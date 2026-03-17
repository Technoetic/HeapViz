"""
XGBoost 스켈레톤 예측 모델 재학습 스크립트
- Supabase에서 skeleton_records + athletes 데이터 가져오기
- 하이퍼파라미터 튜닝 (과적합 방지)
- 선수 ID 변수 중요도 점검
- JS 추론용 모델 파일 생성
"""

import json
import math
import requests
import numpy as np
import pandas as pd
from xgboost import XGBRegressor
from sklearn.model_selection import cross_val_score, GridSearchCV, KFold
from sklearn.metrics import r2_score, mean_squared_error, mean_absolute_error

# ── Supabase 설정 ──
SUPABASE_URL = 'https://dxaehcocrbvhatyfmrvp.supabase.co'
SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4YWVoY29jcmJ2aGF0eWZtcnZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk0MDAxNywiZXhwIjoyMDg3NTE2MDE3fQ.VVnZrN6hfAeMxKZ5i3-_iUAjPzo8xvgkRbEfonYT2wM'

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
}


def fetch_all(table, select='*'):
    """Supabase에서 페이지네이션으로 전체 데이터 가져오기"""
    rows = []
    limit = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select={select}&order=id&offset={offset}&limit={limit}"
        resp = requests.get(url, headers=HEADERS)
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        rows.extend(batch)
        offset += limit
    return rows


def calc_dewpoint(t, rh):
    """이슬점 계산 (Magnus formula)"""
    if t is None or rh is None or rh <= 0:
        return None
    a, b = 17.27, 237.7
    alpha = (a * t) / (b + t) + math.log(rh / 100.0)
    return (b * alpha) / (a - alpha)


def prepare_data():
    """데이터 로드 및 전처리"""
    print("▶ Supabase에서 데이터 로드 중...")
    records = fetch_all('skeleton_records',
        'id,date,session,gender,format,nat,name,run,status,start_time,int1,int2,int3,int4,finish,speed,athlete_id,air_temp,humidity_pct,pressure_hpa,wind_speed_ms,dewpoint_c,ice_temp_est,temp_avg')
    athletes = fetch_all('athletes',
        'athlete_id,name,nat,gender,height_cm,weight_kg,birth_year')

    df = pd.DataFrame(records)
    ath_df = pd.DataFrame(athletes)

    print(f"  전체 레코드: {len(df)}건, 선수: {len(ath_df)}명")

    # OK 상태 + finish 있는 것만
    df = df[df['status'] == 'OK'].copy()
    df = df.dropna(subset=['finish', 'start_time'])
    df['finish'] = pd.to_numeric(df['finish'], errors='coerce')
    df['start_time'] = pd.to_numeric(df['start_time'], errors='coerce')
    for col in ['int1', 'int2', 'int3', 'int4', 'speed',
                'temp_avg', 'air_temp', 'humidity_pct', 'pressure_hpa',
                'wind_speed_ms', 'dewpoint_c', 'ice_temp_est']:
        df[col] = pd.to_numeric(df[col], errors='coerce')

    # 이상치 제거: finish > 60초 또는 < 45초 (비정상 출발)
    df = df[(df['finish'] >= 45) & (df['finish'] <= 60)]
    # start_time 정상 범위: 3~8초
    df = df[(df['start_time'] >= 3) & (df['start_time'] <= 8)]

    print(f"  필터링 후: {len(df)}건")

    # 성별 인코딩
    df['is_female'] = (df['gender'] == 'W').astype(int)

    # 선수 정보 병합
    if 'athlete_id' in df.columns and len(ath_df) > 0:
        ath_merge = ath_df[['athlete_id', 'height_cm', 'weight_kg']].copy()
        df = df.merge(ath_merge, on='athlete_id', how='left')

    return df, ath_df


