"""Build V2 XGBoost: core 6 features + regularization (no onehot)"""
import json, math, requests
import numpy as np
from xgboost import XGBRegressor
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

SUPABASE_URL = 'https://dxaehcocrbvhatyfmrvp.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4YWVoY29jcmJ2aGF0eWZtcnZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk0MDAxNywiZXhwIjoyMDg3NTE2MDE3fQ.VVnZrN6hfAeMxKZ5i3-_iUAjPzo8xvgkRbEfonYT2wM'
headers = {'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY}

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

CORE_F = ['start_time', 'height_cm', 'weight_kg', 'temp_avg', 'air_density', 'dewpoint_c']
CORE_FL = ['\uc2a4\ud0c0\ud2b8 \uc2dc\uac04', '\ud0a4(cm)', '\uccb4\uc911(kg)',
           '\uc5bc\uc74c \uc628\ub3c4', '\uacf5\uae30\ubc00\ub3c4', '\uc774\uc2ac\uc810']

V2_PARAMS = dict(
    learning_rate=0.1, max_depth=3, n_estimators=300, subsample=0.8,
    reg_lambda=5.0, reg_alpha=1.0, colsample_bytree=0.7,
    random_state=42, verbosity=0,
)

# Noise athletes to exclude (degrades CV R2)
EXCLUDE_ATHLETES = {
    'ATH-DE295AEB',  # KAWANO Hayato (JPN) +4.6%
    'ATH-AC042631',  # DONSBERGER Kyle (CAN) +2.2%
    'ATH-64E845EE',  # RUSSWURM Hannah (FIN) +2.2%
    'ATH-0A5C0017',  # PENG Lin-Wei (TPE) +1.2%
    'ATH-C338C9DD',  # RODRIGUEZ Adrian (ESP) +1.0%
    'ATH-60AB5B2A',  # FRIMPONG Akwasi (GHA) +0.7%
    'ATH-0038E3B0',  # BAUER Jeff (LUX) +0.7%
    'ATH-1A4821B0',  # BOSTOCK Laurence (GBR) +0.7%
    'ATH-F8836987',  # FREELING Colin (BEL) +0.5%
}

# ===== SKELETON V2 (core only + regularization) =====
print("Loading skeleton data...")
all_rows = []
offset = 0
while True:
    url = (SUPABASE_URL + '/rest/v1/skeleton_records'
           '?select=*,athletes!inner(height_cm,weight_kg)'
           '&status=eq.OK&finish=not.is.null&air_temp=not.is.null'
           '&order=id&offset=' + str(offset) + '&limit=1000')
    rows = requests.get(url, headers=headers).json()
    all_rows.extend(rows)
    if len(rows) < 1000:
        break
    offset += 1000

valid = []
for r in all_rows:
    try:
        if r.get('athlete_id') in EXCLUDE_ATHLETES:
            continue
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

X = np.array([v[:6] for v in valid])
y = np.array([v[6] for v in valid])
print(f"Skeleton: {len(y)} records, {len(CORE_F)} features")

model = XGBRegressor(**V2_PARAMS)
model.fit(X, y)
y_pred = model.predict(X)

r2_train = r2_score(y, y_pred)
cv = cross_val_score(model, X, y, cv=5, scoring='r2')
rmse = float(np.sqrt(mean_squared_error(y, y_pred)))
mae = float(mean_absolute_error(y, y_pred))

X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)
m2 = XGBRegressor(**V2_PARAMS)
m2.fit(X_tr, y_tr)
r2_test = r2_score(y_te, m2.predict(X_te))

print(f"  Train R2: {r2_train:.4f}")
print(f"  Test R2:  {r2_test:.4f}")
print(f"  CV R2:    {cv.mean():.4f} +/- {cv.std():.4f}")
print(f"  RMSE:     {rmse:.4f}")
print(f"  MAE:      {mae:.4f} ({mae*100:.1f} cents)")
print(f"  Gap:      {r2_train - r2_test:.4f}")

