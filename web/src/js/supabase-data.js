let SUPABASE_URL = '';
let SUPABASE_KEY = '';

const SPORT_CONFIG = {
  skeleton: {
    recordsTable: 'skeleton_records',
    athletesTable: 'athletes',
    select: 'date,session,gender,format,nat,start_no,name,run,status,start_time,int1,int2,int3,int4,finish,speed',
    athleteSelect: 'athlete_id,name,nat,birth_year,gender,height_cm,weight_kg',
    label: '스켈레톤',
  },
  luge: {
    recordsTable: 'luge_records',
    athletesTable: 'luge_athletes',
    select: 'date,session,gender,format,nat,start_no,name,run,status,start_time,int1,int2,int3,int4,finish,speed',
    athleteSelect: 'athlete_id,name,nat,birth_year,gender,height_cm,weight_kg',
    label: '루지',
  },
  bobsled: {
    recordsTable: 'bobsled_records',
    athletesTable: 'bobsled_athletes',
    select: 'date,session,gender,format,nat,start_no,pilot,brakeman,run,status,start_time,int1,int2,int3,int4,finish,speed',
    athleteSelect: 'athlete_id,name,nat,birth_year,gender,height_cm,weight_kg,role',
    label: '봅슬레이',
  },
};

let CURRENT_SPORT = 'skeleton';

async function fetchRecords(sport) {
  const cfg = SPORT_CONFIG[sport || CURRENT_SPORT];
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${cfg.recordsTable}?select=${encodeURIComponent(cfg.select)}&order=id&offset=${offset}&limit=${limit}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Supabase error: ${resp.status}`);
    const rows = await resp.json();
    // bobsled: pilot → name 통일
    if (sport === 'bobsled' || (!sport && CURRENT_SPORT === 'bobsled')) {
      rows.forEach(r => { if (r.pilot && !r.name) r.name = r.pilot; });
    }
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

async function fetchAthletes(sport) {
  const cfg = SPORT_CONFIG[sport || CURRENT_SPORT];
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const url = `${SUPABASE_URL}/rest/v1/${cfg.athletesTable}?select=${encodeURIComponent(cfg.athleteSelect)}&order=id`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`Supabase athletes error: ${resp.status}`);
  return resp.json();
}

async function switchSport(sport) {
  if (!SPORT_CONFIG[sport]) throw new Error(`Unknown sport: ${sport}`);
  CURRENT_SPORT = sport;
  const [records, athletes] = await Promise.all([fetchRecords(sport), fetchAthletes(sport)]);
  RAW_DATA = records;
  ATHLETES = athletes;
  return { records, athletes };
}

let RAW_DATA = [];
let ATHLETES = [];

async function _loadConfig() {
  const resp = await fetch('/api/config');
  if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`);
  const cfg = await resp.json();
  SUPABASE_URL = cfg.supabaseUrl;
  SUPABASE_KEY = cfg.supabaseKey;
}

const _supabaseReady = _loadConfig().then(() =>
  Promise.all([fetchRecords('skeleton'), fetchAthletes('skeleton')])
).then(([records, athletes]) => {
  RAW_DATA = records;
  ATHLETES = athletes;
}).catch(err => {
  console.error('Supabase fetch failed:', err);
  RAW_DATA = [];
  ATHLETES = [];
});
