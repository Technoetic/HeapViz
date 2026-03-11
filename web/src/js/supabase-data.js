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

let RAW_DATA = [];
const _supabaseReady = fetchRecords().then(data => {
  RAW_DATA = data;
}).catch(err => {
  console.error('Supabase fetch failed:', err);
  RAW_DATA = [];
});
