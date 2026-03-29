import asyncio
import logging
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, status, Query, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# Local imports
from database import engine, get_db, Base
from models import (
    User, Condition, MenstrualCycle, Workout, Injury,
    Todo, NotificationSetting, Team
)
from schemas import (
    UserCreate, UserResponse, UserUpdate,
    ConditionCreate, ConditionResponse,
    MenstrualCycleCreate, MenstrualCycleResponse,
    WorkoutCreate, WorkoutResponse,
    InjuryCreate, InjuryResponse,
    TodoCreate, TodoResponse, TodoUpdate,
    NotificationSettingResponse, NotificationSettingUpdate,
    TokenResponse, PasswordChange, UserLogin
)

# Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Environment variables
SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 3650  # ~10년 (사실상 무기한)

# Password hashing — bcrypt 백엔드를 앱 시작 시 미리 초기화
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
pwd_context.hash("warmup")  # 백엔드 초기화

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# --- Rate Limiting ---
_rate_limit: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_WINDOW = 60  # 60초
RATE_LIMIT_MAX = 10  # 윈도우당 최대 10회

def check_rate_limit(key: str):
    now = time.time()
    _rate_limit[key] = [t for t in _rate_limit[key] if now - t < RATE_LIMIT_WINDOW]
    if len(_rate_limit[key]) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please try again later."
        )
    _rate_limit[key].append(now)

# --- In-memory cache ---
_cache: dict[str, tuple] = {}
CACHE_TTL = 60
CACHE_MAX_SIZE = 10000

def _cache_evict():
    if len(_cache) <= CACHE_MAX_SIZE:
        return
    now = time.time()
    expired = [k for k, (_, ts) in _cache.items() if now - ts >= CACHE_TTL]
    for k in expired:
        del _cache[k]
    if len(_cache) > CACHE_MAX_SIZE:
        oldest = sorted(_cache, key=lambda k: _cache[k][1])[:len(_cache) - CACHE_MAX_SIZE]
        for k in oldest:
            del _cache[k]

def cache_set(key: str, data):
    _cache[key] = (data, time.time())
    _cache_evict()

def cache_get(key: str):
    if key in _cache:
        data, ts = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
        del _cache[key]
    return None

def cache_invalidate(prefix: str):
    keys = [k for k in _cache if k.startswith(prefix)]
    for k in keys:
        del _cache[k]

# --- Token blacklist (강제 로그아웃용) ---
_token_blacklist: set[str] = set()

def blacklist_token(token: str):
    _token_blacklist.add(token)

def is_token_blacklisted(token: str) -> bool:
    return token in _token_blacklist

# Initialize FastAPI app
app = FastAPI(title="Health Tracking API", version="1.0.0")

# CORS middleware
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://frontend-production-f659.up.railway.app")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Helper functions
def gen_player_code() -> str:
    import uuid
    return str(uuid.uuid4())[:8].upper()

async def hash_password(password: str) -> str:
    return await asyncio.to_thread(pwd_context.hash, password)

async def verify_password(plain_password: str, hashed_password: str) -> bool:
    return await asyncio.to_thread(pwd_context.verify, plain_password, hashed_password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if is_token_blacklisted(token):
        raise credentials_exception

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        user_id = int(user_id)
    except (JWTError, ValueError, TypeError) as e:
        logger.error(f"JWT decode error: {e}")
        raise credentials_exception

    try:
        result = await db.execute(select(User).filter(User.id == user_id))
        user = result.scalars().first()
    except Exception as e:
        logger.error(f"DB error in get_current_user: {e}")
        raise credentials_exception

    if user is None:
        logger.warning(f"User not found for id: {user_id}")
        raise credentials_exception
    return user

# Startup event
@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)
    logger.info("Application started, tables created")