def train_pre_model(df):
    """Pre-race 모델 학습 (경기 전 예측)"""
    print("\n" + "="*60)
    print("▶ Pre-race XGBoost 모델 학습")
    print("="*60)

    # 피처 정의: 이전 모델과 동일한 구조
    # temp_avg = 실측 트랙 얼음 온도 (PDF에서 추출)
    feature_cols = ['start_time', 'temp_avg', 'air_temp', 'humidity_pct',
                    'pressure_hpa', 'dewpoint_c', 'wind_speed_ms', 'is_female']

    feature_labels = {
        'start_time': '스타트 시간',
        'temp_avg': '얼음 온도',
        'air_temp': '기온',
        'humidity_pct': '습도',
        'pressure_hpa': '현지기압',
        'dewpoint_c': '이슬점',
        'wind_speed_ms': '풍속',
        'is_female': '여성 여부',
    }

    # 결측치 제거
    work = df.dropna(subset=feature_cols + ['finish']).copy()
    X = work[feature_cols].values
    y = work['finish'].values

    print(f"  학습 데이터: {len(X)}건, 피처: {feature_cols}")

    # ── 1단계: 선수 ID 변수 중요도 점검 ──
    print("\n── 선수 ID 변수 중요도 점검 ──")

    # athlete_id를 범주형 인코딩하여 테스트
    if 'athlete_id' in work.columns:
        work_id = work.copy()
        # 빈도 기반 인코딩 (label encoding)
        id_map = {aid: i for i, aid in enumerate(work_id['athlete_id'].unique())}
        work_id['athlete_id_enc'] = work_id['athlete_id'].map(id_map)

        X_with_id = work_id[feature_cols + ['athlete_id_enc']].values
        y_id = work_id['finish'].values

        # Quick test
        model_with_id = XGBRegressor(
            n_estimators=100, max_depth=4, learning_rate=0.1,
            random_state=42, verbosity=0
        )
        cv_with_id = cross_val_score(model_with_id, X_with_id, y_id,
            cv=5, scoring='r2')

        model_without_id = XGBRegressor(
            n_estimators=100, max_depth=4, learning_rate=0.1,
            random_state=42, verbosity=0
        )
        cv_without_id = cross_val_score(model_without_id, X, y,
            cv=5, scoring='r2')

        print(f"  선수ID 포함 CV R²: {cv_with_id.mean():.4f} (±{cv_with_id.std():.4f})")
        print(f"  선수ID 제외 CV R²: {cv_without_id.mean():.4f} (±{cv_without_id.std():.4f})")

        if cv_with_id.mean() > cv_without_id.mean() + 0.02:
            print("  → 선수ID가 유의미 → 포함")
            feature_cols.append('athlete_id_enc')
            feature_labels['athlete_id_enc'] = '선수 인코딩'
            work['athlete_id_enc'] = work['athlete_id'].map(id_map)
            X = work[feature_cols].values
            # id_map 저장 (JS 변환용)
        else:
            print("  → 선수ID가 노이즈 또는 무의미 → 제외")
            id_map = None

    # ── 2단계: 하이퍼파라미터 그리드 서치 ──
    print("\n── 하이퍼파라미터 최적화 (과적합 방지) ──")

    param_grid = {
        'n_estimators': [50, 100, 200, 300],
        'max_depth': [3, 4, 5],
        'learning_rate': [0.01, 0.05, 0.1],
        'min_child_weight': [3, 5, 10],
        'subsample': [0.7, 0.8, 0.9],
        'colsample_bytree': [0.7, 0.8, 1.0],
        'reg_alpha': [0, 0.1, 1.0],
        'reg_lambda': [1.0, 5.0, 10.0],
    }

    # 2-stage search: coarse → fine
    # Stage 1: core structural params
    print("  Stage 1: 구조적 파라미터 탐색...")
    stage1_grid = {
        'n_estimators': [100, 200, 300, 500],
        'max_depth': [3, 4, 5, 6],
        'learning_rate': [0.01, 0.05, 0.1],
        'min_child_weight': [1, 3, 5],
    }

    base_model = XGBRegressor(
        subsample=0.8, colsample_bytree=0.8,
        reg_alpha=0.1, reg_lambda=5.0,
        random_state=42, verbosity=0
    )

    gs1 = GridSearchCV(
        base_model, stage1_grid,
        cv=5, scoring='r2', n_jobs=-1, refit=True
    )
    gs1.fit(X, y)
    best1 = gs1.best_params_
    print(f"  Stage 1 최적: {best1}")
    print(f"  Stage 1 CV R²: {gs1.best_score_:.4f}")

    # Stage 2: regularization params
    print("  Stage 2: 정규화 파라미터 탐색...")
    stage2_grid = {
        'subsample': [0.7, 0.8, 0.9],
        'colsample_bytree': [0.7, 0.8, 1.0],
        'reg_alpha': [0, 0.1, 0.5, 1.0],
        'reg_lambda': [1.0, 3.0, 5.0, 10.0],
    }

    refined_model = XGBRegressor(
        n_estimators=best1['n_estimators'],
        max_depth=best1['max_depth'],
        learning_rate=best1['learning_rate'],
        min_child_weight=best1['min_child_weight'],
        random_state=42, verbosity=0
    )

    gs2 = GridSearchCV(
        refined_model, stage2_grid,
        cv=5, scoring='r2', n_jobs=-1, refit=True
    )
    gs2.fit(X, y)
    best2 = gs2.best_params_
    print(f"  Stage 2 최적: {best2}")
    print(f"  Stage 2 CV R²: {gs2.best_score_:.4f}")

    # ── 3단계: 최종 모델 학습 ──
    final_params = {**best1, **best2, 'random_state': 42, 'verbosity': 0}
    print(f"\n── 최종 파라미터 ──")
    for k, v in final_params.items():
        if k not in ('random_state', 'verbosity'):
            print(f"  {k}: {v}")

    final_model = XGBRegressor(**final_params)
    final_model.fit(X, y)

    # 성능 평가
    y_pred = final_model.predict(X)
    train_r2 = r2_score(y, y_pred)
    train_rmse = mean_squared_error(y, y_pred) ** 0.5
    train_mae = mean_absolute_error(y, y_pred)

    cv_scores = cross_val_score(final_model, X, y, cv=5, scoring='r2')
    cv_r2 = cv_scores.mean()
    cv_std = cv_scores.std()

    cv_neg_mae = cross_val_score(final_model, X, y, cv=5, scoring='neg_mean_absolute_error')
    cv_mae = -cv_neg_mae.mean()

    print(f"\n── 최종 성능 ──")
    print(f"  Train R²:  {train_r2:.4f}")
    print(f"  CV R²:     {cv_r2:.4f} (±{cv_std:.4f})")
    print(f"  Train RMSE: {train_rmse:.4f}")
    print(f"  Train MAE:  {train_mae:.4f}")
    print(f"  CV MAE:     {cv_mae:.4f}")
    print(f"  과적합 갭:  {train_r2 - cv_r2:.4f} (이전: {0.7574 - 0.5965:.4f})")

    # 변수 중요도
    imp = dict(zip(feature_cols, final_model.feature_importances_.tolist()))
    print(f"\n── 변수 중요도 ──")
    for feat, score in sorted(imp.items(), key=lambda x: -x[1]):
        print(f"  {feature_labels.get(feat, feat):12s}: {score*100:.1f}%")

    return final_model, feature_cols, feature_labels, imp, {
        'n': len(X), 'train_r2': train_r2, 'cv_r2': cv_r2, 'cv_std': cv_std,
        'rmse': train_rmse, 'mae': train_mae, 'cv_mae': cv_mae,
        'params': {k: v for k, v in final_params.items() if k not in ('random_state', 'verbosity')},
    }, id_map if 'athlete_id_enc' in feature_cols else None


