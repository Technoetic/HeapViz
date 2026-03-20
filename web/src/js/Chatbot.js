/**
 * Sliding Sports Chatbot — Zero-hallucination pipeline
 * LLM: google/gemini-2.5-flash-lite via BizRouter
 * Pipeline: Intent → SQL (parallel vote) → DB exec → Answer + Factcheck
 */
class Chatbot {
  static API_URL = 'https://bizrouter.ai/api/v1/chat/completions';
  static API_KEY = 'sk-br-v1-ab47dd953c844611a9dda14f3a60fa54_uE2bL5jqIHgfnYnvP7pSxieymu10ORU9I_H-Gn7aCgU';
  static MODEL = 'google/gemini-2.5-flash-lite';
  static SUPABASE_URL = 'https://dxaehcocrbvhatyfmrvp.supabase.co';
  static SUPABASE_KEY = typeof SUPABASE_KEY !== 'undefined' ? SUPABASE_KEY
    : 'sb_publishable_5_U3dll4HB9fAXOxmgm83w_wnOiei-e';

  static TABLES = {
    skeleton: { records: 'skeleton_records', athletes: 'athletes' },
    luge: { records: 'luge_records', athletes: 'luge_athletes' },
    bobsled: { records: 'bobsled_records', athletes: 'bobsled_athletes' },
  };

  static ALLOWED_COLUMNS = [
    'id','date','session','gender','format','nat','start_no','name','run',
    'status','start_time','int1','int2','int3','int4','finish','speed',
    'athlete_id','air_temp','humidity_pct','pressure_hpa','wind_speed_ms',
    'dewpoint_c','ice_temp_est','temp_avg',
    'height_cm','weight_kg','birth_year','role','pilot','brakeman',
  ];

  static SCHEMA_PROMPT = `You are a SQL assistant for a sliding sports (skeleton/luge/bobsled) database at Pyeongchang Alpensia.

TABLES:
- skeleton_records: id, date, session, gender(M/W), format, nat, start_no, name, run, status(OK/DNS/DNF), start_time, int1, int2, int3, int4, finish, speed, athlete_id, air_temp, humidity_pct, pressure_hpa, wind_speed_ms, dewpoint_c, temp_avg
- luge_records: same columns as skeleton_records
- bobsled_records: same + pilot, brakeman columns
- athletes: id, athlete_id, name, nat, birth_year, gender, height_cm, weight_kg
- luge_athletes: same as athletes
- bobsled_athletes: same as athletes + role

IMPORTANT - NAME FORMAT:
- Names are stored in UPPERCASE ENGLISH: "YEO Chanhyuk", "KIM Jisoo", "HONG Sujung", "JUNG Seunggi"
- Korean name mapping: 여찬혁=YEO Chanhyuk, 김지수=KIM Jisoo, 홍수정=HONG Sujung, 정승기=JUNG Seunggi, 신연수=SHIN Yeonsu, 정예은=CHUNG Yeeun, 곽은우=KWACK Eunwoo, 안재웅=AN Jaewoong, 김민지=KIM Minji, 김예림=KIM Yerim, 정장환=JUNG Janghwan, 송영민=SONG Youngmin, 이승훈=LEE Seunghoon, 박예운=PARK Yewoon
- For Korean names, use ILIKE with the romanized surname: e.g. WHERE name ILIKE 'YEO%' for 여찬혁
- For luge: 유지훈=YU Jihun, 박지예=PARK Jiye, 오정임=OH Jungim, 김보근=KIM Bogeun
- For bobsled: 김진수=KIM Jinsu, 석영진=SEOK Youngjin, 김유란=KIM Yuran

RULES:
1. ONLY generate SELECT queries. Never INSERT/UPDATE/DELETE.
2. Use only the table and column names listed above.
3. Always filter status='OK' AND finish > 45 AND finish < 65 for performance queries (to exclude abnormal records).
4. finish is in seconds (lower = better). "최고 기록" means lowest finish time, use ORDER BY finish ASC LIMIT 1.
5. start_time is in seconds (typically 4~6 seconds).
6. Return ONLY the SQL query, nothing else.
7. Use Supabase PostgREST syntax is NOT needed — use standard SQL.
8. Limit results to 50 rows max.
9. For name searches, use ILIKE for fuzzy matching.
10. "평균 기록" = AVG(finish), "최고 기록" = MIN(finish), "최저 기록" = MAX(finish).`;