# Health check
@app.get("/api/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}

# Auth endpoints
@app.post("/api/auth/signup", response_model=TokenResponse)
async def signup(request: Request, user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    check_rate_limit(f"signup:{request.client.host}")

    result = await db.execute(select(User).filter(User.email == user_data.email))
    existing_user = result.scalars().first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    hashed_password = await hash_password(user_data.password)
    new_user = User(
        email=user_data.email,
        hashed_password=hashed_password,
        name=user_data.name or user_data.email.split("@")[0],
        player_code=gen_player_code(),
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    logger.info(f"New user signed up: {new_user.email}")

    access_token = create_access_token(data={"sub": str(new_user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/login", response_model=TokenResponse)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    check_rate_limit(f"login:{request.client.host}")

    result = await db.execute(select(User).filter(User.email == form_data.username))
    user = result.scalars().first()
    if not user or not await verify_password(form_data.password, user.hashed_password):
        logger.warning(f"Failed login attempt for: {form_data.username}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/api/auth/login/json", response_model=TokenResponse)
async def login_json(
    request: Request,
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    check_rate_limit(f"login:{request.client.host}")

    result = await db.execute(select(User).filter(User.email == login_data.email))
    user = result.scalars().first()
    if not user or not await verify_password(login_data.password, user.hashed_password):
        logger.warning(f"Failed login attempt for: {login_data.email}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

# Password change
@app.post("/api/auth/change-password")
async def change_password(
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not await verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    current_user.hashed_password = await hash_password(data.new_password)
    db.add(current_user)
    await db.commit()
    logger.info(f"Password changed for user: {current_user.email}")
    return {"message": "Password changed successfully"}

# Logout (토큰 무효화)
@app.post("/api/auth/logout")
async def logout(token: str = Depends(oauth2_scheme)):
    blacklist_token(token)
    return {"message": "Logged out successfully"}

# Account deletion (회원 탈퇴)
@app.delete("/api/user/me")
async def delete_account(
    current_user: User = Depends(get_current_user),
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
):
    logger.info(f"Account deleted: {current_user.email}")
    await db.delete(current_user)
    await db.commit()
    blacklist_token(token)
    cache_invalidate(f"conditions:{current_user.id}")
    cache_invalidate(f"menstrual:{current_user.id}")
    cache_invalidate(f"workouts:{current_user.id}")
    cache_invalidate(f"injuries:{current_user.id}")
    return {"message": "Account deleted successfully"}

# User endpoints
@app.get("/api/user/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user)
):
    return current_user

@app.patch("/api/user/me", response_model=UserResponse)
async def update_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if user_update.name:
        current_user.name = user_update.name
    if user_update.gender:
        current_user.gender = user_update.gender
    if user_update.role:
        current_user.role = user_update.role
    if user_update.sport:
        current_user.sport = user_update.sport
    if user_update.team_code:
        current_user.team_code = user_update.team_code

    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return current_user

# Condition endpoints
@app.post("/api/conditions", response_model=ConditionResponse)
async def create_condition(
    condition_data: ConditionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_condition = Condition(
        user_id=current_user.id,
        sleep=condition_data.sleep,
        fatigue=condition_data.fatigue,
        mood=condition_data.mood,
        energy=condition_data.energy,
        composite_score=condition_data.composite_score,
        acwr=condition_data.acwr,
        srpe=condition_data.srpe,
        recorded_at=datetime.utcnow()
    )
    db.add(new_condition)
    await db.commit()
    await db.refresh(new_condition)
    cache_invalidate(f"conditions:{current_user.id}")
    return new_condition

@app.get("/api/conditions", response_model=list[ConditionResponse])
async def get_conditions(
    limit: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    cache_key = f"conditions:{current_user.id}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(
        select(Condition)
        .filter(Condition.user_id == current_user.id)
        .order_by(Condition.recorded_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    data = [ConditionResponse.model_validate(r) for r in rows]
    cache_set(cache_key, data)
    return data

# Menstrual Cycle endpoints
@app.post("/api/menstrual-cycles", response_model=MenstrualCycleResponse)
async def create_menstrual_cycle(
    cycle_data: MenstrualCycleCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_cycle = MenstrualCycle(
        user_id=current_user.id,
        start_date=cycle_data.start_date,
        end_date=cycle_data.end_date,
    )
    db.add(new_cycle)
    await db.commit()
    await db.refresh(new_cycle)
    cache_invalidate(f"menstrual:{current_user.id}")
    return new_cycle

@app.get("/api/menstrual-cycles", response_model=list[MenstrualCycleResponse])
async def get_menstrual_cycles(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    cache_key = f"menstrual:{current_user.id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(
        select(MenstrualCycle)
        .filter(MenstrualCycle.user_id == current_user.id)
        .order_by(MenstrualCycle.start_date.desc())
    )
    rows = result.scalars().all()
    data = [MenstrualCycleResponse.model_validate(r) for r in rows]
    cache_set(cache_key, data)
    return data

# Workout endpoints
@app.post("/api/workouts", response_model=WorkoutResponse)
async def create_workout(
    workout_data: WorkoutCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_workout = Workout(
        user_id=current_user.id,
        name=workout_data.name,
        duration_seconds=workout_data.duration_seconds,
        srpe=workout_data.srpe,
        intensity=workout_data.intensity,
        recorded_at=datetime.utcnow()
    )
    db.add(new_workout)
    await db.commit()
    await db.refresh(new_workout)
    cache_invalidate(f"workouts:{current_user.id}")
    return new_workout

@app.get("/api/workouts", response_model=list[WorkoutResponse])
async def get_workouts(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    cache_key = f"workouts:{current_user.id}:{limit}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(
        select(Workout)
        .filter(Workout.user_id == current_user.id)
        .order_by(Workout.recorded_at.desc())
        .limit(limit)
    )
    rows = result.scalars().all()
    data = [WorkoutResponse.model_validate(r) for r in rows]
    cache_set(cache_key, data)
    return data

# Injury endpoints
@app.post("/api/injuries", response_model=InjuryResponse)
async def create_injury(
    injury_data: InjuryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_injury = Injury(
        user_id=current_user.id,
        part_name=injury_data.part_name,
        side=injury_data.side,
        risk_percent=injury_data.risk_percent,
        risk_level=injury_data.risk_level,
        diagnosis=injury_data.diagnosis,
        ai_recommendation=injury_data.ai_recommendation,
        recorded_at=datetime.utcnow()
    )
    db.add(new_injury)
    await db.commit()
    await db.refresh(new_injury)
    cache_invalidate(f"injuries:{current_user.id}")
    return new_injury

@app.get("/api/injuries", response_model=list[InjuryResponse])
async def get_injuries(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    cache_key = f"injuries:{current_user.id}"
    cached = cache_get(cache_key)
    if cached is not None:
        return cached
    result = await db.execute(
        select(Injury)
        .filter(Injury.user_id == current_user.id)
        .order_by(Injury.recorded_at.desc())
    )
    rows = result.scalars().all()
    data = [InjuryResponse.model_validate(r) for r in rows]
    cache_set(cache_key, data)
    return data

# Todo endpoints
@app.post("/api/todos", response_model=TodoResponse)
async def create_todo(
    todo_data: TodoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_todo = Todo(
        user_id=current_user.id,
        text=todo_data.text,
        done=False,
        created_at=datetime.utcnow()
    )
    db.add(new_todo)
    await db.commit()
    await db.refresh(new_todo)
    return new_todo

@app.get("/api/todos", response_model=list[TodoResponse])
async def get_todos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo)
        .filter(Todo.user_id == current_user.id)
        .order_by(Todo.created_at.desc())
    )
    rows = result.scalars().all()
    return [TodoResponse.model_validate(r) for r in rows]

@app.patch("/api/todos/{todo_id}", response_model=TodoResponse)
async def update_todo(
    todo_id: int,
    todo_update: TodoUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id)
    )
    todo = result.scalars().first()

    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found"
        )

    if todo_update.text:
        todo.text = todo_update.text
    if todo_update.done is not None:
        todo.done = todo_update.done

    db.add(todo)
    await db.commit()
    await db.refresh(todo)
    return todo

@app.delete("/api/todos/{todo_id}")
async def delete_todo(
    todo_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Todo).filter(Todo.id == todo_id, Todo.user_id == current_user.id)
    )
    todo = result.scalars().first()

    if not todo:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Todo not found"
        )

    await db.delete(todo)
    await db.commit()
    return {"deleted": True}

# Notification endpoints
@app.get("/api/notifications", response_model=NotificationSettingResponse)
async def get_notifications(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(NotificationSetting).filter(NotificationSetting.user_id == current_user.id)
    )
    settings = result.scalars().first()

    if not settings:
        settings = NotificationSetting(user_id=current_user.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    return settings

@app.patch("/api/notifications", response_model=NotificationSettingResponse)
async def update_notifications(
    settings_update: NotificationSettingUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(NotificationSetting).filter(NotificationSetting.user_id == current_user.id)
    )
    settings = result.scalars().first()

    if not settings:
        settings = NotificationSetting(user_id=current_user.id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    if settings_update.condition_reminder is not None:
        settings.condition_reminder = settings_update.condition_reminder
    if settings_update.workout_reminder is not None:
        settings.workout_reminder = settings_update.workout_reminder
    if settings_update.injury_alert is not None:
        settings.injury_alert = settings_update.injury_alert
    if settings_update.menstrual_reminder is not None:
        settings.menstrual_reminder = settings_update.menstrual_reminder
    if settings_update.mission_notification is not None:
        settings.mission_notification = settings_update.mission_notification

    db.add(settings)
    await db.commit()
    await db.refresh(settings)
    return settings

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=8)
