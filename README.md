<div align="center">

# Skeleton Race Analysis Platform

### AI-based Race Analysis & Prediction System

[![Live Demo](https://img.shields.io/badge/Live_Demo-Railway-blueviolet?style=for-the-badge)](https://skeleton-analysis-production-d1bb.up.railway.app/)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![JavaScript](https://img.shields.io/badge/Vanilla_JS-ES2024-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com)
[![XGBoost](https://img.shields.io/badge/XGBoost-ML_Model-EC4E20?style=for-the-badge)](https://xgboost.readthedocs.io)

<br/>

**Skeleton / Luge / Bobsled** race data analysis platform with<br/>
ML-powered finish time prediction and AI coaching chatbot.

[Live Demo](https://skeleton-analysis-production-d1bb.up.railway.app/) | [Tech Stack](#-tech-stack) | [Getting Started](#-getting-started)

</div>

---

## Table of Contents

- [Project Overview](#-project-overview)
- [Abstract](#-abstract)
- [Key Features](#-key-features)
- [System Architecture](#-system-architecture)
- [Tech Stack](#-tech-stack)
- [Prediction Models](#-prediction-models)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Testing](#-testing)
- [Team](#-team)
- [References](#-references)

---

## Project Overview

> **"0.1s faster start = ~0.3s faster finish"** — In sliding sports, 0.01s decides the medal.

A full-stack web platform for collecting, analyzing, and predicting **Skeleton, Luge, and Bobsled** race data at the Pyeongchang Alpensia Sliding Centre (1,376m, 16 curves).

### Problem & Solution

| Problem | Our Solution |
|---------|-------------|
| Race data scattered across PDFs/spreadsheets | Unified Supabase DB with REST API |
| Manual split-time comparison | Interactive tables + charts for instant comparison |
| Weather impact on performance unclear | Temperature, humidity, pressure, ice conditions integrated into ML models |
| Coaching strategy relies on intuition | AI chatbot provides data-driven coaching insights |
| No integrated environment + start model in prior research | XGBoost + Polynomial MLR ensemble prediction |

---

## Abstract

This platform provides an end-to-end data analytics and prediction system for **sliding sports** (Skeleton, Luge, Bobsled) at the Pyeongchang Alpensia Sliding Centre.

It integrates **real-time weather data** (temperature, humidity, barometric pressure, ice temperature) with **race split times** to predict finish times using an ensemble of **XGBoost** and **Polynomial Ridge Regression** models. The system achieves cross-validated R2 > 0.95 for skeleton predictions.

An **AI chatbot** powered by LLM function routing enables natural language queries against the race database with a zero-hallucination pipeline that verifies every number against actual data.

---

## Key Features

### 1. Dashboard — 3-Panel Analysis Interface

<table>
<tr>
<td width="33%" align="center"><b>Input Panel</b></td>
<td width="33%" align="center"><b>Track Map Visualization</b></td>
<td width="33%" align="center"><b>AI Prediction + Coaching</b></td>
</tr>
<tr>
<td>

- Athlete profile input
- Real-time weather (KMA API)
- Air density / dewpoint auto-calc
- Ice temperature input
- Outlier filtering toggle

</td>
<td>

- Pyeongchang track SVG overview
- Turn 1-16 curve labeling
- Speed heatmap per segment
- Drag zoom control
- Sensor marker display

</td>
<td>

- XGBoost / MLR predictions
- Bootstrap confidence intervals
- Segment-level coaching tips
- Gender-separated modeling
- Model comparison charts

</td>
</tr>
</table>

### 2. Track Map Analysis

- **SVG-based** Pyeongchang track topography rendering
- Curve-by-curve entry speed, temperature, and time overlay
- **Color gradient** speed legend (60-140 km/h)
- Click any curve for detailed analysis panel

### 3. Explore & Compare

- **Multi-filtering**: athlete name, nationality, date, gender, session
- **Tabulator.js** sortable interactive data table
- **Checkbox selection** for parallel split-time comparison
- **Head-to-Head** automatic comparison analysis

### 4. AI Chatbot — Zero-Hallucination Pipeline

```
User Question -> LLM Function Routing -> DB Query -> Result Verification -> Natural Language Response
```

- **LLM-based function routing** instead of keyword matching (18 insight functions)
- Korean particle stripping + DB-based Korean name resolution
- **Every number verified against DB source** — prevents hallucination
- Supports monthly trends, best/worst records, athlete comparisons via natural language

### 5. Multi-Sport Support

| Sport | Data | Prediction Model |
|-------|------|-----------------|
| Skeleton | Full support | XGBoost V2 + Poly MLR |
| Luge | Data analysis | XGBoost V1 |
| Bobsled | Data analysis | XGBoost V1 |

---

## System Architecture

```
+----------------------------------------------------------+
|                    Client (Browser)                       |
|  +----------+ +----------+ +----------+ +--------------+ |
|  |Dashboard | | TrackMap | | Explore/ | |   Chatbot    | |
|  |Controller| | Renderer | | Compare  | |   (LLM)     | |
|  +-----+----+ +-----+----+ +-----+----+ +------+------+ |
|        |             |            |              |        |
|  +-----+-------------+------------+--------------+-----+  |
|  |              DataStore (Client Cache)               |  |
|  +---------------------------+-------------------------+  |
|                              |                            |
|  +---------------------------+-------------------------+  |
|  |         PredictionModel (JS, Client-side)           |  |
|  |  +---------+ +----------+ +----------------------+ |  |
|  |  |XGBoost  | |Poly MLR  | | Ensemble + K-Fold    | |  |
|  |  |(JSON)   | |(JSON)    | | + Bootstrap CI       | |  |
|  |  +---------+ +----------+ +----------------------+ |  |
|  +----------------------------------------------------+  |
+-----------------------------+-----------------------------+
                              | HTTPS
              +---------------+--------------+
              |   Nginx (Railway)            |
              |  +------------------------+  |
              |  | /api/kma/*  -> KMA API |  |
              |  | /api/llm/*  -> LLM API |  |
              |  | /api/records-> FastAPI  |  |
              |  +------------------------+  |
              +---------------+--------------+
                              |
              +---------------+--------------+
              |  FastAPI Backend             |
              |  - /api/records              |
              |  - Supabase DataService      |
              +---------------+--------------+
                              |
              +---------------+--------------+
              |  Supabase (PostgreSQL)       |
              |  - skeleton_records          |
              |  - luge_records              |
              |  - bobsled_records           |
              |  - athletes                  |
              |  - track_metadata            |
              +------------------------------+
```

---

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **Vanilla JavaScript (ES2024)** | SPA architecture, module-based |
| **Chart.js** + Plugins | Speed/time charts, zoom, annotations, datalabels |
| **D3.js** | SVG track map rendering |
| **Tabulator.js** | Interactive data tables |
| **Tippy.js** | Tooltip UI |
| **Luxon** | Date/time handling |
| **html2canvas + jsPDF** | Dashboard PDF export |
| **PapaParse** | CSV parsing |
| **simple-statistics** | Client-side statistical computation |

### Backend

| Technology | Purpose |
|------------|---------|
| **FastAPI** | REST API server |
| **Uvicorn** | ASGI server |
| **httpx** | Async HTTP for Supabase |
| **Supabase (PostgreSQL)** | Race records DB + Athletes DB |

### ML / Prediction

| Technology | Purpose |
|------------|---------|
| **XGBoost** | Finish time prediction (main model) |
| **scikit-learn** | Polynomial Ridge Regression, Cross-Validation |
| **NumPy / Pandas** | Data preprocessing |

### Infra / DevOps

| Technology | Purpose |
|------------|---------|
| **Railway** | Deployment platform (Nixpacks) |
| **Nginx** | Static file serving + API proxy (CORS bypass) |
| **Docker** | Containerization |
| **Playwright** | E2E testing |
| **axe-core** | Accessibility testing |

---

## Prediction Models

> Details: [PREDICTION_MODEL.md](PREDICTION_MODEL.md) | Prior Research: [LITERATURE_AND_PROPOSAL.md](LITERATURE_AND_PROPOSAL.md)

### Model Pipeline

```
Raw Data (Supabase)
    |
    +-- Outlier filtering (Skidding, DNF, abnormal splits)
    +-- Gender separation (M/F separate training)
    |
    +--> Model 1: XGBoost
    |    Features: start_time, int1-4, air_density, ice_temp, dewpoint
    |    Output: finish time prediction
    |
    +--> Model 2: Polynomial Ridge MLR (degree=3)
    |    Features: start_time, int1-4, environmental vars
    |    Output: finish time prediction
    |
    +--> Ensemble (weighted average)
         + K-Fold Cross Validation (k=5)
         + Bootstrap Confidence Interval (95%)
```

### Domain Knowledge

| Rule | Value |
|------|-------|
| Start 0.1s reduction -> Finish reduction | **~0.3s** (3x amplification) |
| Normal Start range (Male) | 4.7 - 5.5s |
| Normal Finish range | 50 - 55s |
| Environmental factors | Air density, ice temp, dewpoint |

### Validation Performance

| Model | R2 (CV) | MAE | Note |
|-------|---------|-----|------|
| XGBoost V2 | > 0.95 | < 0.15s | Skeleton main |
| Poly MLR (deg=3) | > 0.93 | < 0.20s | Interpretable model |
| Ensemble | > 0.96 | < 0.13s | Final prediction |

---

## Project Structure

```
skeleton-analysis/
+-- backend/                    # FastAPI server
|   +-- main.py                 # API endpoints + static file serving
|   +-- models.py               # Pydantic data models
|   +-- data_service.py         # Supabase data loader (async)
|   +-- config.py               # Configuration
|   +-- requirements.txt        # Python dependencies
|
+-- web/
|   +-- src/
|   |   +-- index.html          # SPA entry point
|   |   +-- js/
|   |   |   +-- DashboardController.js  # Dashboard tab logic
|   |   |   +-- DataStore.js            # Client data cache
|   |   |   +-- PredictionModel.js      # ML inference engine (1,121 lines)
|   |   |   +-- TrackMapRenderer.js     # SVG track map rendering
|   |   |   +-- ChartManager.js         # Chart.js wrapper
|   |   |   +-- Chatbot.js              # AI chatbot (LLM + insights)
|   |   |   +-- TableRenderer.js        # Tabulator wrapper
|   |   |   +-- PlayerAnalyzer.js       # Athlete analysis logic
|   |   |   +-- UIController.js         # UI state management
|   |   |   +-- xgb-models.js           # XGBoost JSON models
|   |   |   +-- poly-mlr.js             # Polynomial MLR coefficients
|   |   |   +-- trackmap-data.js        # Track metadata
|   |   +-- css/
|   |       +-- main.css                # Main styles
|   |       +-- dashboard.css           # Dashboard layout
|   +-- dist/                   # Build output
|   +-- bundle.js               # Bundler
|
+-- test/
|   +-- unit/                   # Unit tests
|   |   +-- datastore.test.js
|   |   +-- prediction.test.js
|   |   +-- tableutil.test.js
|   +-- e2e/                    # E2E tests (Playwright)
|       +-- dashboard.test.js
|       +-- tabs.test.js
|       +-- trackmap.test.js
|       +-- prediction.test.js
|
+-- build_v2.py                 # XGBoost V2 model builder
+-- build_poly_mlr.py           # Polynomial MLR builder
+-- train_xgb.py                # XGBoost hyperparameter tuning
+-- build_track_meta.py         # Track metadata builder
+-- skeleton_weather_combined.csv  # Weather + race combined data
|
+-- Dockerfile                  # Nginx-based container
+-- nixpacks.toml               # Railway deployment config
+-- nginx.conf                  # Nginx proxy config
+-- PREDICTION_MODEL.md         # Prediction model documentation
+-- LITERATURE_AND_PROPOSAL.md  # Literature review & research proposal
+-- DASHBOARD_DESIGN.md         # Dashboard UI design document
```

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js (for running tests)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/Technoetic/skeleton-analysis.git
cd skeleton-analysis

# 2. Install Python dependencies
pip install -r backend/requirements.txt

# 3. Start FastAPI server
python -m uvicorn backend.main:app --host 127.0.0.1 --port 3000

# 4. Open in browser
open http://localhost:3000
```

### Docker

```bash
docker build -t skeleton-analysis .
docker run -p 8080:80 skeleton-analysis
```

### Railway Deployment

> `nixpacks.toml` automatically configures the Python environment and starts Uvicorn.

```bash
railway up
```

---

## Testing

```bash
# Unit tests
npx playwright test test/unit/

# E2E tests (Playwright)
npx playwright test test/e2e/

# Accessibility tests (axe-core)
npx playwright test test/e2e/ --grep accessibility
```

---

## Team

<table>
<tr align="center">
<td>
<a href="https://github.com/Technoetic">
<img src="https://github.com/Technoetic.png" width="120" style="border-radius:50%"/>
<br/><b>Technoetic</b>
</a>
<br/>Full Stack / ML / Design
</td>
</tr>
</table>

---

## References

<details>
<summary><b>Prior Research & Papers</b></summary>

| Author | Year | Title | Key Contribution |
|--------|------|-------|-----------------|
| Vracas et al. | 2023 | Altenberg Track Simulation | 1D motion equation, sensitivity analysis |
| Poirier | 2011 | F.A.S.T. 3.2b Friction Model | Runner-ice nonlinear friction model |
| Colyer et al. | 2017 | Elite Skeleton Start Performance | Start prediction R2=0.86 |

> Details: [LITERATURE_AND_PROPOSAL.md](LITERATURE_AND_PROPOSAL.md)

</details>

<details>
<summary><b>Technical Documentation</b></summary>

- [Prediction Model Algorithms](PREDICTION_MODEL.md) — 6 model formulas, cross-validation, bootstrap CI
- [Dashboard Design Analysis](DASHBOARD_DESIGN.md) — 3-panel layout, color scheme, UI components
- [Literature Review & Proposal](LITERATURE_AND_PROPOSAL.md) — 7-factor analysis, key cited research

</details>

---

<div align="center">

**Built for the sliding sports community**

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.app)

</div>