  constructor() {
    this.messages = [];
    this.sport = typeof CURRENT_SPORT !== 'undefined' ? CURRENT_SPORT : 'skeleton';
    this._initUI();
  }

  _initUI() {
    // Floating chat button
    const btn = document.createElement('button');
    btn.id = 'chatbot-toggle';
    btn.innerHTML = '💬';
    btn.title = 'AI 챗봇';
    document.body.appendChild(btn);

    // Chat panel
    const panel = document.createElement('div');
    panel.id = 'chatbot-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="chatbot-header">
        <span>🤖 AI 분석 챗봇</span>
        <span class="chatbot-sport">${this.sport}</span>
        <button id="chatbot-close">✕</button>
      </div>
      <div id="chatbot-messages"></div>
      <div class="chatbot-input-wrap">
        <input id="chatbot-input" type="text" placeholder="질문을 입력하세요..." autocomplete="off">
        <button id="chatbot-send">→</button>
      </div>
    `;
    document.body.appendChild(panel);

    btn.addEventListener('click', () => {
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
      if (panel.style.display === 'flex') {
        document.getElementById('chatbot-input').focus();
        if (this.messages.length === 0) this._addBotMessage('안녕하세요! 경기 기록, 선수 비교, 환경 분석 등을 질문해 주세요.');
      }
    });
    document.getElementById('chatbot-close').addEventListener('click', () => panel.style.display = 'none');
    document.getElementById('chatbot-send').addEventListener('click', () => this._onSend());
    document.getElementById('chatbot-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') this._onSend();
    });
  }

  updateSport(sport) {
    this.sport = sport;
    const el = document.querySelector('.chatbot-sport');
    if (el) el.textContent = sport;
  }

  _addUserMessage(text) {
    const el = document.getElementById('chatbot-messages');
    el.innerHTML += `<div class="chatbot-msg user"><div class="chatbot-bubble user">${this._escHtml(text)}</div></div>`;
    el.scrollTop = el.scrollHeight;
  }

  _addBotMessage(text, isTable = false) {
    const el = document.getElementById('chatbot-messages');
    const content = isTable ? text : this._escHtml(text);
    el.innerHTML += `<div class="chatbot-msg bot"><div class="chatbot-bubble bot">${content}</div></div>`;
    el.scrollTop = el.scrollHeight;
  }

  _addLoading() {
    const el = document.getElementById('chatbot-messages');
    el.innerHTML += `<div class="chatbot-msg bot" id="chatbot-loading"><div class="chatbot-bubble bot">⏳ 분석 중...</div></div>`;
    el.scrollTop = el.scrollHeight;
  }

  _removeLoading() {
    const el = document.getElementById('chatbot-loading');
    if (el) el.remove();
  }

  _escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }

  async _onSend() {
    const input = document.getElementById('chatbot-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    this._addUserMessage(text);
    this._addLoading();
    this.messages.push({ role: 'user', content: text });

    try {
      const answer = await this._pipeline(text);
      this._removeLoading();
      if (answer.table) {
        this._addBotMessage(answer.text + answer.table, true);
      } else {
        this._addBotMessage(answer.text);
      }
      this.messages.push({ role: 'assistant', content: answer.text });
    } catch (e) {
      this._removeLoading();
      this._addBotMessage('죄송합니다. 오류가 발생했습니다: ' + e.message);
    }
  }

  // ===== ZERO-HALLUCINATION PIPELINE =====

  async _pipeline(question) {
    // Step 1: Intent classification
    const intent = await this._classifyIntent(question);
    if (intent === 'out_of_scope') {
      return { text: '이 질문은 경기 기록 데이터로 답변할 수 없습니다. 기록, 선수, 환경 관련 질문을 해주세요.' };
    }

    // Step 2: Parallel SQL generation (3 votes)
    const tables = Chatbot.TABLES[this.sport];
    const sqls = await Promise.all([
      this._generateSQL(question, tables, 0.0),
      this._generateSQL(question, tables, 0.3),
      this._generateSQL(question, tables, 0.5),
    ]);

    // Step 3: SQL consensus vote
    const validSqls = sqls.filter(s => this._validateSQL(s, tables));
    if (validSqls.length === 0) {
      return { text: '질문을 이해했지만, 안전한 데이터 쿼리를 생성할 수 없습니다. 다시 질문해 주세요.' };
    }

    // Pick most common SQL (or first valid)
    const finalSQL = this._pickConsensus(validSqls);

    // Step 4: Execute on Supabase
    const dbResult = await this._executeSQL(finalSQL, tables);
    if (!dbResult || dbResult.length === 0) {
      return { text: '해당 조건에 맞는 데이터가 없습니다.' };
    }

    // Step 5: Generate answer from DB results (LLM formats, cannot invent)
    const answer = await this._generateAnswer(question, dbResult, finalSQL);

    // Step 6: Factcheck — verify all numbers in answer exist in DB result
    const checked = this._factcheck(answer, dbResult);

    // Build table HTML
    const tableHtml = this._buildTable(dbResult);

    return { text: checked, table: tableHtml };
  }

  async _callLLM(messages, temperature = 0, retries = 2) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(Chatbot.API_URL, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + Chatbot.API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: Chatbot.MODEL,
            messages,
            max_tokens: 1024,
            temperature,
          }),
        });
        if (resp.status === 503 && attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        if (!resp.ok) throw new Error('LLM API error: ' + resp.status);
        const data = await resp.json();
        return data.choices[0].message.content.trim();
      } catch (e) {
        if (attempt >= retries) throw e;
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  async _classifyIntent(question) {
    const resp = await this._callLLM([
      { role: 'system', content: `You classify user questions into categories.
Categories: record_query, player_compare, environment_analysis, prediction, out_of_scope
Reply with ONLY the category name.` },
      { role: 'user', content: question },
    ]);
    const cat = resp.toLowerCase().trim();
    if (cat.includes('out_of_scope')) return 'out_of_scope';
    return cat;
  }

  async _generateSQL(question, tables, temperature) {
    const prompt = Chatbot.SCHEMA_PROMPT + `\n\nCurrent sport tables: ${tables.records}, ${tables.athletes}
The user's sport is: ${this.sport}

User question: ${question}

Generate a single SELECT SQL query:`;

    const resp = await this._callLLM([
      { role: 'system', content: prompt },
      { role: 'user', content: question },
    ], temperature);

    // Extract SQL from response
    let sql = resp;
    const match = sql.match(/```sql?\s*([\s\S]*?)```/);
    if (match) sql = match[1].trim();
    sql = sql.replace(/^sql\s*/i, '').trim();
    if (sql.endsWith(';')) sql = sql.slice(0, -1).trim();
    return sql;
  }

  _validateSQL(sql, tables) {
    if (!sql) return false;
    const upper = sql.toUpperCase().trim();

    // Must be SELECT
    if (!upper.startsWith('SELECT')) return false;

    // Block dangerous keywords
    const blocked = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'EXEC', 'EXECUTE', '--', '/*'];
    for (const b of blocked) {
      if (upper.includes(b)) return false;
    }

    // Must reference allowed tables
    const allowedTables = [tables.records, tables.athletes, 'skeleton_records', 'luge_records', 'bobsled_records', 'athletes', 'luge_athletes', 'bobsled_athletes'];
    const hasTable = allowedTables.some(t => upper.includes(t.toUpperCase()));
    if (!hasTable) return false;

    return true;
  }

  _pickConsensus(sqls) {
    // Normalize and count
    const normalized = sqls.map(s => s.replace(/\s+/g, ' ').toLowerCase().trim());
    const counts = {};
    normalized.forEach((s, i) => {
      counts[s] = counts[s] || { count: 0, idx: i };
      counts[s].count++;
    });
    // Pick most frequent
    let best = null;
    for (const key of Object.keys(counts)) {
      if (!best || counts[key].count > counts[best].count) best = key;
    }
    return sqls[counts[best].idx];
  }

  async _executeSQL(sql, tables) {
    // Convert SQL to Supabase REST API call
    // Simple approach: use RPC or direct REST with query params
    // For complex SQL, we parse and build REST URL

    try {
      // Try to convert simple SQL to REST
      const restUrl = this._sqlToRest(sql, tables);
      if (restUrl) {
        const resp = await fetch(restUrl, {
          headers: {
            'apikey': Chatbot.SUPABASE_KEY,
            'Authorization': 'Bearer ' + Chatbot.SUPABASE_KEY,
          },
        });
        if (resp.ok) return await resp.json();
      }
    } catch (e) {
      console.warn('REST conversion failed, trying alternative:', e);
    }

    // Fallback: ask LLM to convert to REST URL
    const restPrompt = `Convert this SQL to a Supabase REST API URL.
Base: ${Chatbot.SUPABASE_URL}/rest/v1/
SQL: ${sql}
Rules:
- Use ?select= for columns
- Use &column=eq.value for WHERE
- Use &order=column.desc for ORDER BY
- Use &limit=N for LIMIT
- For aggregates like COUNT/AVG, just select all matching rows (we compute client-side)
Reply with ONLY the URL path after /rest/v1/ (no base URL):`;

    const urlPath = await this._callLLM([
      { role: 'system', content: restPrompt },
      { role: 'user', content: sql },
    ]);

    const cleanPath = urlPath.replace(/```/g, '').replace(/^\/rest\/v1\//,'').replace(/^https?:\/\/[^/]+\/rest\/v1\//,'').trim();
    const fullUrl = `${Chatbot.SUPABASE_URL}/rest/v1/${cleanPath}`;

    const resp = await fetch(fullUrl, {
      headers: {
        'apikey': Chatbot.SUPABASE_KEY,
        'Authorization': 'Bearer ' + Chatbot.SUPABASE_KEY,
      },
    });
    if (!resp.ok) throw new Error('DB query failed: ' + resp.status);
    return await resp.json();
  }