def train_live_model(df):
    """Live 모델 학습 (경기 중 구간 시간 포함)"""
    print("\n" + "="*60)
    print("▶ Live XGBoost 모델 학습 (구간 시간 포함)")
    print("="*60)

    feature_cols = ['start_time', 'int1', 'int2', 'int3', 'int4',
                    'temp_avg', 'air_temp', 'humidity_pct',
                    'pressure_hpa', 'dewpoint_c', 'wind_speed_ms', 'is_female']
    feature_labels = {
        'start_time': '스타트 시간', 'int1': 'Int.1', 'int2': 'Int.2',
        'int3': 'Int.3', 'int4': 'Int.4',
        'temp_avg': '얼음 온도', 'air_temp': '기온', 'humidity_pct': '습도',
        'pressure_hpa': '현지기압', 'dewpoint_c': '이슬점', 'wind_speed_ms': '풍속',
        'is_female': '여성 여부',
    }

    work = df.dropna(subset=feature_cols + ['finish']).copy()
    X = work[feature_cols].values
    y = work['finish'].values

    print(f"  학습 데이터: {len(X)}건")

    # Live 모델은 정보량이 많아 과적합 위험 낮음, 하지만 적당히 제어
    param_grid = {
        'n_estimators': [100, 200, 300],
        'max_depth': [4, 5, 6],
        'learning_rate': [0.05, 0.1],
        'min_child_weight': [3, 5],
        'subsample': [0.8, 0.9],
        'colsample_bytree': [0.8, 1.0],
        'reg_lambda': [1.0, 5.0],
    }

    gs = GridSearchCV(
        XGBRegressor(random_state=42, verbosity=0),
        param_grid, cv=5, scoring='r2', n_jobs=-1, refit=True
    )
    gs.fit(X, y)

    final_model = gs.best_estimator_
    print(f"  최적 파라미터: {gs.best_params_}")

    y_pred = final_model.predict(X)
    train_r2 = r2_score(y, y_pred)
    train_rmse = mean_squared_error(y, y_pred) ** 0.5
    train_mae = mean_absolute_error(y, y_pred)
    cv_r2 = gs.best_score_
    cv_scores = cross_val_score(final_model, X, y, cv=5, scoring='r2')
    cv_std = cv_scores.std()

    print(f"  Train R²:  {train_r2:.4f}")
    print(f"  CV R²:     {cv_r2:.4f} (±{cv_std:.4f})")
    print(f"  Train RMSE: {train_rmse:.4f}")
    print(f"  CV MAE:     {train_mae:.4f}")

    imp = dict(zip(feature_cols, final_model.feature_importances_.tolist()))
    print(f"\n── 변수 중요도 ──")
    for feat, score in sorted(imp.items(), key=lambda x: -x[1]):
        print(f"  {feature_labels.get(feat, feat):12s}: {score*100:.1f}%")

    return final_model, feature_cols, feature_labels, imp, {
        'n': len(X), 'train_r2': train_r2, 'cv_r2': cv_r2, 'cv_std': cv_std,
        'rmse': train_rmse, 'mae': train_mae,
        'params': {k: v for k, v in gs.best_params_.items()},
    }


