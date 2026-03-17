class DashboardController {
  constructor(dataStore, predModel, chartManager, trackMap) {
    this.ds = dataStore;
    this.predModel = predModel;
    this.charts = chartManager;
    this.trackMap = trackMap;
    this._outlierFilter = true;
  }

  init() {
    this.#bindEvents();
    this.#populateSelectors();
    this.#renderTrackMap();
    this.#fetchWeather();
  }

  #renderTrackMap() {
    if (this.trackMap && document.getElementById('dash-track-container')) {
      try {
        this.trackMap.render('dash-track-container');
      } catch (e) { /* ignore */ }
    }
  }

  #el(id) { return document.getElementById(id); }

  #resolveAthlete(aid) {
    return (typeof ATHLETES !== 'undefined' ? ATHLETES : []).find(a => a.athlete_id === aid);
  }

  _mode = 'personal'; // 'personal' | 'general'

  #bindEvents() {
    const btn = this.#el('dash-predict-btn');
    if (btn) btn.addEventListener('click', () => this.#runPrediction());

    const player = this.#el('dash-player');
    if (player) player.addEventListener('change', () => this.#onPlayerChange());

    // 날씨 모드 토글
    const weatherRealtimeBtn = this.#el('dash-weather-mode-realtime');
    const weatherPastBtn = this.#el('dash-weather-mode-past');
    const weatherPastFields = this.#el('dash-weather-past-fields');
    const dateEl = this.#el('dash-weather-date');

    if (weatherRealtimeBtn) weatherRealtimeBtn.addEventListener('click', () => {
      weatherRealtimeBtn.classList.add('active');
      if (weatherPastBtn) weatherPastBtn.classList.remove('active');
      if (weatherPastFields) weatherPastFields.style.display = 'none';
      if (dateEl) dateEl.value = '';
      const titleEl = this.#el('dash-weather-title');
      if (titleEl) titleEl.textContent = '실시간 환경 데이터';
      this.#fetchWeather();
    });
    if (weatherPastBtn) weatherPastBtn.addEventListener('click', () => {
      weatherPastBtn.classList.add('active');
      if (weatherRealtimeBtn) weatherRealtimeBtn.classList.remove('active');
      if (weatherPastFields) weatherPastFields.style.display = '';
    });
    if (dateEl) dateEl.addEventListener('change', () => this.#fetchWeatherForDate(dateEl.value));

    // 모드 토글
    const personalBtn = this.#el('dash-mode-personal');
    const generalBtn = this.#el('dash-mode-general');
    if (personalBtn) personalBtn.addEventListener('click', () => this.#setMode('personal'));
    if (generalBtn) generalBtn.addEventListener('click', () => this.#setMode('general'));
  }

  #setMode(mode) {
    this._mode = mode;
    const personalBtn = this.#el('dash-mode-personal');
    const generalBtn = this.#el('dash-mode-general');
    const personalFields = this.#el('dash-personal-fields');
    const generalFields = this.#el('dash-general-fields');
    if (personalBtn) personalBtn.classList.toggle('active', mode === 'personal');
    if (generalBtn) generalBtn.classList.toggle('active', mode === 'general');
    if (personalFields) personalFields.style.display = mode === 'personal' ? '' : 'none';
    if (generalFields) generalFields.style.display = mode === 'general' ? '' : 'none';
  }

  #populateSelectors() {
    const playerEl = this.#el('dash-player');
    if (!playerEl) return;
    const athletes = typeof ATHLETES !== 'undefined' ? ATHLETES : [];
    const sorted = [...athletes].sort((a, b) => a.athlete_id.localeCompare(b.athlete_id));
    playerEl.innerHTML = '<option value="">선수 선택</option>' + sorted.map(a =>
      `<option value="${a.athlete_id}">${a.athlete_id}</option>`
    ).join('');
  }

  #onPlayerChange() {
    const aid = this.#el('dash-player')?.value;
    const ath = aid ? this.#resolveAthlete(aid) : null;
    if (!ath) return;

    // 키/체중 자동 입력 (예측 모델용)
    const hEl = this.#el('pred-height');
    const wEl = this.#el('pred-weight');
    if (hEl && ath.height_cm) hEl.value = ath.height_cm;
    if (wEl && ath.weight_kg) wEl.value = ath.weight_kg;

    // 목표 스타트 자동 설정
    const allRecords = this.ds.getAllRecords ? this.ds.getAllRecords() : this.ds.records || [];
    const starts = allRecords.filter(r => r.name === ath.name && r.status === 'OK' && r.start_time)
      .map(r => parseFloat(r.start_time)).filter(v => v > 0);
    const targetEl = this.#el('dash-target-start');
    if (targetEl && !targetEl.value && starts.length) {
      targetEl.value = (starts.reduce((s, v) => s + v, 0) / starts.length).toFixed(3);
    }
  }

  async #fetchWeather() {
    // 기상청 API허브 — 대관령(100) AWS 1분 관측
    const KMA_KEY = 'ncpn3dPgT5OKZ93T4D-TJw';
    const now = new Date();
    // KST 기준 현재 분 (1분 단위 관측, 2분 여유)
    const kst = new Date(now.getTime() + 9 * 3600000 - 2 * 60000);
    const tm2 = kst.toISOString().replace(/[-T:]/g, '').slice(0, 12);
    // Use nginx proxy in production to avoid CORS, direct URL for local dev
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const base = isLocal ? 'https://apihub.kma.go.kr/api' : '/api/kma';
    const url = `${base}/typ01/cgi-bin/url/nph-aws2_min?tm2=${tm2}&stn=100&disp=0&help=0&authKey=${KMA_KEY}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(resp.status);
      const text = await resp.text();
      const dataLine = text.split('\n').find(l => l.trim() && !l.startsWith('#'));
      if (!dataLine) throw new Error('No data line');
      const cols = dataLine.trim().split(/\s+/);
      // AWS cols: [0]=YYMMDDHHMI [1]=STN [2]=WD1 [3]=WS1 [4]=WDS [5]=WSS
      //           [6]=WD10 [7]=WS10 [8]=TA [9]=RE [10]=RN-15m [11]=RN-60m
      //           [12]=RN-12H [13]=RN-DAY [14]=HM [15]=PA [16]=PS [17]=TD
      const valid = v => { const n = parseFloat(v); return (!isNaN(n) && n > -50) ? n : NaN; };
      const ta = valid(cols[8]);   // 기온
      const hm = valid(cols[14]);  // 습도
      const pa = valid(cols[15]);  // 현지기압
      const td = valid(cols[17]);  // 이슬점
      const wd = valid(cols[2]);   // 1분 평균 풍향
      const ws = valid(cols[3]);   // 1분 평균 풍속
      const wss = valid(cols[5]);  // 최대순간풍속
      const airEl = this.#el('dash-airtemp');
      const humEl = this.#el('dash-humidity');
      const presEl = this.#el('dash-pressure');
      const wdEl = this.#el('dash-winddir');
      const wsEl = this.#el('dash-windspd');
      const wgEl = this.#el('dash-windgust');
      if (airEl && !isNaN(ta)) { airEl.value = ta; airEl.readOnly = true; }
      if (humEl && !isNaN(hm)) { humEl.value = hm; humEl.readOnly = true; }
      if (presEl && !isNaN(pa)) { presEl.value = pa; presEl.readOnly = true; }
      if (wdEl && !isNaN(wd)) { wdEl.value = wd; wdEl.readOnly = true; }
      if (wsEl && !isNaN(ws)) { wsEl.value = ws; wsEl.readOnly = true; }
      if (wgEl && !isNaN(wss)) { wgEl.value = wss; wgEl.readOnly = true; }
      // 관측 시각 표시
      const obsTime = cols[0];
      const h4 = this.#el('dash-airtemp')?.closest('.dash-card')?.querySelector('h4');
      if (h4) {
        const hh = obsTime.slice(8, 10), mm = obsTime.slice(10, 12);
        h4.querySelector('.weather-time')?.remove();
        const span = document.createElement('span');
        span.className = 'weather-time';
        span.style.cssText = 'font-size:0.65rem;color:#4caf50;margin-left:6px;font-weight:400;text-transform:none;letter-spacing:0;';
        span.textContent = `${hh}:${mm} KST`;
        h4.appendChild(span);
      }
      this.#updateCalc();
    } catch (e) {
      console.warn('KMA AWS fetch failed, falling back to Open-Meteo:', e);
      await this.#fetchWeatherFallback();
    }
  }

  async #fetchWeatherFallback() {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=37.6584&longitude=128.7253&current=temperature_2m,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=Asia/Seoul';
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(resp.status);
      const data = await resp.json();
      const c = data.current;
      const airEl = this.#el('dash-airtemp');
      const humEl = this.#el('dash-humidity');
      const presEl = this.#el('dash-pressure');
      const wdEl = this.#el('dash-winddir');
      const wsEl = this.#el('dash-windspd');
      const wgEl = this.#el('dash-windgust');
      if (airEl) { airEl.value = c.temperature_2m; airEl.readOnly = true; }
      if (humEl) { humEl.value = c.relative_humidity_2m; humEl.readOnly = true; }
      if (presEl) { presEl.value = c.surface_pressure; presEl.readOnly = true; }
      if (wdEl && c.wind_direction_10m != null) { wdEl.value = c.wind_direction_10m; wdEl.readOnly = true; }
      if (wsEl && c.wind_speed_10m != null) { wsEl.value = (c.wind_speed_10m / 3.6).toFixed(1); wsEl.readOnly = true; }
      if (wgEl && c.wind_gusts_10m != null) { wgEl.value = (c.wind_gusts_10m / 3.6).toFixed(1); wgEl.readOnly = true; }
      this.#updateCalc();
    } catch (e) {
      console.warn('Weather fallback also failed:', e);
    }
  }

  async #fetchWeatherForDate(datetimeStr) {
    if (!datetimeStr) return this.#fetchWeather();
    // datetime-local: "2026-03-13T14:00" or date-only: "2026-03-13"
    const hasTime = datetimeStr.includes('T');
    const titleEl = this.#el('dash-weather-title');
    let tm1, tm2, timeLabel;

    const KMA_KEY = 'ncpn3dPgT5OKZ93T4D-TJw';

    if (hasTime) {
      // 시간 지정 → 해당 시각 ±30분
      const dt = new Date(datetimeStr);
      const pad = n => String(n).padStart(2, '0');
      const fmt = d => `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
      const from = new Date(dt.getTime() - 30 * 60000);
      const to = new Date(dt.getTime() + 30 * 60000);
      tm1 = fmt(from);
      tm2 = fmt(to);
      timeLabel = `${pad(dt.getHours())}:${pad(dt.getMinutes())} ±30분`;
      if (titleEl) titleEl.textContent = `${datetimeStr.replace('T', ' ')} 환경 데이터`;
    } else {
      // 날짜만 → 09~17시 평균
      const d = datetimeStr.replace(/-/g, '');
      tm1 = `${d}0900`;
      tm2 = `${d}1700`;
      timeLabel = '09-17시 평균';
      if (titleEl) titleEl.textContent = `${datetimeStr} 환경 데이터`;
    }

    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const base = isLocal ? 'https://apihub.kma.go.kr/api' : '/api/kma';
    const url = `${base}/typ01/cgi-bin/url/nph-aws2_min?tm1=${tm1}&tm2=${tm2}&stn=100&disp=0&help=0&authKey=${KMA_KEY}`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(resp.status);
      const text = await resp.text();
      const lines = text.split('\n').filter(l => l.trim() && !l.startsWith('#'));
      if (!lines.length) throw new Error('해당 날짜 데이터 없음');

      const valid = v => { const n = parseFloat(v); return (!isNaN(n) && n > -50) ? n : NaN; };
      let sumTA = 0, sumHM = 0, sumPA = 0, sumWD = 0, sumWS = 0, maxWSS = 0, cnt = 0;
      for (const line of lines) {
        const cols = line.trim().split(/\s+/);
        if (cols.length < 16) continue;
        const ta = valid(cols[8]), hm = valid(cols[14]), pa = valid(cols[15]);
        const wd = valid(cols[6]), ws = valid(cols[7]), wss = valid(cols[5]);
        if (isNaN(ta) || isNaN(hm) || isNaN(pa)) continue;
        sumTA += ta; sumHM += hm; sumPA += pa;
        if (!isNaN(wd)) sumWD += wd;
        if (!isNaN(ws) && ws >= 0) sumWS += ws;
        if (!isNaN(wss) && wss > maxWSS) maxWSS = wss;
        cnt++;
      }
      if (!cnt) throw new Error('유효 데이터 없음');

      const avgTA = sumTA / cnt, avgHM = sumHM / cnt, avgPA = sumPA / cnt;
      const avgWD = sumWD / cnt, avgWS = sumWS / cnt;

      const airEl = this.#el('dash-airtemp');
      const humEl = this.#el('dash-humidity');
      const presEl = this.#el('dash-pressure');
      const wdEl = this.#el('dash-winddir');
      const wsEl = this.#el('dash-windspd');
      const wgEl = this.#el('dash-windgust');
      if (airEl) { airEl.value = avgTA.toFixed(1); airEl.readOnly = true; }
      if (humEl) { humEl.value = avgHM.toFixed(0); humEl.readOnly = true; }
      if (presEl) { presEl.value = avgPA.toFixed(1); presEl.readOnly = true; }
      if (wdEl) { wdEl.value = avgWD.toFixed(0); wdEl.readOnly = true; }
      if (wsEl) { wsEl.value = avgWS.toFixed(1); wsEl.readOnly = true; }
      if (wgEl) { wgEl.value = maxWSS.toFixed(1); wgEl.readOnly = true; }

      // 시간 표시
      const h4 = airEl?.closest('.dash-card')?.querySelector('h4');
      if (h4) {
        h4.querySelector('.weather-time')?.remove();
        const span = document.createElement('span');
        span.className = 'weather-time';
        span.style.cssText = 'font-size:0.65rem;color:#ff9800;margin-left:6px;font-weight:400;';
        span.textContent = `${timeLabel} (${cnt}건)`;
        h4.appendChild(span);
      }
      this.#updateCalc();
    } catch (e) {
      console.warn('과거 날씨 데이터 조회 실패:', e);
      const h4 = this.#el('dash-airtemp')?.closest('.dash-card')?.querySelector('h4');
      if (h4) {
        h4.querySelector('.weather-time')?.remove();
        const span = document.createElement('span');
        span.className = 'weather-time';
        span.style.cssText = 'font-size:0.65rem;color:#f44336;margin-left:6px;font-weight:400;';
        span.textContent = '조회 실패';
        h4.appendChild(span);
      }
    }
  }

  #updateCalc() {
    const airTemp = parseFloat(this.#el('dash-airtemp')?.value);
    const humidity = parseFloat(this.#el('dash-humidity')?.value);
    const pressure = parseFloat(this.#el('dash-pressure')?.value);
    const calcEl = this.#el('dash-calc-values');
    if (!calcEl) return;

    if (isNaN(airTemp) || isNaN(humidity) || isNaN(pressure)) {
      calcEl.innerHTML = '<div class="dash-calc-row"><span>입력 대기 중...</span></div>';
      return;
    }

    const density = PredictionModel.calcAirDensity(airTemp, humidity, pressure);
    const dewPoint = PredictionModel.calcDewPoint(airTemp, humidity);
    const iceTemp = parseFloat(this.#el('dash-icetemp')?.value) || -7;
    const frostRisk = dewPoint > iceTemp;

    calcEl.innerHTML = `
      <div class="dash-calc-row"><span>공기밀도</span> <span class="val">${density.toFixed(4)} kg/m³</span></div>
      <div class="dash-calc-row"><span>이슬점</span> <span class="val">${dewPoint.toFixed(1)}°C</span></div>
      <div class="dash-calc-row"><span>서리 위험</span> <span class="val" style="color:${frostRisk ? '#f44336' : '#4caf50'}">${frostRisk ? '⚠ 있음' : '✓ 없음'}</span></div>
    `;
  }

  #getInputs() {
    let gender = '', player = '', height = null, weight = null;

    if (this._mode === 'personal') {
      const aid = this.#el('dash-player')?.value || '';
      const ath = aid ? this.#resolveAthlete(aid) : null;
      gender = ath ? ath.gender : '';
      player = aid;
      height = ath && ath.height_cm ? parseFloat(ath.height_cm) : null;
      weight = ath && ath.weight_kg ? parseFloat(ath.weight_kg) : null;
    } else {
      player = '__general__';
      height = parseFloat(this.#el('dash-height-manual')?.value) || null;
      weight = parseFloat(this.#el('dash-weight-manual')?.value) || null;
    }

    return {
      gender, player,
      startTime: parseFloat(this.#el('dash-target-start')?.value) || 0,
      airTemp: parseFloat(this.#el('dash-airtemp')?.value) || 5,
      humidity: parseFloat(this.#el('dash-humidity')?.value) || 60,
      pressure: parseFloat(this.#el('dash-pressure')?.value) || 935,
      iceTemp: parseFloat(this.#el('dash-icetemp')?.value) || -7,
      windSpeed: parseFloat(this.#el('dash-windspd')?.value) || 0,
      height, weight,
    };
  }

  #runPrediction() {
    const inp = this.#getInputs();
    const resultEl = this.#el('dash-prediction-result');
    const coachEl = this.#el('dash-coaching-tips');
    if (!resultEl) return;

    if (this._mode === 'personal' && !inp.player) {
      resultEl.innerHTML = '<div style="text-align:center;color:#f44336;padding:1rem">선수를 선택해주세요</div>';
      return;
    }
    if (!inp.startTime || inp.startTime < 3 || inp.startTime > 8) {
      resultEl.innerHTML = '<div style="text-align:center;color:#f44336;padding:1rem">목표 스타트 시간을 입력해주세요 (3~8초)</div>';
      return;
    }

    const allRecords = this.ds.getAllRecords ? this.ds.getAllRecords() : this.ds.records || [];
    const okRecords = inp.gender
      ? allRecords.filter(r => r.gender === inp.gender && r.status === 'OK' && r.finish)
      : allRecords.filter(r => r.status === 'OK' && r.finish);

    if (okRecords.length < 5) {
      resultEl.innerHTML = '<div style="text-align:center;color:#f44336;padding:1rem">데이터 부족</div>';
      return;
    }

    // XGBoost 출발 전 예측
    let xgbPredicted = null;
    let xgbModel = null;
    if (typeof XGB_MODELS !== 'undefined' && XGB_MODELS.pre) {
      const dewPoint = PredictionModel.calcDewPoint(inp.airTemp, inp.humidity);
      const isFemale = inp.gender === 'W' ? 1 : 0;
      // 피처 순서: start_time, temp_avg, air_temp, humidity, pressure, dewpoint, wind_speed, is_female, [athlete_id_enc]
      const features = [inp.startTime, inp.iceTemp, inp.airTemp, inp.humidity, inp.pressure, dewPoint, inp.windSpeed, isFemale];
      // 선수 인코딩 (id_map 있을 때)
      if (XGB_MODELS.pre.id_map && inp.player && inp.player !== '__general__') {
        const ath = this.#resolveAthlete(inp.player);
        const encVal = ath ? (XGB_MODELS.pre.id_map[ath.athlete_id] ?? -1) : -1;
        features.push(encVal);
      } else if (XGB_MODELS.pre.id_map) {
        features.push(-1);
      }
      xgbPredicted = xgbPredict(XGB_MODELS.pre, features);
      xgbModel = XGB_MODELS.pre;
    }

    // MLR 예측
    let mlrResult = null;
    try {
      this.predModel.trainAll(okRecords);
      mlrResult = this.predModel.trainGeneralMLR(okRecords, {
        startTime: inp.startTime,
        iceTemp: inp.iceTemp,
        airTemp: inp.airTemp,
        humidity: inp.humidity,
        pressure: inp.pressure,
        height: inp.height,
        weight: inp.weight,
      });
    } catch (e) { /* ignore */ }

    // 개별 모델 예측값
    const mlrPredicted = mlrResult ? mlrResult.prediction.predicted : null;
    const mlrR2 = mlrResult ? mlrResult.modelInfo.r2 : 0;
    const xgbR2 = xgbModel ? (xgbModel.cv || 0) : 0;

    if (!xgbPredicted && !mlrPredicted) {
      resultEl.innerHTML = '<div style="text-align:center;color:#f44336;padding:1rem">예측 실패</div>';
      return;
    }

    // 앙상블: MLR 가중치 높게 (MLR이 일반적으로 더 정확)
    let ensemblePredicted = null;
    if (xgbPredicted && mlrPredicted) {
      const wMLR = 0.7, wXGB = 0.3;
      ensemblePredicted = mlrPredicted * wMLR + xgbPredicted * wXGB;
    }

    // 모델 목록 구성
    const models = [];
    if (mlrPredicted) models.push({ name: 'MLR', pred: mlrPredicted, r2: mlrR2 });
    if (xgbPredicted) models.push({ name: 'XGBoost', pred: xgbPredicted, r2: xgbR2 });
    if (ensemblePredicted) models.push({ name: '앙상블', pred: ensemblePredicted, r2: null });

    // 최종 선택: 앙상블 > MLR > XGBoost (앙상블이 두 모델 결합으로 가장 안정적)
    const best = ensemblePredicted ? models.find(m => m.name === '앙상블')
      : (mlrPredicted ? models.find(m => m.name === 'MLR') : models[0]);
    const predicted = best.pred;

    // 모델별 카드 HTML
    const modelCard = (m, isBest) => {
      const color = isBest ? '#4caf50' : '#888';
      const border = isBest ? '2px solid #4caf50' : '1px solid rgba(255,255,255,0.1)';
      const label = isBest ? ' ⭐' : '';
      const info = m.r2 != null ? `R² ${(m.r2 * 100).toFixed(1)}%` : 'MLR 70% + XGB 30%';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:6px;border:${border};margin-bottom:4px;background:rgba(255,255,255,0.03)">
        <span style="font-weight:600;color:${color};min-width:80px">${m.name}${label}</span>
        <span style="font-size:1.1rem;font-weight:700;color:${isBest ? '#fff' : '#aaa'}">${m.pred.toFixed(2)}s</span>
        <span style="font-size:0.7rem;color:#888">${info}</span>
      </div>`;
    };

    // 결과 렌더링
    resultEl.innerHTML = `
      <div class="dash-big-number">
        <div class="sub">최종 예상 기록 (${best.name})</div>
        <div class="number" data-countup="${predicted.toFixed(2)}">${predicted.toFixed(2)}<span class="unit">s</span></div>
      </div>
      <div style="margin-top:10px">
        ${models.map(m => modelCard(m, m.name === best.name)).join('')}
      </div>
    `;

    // 분포 차트
    const finishes = okRecords.map(r => parseFloat(r.finish)).filter(v => v > 0 && v < 65);
    this.#renderDistChart(finishes, predicted);

    // 코칭 팁
    if (coachEl) coachEl.innerHTML = this.#generateTips(inp, predicted, mlrResult);

    // 필터 상태 업데이트
    this.#updateFilterStatus(okRecords);

    // countUp 애니메이션
    if (typeof UIController !== 'undefined' && UIController.animateCountUp) {
      UIController.animateCountUp(resultEl);
    }
  }

  #renderDistChart(finishes, predicted) {
    const canvas = this.#el('dash-dist-chart');
    if (!canvas || !finishes.length) return;
    canvas.style.display = 'block';

    // 히스토그램 빈 계산
    const min = Math.floor(Math.min(...finishes));
    const max = Math.ceil(Math.max(...finishes));
    const binSize = 0.5;
    const bins = [];
    const labels = [];
    for (let b = min; b < max; b += binSize) {
      labels.push(b.toFixed(1));
      bins.push(finishes.filter(v => v >= b && v < b + binSize).length);
    }

    if (this._distChart) this._distChart.destroy();
    this._distChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: bins,
          backgroundColor: labels.map(l => Math.abs(parseFloat(l) - predicted) < binSize ? 'rgba(0,229,255,0.6)' : 'rgba(100,150,200,0.3)'),
          borderRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              predLine: {
                type: 'line',
                xMin: ((predicted - min) / binSize).toFixed(1),
                xMax: ((predicted - min) / binSize).toFixed(1),
                borderColor: '#00e5ff',
                borderWidth: 2,
                borderDash: [4, 4],
                label: { display: true, content: `${predicted.toFixed(2)}s`, position: 'start', backgroundColor: 'rgba(0,229,255,0.8)', color: '#fff', font: { size: 10 } }
              }
            }
          }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        }
      }
    });
  }

  #generateTips(inp, predicted, mlrResult) {
    const tips = [];

    // 스타트 영향
    const startImpact = -2.49; // MLR 계수 기반
    tips.push({
      type: 'good',
      title: '스타트 시간 영향',
      text: `스타트 0.1초 단축 시 피니시 약 ${Math.abs(startImpact * 0.1).toFixed(2)}초 단축. 현재 목표: ${inp.startTime}초`
    });

    // 환경 보정
    const density = PredictionModel.calcAirDensity(inp.airTemp, inp.humidity, inp.pressure);
    const refDensity = 1.20;
    const densityDiff = ((density - refDensity) / refDensity * 100).toFixed(1);
    if (Math.abs(densityDiff) > 1) {
      tips.push({
        type: densityDiff > 0 ? 'warn' : 'good',
        title: '공기밀도 보정',
        text: `공기밀도 ${density.toFixed(4)} kg/m³ (기준 대비 ${densityDiff > 0 ? '+' : ''}${densityDiff}%) → 항력 ${densityDiff > 0 ? '증가' : '감소'}`
      });
    }

    // 서리 위험
    const dewPoint = PredictionModel.calcDewPoint(inp.airTemp, inp.humidity);
    if (dewPoint > inp.iceTemp) {
      tips.push({
        type: 'danger',
        title: '서리 위험 경고',
        text: `이슬점(${dewPoint.toFixed(1)}°C) > 빙면(${inp.iceTemp}°C) → 서리로 마찰 증가 가능 (+0.1~0.3초)`
      });
    }

    // 최적화 목표
    tips.push({
      type: 'good',
      title: '최적화 목표',
      text: 'Int.4(15번 커브)가 피니시 예측의 52.3%를 결정. Turn 13 진입 속도 최적화 권장.'
    });

    // MLR 분석
    if (mlrResult) {
      tips.push({
        type: 'good',
        title: 'MLR 분석',
        text: `MLR 예측: ${mlrResult.prediction.predicted.toFixed(3)}초 (R²=${mlrResult.modelInfo.r2.toFixed(4)})`
      });
    }

    return tips.map(t => `
      <div class="dash-tip ${t.type}">
        <div class="tip-title">${t.type === 'danger' ? '🔴' : t.type === 'warn' ? '🟡' : '🟢'} ${t.title}</div>
        ${t.text}
      </div>
    `).join('');
  }

  #updateFilterStatus(okRecords) {
    const el = this.#el('dash-filter-status');
    if (!el) return;
    el.innerHTML = `<span class="dash-badge active">활성</span> <span style="font-size:0.75rem;color:#7a9ab5;margin-left:0.3rem">학습 데이터: ${okRecords.length}건</span>`;
  }
}
