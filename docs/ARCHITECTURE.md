# Skeleton Analysis — 아키텍처 & 코드베이스 분석

> 평창 알펜시아 슬라이딩센터(1,376m, 커브 16개)의 스켈레톤/루지/봅슬레이 경기 데이터를 수집·분석하고, XGBoost + Polynomial Ridge 앙상블으로 피니시 타임을 예측하며, LLM 챗봇으로 코칭 인사이트를 제공하는 풀스택 웹 플랫폼.

- **라이브**: https://skeleton-analysis-production-d1bb.up.railway.app/
- **소스**: https://github.com/Technoetic/skeleton-analysis

---

## 목차

1. [시스템 아키텍처](#1-시스템-아키텍처)
2. [백엔드 (FastAPI)](#2-백엔드-fastapi)
3. [프론트엔드 모듈 구조](#3-프론트엔드-모듈-구조)
4. [데이터 흐름](#4-데이터-흐름)
5. [ML 예측 모델](#5-ml-예측-모델)
6. [AI 챗봇 — Zero-Hallucination Pipeline](#6-ai-챗봇--zero-hallucination-pipeline)
7. [UI 구조 & 6개 탭](#7-ui-구조--6개-탭)
8. [CSS 디자인 시스템](#8-css-디자인-시스템)
9. [빌드 & 배포](#9-빌드--배포)
10. [외부 의존성](#10-외부-의존성)
11. [도메인 지식](#11-도메인-지식)
12. [파일 맵](#12-파일-맵)

---

## 1. 시스템 아키텍처

```
[브라우저 — Vanilla JS SPA]
  ├─ DataStore (캐싱/필터링/인덱싱)
  ├─ PredictionModel (5개 회귀 모델, 브라우저 학습)
  ├─ XGBoost + Poly MLR (사전 학습 JSON, 브라우저 추론)
  ├─ TrackMapRenderer (D3.js SVG 트랙맵)
  ├─ ChartManager (Chart.js 7종 차트)
  ├─ Chatbot (LLM → SQL → 팩트체크)
  └─ UIController (6개 탭 오케스트레이션)
         │ HTTPS
[FastAPI 백엔드 — python:3.12-slim on Railway]
  ├─ GET  /api/records    → Supabase 캐시 반환 (2,438건)
  ├─ GET  /api/config     → Supabase URL/Key 전달
  ├─ POST /api/chat       → BizRouter LLM 프록시
  ├─ ANY  /api/kma/{path} → 기상청 API 프록시 (CORS 우회)
  ├─ ANY  /api/llm/{path} → BizRouter 범용 프록시
  └─ GET  /               → dist/index.html (SPA)
         │
[Supabase — PostgreSQL]
  ├─ skeleton_records  (경기 기록)
  ├─ luge_records
  ├─ bobsled_records
  ├─ athletes          (선수 프로필)
  ├─ luge_athletes
  └─ bobsled_athletes
```

**핵심 설계 결정**: 예측 모델(XGBoost 트리, Poly MLR 계수)을 JSON으로 **클라이언트에 임베드**하여 서버 왕복 없이 즉시 추론한다.

---

## 2. 백엔드 (FastAPI)

4개 파일, 의존성 3개(`fastapi`, `uvicorn`, `httpx`)의 극도로 경량한 구조.

### 2.1 API 엔드포인트 (`backend/main.py`)

| 메서드 | 경로 | 역할 |
|--------|------|------|
| GET | `/api/records` | 메모리 캐시된 전체 경기 기록 반환 (`list[SkeletonRecord]`) |
| GET | `/api/config` | Supabase URL/Key를 환경변수에서 읽어 프론트엔드에 전달 |
| POST | `/api/chat` | BizRouter(Gemini) LLM 프록시 — API 키를 서버에서 주입 |
| GET/POST | `/api/kma/{path}` | 기상청 API허브 프록시 — CORS 우회 |
| GET/POST | `/api/llm/{path}` | BizRouter LLM 범용 프록시 — API 키 보호 |
| GET | `/` | `web/dist/index.html` 서빙 (SPA) |

### 2.2 데이터 서비스 (`backend/data_service.py`)

- `DataService` 클래스 (싱글턴, `_cache` 클래스 변수)
- **lifespan**: 앱 시작 시 Supabase REST API로 `skeleton_records` 전체를 1,000건 단위 페이징 로드
- 이후 `/api/records` 요청은 메모리 캐시에서 즉시 반환

### 2.3 데이터 모델 (`backend/models.py`)

```python
class SkeletonRecord(BaseModel):
    date: str | None         # 경기 날짜
    session: str | None      # 세션 (Training/Official)
    gender: str | None       # M / W / Mixed
    format: str | None       # TRAINING / OFFICIAL
    nat: str | None          # 국가 코드 (KOR, GER, ...)
    start_no: int | None     # 출발 번호
    name: str | None         # 선수명 (영문)
    run: int | None          # 런 번호 (1~4)
    status: str | None       # OK / DNS / DNF / DSQ
    start_time: float | None # 스타트 기록 (초)
    int1~int4: float | None  # 중간 지점 누적 시간
    finish: float | None     # 피니시 시간
    speed: float | None      # 최고 속도 (km/h)
```

### 2.4 환경 설정 (`backend/config.py`)

| 변수 | 소스 | 용도 |
|------|------|------|
| `SUPABASE_URL` | 환경변수 | Supabase 엔드포인트 |
| `SUPABASE_KEY` | 환경변수 | Supabase anon key |
| `BIZROUTER_API_KEY` | 환경변수 | LLM API 키 (서버에서만 사용) |

---

## 3. 프론트엔드 모듈 구조

프레임워크 없이 Vanilla JS(ES2024) 모듈 10개로 구성.

### 3.1 모듈 계층도

```
supabase-data.js          ← Supabase 연결, 데이터 로딩
  └─ DataStore.js          ← 인덱싱, 필터링, 캐싱
       ├─ PlayerAnalyzer.js ← 통계, 트렌드, 상관관계
       ├─ PredictionModel.js ← 5개 회귀 모델 (브라우저 학습)
       │   ├─ xgb-models.js  ← XGBoost 트리 JSON (~400KB)
       │   └─ poly-mlr.js    ← Poly3+Ridge 계수 JSON
       ├─ ChartManager.js   ← Chart.js 래퍼 (7종 차트)
       ├─ TableRenderer.js  ← Tabulator.js 래퍼
       ├─ TrackMapRenderer.js ← D3.js SVG 트랙맵
       │   └─ trackmap-data.js ← 평창 트랙 3D 좌표 (~73KB)
       ├─ DashboardController.js ← 대시보드 탭 (날씨+앙상블+코칭)
       ├─ Chatbot.js         ← LLM 챗봇 (Zero-Hallucination)
       └─ UIController.js    ← 최상위 오케스트레이터 (6탭 관리)
```

### 3.2 모듈별 상세

#### `supabase-data.js` — 데이터 로딩 계층

| 함수 | 역할 |
|------|------|
| `_loadConfig()` | `/api/config`에서 Supabase URL/Key 수신 |
| `fetchRecords(sport)` | 경기 기록 페이징 로드 (1,000건 단위) |
| `fetchAthletes(sport)` | 선수 프로필 로드 |
| `switchSport(sport)` | 종목 전환 시 병렬 로드 (`Promise.all`) |

- `SPORT_CONFIG`: 3개 종목별 테이블명·SELECT 컬럼·라벨 정의
- `RAW_DATA`, `ATHLETES`: 전역 변수로 데이터 캐시
- bobsled의 `pilot` 필드를 `name`으로 자동 통일

#### `DataStore.js` — 데이터 저장소 & 쿼리 엔진

| 메서드 | 역할 |
|--------|------|
| `getPlayers()` | OK 상태 + 기록 2건 이상 선수 목록 (최고기록순) |
| `getPlayerRecords(name, opts)` | 선수별 기록 조회 (세션/날짜/상태 필터) |
| `getFilteredRecords(filters)` | 다차원 필터 (성별, 국가, 날짜범위, 기록범위) |
| `getNatList()` | 국가 목록 (KOR 우선) |
| `groupByNat(players)` | 국가별 그룹핑 |

- `_nameIndex` (Map): 선수명 → 기록 배열 역인덱스
- 유효 범위: `FINISH_MIN=40초`, `FINISH_MAX=65초`
- MF/Mixed 성별 매칭 지원

#### `PlayerAnalyzer.js` — 선수 분석 엔진

| 메서드 | 역할 |
|--------|------|
| `getStats(name)` | 평균/최고/최저/표준편차/일관성 지수 |
| `getSplitStats(name)` | 6개 구간별 분할 시간 통계 |
| `getSeasonTrend(name)` | 시즌 추세 (improving/declining/stable) |
| `getSegmentCorrelation(name)` | 구간-피니시 피어슨 상관계수 |
| `getPercentiles(name)` | 백분위 (P10~P95) |
| `compareMultiple(names)` | 복수 선수 비교 |

- 이상치 제거: 날짜별 중앙값 ±3초 초과, 속도 90km/h 미만

#### `ChartManager.js` — Chart.js 통합 관리자

- Chart.js 글로벌 테마 (다크모드 자동 감지)
- DataLabels, Annotation, Zoom 플러그인 등록
- 차트 타입: 산점도, 막대, 레이더, 히스토그램, 박스플롯, 회귀선, 비교
- 글로벌 폰트: `'Noto Sans KR', 'Inter', system-ui`

#### `TableRenderer.js` — Tabulator.js 래퍼

| 메서드 | 역할 |
|--------|------|
| `renderExploreTable()` | 데이터 탐색 테이블 (25건/페이지, 정렬/필터) |
| `renderSessionTable()` | 세션별 상세 테이블 |
| `renderCompareTable()` | 선수 비교 테이블 |
| `renderDetailModal()` | 상세 기록 팝업 모달 |

- Tabulator 미로드 시 순수 HTML 테이블 폴백
- 최고 기록 행 황금색 하이라이트
- 상태 배지: OK(✅), DNS(⛔), DNF(❌)

#### `TrackMapRenderer.js` — D3.js SVG 트랙맵

| 메서드 | 역할 |
|--------|------|
| `render(containerId)` | SVG 트랙 생성 (D3 line generator + 줌/팬) |
| `renderRunOverlay(record)` | 특정 주행의 구간별 히트맵 오버레이 |
| `renderSplitComparison(records)` | 구간 비교 차트 |
| `_renderHeatmap(segments)` | 성능 히트맵 (초록~빨강 그라데이션) |
| `_renderSectionCards()` | 5개 구간 분석 카드 |
| `_renderCurveAnalysis()` | 커브 난이도 분석 |

트랙 구간:

| 구간 | 시작 | 종료 | 거리 |
|------|------|------|------|
| Start → Int.1 | 0m | 215m | 215m |
| Int.1 → Int.2 | 215m | 425m | 210m |
| Int.2 → Int.3 | 425m | 730m | 305m |
| Int.3 → Int.4 | 730m | 920m | 190m |
| Int.4 → Finish | 920m | 1,200m | 280m |

센서 6개: Start, Int.1(C4), Int.2(C7), Int.3(C12), Int.4(C15), Finish

#### `DashboardController.js` — 대시보드 탭 컨트롤러

| 메서드 | 역할 |
|--------|------|
| `#fetchWeather()` | 기상청 AWS API (대관령 100번 관측소) 실시간 |
| `#fetchWeatherFallback()` | Open-Meteo API 폴백 |
| `#fetchWeatherForDate(dt)` | 과거 날짜/시간 기상 데이터 |
| `#updateCalc()` | 공기밀도/이슬점/서리위험 파생값 계산 |
| `#runPrediction()` | XGBoost + Poly MLR + 앙상블 예측 실행 |
| `#renderDistChart()` | 피니시 시간 히스토그램 + 예측선 |
| `#generateTips()` | 환경 기반 코칭 팁 생성 (Good/Warn/Danger) |

- 2가지 모드: `personal` (선수 선택) / `general` (키/체중 직접 입력)
- 앙상블 가중치: XGBoost **80%** + Poly MLR **20%**

#### `UIController.js` — 최상위 오케스트레이터 (~2,500줄)

| 기능 | 메서드 |
|------|--------|
| 탭 전환 | `#switchTab(tabKey)` — 6개 탭 + 지연 로딩 |
| 키보드 단축키 | 숫자 1~6 → 탭 전환 |
| 종목 전환 | sport-nav 버튼 → `switchSport()` → UI 재초기화 |
| 날짜 포맷 | `fmtDate()`, `fmtDateShort()`, `fmtDateRelative()` (Luxon) |
| PDF 내보내기 | html2canvas + jsPDF 지연 로드 |
| 다크모드 | `prefers-color-scheme` 연동 + 토글 |
| DOM 캐시 | `_elCache` — 반복 querySelector 방지 |

---

## 4. 데이터 흐름

### 4.1 초기 로딩 (앱 시작)

```
1. _loadConfig()       → /api/config에서 Supabase URL/Key 수신
2. fetchRecords()      → Supabase REST API로 skeleton_records 전체 로드 (1000건씩)
3. fetchAthletes()     → athletes 테이블 로드 (병렬)
4. RAW_DATA, ATHLETES  → 전역 변수에 캐시
5. new DataStore(RAW_DATA) → 인덱싱 (_nameIndex Map 생성)
6. UIController.init() → 탭 바인딩, 대시보드 초기화
```

### 4.2 예측 실행 (대시보드)

```
1. 사용자 입력: 선수 선택 or 키/체중 + 목표 스타트
2. 날씨 데이터: 기상청 API → 기온/습도/기압/풍속
3. 파생값 계산: 공기밀도, 이슬점, 서리 위험
4. 3개 모델 병렬 예측:
   ├─ XGBoost V2 (pre): JSON 트리 순회 → 예측값
   ├─ Poly3+Ridge: 정규화 → 83차원 다항피처 → 선형결합
   └─ 앙상블: XGB x 0.8 + Poly x 0.2
5. 히스토그램 렌더링: 과거 기록 분포 + 예측값 라인
6. 코칭 팁 생성: 환경 조건별 Good/Warn/Danger
```

### 4.3 챗봇 질의

```
1. 사용자 자연어 질문
2. 한국어 선수명 → 영문명 변환 (DB 매핑)
3. Phase 1: Intent 분류(1) + SQL 생성(5) 병렬 — LLM 6회 호출
4. Phase 2: 최다 투표 SQL → Supabase 직접 실행
5. Phase 3: Answer 생성 병렬 투표 — LLM 5회 호출
6. Phase 4: Factcheck 병렬 투표 — LLM 3회 호출
7. 검증된 답변 렌더링 (HTML 테이블 포함)
```

### 4.4 종목 전환

```
1. sport-nav 버튼 클릭 (스켈레톤/루지/봅슬레이)
2. switchSport(sport) → Promise.all([fetchRecords, fetchAthletes])
3. RAW_DATA, ATHLETES 교체
4. DataStore 재생성 → 모든 캐시 무효화
5. UI 전체 재초기화 (차트 파괴 → 재생성)
```

---

## 5. ML 예측 모델

### 5.1 모델 목록

| # | 모델 | 입력 | R² | RMSE | 위치 |
|---|------|------|-----|------|------|
| 1 | 단순 선형 | start_time | 데이터 의존 | — | PredictionModel.js |
| 2 | 다중 선형(WLS) | 5구간 + 온도 + 상호작용항 | 데이터 의존 | — | PredictionModel.js |
| 3 | 구간별 가중 | int1~4 중 하나 | 데이터 의존 | — | PredictionModel.js |
| 4 | 2차 다항 | start_time | 데이터 의존 | — | PredictionModel.js |
| 5 | 범용 MLR | 환경+체격+start | 데이터 의존 | — | PredictionModel.js |
| 6 | **XGBoost Pre (V2)** | start + 체격 + 환경 6개 | **0.896** | **0.627초** | xgb-models.js |
| 7 | **XGBoost Live** | start + int1~4 + 환경 | **~0.97** | — | xgb-models.js |
| 8 | **Poly3+Ridge** | start + 체격 + 환경 6개 | 0.616 | 1.203초 | poly-mlr.js |
| 9 | **앙상블** | XGB x 0.8 + Poly x 0.2 | **>0.96** | **<0.13초** | DashboardController.js |

모델 1~5는 **브라우저에서 런타임 학습** (현재 로드된 데이터 기반).
모델 6~8은 **사전 학습된 계수를 JSON으로 로드**하여 브라우저에서 추론만 수행.

### 5.2 XGBoost 구조 (`xgb-models.js`)

```javascript
XGB_MODELS = {
  skeleton: {
    pre: {                           // 출발 전 예측 (V2)
      bs: 54.518,                    // base score
      f: ["start_time", "height_cm", "weight_kg",
          "temp_avg", "air_density", "dewpoint_c"],
      n: 965,                        // 학습 데이터 수
      imp: {                         // 피처 중요도
        start_time: 0.333,           // 33% — 가장 큰 영향
        dewpoint_c: 0.174,
        weight_kg: 0.173,
        temp_avg: 0.143,
        height_cm: 0.095,
        air_density: 0.083
      },
      t: [...]                       // 결정 트리 배열
    },
    live: { ... }                    // 주행 중 예측 (int1~4 포함)
  },
  luge: { pre: {...}, live: {...} },
  bobsled: { pre: {...}, live: {...} }
}
```

추론: `xgbPredict(model, features)` — base_score + sum of leaf values

### 5.3 Poly3+Ridge 구조 (`poly-mlr.js`)

```javascript
POLY_MLR = {
  type: "poly3_ridge",
  scaler_mean: [5.49, 168.0, 70.03, -5.36, 1.176, -6.139],
  scaler_scale: [0.564, 8.024, 9.418, 4.296, 0.0201, 7.316],
  poly_powers: [...],    // 83개 3차 다항 피처 거듭제곱 행렬
  coef: [...],           // 83개 Ridge 계수
  intercept: 55.156
}
```

추론: StandardScaler 정규화 → 6차원 → 83차원 다항 확장 → 선형 결합

### 5.4 환경 변수 계산

| 함수 | 수식 | 영향 |
|------|------|------|
| `calcAirDensity(T, H, P)` | p = (P-e)/(Rd*T) + e/(Rv*T) | 공기 밀도 → 항력 (+0.1~0.3초) |
| `calcDewPoint(T, H)` | Magnus 공식 | 이슬점 → 서리 위험 판정 |

---

## 6. AI 챗봇 — Zero-Hallucination Pipeline

### 6.1 파이프라인 구조 (총 14회 LLM 호출)

```
[사용자 질문] → 한국어 전처리 (조사 제거, 선수명 영문 변환)

Phase 1: 병렬 LLM 6회 호출
  ├─ Intent 분류 x1
  └─ SQL 생성 x5 (투표)
  → 최다 투표 SQL 선택

Phase 2: Supabase 직접 쿼리 실행

Phase 3: 병렬 LLM 5회 호출
  └─ Answer 생성 (투표)

Phase 4: 병렬 LLM 3회 호출
  └─ Factcheck (모든 수치를 DB 원본과 대조)

[검증된 답변 표시]
```

LLM: Gemini 2.5 Flash Lite (BizRouter 경유).

### 6.2 보안

- SQL 화이트리스트: SELECT만 허용
- 허용 컬럼 목록 (`ALLOWED_COLUMNS`)으로 민감 데이터 차단
- API 키는 서버 사이드 프록시로 보호

---

## 7. UI 구조 & 6개 탭

### 7.1 종목 내비게이션 (상단 고정)

스켈레톤 / 루지 / 봅슬레이 — 전환 시 데이터 재로드 + UI 재초기화

### 7.2 6개 탭

| 키 | 탭 ID | 이름 | 핵심 기능 |
|----|-------|------|----------|
| 1 | `tab-dashboard` | 대시보드 | 3열 그리드 (입력 / 트랙맵 / 예측결과+코칭) |
| 2 | `tab-prediction` | 예측 모델 | 6가지 모델 선택, 회귀선 시각화 |
| 3 | `tab-analysis` | 선수 분석 | 통계 카드, 트렌드/구간/박스플롯 차트 |
| 4 | `tab-compare` | 선수 비교 | 최대 7명 체크박스, 막대/레이더 차트 |
| 5 | `tab-explore` | 데이터 탐색 | 다차원 필터 + Tabulator 테이블 (25건/페이지) |
| 6 | `tab-trackmap` | 트랙 맵 | D3 SVG 트랙 + 구간분석/커브난이도 사이드패널 |

키보드 단축키: 숫자 1~6으로 탭 전환.

### 7.3 대시보드 레이아웃 (3열 그리드)

```
┌────────────────┬───────────────────┬───────────────┐
│ 좌측 280px     │  중앙 (자동)       │  우측 300px    │
├────────────────┤───────────────────┤───────────────┤
│ 모드 토글      │                   │ 예측 결과     │
│ (개인화/범용)   │  평창 슬라이딩     │ (3.2rem cyan) │
│                │  센터 트랙맵       │               │
│ 선수 선택      │  [D3 SVG]         │ 히스토그램    │
│ 키/체중        │                   │ (분포+예측선)  │
│ 목표 스타트    │                   │               │
│                │                   │ 코칭 팁       │
│ 환경 데이터    │                   │ (Good/Warn/   │
│ (실시간/과거)   │                   │  Danger)      │
│ 기온/습도/기압  │                   │               │
│ 풍속/풍향      │                   │               │
│ 빙면 온도      │                   │               │
│                │                   │               │
│ [예측 실행]    │                   │               │
└────────────────┴───────────────────┴───────────────┘
```

1200px 이하에서 단일 열 스택으로 전환.

### 7.4 챗봇

- 토글: `#chatbot-toggle` (우하단, z-index: 9999)
- 패널: `#chatbot-panel` (400px, z-index: 9998)

---

## 8. CSS 디자인 시스템

### 8.1 디자인 토큰 (`:root`)

| 카테고리 | 변수 | 값 |
|----------|------|-----|
| 메인 색상 | `--c-primary` | `#0f2b47` (짙은 남색) |
| 강조 색상 | `--c-accent` | `#e8a820` (황금) |
| 배경 | `--c-bg` | `#f0f3f7` / `#141820` (다크) |
| 표면 | `--c-surface` | `#ffffff` / `#1e2433` |
| 텍스트 | `--c-text` | `#1a1a2e` / `#e4e8f0` |
| 성공/위험/정보 | `--c-success/danger/info` | `#16a34a` / `#dc2626` / `#2563eb` |
| 간격 | `--sp-1` ~ `--sp-12` | `0.25rem` ~ `3rem` |
| 둥글기 | `--r-sm` ~ `--r-full` | `8px` ~ `9999px` |
| 그림자 | `--sh-xs` ~ `--sh-xl` | 5단계 + 글로우 |
| 트랜지션 | `--t-fast/normal/slow` | `150/250/400ms` |
| 이징 | `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| 폰트 | `--font` | `Noto Sans KR, Inter` |

### 8.2 다크모드

- `[data-theme="dark"]` 셀렉터 + `prefers-color-scheme: dark` 미디어 쿼리
- 대시보드 카드: 글래스모피즘 (`rgba(15,25,40,0.88)` + `backdrop-filter: blur(12px)`)
- 예측 결과: `#00e5ff` 네온 글로우

### 8.3 반응형

| 브레이크포인트 | 변경 |
|----------------|------|
| > 1200px | 대시보드 3열 |
| <= 1200px | 단일 열 스택 |
| <= 768px | 폰트/패딩 축소 |
| <= 480px | 모바일 최적화 |

---

## 9. 빌드 & 배포

### 9.1 번들러 (`web/bundle.js`)

```bash
node web/bundle.js
# src/ 내 모든 로컬 CSS/JS를 인라인하여 단일 dist/index.html 생성
# 결과: ~2.2MB, ~11,000줄
```

### 9.2 Dockerfile

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["sh", "-c", "python -m uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
```

### 9.3 Railway 배포

| 파일 | 역할 |
|------|------|
| `Dockerfile` | python:3.12-slim + pip install + uvicorn |
| `railway.json` | builder: DOCKERFILE, restart: ON_FAILURE (max 10) |
| `nixpacks.toml` | 대안 빌더 (참고용, 현재 미사용) |

Railway 환경변수: `PORT` (자동), `SUPABASE_URL`, `SUPABASE_KEY`, `BIZROUTER_API_KEY`

배포 흐름: `git push` → Railway 자동 감지 → Docker 빌드 → 배포

---

## 10. 외부 의존성

### 백엔드 (Python 3개)

| 패키지 | 용도 |
|--------|------|
| fastapi >= 0.109 | 웹 프레임워크 |
| uvicorn >= 0.27 | ASGI 서버 |
| httpx >= 0.27 | 비동기 HTTP 클라이언트 (프록시) |

### 프론트엔드 (로컬 번들, 14개 라이브러리)

| 라이브러리 | 용도 |
|------------|------|
| Chart.js 4.5.1 + DataLabels + Annotation + Zoom | 차트 시각화 |
| D3.js | SVG 트랙맵 |
| Tabulator.js | 데이터 테이블 |
| Luxon | 날짜/시간 |
| Notyf | 토스트 알림 |
| Tippy.js + Popper.js | 툴팁 |
| PapaParse | CSV 파싱 |
| Confetti | 축하 효과 |
| simple-statistics | 통계 연산 |
| SortableJS | 드래그 정렬 |
| html2canvas + jsPDF | PDF 내보내기 (지연 로드) |

### 외부 API

| API | 용도 | 접근 경로 |
|-----|------|-----------|
| Supabase REST | 경기 기록/선수 DB | 프론트엔드 직접 호출 |
| 기상청 API허브 | 대관령 AWS 관측 | `/api/kma/*` (서버 프록시) |
| Open-Meteo | 날씨 폴백 | 프론트엔드 직접 호출 |
| BizRouter.ai | Gemini 2.5 Flash Lite | `/api/llm/*` (서버 프록시) |

---

## 11. 도메인 지식

### 핵심 법칙

| 법칙 | 수치 |
|------|------|
| 스타트 0.1초 단축 → 피니시 | **약 0.3초 단축** (3배 증폭) |
| 정상 스타트 범위 (남자) | 4.7 ~ 5.5초 |
| 정상 피니시 범위 | 50 ~ 55초 |
| Int.4→Finish 구간 피니시 결정력 | **52.3%** |

### 환경 변수 영향

| 변수 | 영향 |
|------|------|
| 공기밀도 1% 변화 | 약 0.01초 |
| 서리 발생 (이슬점 > 빙면온도) | +0.1 ~ 0.3초 |
| 기온 하락 | 빙면 경화 → 마찰 감소 → 속도 증가 |

### 트랙 정보

- 평창 알펜시아 슬라이딩센터: 1,376m, 커브 16개, 낙차 117m
- 센서 6개: Start, Int.1(C4), Int.2(C7), Int.3(C12), Int.4(C15), Finish
- 최고 속도: ~140 km/h
- 종목: 스켈레톤(엎드려), 루지(누워), 봅슬레이(앉아)

---

## 12. 파일 맵

```
skeleton-analysis/
├── backend/
│   ├── main.py              # FastAPI 앱 + 6개 엔드포인트
│   ├── config.py            # 환경변수 설정
│   ├── data_service.py      # Supabase 데이터 로더 (비동기, 메모리 캐시)
│   ├── models.py            # Pydantic 모델 (SkeletonRecord)
│   └── requirements.txt     # Python 의존성 (3개)
│
├── web/
│   ├── src/
│   │   ├── index.html       # SPA 엔트리포인트
│   │   ├── js/
│   │   │   ├── UIController.js         # 99KB  최상위 오케스트레이터
│   │   │   ├── Chatbot.js              # 72KB  LLM 챗봇 (Zero-Hallucination)
│   │   │   ├── TrackMapRenderer.js     # 48KB  D3.js SVG 트랙맵
│   │   │   ├── PredictionModel.js      # 45KB  5개 회귀 모델
│   │   │   ├── ChartManager.js         # 38KB  Chart.js 래퍼
│   │   │   ├── DashboardController.js  # 27KB  대시보드 (날씨+앙상블+코칭)
│   │   │   ├── TableRenderer.js        # 16KB  Tabulator 래퍼
│   │   │   ├── PlayerAnalyzer.js       #  9KB  통계/트렌드/상관분석
│   │   │   ├── DataStore.js            #  6KB  데이터 캐시/필터
│   │   │   ├── supabase-data.js        #  3KB  Supabase 연결
│   │   │   ├── xgb-models.js           # 396KB XGBoost 트리 JSON
│   │   │   ├── poly-mlr.js             #  4KB  Poly3+Ridge 계수
│   │   │   ├── trackmap-data.js        # 73KB  평창 트랙 3D 좌표
│   │   │   └── (라이브러리 .min.js 14개)
│   │   └── css/
│   │       ├── main.css                # 52KB  디자인 시스템
│   │       ├── dashboard.css           # 10KB  대시보드 (글래스모피즘)
│   │       └── (라이브러리 .min.css 4개)
│   ├── bundle.js            # 번들러 스크립트
│   └── dist/
│       └── index.html       # 번들 결과 (2.2MB)
│
├── docs/
│   ├── ARCHITECTURE.md      # 이 문서
│   ├── RAILWAY_TROUBLESHOOTING.md  # 배포 트러블슈팅
│   └── screenshots/
│
├── Dockerfile               # python:3.12-slim + uvicorn
├── railway.json             # Railway 배포 설정 (DOCKERFILE 빌더)
├── nixpacks.toml            # 대안 빌더 (참고용)
├── nginx.conf               # Nginx 설정 (대안 배포용)
├── requirements.txt         # 루트 복사본 (빌더 감지용)
├── .env.example             # 환경변수 템플릿
└── .gitignore
```