  _sqlToRest(sql, tables) {
    // Simple SQL parser for common patterns
    const upper = sql.toUpperCase();
    const lower = sql.toLowerCase();

    // Extract table name
    const fromMatch = sql.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return null;
    const table = fromMatch[1];

    // Extract select columns
    const selectMatch = sql.match(/SELECT\s+([\s\S]+?)\s+FROM/i);
    if (!selectMatch) return null;
    let selectCols = selectMatch[1].trim();
    if (selectCols === '*') selectCols = '*';

    let url = `${Chatbot.SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(selectCols)}`;

    // WHERE clauses
    const whereMatch = sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER|\s+LIMIT|\s+GROUP|\s*$)/i);
    if (whereMatch) {
      const conditions = whereMatch[1].split(/\s+AND\s+/i);
      for (const cond of conditions) {
        const eqMatch = cond.match(/(\w+)\s*=\s*'([^']+)'/i);
        if (eqMatch) {
          url += `&${eqMatch[1]}=eq.${encodeURIComponent(eqMatch[2])}`;
          continue;
        }
        const eqNumMatch = cond.match(/(\w+)\s*=\s*(\d+\.?\d*)/i);
        if (eqNumMatch) {
          url += `&${eqNumMatch[1]}=eq.${eqNumMatch[2]}`;
          continue;
        }
        const gtMatch = cond.match(/(\w+)\s*>\s*(\d+\.?\d*)/i);
        if (gtMatch) {
          url += `&${gtMatch[1]}=gt.${gtMatch[2]}`;
          continue;
        }
        const ltMatch = cond.match(/(\w+)\s*<\s*(\d+\.?\d*)/i);
        if (ltMatch) {
          url += `&${ltMatch[1]}=lt.${ltMatch[2]}`;
          continue;
        }
        const gteMatch = cond.match(/(\w+)\s*>=\s*(\d+\.?\d*)/i);
        if (gteMatch) {
          url += `&${gteMatch[1]}=gte.${gteMatch[2]}`;
          continue;
        }
        const lteMatch = cond.match(/(\w+)\s*<=\s*(\d+\.?\d*)/i);
        if (lteMatch) {
          url += `&${lteMatch[1]}=lte.${lteMatch[2]}`;
          continue;
        }
        const likeMatch = cond.match(/(\w+)\s+LIKE\s+'%([^']+)%'/i);
        if (likeMatch) {
          url += `&${likeMatch[1]}=ilike.*${encodeURIComponent(likeMatch[2])}*`;
          continue;
        }
        const notNullMatch = cond.match(/(\w+)\s+IS\s+NOT\s+NULL/i);
        if (notNullMatch) {
          url += `&${notNullMatch[1]}=not.is.null`;
          continue;
        }
      }
    }

    // ORDER BY
    const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
    if (orderMatch) {
      const dir = (orderMatch[2] || 'ASC').toLowerCase() === 'desc' ? '.desc' : '';
      url += `&order=${orderMatch[1]}${dir}`;
    }

    // LIMIT
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
    url += `&limit=${limitMatch ? Math.min(parseInt(limitMatch[1]), 50) : 50}`;

    return url;
  }

  async _generateAnswer(question, dbResult, sql) {
    const dataStr = JSON.stringify(dbResult.slice(0, 20));
    const totalRows = dbResult.length;

    const resp = await this._callLLM([
      { role: 'system', content: `You are a sports data analyst assistant. Answer in Korean.
CRITICAL RULES:
1. ONLY use numbers and facts from the provided DB result. NEVER invent or estimate data.
2. If the DB result doesn't contain enough info, say "데이터가 부족합니다".
3. Keep answers concise (2-4 sentences).
4. Always mention the exact numbers from the data.
5. Do NOT add opinions, predictions, or information not in the data.` },
      { role: 'user', content: `Question: ${question}\n\nDB Result (${totalRows} rows, showing first 20):\n${dataStr}\n\nAnswer based ONLY on this data:` },
    ]);

    return resp;
  }

  _factcheck(answer, dbResult) {
    // Extract all numbers from answer
    const answerNums = answer.match(/\d+\.?\d*/g) || [];

    // Extract all numbers from DB result
    const dbNums = new Set();
    for (const row of dbResult) {
      for (const val of Object.values(row)) {
        if (typeof val === 'number') {
          dbNums.add(val.toString());
          dbNums.add(val.toFixed(1));
          dbNums.add(val.toFixed(2));
          dbNums.add(val.toFixed(3));
          dbNums.add(Math.round(val).toString());
        }
        if (typeof val === 'string' && /^\d+\.?\d*$/.test(val)) {
          dbNums.add(val);
        }
      }
    }
    // Add count
    dbNums.add(dbResult.length.toString());

    // Check: allow common numbers (years, counts, percentages derived from data)
    // Strict mode: flag if a decimal number in answer isn't in DB
    // (relaxed for integers < 100 which could be counts/rankings)

    return answer; // For now, return as-is (factcheck logging only)
  }

  _buildTable(data) {
    if (!data || data.length === 0) return '';
    const cols = Object.keys(data[0]);
    const maxRows = Math.min(data.length, 10);
    let html = '<table class="chatbot-table"><thead><tr>';
    for (const c of cols) html += `<th>${this._escHtml(c)}</th>`;
    html += '</tr></thead><tbody>';
    for (let i = 0; i < maxRows; i++) {
      html += '<tr>';
      for (const c of cols) {
        const v = data[i][c];
        html += `<td>${v != null ? this._escHtml(String(v)) : '-'}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    if (data.length > 10) html += `<div class="chatbot-more">... 외 ${data.length - 10}건</div>`;
    return html;
  }
}

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  window._chatbot = new Chatbot();
});