def model_to_js_trees(model):
    """XGBoost 모델을 JS 추론용 트리 배열로 변환"""
    booster = model.get_booster()
    trees_str = booster.get_dump(dump_format='json')
    js_trees = []

    def parse_tree(node):
        """트리 노드를 [feature_idx, threshold, right_child_idx, leaf_value] 형식으로 변환"""
        nodes = []

        def traverse(n, idx=0):
            if 'leaf' in n:
                nodes.append([-1, 0, 0, round(n['leaf'], 8)])
                return idx
            feat_idx = int(n['split'][1:]) if n['split'].startswith('f') else int(n['split'])
            threshold = round(n['split_condition'], 6)
            nodes.append([feat_idx, threshold, 0, 0])  # placeholder for right_child
            current_idx = idx

            # left child (yes)
            left_idx = len(nodes)
            traverse(n['children'][0], left_idx)

            # right child (no)
            right_idx = len(nodes)
            nodes[current_idx][2] = right_idx
            traverse(n['children'][1], right_idx)

            return current_idx

        traverse(json.loads(node))
        return nodes

    for tree_str in trees_str:
        js_trees.append(parse_tree(tree_str))

    return js_trees


def export_js(pre_model, pre_cols, pre_labels, pre_imp, pre_stats, pre_id_map,
              live_model, live_cols, live_labels, live_imp, live_stats):
    """JS 파일 생성"""
    print("\n" + "="*60)
    print("▶ JS 모델 파일 생성")
    print("="*60)

    pre_trees = model_to_js_trees(pre_model)
    live_trees = model_to_js_trees(live_model)

    # base_score: XGBoost 3.x extracts from booster config
    def get_base_score(model):
        try:
            config = json.loads(model.get_booster().save_config())
            bs_raw = config['learner']['learner_model_param']['base_score']
            # XGBoost 3.x returns "[5.43E1]" format — strip brackets
            bs_str = str(bs_raw).strip('[]')
            return float(bs_str)
        except:
            # fallback: use intercept_
            try:
                return float(model.intercept_[0] if hasattr(model.intercept_, '__len__') else model.intercept_)
            except:
                return 0.5

    pre_bs = get_base_score(pre_model)
    live_bs = get_base_score(live_model)

    # JS feature name mapping (match existing format)
    pre_f = pre_cols[:]
    pre_fl = [pre_labels.get(c, c) for c in pre_cols]
    live_f = live_cols[:]
    live_fl = [live_labels.get(c, c) for c in live_cols]

    model_obj = {
        'pre': {
            'bs': round(pre_bs, 6),
            'f': pre_f,
            'fl': pre_fl,
            'n': pre_stats['n'],
            'r2': round(pre_stats['train_r2'], 4),
            'cv': round(pre_stats['cv_r2'], 4),
            'rmse': round(pre_stats['rmse'], 4),
            'mae': round(pre_stats['mae'], 4),
            'imp': {k: round(v, 4) for k, v in pre_imp.items()},
            'id_map': pre_id_map,
            't': pre_trees,
        },
        'live': {
            'bs': round(live_bs, 6),
            'f': live_f,
            'fl': live_fl,
            'n': live_stats['n'],
            'r2': round(live_stats['train_r2'], 4),
            'cv': round(live_stats['cv_r2'], 4),
            'rmse': round(live_stats['rmse'], 4),
            'mae': round(live_stats['mae'], 4),
            'imp': {k: round(v, 4) for k, v in live_imp.items()},
            't': live_trees,
        }
    }

    # xgb-models.js
    js_content = "// XGBoost 모델 - Python 학습 → JS 추론 (자동 생성)\n"
    js_content += f"const XGB_MODELS={json.dumps(model_obj, separators=(',', ':'))};\n\n"
    js_content += """function xgbPredict(m, x) {
  let s = m.bs;
  for (const t of m.t) {
    let i = 0;
    while (true) {
      const n = t[i];
      if (n[0] === -1) {
        s += n[3];
        break;
      }
      if (x[n[0]] < n[1])
        i++;
      else
        i = n[2];
    }
  }
  return s;
}
"""

    js_path = 'web/src/js/xgb-models.js'
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
    print(f"  → {js_path} ({len(js_content):,} chars)")

    # xgb_meta.json
    meta = {
        'pre': {
            'features': pre_f,
            'featureLabels': pre_fl,
            'trainN': pre_stats['n'],
            'trainR2': round(pre_stats['train_r2'], 4),
            'trainRMSE': round(pre_stats['rmse'], 4),
            'trainMAE': round(pre_stats['mae'], 4),
            'cvR2': round(pre_stats['cv_r2'], 4),
            'cvR2Std': round(pre_stats['cv_std'], 4),
            'importance': {k: round(v, 4) for k, v in pre_imp.items()},
            'params': pre_stats['params'],
        },
        'live': {
            'features': live_f,
            'featureLabels': live_fl,
            'trainN': live_stats['n'],
            'trainR2': round(live_stats['train_r2'], 4),
            'trainRMSE': round(live_stats['rmse'], 4),
            'trainMAE': round(live_stats['mae'], 4),
            'cvR2': round(live_stats['cv_r2'], 4),
            'cvR2Std': round(live_stats['cv_std'], 4),
            'importance': {k: round(v, 4) for k, v in live_imp.items()},
            'params': live_stats['params'],
        }
    }

    meta_path = 'web/src/js/xgb_meta.json'
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)
    print(f"  → {meta_path}")

    return pre_stats, live_stats


