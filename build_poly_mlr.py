"""Build Polynomial(degree=3) + Ridge MLR coefficients for JS embedding"""
import json, math, requests
import numpy as np
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.model_selection import cross_val_score, RepeatedKFold
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

SUPABASE_URL = 'https://dxaehcocrbvhatyfmrvp.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4YWVoY29jcmJ2aGF0eWZtcnZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk0MDAxNywiZXhwIjoyMDg3NTE2MDE3fQ.VVnZrN6hfAeMxKZ5i3-_iUAjPzo8xvgkRbEfonYT2wM'
headers = {'apikey': SERVICE_KEY, 'Authorization': 'Bearer ' + SERVICE_KEY}

EXCLUDE = {'ATH-DE295AEB', 'ATH-AC042631', 'ATH-64E845EE', 'ATH-0A5C0017', 'ATH-C338C9DD',
           'ATH-60AB5B2A', 'ATH-0038E3B0', 'ATH-1A4821B0', 'ATH-F8836987'}

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

# Load data
print("Loading data...")
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

recs = []
for r in all_rows:
    try:
        if r.get('athlete_id') in EXCLUDE:
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
        recs.append([st, h, w, temp_avg, ad, dp, finish])
    except:
        continue

data = np.array(recs)
X = data[:, :6]
y = data[:, 6]
print(f"Data: {len(y)} records, 6 features")

# Train pipeline: StandardScaler -> Poly(3) -> Ridge(10)
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

poly = PolynomialFeatures(degree=3, include_bias=False)
X_poly = poly.fit_transform(X_scaled)

ridge = Ridge(alpha=10.0)
ridge.fit(X_poly, y)
y_pred = ridge.predict(X_poly)

r2 = r2_score(y, y_pred)
rmse = np.sqrt(mean_squared_error(y, y_pred))
mae = mean_absolute_error(y, y_pred)

# CV
pipe = Pipeline([('scaler', StandardScaler()), ('poly', PolynomialFeatures(degree=3, include_bias=False)), ('ridge', Ridge(alpha=10.0))])
rkf = RepeatedKFold(n_splits=5, n_repeats=3, random_state=42)
cv = cross_val_score(pipe, X, y, cv=rkf, scoring='r2')

print(f"Poly3+Ridge: Train R2={r2:.4f}, CV R2={cv.mean():.4f}, RMSE={rmse:.4f}, MAE={mae:.4f}")
print(f"Poly features: {X_poly.shape[1]}")

# Export model parameters for JS
model_data = {
    'type': 'poly3_ridge',
    'scaler_mean': scaler.mean_.tolist(),
    'scaler_scale': scaler.scale_.tolist(),
    'poly_powers': poly.powers_.tolist(),
    'coef': ridge.coef_.tolist(),
    'intercept': float(ridge.intercept_),
    'n': len(y),
    'r2': round(r2, 4),
    'cv': round(float(cv.mean()), 4),
    'rmse': round(rmse, 4),
    'mae': round(mae, 4),
    'feature_names': ['start_time', 'height_cm', 'weight_kg', 'temp_avg', 'air_density', 'dewpoint_c'],
    'n_poly_features': X_poly.shape[1],
}

with open('web/src/js/poly-mlr-model.json', 'w') as f:
    json.dump(model_data, f)

print(f"Saved poly-mlr-model.json ({len(json.dumps(model_data)):,} chars)")

# Generate JS prediction function
js = '''// Poly3+Ridge MLR model (auto-generated)
const POLY_MLR = ''' + json.dumps(model_data, separators=(',', ':')) + ''';

function polyMLRPredict(input) {
  // input: [start_time, height_cm, weight_kg, temp_avg, air_density, dewpoint_c]
  const m = POLY_MLR;
  // 1. StandardScaler
  const scaled = input.map((v, i) => (v - m.scaler_mean[i]) / m.scaler_scale[i]);
  // 2. PolynomialFeatures (degree=3, no bias)
  const powers = m.poly_powers;
  const polyFeats = [];
  for (let p = 0; p < powers.length; p++) {
    let val = 1;
    for (let j = 0; j < 6; j++) {
      if (powers[p][j] > 0) {
        val *= Math.pow(scaled[j], powers[p][j]);
      }
    }
    polyFeats.push(val);
  }
  // 3. Ridge predict
  let pred = m.intercept;
  for (let i = 0; i < polyFeats.length; i++) {
    pred += m.coef[i] * polyFeats[i];
  }
  return pred;
}
'''

with open('web/src/js/poly-mlr.js', 'w', encoding='utf-8') as f:
    f.write(js)

print(f"Saved poly-mlr.js ({len(js):,} chars)")
print("DONE")