imp = model.feature_importances_
skel_imp = {CORE_F[i]: round(float(imp[i]), 4) for i in range(len(CORE_F))}

skeleton_pre = {
    'bs': round(get_base_score(model), 6),
    'f': CORE_F,
    'fl': CORE_FL,
    'n': len(y),
    'r2': round(r2_train, 4),
    'cv': round(float(cv.mean()), 4),
    'r2_test': round(r2_test, 4),
    'rmse': round(rmse, 4),
    'mae': round(mae, 4),
    'imp': skel_imp,
    'v': 2,
    't': model_to_js_trees(model),
}

# ===== SKELETON LIVE (keep existing) =====
print("Loading skeleton live model...")
skel_live_m = XGBRegressor()
skel_live_m.load_model('web/src/js/xgb_live.json')
skel_live_meta = json.load(open('web/src/js/xgb_meta.json'))

skeleton_live = {
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

# ===== LUGE & BOBSLED (V1, also add regularization) =====
V1_F = ['start_time', 'temp_avg', 'air_temp', 'humidity_pct', 'pressure_hpa',
        'dewpoint_c', 'wind_speed_ms', 'is_female']
V1_FL = ['\uc2a4\ud0c0\ud2b8 \uc2dc\uac04', '\uc5bc\uc74c \uc628\ub3c4', '\uae30\uc628',
         '\uc2b5\ub3c4', '\ud604\uc9c0\uae30\uc555', '\uc774\uc2ac\uc810',
         '\ud48d\uc18d', '\uc5ec\uc131 \uc5ec\ubd80']

V1_PARAMS = dict(
    learning_rate=0.1, max_depth=3, n_estimators=200, subsample=0.8,
    reg_lambda=5.0, reg_alpha=1.0, colsample_bytree=0.7, min_child_weight=3,
    random_state=42, verbosity=0,
)

sport_models = {}
for sport in ['luge', 'bobsled']:
    print(f"Training {sport}...")
    table = sport + '_records'
    recs = []
    offset = 0
    while True:
        url = (SUPABASE_URL + '/rest/v1/' + table
               + '?select=*&status=eq.OK&finish=not.is.null&air_temp=not.is.null'
               + '&order=id&offset=' + str(offset) + '&limit=1000')
        rows = requests.get(url, headers=headers).json()
        recs.extend(rows)
        if len(rows) < 1000:
            break
        offset += 1000

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

    Xv = np.array([v[:8] for v in vv])
    yv = np.array([v[8] for v in vv])
    m = XGBRegressor(**V1_PARAMS)
    m.fit(Xv, yv)
    yp = m.predict(Xv)
    cv_s = cross_val_score(m, Xv, yv, cv=min(5, max(2, len(vv) // 5)), scoring='r2')
    imp_s = {V1_F[i]: round(float(m.feature_importances_[i]), 4) for i in range(8)}

    sport_models[sport] = {
        'pre': {
            'bs': round(get_base_score(m), 6),
            'f': V1_F[:], 'fl': V1_FL[:],
            'n': len(vv), 'r2': round(float(r2_score(yv, yp)), 4),
            'cv': round(float(cv_s.mean()), 4),
            'rmse': round(float(np.sqrt(mean_squared_error(yv, yp))), 4),
            'mae': round(float(mean_absolute_error(yv, yp)), 4),
            'imp': imp_s, 't': model_to_js_trees(m),
        }
    }
    print(f"  {sport}: n={len(vv)}, R2={r2_score(yv, yp):.4f}, CV={cv_s.mean():.4f}")

# ===== BUILD JS =====
print("Building xgb-models.js...")
model_obj = {
    'skeleton': {'pre': skeleton_pre, 'live': skeleton_live},
    'luge': sport_models['luge'],
    'bobsled': sport_models['bobsled'],
}

js = '// XGBoost models per sport (V2 regularized, auto-generated)\n'
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

print(f"xgb-models.js: {len(js):,} chars")
print("DONE")
