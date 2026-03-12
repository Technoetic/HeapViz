const SUPABASE_URL = 'https://dxaehcocrbvhatyfmrvp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_5_U3dll4HB9fAXOxmgm83w_wnOiei-e';
const TABLE = 'skeleton_records';
const SELECT = 'date,session,gender,format,nat,start_no,name,run,status,start_time,int1,int2,int3,int4,finish,speed';

async function fetchRecords() {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const all = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}?select=${encodeURIComponent(SELECT)}&order=id&offset=${offset}&limit=${limit}`;
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`Supabase error: ${resp.status}`);
    const rows = await resp.json();
    all.push(...rows);
    if (rows.length < limit) break;
    offset += limit;
  }
  return all;
}

async function fetchAthletes() {
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const url = `${SUPABASE_URL}/rest/v1/athletes?select=athlete_id,name,nat,birth_year,gender,height_cm,weight_kg&order=id`;
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`Supabase athletes error: ${resp.status}`);
  return resp.json();
}

let RAW_DATA = [];
let ATHLETES = [];
const _supabaseReady = Promise.all([fetchRecords(), fetchAthletes()]).then(([records, athletes]) => {
  RAW_DATA = records;
  ATHLETES = athletes;
}).catch(err => {
  console.error('Supabase fetch failed:', err);
  RAW_DATA = [];
  ATHLETES = [];
});