def main():
    df, ath_df = prepare_data()

    # Pre-race 모델
    pre_model, pre_cols, pre_labels, pre_imp, pre_stats, pre_id_map = train_pre_model(df)

    # Live 모델
    live_model, live_cols, live_labels, live_imp, live_stats = train_live_model(df)

    # JS 파일 생성
    export_js(pre_model, pre_cols, pre_labels, pre_imp, pre_stats, pre_id_map,
              live_model, live_cols, live_labels, live_imp, live_stats)

    # ── 최종 비교 ──
    print("\n" + "="*60)
    print("▶ 이전 모델 vs 새 모델 비교")
    print("="*60)
    print(f"  {'':20s} {'이전':>10s} {'새 모델':>10s}")
    print(f"  {'─'*42}")
    print(f"  {'Pre-race Train R²':20s} {'0.7574':>10s} {pre_stats['train_r2']:>10.4f}")
    print(f"  {'Pre-race CV R²':20s} {'0.5965':>10s} {pre_stats['cv_r2']:>10.4f}")
    print(f"  {'Pre-race RMSE':20s} {'0.7508':>10s} {pre_stats['rmse']:>10.4f}")
    print(f"  {'Pre-race MAE':20s} {'0.5312':>10s} {pre_stats['mae']:>10.4f}")
    print(f"  {'과적합 갭':20s} {'0.1609':>10s} {pre_stats['train_r2']-pre_stats['cv_r2']:>10.4f}")
    print(f"  {'─'*42}")
    print(f"  {'Live Train R²':20s} {'0.9989':>10s} {live_stats['train_r2']:>10.4f}")
    print(f"  {'Live CV R²':20s} {'0.9727':>10s} {live_stats['cv_r2']:>10.4f}")
    print()
    print("✅ 완료!")


if __name__ == '__main__':
    main()
