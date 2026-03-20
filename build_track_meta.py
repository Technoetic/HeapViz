"""Create track_metadata table and insert Alpensia curve data"""
import requests, json

PAT = 'sbp_5006ddbd007c28247ef6f16c72187c159abf45ac'
PROJECT_REF = 'dxaehcocrbvhatyfmrvp'
SUPABASE_URL = 'https://dxaehcocrbvhatyfmrvp.supabase.co'
SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR4YWVoY29jcmJ2aGF0eWZtcnZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk0MDAxNywiZXhwIjoyMDg3NTE2MDE3fQ.VVnZrN6hfAeMxKZ5i3-_iUAjPzo8xvgkRbEfonYT2wM'

mgmt_headers = {'Authorization': f'Bearer {PAT}', 'Content-Type': 'application/json'}
mgmt_url = f'https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query'

# 1. Create table
sql = """
CREATE TABLE IF NOT EXISTS track_metadata (
    id serial PRIMARY KEY,
    track_name text DEFAULT 'Alpensia Sliding Centre',
    curve_number integer NOT NULL,
    curve_type text,
    radius_m real,
    banking_deg real,
    elevation_m real,
    elevation_drop_m real,
    distance_from_start_m real,
    segment text,
    sensor_before text,
    sensor_after text,
    avg_speed_kmh real,
    max_speed_kmh real,
    dnf_count integer DEFAULT 0,
    difficulty text,
    coaching_tip text
);
"""
resp = requests.post(mgmt_url, headers=mgmt_headers, json={'query': sql})
print(f'Create table: {resp.status_code}')

# 2. Insert curves
curves = [
    (1, 'Left', 35, 15, 850, 0, 95, 'Start-Int.1', 'Start', 'Int.1', None, None, 0, 'low',
     'Start directly after. Stable entry is key. Avoid excessive steering.'),
    (2, 'Right', 30, 18, 845, 5, 145, 'Start-Int.1', 'Start', 'Int.1', None, None, 0, 'medium',
     'S-curve continuation from C1. Maintain rhythm.'),
    (3, 'Left', 28, 20, 838, 12, 210, 'Start-Int.1', 'Start', 'Int.1', None, None, 0, 'medium',
     'Slope steepens. Lower center of gravity.'),
    (4, 'Right', 25, 22, 830, 20, 290, 'Start-Int.1', 'Start', 'Int.1', None, None, 0, 'medium-high',
     'Just before Int.1 sensor. Entry speed here determines overall record. Optimal line essential.'),
    (5, 'Left', 32, 18, 820, 30, 370, 'Int.1-Int.2', 'Int.1', 'Int.2', None, None, 0, 'medium',
     'Acceleration zone begins after Int.1. Minimize unnecessary steering.'),
    (6, 'Right', 27, 21, 810, 40, 440, 'Int.1-Int.2', 'Int.1', 'Int.2', None, None, 0, 'medium-high',
     'Speed building zone. Minimize wall contact.'),
    (7, 'Left', 22, 25, 798, 52, 520, 'Int.1-Int.2', 'Int.1', 'Int.2', None, None, 0, 'high',
     'Just before Int.2. Radius sharply decreases. Entry angle and timing critical. 0.1-0.3s difference here.'),
    (8, 'Right', 30, 20, 785, 65, 600, 'Int.2-Int.3', 'Int.2', 'Int.3', None, None, 0, 'medium',
     'Long acceleration zone start after Int.2. Maintain stable posture.'),
    (9, 'Left', 26, 22, 772, 78, 690, 'Int.2-Int.3', 'Int.2', 'Int.3', None, None, 0, 'medium-high',
     'Core mid-track curve. Consistent pressure through the curve minimizes speed loss.'),
    (10, 'Right', 24, 24, 758, 92, 770, 'Int.2-Int.3', 'Int.2', 'Int.3', None, None, 0, 'high',
     'Speed 100km/h+ zone. Strong G-force requires neck and shoulder tension.'),
    (11, 'Left', 28, 21, 745, 105, 850, 'Int.2-Int.3', 'Int.2', 'Int.3', None, None, 0, 'medium',
     'Approaching Int.3. Line recovery and stable passage.'),
    (12, 'Right', 20, 28, 730, 120, 930, 'Int.2-Int.3', 'Int.2', 'Int.3', None, None, 0, 'highest',
     'Just before Int.3. Smallest radius on track (20m). Most DNFs occur here. Perfect line required or wall collision risk.'),
    (13, 'Left', 32, 19, 715, 135, 1010, 'Int.3-Int.4', 'Int.3', 'Int.4', None, None, 0, 'medium',
     'Recovery zone after C12. Quickly restore disrupted posture.'),
    (14, 'Right', 26, 23, 700, 150, 1080, 'Int.3-Int.4', 'Int.3', 'Int.4', None, None, 0, 'medium-high',
     'Finish acceleration. Stability at top speed (120km/h+) is key.'),
    (15, 'Left', 24, 25, 685, 165, 1140, 'Int.3-Int.4', 'Int.3', 'Int.4', None, None, 0, 'high',
     'Just before Int.4. Peak speed point. Micro-adjustments of 0.01s determine final record.'),
    (16, 'Right', 35, 16, 672, 178, 1200, 'Int.4-Finish', 'Int.4', 'Finish', None, None, 0, 'low',
     'Final curve. Deceleration begins but maintain max speed until braking point.'),
]

sb_headers = {
    'apikey': SERVICE_KEY,
    'Authorization': f'Bearer {SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

for c in curves:
    data = {
        'curve_number': c[0], 'curve_type': c[1], 'radius_m': c[2],
        'banking_deg': c[3], 'elevation_m': c[4], 'elevation_drop_m': c[5],
        'distance_from_start_m': c[6], 'segment': c[7],
        'sensor_before': c[8], 'sensor_after': c[9],
        'avg_speed_kmh': c[10], 'max_speed_kmh': c[11],
        'dnf_count': c[12], 'difficulty': c[13], 'coaching_tip': c[14],
    }
    resp = requests.post(f'{SUPABASE_URL}/rest/v1/track_metadata', headers=sb_headers, json=data)
    if resp.status_code >= 300:
        print(f'Error curve {c[0]}: {resp.status_code} {resp.text[:100]}')

print(f'Inserted {len(curves)} curves')

# 3. Verify
resp = requests.get(
    f'{SUPABASE_URL}/rest/v1/track_metadata?select=curve_number,curve_type,radius_m,difficulty,segment&order=curve_number',
    headers={'apikey': SERVICE_KEY, 'Authorization': f'Bearer {SERVICE_KEY}'}
)
for row in resp.json():
    print(f"  C{row['curve_number']:2d} {row['curve_type']:5s} R={row['radius_m']:4.0f}m {row['difficulty']:12s} {row['segment']}")
