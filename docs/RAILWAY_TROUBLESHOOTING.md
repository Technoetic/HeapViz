# Railway 배포 트러블슈팅 가이드

Railway에서 Python(FastAPI/Django/Flask) 앱을 배포할 때 자주 발생하는 문제와 해결법.

---

## 1. 빌더가 프로젝트를 인식하지 못함

### 증상

```
✖ Railpack could not determine how to build the app.
```

### 원인

Railway의 자동 감지(Railpack/Nixpacks)는 **루트 디렉토리**의 파일로 언어를 판단한다.  
`requirements.txt`가 하위 폴더(`backend/`, `server/` 등)에만 있으면 Python으로 인식하지 못한다.

### 해결

**방법 A** — 루트에 `requirements.txt` 배치

```bash
cp backend/requirements.txt requirements.txt
```

**방법 B** — Dockerfile 사용 (가장 확실)

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["sh", "-c", "python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

`railway.json`에서 빌더 명시:

```json
{
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  }
}
```

---

## 2. pip 모듈 없음 (Nixpacks/Railpack)

### 증상

```
/root/.nix-profile/bin/python3: No module named pip
```

### 원인

Railpack이 설치하는 `python312Full` Nix 패키지에 pip가 포함되지 않는 경우가 있다.  
`ensurepip`도 캐시 오염 등으로 실패할 수 있다.

### 해결

Nixpacks의 pip 문제를 우회하려면 **`python:3.12-slim` Dockerfile을 사용**한다.  
공식 Python Docker 이미지에는 pip가 기본 포함되어 있어 안정적이다.

```dockerfile
FROM python:3.12-slim
RUN pip install --no-cache-dir -r requirements.txt
```

> **Tip**: `nixpacks.toml`에 `python312Packages.pip`를 추가해도 Railpack 버전에 따라 무시될 수 있다.

---

## 3. `${PORT}` 변수가 확장되지 않음

### 증상

```
Error: Invalid value for '--port': '${PORT:-8000}' is not a valid integer.
```

### 원인

Railway는 컨테이너에 `PORT` 환경변수를 주입한다.  
하지만 다음 경우 shell 변수 확장이 발생하지 않는다:

| 설정 위치 | 변수 확장 | 비고 |
|-----------|-----------|------|
| `railway.json`의 `startCommand` | ❌ 안됨 | 문자열 그대로 전달 |
| Dockerfile `CMD ["...", "${PORT}"]` | ❌ 안됨 | exec form은 shell 미경유 |
| Dockerfile `CMD python ... ${PORT}` | ❌ 안됨 | exec form으로 해석됨 |
| Dockerfile `CMD ["sh", "-c", "... ${PORT}"]` | ✅ 됨 | shell을 통해 확장 |

### 해결

**Dockerfile에서 `sh -c`를 명시적으로 사용**:

```dockerfile
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

`railway.json`에서는 `startCommand`를 **제거**하고, Dockerfile CMD에 위임한다:

```json
{
  "build": { "builder": "DOCKERFILE" },
  "deploy": { "restartPolicyType": "ON_FAILURE" }
}
```

> **주의**: `railway.json`의 `startCommand`가 있으면 Dockerfile CMD를 **덮어쓴다**.  
> 둘 다 정의하면 `startCommand`가 우선이며, 이쪽은 변수 확장을 하지 않는다.

---

## 4. Dockerfile과 Nixpacks가 충돌

### 증상

Dockerfile이 있는데 Nixpacks 설정도 있어서 어느 쪽이 사용되는지 불명확.

### 원인

Railway 빌더 우선순위:

1. `railway.json`의 `build.builder` (명시적 지정)
2. `Dockerfile` 존재 시 → Docker 빌더
3. 그 외 → Railpack(Nixpacks 후속) 자동 감지

`Dockerfile`과 `nixpacks.toml`이 **동시에 존재하면** Dockerfile이 우선된다.

### 해결

**하나만 사용**하고, `railway.json`에서 명시:

```json
// Dockerfile 사용 시
{ "build": { "builder": "DOCKERFILE" } }

// Nixpacks 사용 시 (Dockerfile 삭제 필요)
{ "build": { "builder": "NIXPACKS" } }
```

---

## 5. 정적 파일(SPA)이 API 경로를 가로챔

### 증상

`/api/records` 등 API 요청이 JSON 대신 `index.html`을 반환한다.

### 원인

**Nginx** 또는 **FastAPI StaticFiles**의 `html=True` 설정이  
모든 경로를 `index.html`로 폴백(SPA 라우팅)시키기 때문.

```python
# 이 마운트가 /api/* 보다 먼저 매칭되면 HTML 반환
app.mount("/", StaticFiles(directory="dist", html=True), name="static")
```

### 해결

**FastAPI에서 API 라우트를 StaticFiles보다 먼저 등록**:

```python
# ✅ API 라우트를 먼저 정의
@app.get("/api/records")
def get_records(): ...

@app.get("/api/config")
def get_config(): ...

# ✅ StaticFiles는 마지막에 마운트
app.mount("/", StaticFiles(directory="dist", html=True), name="static")
```

FastAPI는 라우트를 등록 순서대로 매칭하므로, `/api/*`가 먼저 처리된다.

---

## 6. 환경변수가 적용되지 않음

### 증상

환경변수를 설정했는데 앱에서 빈 값이 반환된다.

### 원인

- 환경변수를 **다른 서비스**에 설정함
- 배포 후 **재시작하지 않음** (환경변수 변경은 재배포 필요)
- `railway.json`의 `startCommand`에서 변수를 참조했지만 확장 안됨

### 해결

**Railway GraphQL API로 확인**:

```bash
# 환경변수 설정
curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { variableUpsert(input: { projectId: \"...\", serviceId: \"...\", environmentId: \"...\", name: \"KEY\", value: \"VALUE\" }) }"
  }'

# 재배포 트리거
curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation { serviceInstanceRedeploy(serviceId: \"...\", environmentId: \"...\") }"
  }'
```

> **Tip**: Railway 대시보드에서 변수를 변경하면 자동으로 재배포된다.  
> GraphQL API로 변경 시에는 수동으로 `serviceInstanceRedeploy`를 호출해야 한다.

---

## 7. 빌드는 성공하지만 502 에러

### 증상

```json
{"status": "error", "code": 502, "message": "Application failed to respond"}
```

### 원인

- 앱이 **Railway가 할당한 PORT**가 아닌 다른 포트에서 리스닝
- 앱이 시작 중 크래시 (런타임 에러)
- 앱이 `127.0.0.1`에서만 리스닝 (외부 접근 불가)

### 해결

```dockerfile
# ✅ 0.0.0.0으로 바인딩 (127.0.0.1 아님)
# ✅ ${PORT}를 사용 (하드코딩 아님)
CMD ["sh", "-c", "python -m uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

**런타임 로그 확인** (GraphQL API):

```bash
curl -X POST https://backboard.railway.app/graphql/v2 \
  -H "Authorization: Bearer $RAILWAY_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "{ deploymentLogs(deploymentId: \"...\", limit: 50) { message } }"
  }'
```

---

## 빠른 체크리스트

배포 전 확인:

- [ ] `requirements.txt`가 루트에 있거나, Dockerfile을 사용하는가?
- [ ] `Dockerfile`과 `nixpacks.toml`이 충돌하지 않는가?
- [ ] `railway.json`에 빌더가 명시되어 있는가?
- [ ] `CMD`에서 `sh -c`를 통해 `${PORT}`를 확장하는가?
- [ ] `--host 0.0.0.0`으로 바인딩하는가? (`127.0.0.1` 아님)
- [ ] API 라우트가 StaticFiles 마운트보다 **먼저** 등록되는가?
- [ ] 환경변수 변경 후 재배포를 트리거했는가?
