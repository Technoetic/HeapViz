"""Build V2 XGBoost models JS file (skeleton V2 features, luge/bobsled V1)"""
import json, math, requests
import numpy as np
from xgboost import XGBRegressor
from sklearn.model_selection import cross_val_score
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

SUPABASE_URL = 'https://dxaehcocrbvhatyfmrvp.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4YWVoY29jcmJ2aGF0eWZtcnZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk0MDAxNywiZXhwIjoyMDg3NTE2MDE3fQ.VVnZrN6hfAeMxKZ5i3-_iUAjPzo8xvgkRbEfonYT2wM'
HEADERS = {'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY}

def calc_dewpoint(ta, hm):
    a, b = 17.27, 237.3
    alpha = (a * ta) / (b + ta) + math.log(hm / 100.0)
    return (b * alpha) / (a - alpha)

def calc_air_density(ta, hm, pa):
    T = ta + 273.15
    Rd, Rv = 287.058, 461.495
    es = 6.1078 * math.exp((17.27 * ta) / (ta + 237.3))
    e = (hm / 100) * es
    return ((pa - e) * 100 / (Rd * T)) + (e * 100 / (Rv * T))

def model_to_js_trees(model):
    booster = model.get_booster()
    trees_str = booster.get_dump(dump_format='json')
    js_trees = []
    for tree_str in trees_str:
        nodes = []
        def traverse(n, idx=0):
            if 'leaf' in n:
                nodes.append([-1, 0, 0, round(n['leaf'], 8)])
                return idx
            feat_idx = int(n['split'][1:]) if n['split'].startswith('f') else int(n['split'])
            threshold = round(n['split_condition'], 6)
            nodes.append([feat_idx, threshold, 0, 0])
            current_idx = idx
            left_idx = len(nodes)
            traverse(n['children'][0], left_idx)
            right_idx = len(nodes)
            nodes[current_idx][2] = right_idx
            traverse(n['children'][1], right_idx)
            return current_idx
        traverse(json.loads(tree_str))
        js_trees.append(nodes)
    return js_trees

def get_base_score(model):
    try:
        config = json.loads(model.get_booster().save_config())
        bs_raw = config['learner']['learner_model_param']['base_score']
        return float(str(bs_raw).strip('[]'))
    except:
        return 0.5

def fetch_all(path):
    all_rows = []
    offset = 0
    while True:
        url = SUPABASE_URL + path + ('&' if '?' in path else '?') + 'offset=' + str(offset) + '&limit=1000'
        rows = requests.get(url, headers=HEADERS).json()
        all_rows.extend(rows)
        if len(rows) < 1000:
            break
        offset += 1000
    return all_rows

# ===== SKELETON V2 =====
print("=== Skeleton V2 ===")
all_rows = fetch_all('/rest/v1/skeleton_records?select=*,athletes!inner(height_cm,weight_kg)&status=eq.OK&finish=not.is.null&air_temp=not.is.null&order=id')
print(f"  Raw records: {len(all_rows)}")

valid = []
for r in all_rows:
    try:
        ath = r.get('athletes', {})
        h = float(ath.get('height_cm') or 0)
        w = float(ath.get('weight_kg') or 0)
        if h <= 0 or w <= 0:
            continue
        finish = float(r['finish'])
        st = float(r['start_time'])
        if not (45 <= finish <= 60 and 3 <= st <= 8):
            continue
        ta = float(r['air_temp'])
        hm = float(r['humidity_pct'])
        pa = float(r['pressure_hpa'])
        temp_avg = float(r.get('temp_avg') or (ta - 4))
        dp = calc_dewpoint(ta, hm)
        ad = calc_air_density(ta, hm, pa)
        valid.append([st, h, w, temp_avg, ad, dp, finish])
    except:
        continue

X_skel = np.array([v[:6] for v in valid])
y_skel = np.array([v[6] for v in valid])

skel_model = XGBRegressor(
    learning_rate=0.1, max_depth=3, n_estimators=300, subsample=0.8,
    random_state=42, verbosity=0
)
skel_model.fit(X_skel, y_skel)
skel_pred = skel_model.predict(X_skel)
skel_r2 = float(r2_score(y_skel, skel_pred))
skel_cv = cross_val_score(skel_model, X_skel, y_skel, cv=5, scoring='r2')
skel_rmse = float(np.sqrt(mean_squared_error(y_skel, skel_pred)))
skel_mae = float(mean_absolute_error(y_skel, skel_pred))
skel_imp = {}
feat_names = ['start_time', 'height_cm', 'weight_kg', 'temp_avg', 'air_density', 'dewpoint_c']
for i, f in enumerate(feat_names):
    skel_imp[f] = round(float(skel_model.feature_importances_[i]), 4)

print(f"  Valid: {len(valid)}, R2={skel_r2:.4f}, CV={skel_cv.mean():.4f}, RMSE={skel_rmse:.4f}, MAE={skel_mae:.4f}")

# ===== LUGE & BOBSLED (V1 features) =====
V1_F = ['start_time', 'temp_avg', 'air_temp', 'humidity_pct', 'pressure_hpa', 'dewpoint_c', 'wind_speed_ms', 'is_female']
V1_FL = ['스타트 시간', '얼음 온도', '기온', '습도', '현지기압', '이슬점', '풍속', '여성 여부']

sport_models = {}
for sport in ['luge', 'bobsled']:
    print(f"\n=== {sport} V1 ===")
    table = sport + '_records'
    recs = fetch_all(f'/rest/v1/{table}?select=*&status=eq.OK&finish=not.is.null&air_temp=not.is.null&order=id')
    print(f"  Raw: {len(recs)}")

    vv = []
    for r in recs:
        try:
            finish = float(r['finish'])
            st = float(r['start_time'])
            if not (40 <= finish <= 70 and 3 <= st <= 10):
                continue
            ta = float(r.get('air_temp') or 0)
            hm = float(r.get('humidity_pct') or 50)
            pa = float(r.get('pressure_hpa') or 930)
            ws = float(r.get('wind_speed_ms') or 0)
            tavg = float(r.get('temp_avg') or (ta - 4))
            dp = calc_dewpoint(ta, hm)
            is_f = 1 if r.get('gender') == 'W' else 0
            vv.append([st, tavg, ta, hm, pa, dp, ws, is_f, finish])
        except:
            continue

    X = np.array([v[:8] for v in vv])
    y = np.array([v[8] for v in vv])
    m = XGBRegressor(
        learning_rate=0.1, max_depth=3, min_child_weight=3, n_estimators=200,
        colsample_bytree=0.7, reg_alpha=0.1, reg_lambda=3.0, subsample=0.9,
        random_state=42, verbosity=0
    )
    m.fit(X, y)
    yp = m.predict(X)
    cv = cross_val_score(m, X, y, cv=min(5, max(2, len(vv) // 5)), scoring='r2')
    imp = {}
    for i in range(8):
        imp[V1_F[i]] = round(float(m.feature_importances_[i]), 4)

    sport_models[sport] = {
        'pre': {
            'bs': round(get_base_score(m), 6),
            'f': V1_F[:],
            'fl': V1_FL[:],
            'n': len(vv),
            'r2': round(float(r2_score(y, yp)), 4),
            'cv': round(float(cv.mean()), 4),
            'rmse': round(float(np.sqrt(mean_squared_error(y, yp))), 4),
            'mae': round(float(mean_absolute_error(y, yp)), 4),
            'imp': imp,
            't': model_to_js_trees(m),
        }
    }
    print(f"  Valid: {len(vv)}, R2={r2_score(y,yp):.4f}, CV={cv.mean():.4f}")

# ===== SKELETON LIVE (existing model) =====
print("\n=== Skeleton Live ===")
skel_live_m = XGBRegressor()
skel_live_m.load_model('web/src/js/xgb_live.json')
skel_live_meta = json.load(open('web/src/js/xgb_meta.json'))
print(f"  Loaded existing live model")

# ===== BUILD JS =====
V2_F = ['start_time', 'height_cm', 'weight_kg', 'temp_avg', 'air_density', 'dewpoint_c']
V2_FL = ['스타트 시간', '키(cm)', '체중(kg)', '얼음 온도', '공기밀도', '이슬점']

skeleton_obj = {
    'pre': {
        'bs': round(get_base_score(skel_model), 6),
        'f': V2_F, 'fl': V2_FL,
        'n': len(valid), 'r2': round(skel_r2, 4), 'cv': round(float(skel_cv.mean()), 4),
        'rmse': round(skel_rmse, 4), 'mae': round(skel_mae, 4),
        'imp': skel_imp, 'v': 2,
        't': model_to_js_trees(skel_model),
    },
    'live': {
        'bs': round(get_base_score(skel_live_m), 6),
        'f': skel_live_meta['live']['features'],
        'fl': skel_live_meta['live']['featureLabels'],
        'n': skel_live_meta['live']['trainN'],
        'r2': skel_live_meta['live']['trainR2'],
        'cv': skel_live_meta['live']['cvR2'],
        'rmse': skel_live_meta['live']['trainRMSE'],
        'mae': skel_live_meta['live']['trainMAE'],
        'imp': skel_live_meta['live'].get('importance', {}),
        't': model_to_js_trees(skel_live_m),
    }
}

model_obj = {
    'skeleton': skeleton_obj,
    'luge': sport_models['luge'],
    'bobsled': sport_models['bobsled'],
}

js = '// XGBoost models per sport (V2 skeleton, auto-generated)\n'
js += 'const XGB_MODELS=' + json.dumps(model_obj, separators=(',', ':')) + ';\n\n'
js += 'function xgbPredict(m, x) {\n'
js += '  let s = m.bs;\n'
js += '  for (const t of m.t) {\n'
js += '    let i = 0;\n'
js += '    while (true) {\n'
js += '      const n = t[i];\n'
js += '      if (n[0] === -1) { s += n[3]; break; }\n'
js += '      if (x[n[0]] < n[1]) i++; else i = n[2];\n'
js += '    }\n'
js += '  }\n'
js += '  return s;\n'
js += '}\n'

with open('web/src/js/xgb-models.js', 'w', encoding='utf-8') as f:
    f.write(js)

print(f"\nxgb-models.js: {len(js):,} chars")
print("DONE")
