// ── PitWall App ──────────────────────────────────────────────────────────────

const App = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let state = {
    page: 'races',
    races: [],
    activeRace: null,
    config: null,
    pitLog: [],
    scenarios: null,
    activeScenario: 'base',
    loading: false,
  };

  // Local fallback storage when Sheets not configured
  function localSave(key, val) {
    try { localStorage.setItem('pw_' + key, JSON.stringify(val)); } catch {}
  }
  function localLoad(key, fallback = null) {
    try { const v = localStorage.getItem('pw_' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  async function init() {
    setupNav();
    setupSettingsModal();
    createToastContainer();
    await checkConnection();
    await loadRaces();
    navigate('races');
  }

  async function checkConnection() {
    const dot = document.getElementById('status-dot');
    const lbl = document.getElementById('status-label');
    if (!Sheets.isConfigured()) {
      dot.className = 'status-dot';
      lbl.textContent = 'Not connected';
      return;
    }
    const ok = await Sheets.testConnection();
    if (ok) {
      dot.className = 'status-dot connected';
      lbl.textContent = 'Sheets connected';
    } else {
      dot.className = 'status-dot error';
      lbl.textContent = 'Connection error';
    }
  }

  function setupNav() {
    document.getElementById('main-nav').addEventListener('click', e => {
      const btn = e.target.closest('.nav-btn');
      if (!btn || btn.disabled) return;
      navigate(btn.dataset.page);
    });
  }

  function navigate(page, raceId) {
    state.page = page;
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.page === page);
    });
    if (raceId) {
      state.activeRace = state.races.find(r => r.id === raceId) || state.activeRace;
    }
    render();
  }

  function setNavEnabled() {
    const hasRace = !!state.activeRace;
    document.getElementById('nav-setup').disabled = !hasRace;
    document.getElementById('nav-strategy').disabled = !hasRace;
    document.getElementById('nav-live').disabled = !hasRace;
  }

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadRaces() {
    if (Sheets.isConfigured()) {
      const sheetsRaces = await Sheets.loadRaces();
      if (sheetsRaces.length) {
        state.races = sheetsRaces.filter(r => r.status !== 'deleted');
        localSave('races', state.races);
        return;
      }
    }
    state.races = localLoad('races', []);
  }

  async function loadRaceConfig(raceId) {
    if (Sheets.isConfigured()) {
      const cfg = await Sheets.loadConfig(raceId);
      if (cfg) {
        state.config = cfg;
        localSave('config_' + raceId, cfg);
        return;
      }
    }
    state.config = localLoad('config_' + raceId, {});
  }

  async function loadPitLog(raceId) {
    if (Sheets.isConfigured()) {
      const log = await Sheets.loadPitLog(raceId);
      if (log) {
        state.pitLog = log;
        localSave('pitlog_' + raceId, log);
        return;
      }
    }
    state.pitLog = localLoad('pitlog_' + raceId, []);
  }

  // ── Settings modal ─────────────────────────────────────────────────────────
  function setupSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const btn = document.getElementById('settings-btn');
    const close = document.getElementById('settings-close');
    const cancel = document.getElementById('settings-cancel');
    const save = document.getElementById('settings-save');

    btn.addEventListener('click', () => {
      const { sheetId, apiKey } = Sheets.getCreds();
      document.getElementById('sheet-id-input').value = sheetId;
      document.getElementById('api-key-input').value = apiKey;
      modal.style.display = 'flex';
    });

    const closeModal = () => { modal.style.display = 'none'; };
    close.addEventListener('click', closeModal);
    cancel.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    save.addEventListener('click', async () => {
      const sheetId = document.getElementById('sheet-id-input').value.trim();
      const apiKey = document.getElementById('api-key-input').value.trim();
      if (!sheetId || !apiKey) { toast('Enter both Sheet ID and API key', 'error'); return; }
      localStorage.setItem('pw_sheet_id', sheetId);
      localStorage.setItem('pw_api_key', apiKey);
      save.textContent = 'Testing…';
      save.disabled = true;
      const ok = await Sheets.testConnection();
      save.textContent = 'Save & test connection';
      save.disabled = false;
      if (ok) {
        toast('Connected to Google Sheets!', 'success');
        await checkConnection();
        closeModal();
      } else {
        toast('Could not connect. Check your Sheet ID and API key.', 'error');
      }
    });
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function createToastContainer() {
    const el = document.createElement('div');
    el.className = 'toast-container';
    el.id = 'toast-container';
    document.body.appendChild(el);
  }

  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ── Render router ──────────────────────────────────────────────────────────
  function render() {
    setNavEnabled();
    const container = document.getElementById('page-container');
    switch (state.page) {
      case 'races':    container.innerHTML = renderRaces(); bindRaces(); break;
      case 'setup':    renderSetupPage(container); break;
      case 'strategy': renderStrategyPage(container); break;
      case 'live':     renderLivePage(container); break;
    }
  }

  // ── Page: Races ────────────────────────────────────────────────────────────
  function renderRaces() {
    const races = state.races;
    return `
      <div class="page-header">
        <div>
          <div class="page-title">Your races</div>
          <div class="page-subtitle">Select a race to view or plan its strategy</div>
        </div>
        <button class="btn btn-primary" id="new-race-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New race
        </button>
      </div>
      ${races.length === 0 ? `
        <div class="empty-state">
          <div class="empty-state-icon">🏁</div>
          <div class="empty-state-title">No races yet</div>
          <div>Create your first race to start planning</div>
          <div style="margin-top:16px">
            <button class="btn btn-primary" id="new-race-btn-empty">New race</button>
          </div>
        </div>
      ` : `
        <div class="races-grid">
          ${races.map(race => `
            <div class="race-card" data-race-id="${race.id}">
              <div class="race-card-actions">
                <button class="btn btn-sm btn-danger delete-race-btn" data-race-id="${race.id}">Delete</button>
              </div>
              <div class="race-card-name">${escHtml(race.name)}</div>
              <div class="race-card-meta">${race.date ? formatDate(race.date) : 'Date not set'}</div>
              <div class="race-card-stats">
                <div class="race-stat">
                  <span class="race-stat-val">${Strategy.formatDuration(race.durationMins)}</span>
                  <span class="race-stat-lbl">Duration</span>
                </div>
                <div class="race-stat">
                  <span class="race-stat-val">${race.totalLaps || '--'}</span>
                  <span class="race-stat-lbl">Laps</span>
                </div>
                <div class="race-stat">
                  <span class="race-stat-val">${race.driverCount || '--'}</span>
                  <span class="race-stat-lbl">Drivers</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    `;
  }

  function bindRaces() {
    document.getElementById('new-race-btn')?.addEventListener('click', openNewRaceModal);
    document.getElementById('new-race-btn-empty')?.addEventListener('click', openNewRaceModal);
    document.querySelectorAll('.race-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.delete-race-btn')) return;
        const raceId = card.dataset.raceId;
        state.activeRace = state.races.find(r => r.id === raceId);
        navigate('setup');
      });
    });
    document.querySelectorAll('.delete-race-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const raceId = btn.dataset.raceId;
        if (!confirm('Delete this race? This cannot be undone.')) return;
        state.races = state.races.filter(r => r.id !== raceId);
        localSave('races', state.races);
        if (Sheets.isConfigured()) await Sheets.deleteRace(raceId);
        render();
      });
    });
  }

  function openNewRaceModal() {
    const modalHtml = `
      <div class="modal-overlay" id="new-race-modal">
        <div class="modal">
          <div class="modal-header">
            <h2>New race</h2>
            <button class="btn-icon" id="new-race-close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="field-group">
              <label class="field-label">Race name</label>
              <input type="text" class="field-input" id="nr-name" placeholder="Daytona 24h, Spa 6h…">
            </div>
            <div class="field-row">
              <div class="field-group">
                <label class="field-label">Duration (minutes)</label>
                <input type="number" class="field-input" id="nr-duration" placeholder="360" min="1">
              </div>
              <div class="field-group">
                <label class="field-label">Total laps</label>
                <input type="number" class="field-input" id="nr-laps" placeholder="200" min="1">
              </div>
            </div>
            <div class="field-row">
              <div class="field-group">
                <label class="field-label">Race date</label>
                <input type="date" class="field-input" id="nr-date">
              </div>
              <div class="field-group">
                <label class="field-label">Tank capacity (L)</label>
                <input type="number" class="field-input" id="nr-tank" placeholder="120" min="1" step="0.1">
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-secondary" id="new-race-cancel">Cancel</button>
              <button class="btn btn-primary" id="new-race-create">Create race</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('new-race-modal');
    const close = () => modal.remove();
    document.getElementById('new-race-close').addEventListener('click', close);
    document.getElementById('new-race-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('new-race-create').addEventListener('click', async () => {
      const name = document.getElementById('nr-name').value.trim();
      const durationMins = Number(document.getElementById('nr-duration').value);
      const totalLaps = Number(document.getElementById('nr-laps').value);
      const date = document.getElementById('nr-date').value;
      const tankCapacity = Number(document.getElementById('nr-tank').value);
      if (!name) { toast('Enter a race name', 'error'); return; }
      if (!totalLaps) { toast('Enter total laps', 'error'); return; }
      if (!tankCapacity) { toast('Enter tank capacity', 'error'); return; }
      const race = {
        id: 'race_' + Date.now(),
        name, date, durationMins, totalLaps, tankCapacity,
        driverCount: 4, status: 'setup',
      };
      state.races.unshift(race);
      localSave('races', state.races);
      if (Sheets.isConfigured()) await Sheets.saveRace(race);
      state.activeRace = race;
      state.config = {};
      close();
      navigate('setup');
    });
  }

  // ── Page: Setup ────────────────────────────────────────────────────────────
  async function renderSetupPage(container) {
    if (!state.activeRace) { navigate('races'); return; }
    await loadRaceConfig(state.activeRace.id);
    const cfg = state.config || {};
    const drivers = cfg.drivers || [{ name: '' }, { name: '' }, { name: '' }, { name: '' }];
    const burnRate = cfg.burnRate || '';
    const testLaps = cfg.testLaps || '';
    const testFuel = cfg.testFuel || '';

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">${escHtml(state.activeRace.name)}</div>
          <div class="page-subtitle">Setup — configure drivers and fuel</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" id="setup-back">← Races</button>
          <button class="btn btn-primary" id="setup-save">Save & view strategy →</button>
        </div>
      </div>

      <div class="setup-layout">
        <div>
          <!-- Race basics -->
          <div class="card" style="margin-bottom:16px">
            <div class="card-title">Race info</div>
            <div class="field-row">
              <div class="field-group">
                <label class="field-label">Total laps</label>
                <input type="number" class="field-input" id="cfg-laps" value="${state.activeRace.totalLaps || ''}" placeholder="200" min="1">
              </div>
              <div class="field-group">
                <label class="field-label">Duration (mins)</label>
                <input type="number" class="field-input" id="cfg-duration" value="${state.activeRace.durationMins || ''}" placeholder="360">
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">Tank capacity (L)</label>
              <input type="number" class="field-input" id="cfg-tank" value="${state.activeRace.tankCapacity || ''}" placeholder="120" step="0.1" min="1">
            </div>
          </div>

          <!-- Fuel burn rate -->
          <div class="card">
            <div class="card-title">Fuel burn</div>
            <div class="burn-calc">
              <div class="burn-calc-title">Calculate from test laps</div>
              <div class="field-row">
                <div class="field-group" style="margin-bottom:0">
                  <label class="field-label">Laps run</label>
                  <input type="number" class="field-input" id="cfg-test-laps" value="${testLaps}" placeholder="10" min="1" step="1">
                </div>
                <div class="field-group" style="margin-bottom:0">
                  <label class="field-label">Fuel used (L)</label>
                  <input type="number" class="field-input" id="cfg-test-fuel" value="${testFuel}" placeholder="18.4" step="0.1" min="0">
                </div>
              </div>
              <div class="burn-result" id="burn-result" style="${testLaps && testFuel ? '' : 'display:none'}">
                <span class="burn-result-val" id="burn-calc-val">${testLaps && testFuel ? (testFuel/testLaps).toFixed(2) : ''}</span>
                <span class="burn-result-lbl">L/lap (calculated)</span>
              </div>
            </div>
            <div class="field-group">
              <label class="field-label">Burn rate (L/lap) <span class="text-dim">— override or use calculated above</span></label>
              <input type="number" class="field-input" id="cfg-burn" value="${burnRate}" placeholder="1.82" step="0.01" min="0">
            </div>
          </div>
        </div>

        <div>
          <!-- Drivers -->
          <div class="card">
            <div class="card-title">Driver lineup & rotation order</div>
            <div class="text-muted" style="font-size:12px;margin-bottom:14px">Drag to reorder. Rotation follows this order top to bottom.</div>
            <div class="driver-list" id="driver-list">
              ${drivers.map((d, i) => renderDriverRow(d, i)).join('')}
            </div>
            <button class="add-driver-btn" id="add-driver-btn" ${drivers.length >= 4 ? 'style="display:none"' : ''}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add driver
            </button>
          </div>
        </div>
      </div>
    `;

    bindSetup();
  }

  function renderDriverRow(driver, index) {
    const color = Strategy.driverColor(index);
    return `
      <div class="driver-row" data-index="${index}" draggable="true">
        <div class="driver-handle" style="color:${color}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="8" x2="21" y2="8"/><line x1="3" y1="16" x2="21" y2="16"/></svg>
        </div>
        <span class="driver-num">${index + 1}</span>
        <input type="text" class="driver-input" placeholder="Driver ${index + 1} name" value="${escHtml(driver.name || '')}" data-driver-idx="${index}">
        <button class="driver-remove" data-index="${index}" title="Remove driver">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
  }

  function bindSetup() {
    // Burn rate calculator
    const calcBurn = () => {
      const laps = Number(document.getElementById('cfg-test-laps').value);
      const fuel = Number(document.getElementById('cfg-test-fuel').value);
      const result = document.getElementById('burn-result');
      const val = document.getElementById('burn-calc-val');
      const burnInput = document.getElementById('cfg-burn');
      if (laps > 0 && fuel > 0) {
        const rate = (fuel / laps).toFixed(2);
        val.textContent = rate;
        result.style.display = 'flex';
        if (!burnInput.value) burnInput.value = rate;
        else burnInput.value = rate; // always update burn from calc
      } else {
        result.style.display = 'none';
      }
    };
    document.getElementById('cfg-test-laps').addEventListener('input', calcBurn);
    document.getElementById('cfg-test-fuel').addEventListener('input', calcBurn);

    // Drag and drop for drivers
    const list = document.getElementById('driver-list');
    let dragSrc = null;
    list.addEventListener('dragstart', e => {
      dragSrc = e.target.closest('.driver-row');
      dragSrc.style.opacity = '0.4';
    });
    list.addEventListener('dragend', e => {
      e.target.closest('.driver-row').style.opacity = '1';
      list.querySelectorAll('.driver-row').forEach(r => r.classList.remove('drag-over'));
    });
    list.addEventListener('dragover', e => {
      e.preventDefault();
      const target = e.target.closest('.driver-row');
      if (target && target !== dragSrc) {
        list.querySelectorAll('.driver-row').forEach(r => r.classList.remove('drag-over'));
        target.classList.add('drag-over');
      }
    });
    list.addEventListener('drop', e => {
      e.preventDefault();
      const target = e.target.closest('.driver-row');
      if (target && target !== dragSrc) {
        const rows = [...list.querySelectorAll('.driver-row')];
        const srcIdx = rows.indexOf(dragSrc);
        const tgtIdx = rows.indexOf(target);
        if (srcIdx < tgtIdx) list.insertBefore(dragSrc, target.nextSibling);
        else list.insertBefore(dragSrc, target);
        refreshDriverNumbers();
      }
    });

    // Add driver
    document.getElementById('add-driver-btn').addEventListener('click', () => {
      const rows = list.querySelectorAll('.driver-row');
      if (rows.length >= 4) return;
      const idx = rows.length;
      const row = document.createElement('div');
      row.innerHTML = renderDriverRow({ name: '' }, idx);
      list.appendChild(row.firstElementChild);
      refreshDriverNumbers();
      bindRemoveDrivers();
      if (list.querySelectorAll('.driver-row').length >= 4) {
        document.getElementById('add-driver-btn').style.display = 'none';
      }
    });

    bindRemoveDrivers();

    // Nav
    document.getElementById('setup-back').addEventListener('click', () => navigate('races'));
    document.getElementById('setup-save').addEventListener('click', saveSetup);
  }

  function refreshDriverNumbers() {
    const list = document.getElementById('driver-list');
    list.querySelectorAll('.driver-row').forEach((row, i) => {
      row.dataset.index = i;
      row.querySelector('.driver-num').textContent = i + 1;
      const handle = row.querySelector('.driver-handle');
      handle.style.color = Strategy.driverColor(i);
      const inp = row.querySelector('.driver-input');
      inp.dataset.driverIdx = i;
    });
  }

  function bindRemoveDrivers() {
    document.querySelectorAll('.driver-remove').forEach(btn => {
      btn.replaceWith(btn.cloneNode(true)); // clear old listeners
    });
    document.querySelectorAll('.driver-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const list = document.getElementById('driver-list');
        if (list.querySelectorAll('.driver-row').length <= 2) {
          toast('Minimum 2 drivers required', 'error'); return;
        }
        btn.closest('.driver-row').remove();
        refreshDriverNumbers();
        if (list.querySelectorAll('.driver-row').length < 4) {
          document.getElementById('add-driver-btn').style.display = '';
        }
      });
    });
  }

  async function saveSetup() {
    const list = document.getElementById('driver-list');
    const drivers = [...list.querySelectorAll('.driver-input')].map((inp, i) => ({
      name: inp.value.trim() || `Driver ${i + 1}`,
      index: i,
    }));

    const totalLaps = Number(document.getElementById('cfg-laps').value) || state.activeRace.totalLaps;
    const durationMins = Number(document.getElementById('cfg-duration').value) || state.activeRace.durationMins;
    const tankCapacity = Number(document.getElementById('cfg-tank').value) || state.activeRace.tankCapacity;
    const burnRate = Number(document.getElementById('cfg-burn').value);
    const testLaps = Number(document.getElementById('cfg-test-laps').value);
    const testFuel = Number(document.getElementById('cfg-test-fuel').value);

    if (!burnRate) { toast('Enter a fuel burn rate', 'error'); return; }

    // Update race basics
    state.activeRace.totalLaps = totalLaps;
    state.activeRace.durationMins = durationMins;
    state.activeRace.tankCapacity = tankCapacity;
    state.activeRace.driverCount = drivers.length;

    const raceIdx = state.races.findIndex(r => r.id === state.activeRace.id);
    if (raceIdx >= 0) state.races[raceIdx] = state.activeRace;
    localSave('races', state.races);

    // Save config
    state.config = { drivers, burnRate, testLaps, testFuel };
    localSave('config_' + state.activeRace.id, state.config);

    if (Sheets.isConfigured()) {
      await Sheets.saveRace(state.activeRace);
      await Sheets.saveConfig(state.activeRace.id, 'drivers', drivers);
      await Sheets.saveConfig(state.activeRace.id, 'burnRate', burnRate);
      await Sheets.saveConfig(state.activeRace.id, 'testLaps', testLaps);
      await Sheets.saveConfig(state.activeRace.id, 'testFuel', testFuel);
    }

    // Pre-calculate scenarios
    const cfg = {
      totalLaps: state.activeRace.totalLaps,
      tankCapacity: state.activeRace.tankCapacity,
      drivers: state.config.drivers,
    };
    state.scenarios = Strategy.calcScenarios(cfg, burnRate);
    toast('Setup saved!', 'success');
    navigate('strategy');
  }

  // ── Page: Strategy ─────────────────────────────────────────────────────────
  async function renderStrategyPage(container) {
    if (!state.activeRace) { navigate('races'); return; }
    await loadRaceConfig(state.activeRace.id);

    const cfg = state.config || {};
    if (!cfg.burnRate) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Setup not complete</div><div>Please complete race setup first.</div><div style="margin-top:16px"><button class="btn btn-primary" id="go-setup">Go to setup</button></div></div>`;
      document.getElementById('go-setup').addEventListener('click', () => navigate('setup'));
      return;
    }

    const raceConfig = {
      totalLaps: state.activeRace.totalLaps,
      tankCapacity: state.activeRace.tankCapacity,
      drivers: cfg.drivers || [],
    };

    if (!state.scenarios) {
      state.scenarios = Strategy.calcScenarios(raceConfig, cfg.burnRate);
    }

    const { safe, base, risky } = state.scenarios;
    const active = state.scenarios[state.activeScenario];

    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">${escHtml(state.activeRace.name)}</div>
          <div class="page-subtitle">Pit strategy — ${state.activeRace.totalLaps} laps · ${state.activeRace.tankCapacity}L tank</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-secondary" id="strat-back">← Setup</button>
          <button class="btn btn-primary" id="strat-to-live">Go live →</button>
        </div>
      </div>

      <!-- Scenario comparison -->
      <div class="comparison-grid">
        ${renderComparisonCard('safe', safe, cfg.burnRate)}
        ${renderComparisonCard('base', base, cfg.burnRate)}
        ${renderComparisonCard('risky', risky, cfg.burnRate)}
      </div>

      <!-- Active scenario detail -->
      <div class="strategy-stats">
        <div class="stat-box highlight">
          <div class="stat-box-val">${active.stops}</div>
          <div class="stat-box-lbl">Pit stops</div>
        </div>
        <div class="stat-box">
          <div class="stat-box-val">${active.lapsPerStint}</div>
          <div class="stat-box-lbl">Laps per stint</div>
        </div>
        <div class="stat-box">
          <div class="stat-box-val">${active.maxLapsPerTank}</div>
          <div class="stat-box-lbl">Max laps/tank</div>
        </div>
        <div class="stat-box">
          <div class="stat-box-val">${active.totalFuelNeeded}L</div>
          <div class="stat-box-lbl">Total fuel needed</div>
        </div>
      </div>

      <!-- Stint schedule -->
      <div class="card">
        <div class="card-title">
          Stint schedule
          <span class="tag tag-info" style="margin-left:8px">${state.activeScenario === 'safe' ? '−5% burn' : state.activeScenario === 'risky' ? '+5% burn' : 'Base rate'}</span>
          <span class="text-dim" style="font-size:11px;margin-left:8px">${active.burnRate} L/lap</span>
        </div>
        <div style="overflow-x:auto">
          <table class="stint-table">
            <thead>
              <tr>
                <th>Stint</th>
                <th>Driver</th>
                <th>Laps</th>
                <th>Lap range</th>
                <th>Fuel to add</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${active.stints.map(s => renderStintRow(s, state.activeRace.tankCapacity)).join('')}
            </tbody>
          </table>
        </div>
        <div class="tolerance-note">
          Strategy shown for ${active.burnRate} L/lap. Tested rate was ${cfg.burnRate} L/lap.
          ${state.activeScenario === 'safe' ? 'Safe scenario assumes 5% lower consumption.' : ''}
          ${state.activeScenario === 'risky' ? 'Risky scenario assumes 5% higher consumption — plan a contingency stop.' : ''}
        </div>
      </div>
    `;

    document.getElementById('strat-back').addEventListener('click', () => navigate('setup'));
    document.getElementById('strat-to-live').addEventListener('click', () => navigate('live'));
    document.querySelectorAll('.comparison-card').forEach(card => {
      card.addEventListener('click', () => {
        state.activeScenario = card.dataset.scenario;
        renderStrategyPage(container);
      });
    });
  }

  function renderComparisonCard(type, scenario, baseRate) {
    if (!scenario) return '';
    const labels = { safe: 'Safe (−5%)', base: 'Base rate', risky: 'Risky (+5%)' };
    const desc = {
      safe: `${scenario.burnRate} L/lap · ${scenario.maxLapsPerTank} laps/tank`,
      base: `${scenario.burnRate} L/lap · ${scenario.maxLapsPerTank} laps/tank`,
      risky: `${scenario.burnRate} L/lap · consider +1 stop`,
    };
    const isActive = state.activeScenario === type;
    return `
      <div class="comparison-card ${type} ${isActive ? 'active' : ''}" data-scenario="${type}">
        <div class="comparison-card-label">${labels[type]}</div>
        <div class="comparison-card-stops">${scenario.stops}</div>
        <div class="comparison-card-detail">
          pit stops<br>
          ${desc[type]}
        </div>
      </div>
    `;
  }

  function renderStintRow(s, tankCapacity) {
    const color = Strategy.driverColor(s.driverIndex);
    const fuelPct = tankCapacity ? (s.fuelNeeded / tankCapacity) * 100 : 0;
    let badge = '';
    if (s.stintNum === 1) badge = `<span class="pit-badge start">Start</span>`;
    else if (s.isLast) badge = `<span class="pit-badge finish">Finish</span>`;
    else badge = `<span class="pit-badge pit">Pit in</span>`;

    return `
      <tr>
        <td class="mono text-dim">#${s.stintNum}</td>
        <td>
          <span class="driver-badge">
            <span class="driver-dot" style="background:${color}"></span>
            ${escHtml(s.driver?.name || `Driver ${s.driverIndex + 1}`)}
          </span>
        </td>
        <td class="mono">${s.laps}</td>
        <td class="mono text-muted">${s.startLap}–${s.endLap}</td>
        <td>
          ${s.isPit ? `
            <div class="fuel-bar-wrap">
              <div class="fuel-bar"><div class="fuel-bar-fill" style="width:${fuelPct}%"></div></div>
              <span class="fuel-bar-val">${s.fuelToAdd}L</span>
            </div>
          ` : '<span class="text-dim">—</span>'}
        </td>
        <td>${badge}</td>
      </tr>
    `;
  }

  // ── Page: Live ─────────────────────────────────────────────────────────────
  async function renderLivePage(container) {
    if (!state.activeRace) { navigate('races'); return; }
    await loadRaceConfig(state.activeRace.id);
    await loadPitLog(state.activeRace.id);

    const cfg = state.config || {};
    if (!cfg.burnRate) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-title">Setup not complete</div><div class="mt-16"><button class="btn btn-primary" id="go-setup-live">Go to setup</button></div></div>`;
      document.getElementById('go-setup-live').addEventListener('click', () => navigate('setup'));
      return;
    }

    const raceConfig = {
      totalLaps: state.activeRace.totalLaps,
      tankCapacity: state.activeRace.tankCapacity,
      drivers: cfg.drivers || [],
    };

    const pitLog = state.pitLog;
    const live = Strategy.recalcFromLive(raceConfig, cfg.burnRate, pitLog);
    const nextStint = live?.stints?.[0];
    const stopNum = pitLog.length + 1;
    const nextDriverIdx = (pitLog.length) % (cfg.drivers?.length || 1);
    const nextDriver = cfg.drivers?.[nextDriverIdx];

    container.innerHTML = `
      <div class="live-header-bar">
        <div>
          <div class="page-title">${escHtml(state.activeRace.name)}</div>
          <div class="page-subtitle">Live race · ${state.activeRace.totalLaps} laps total</div>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <div class="live-indicator"><div class="live-dot"></div>Live</div>
          <button class="btn btn-primary" id="log-pit-btn">Log pit stop</button>
        </div>
      </div>

      <!-- Next pit info -->
      ${nextStint ? `
        <div class="next-pit-card">
          <div class="next-pit-label">Next pit stop — stop #${stopNum}</div>
          <div class="next-pit-info">
            <div>
              <div class="next-pit-val" style="color:var(--accent)">${nextStint.endLap}</div>
              <div class="next-pit-lbl">Target lap</div>
            </div>
            <div>
              <div class="next-pit-val">${nextStint.laps}</div>
              <div class="next-pit-lbl">Laps in stint</div>
            </div>
            <div>
              <div class="next-pit-val" style="color:${Strategy.driverColor(nextDriverIdx)}">${escHtml(nextDriver?.name || '—')}</div>
              <div class="next-pit-lbl">Driver in</div>
            </div>
            <div>
              <div class="next-pit-val">${nextStint.fuelToAdd}L</div>
              <div class="next-pit-lbl">Fuel to add</div>
            </div>
          </div>
        </div>
      ` : `
        <div class="next-pit-card" style="border-color:var(--green)">
          <div class="next-pit-label" style="color:var(--green)">Race complete — no more pit stops planned</div>
        </div>
      `}

      <div class="live-layout">
        <!-- Remaining stints -->
        <div class="card">
          <div class="card-title">Remaining stint schedule</div>
          ${live?.stints?.length ? `
            <div style="overflow-x:auto">
              <table class="stint-table">
                <thead>
                  <tr>
                    <th>Stint</th>
                    <th>Driver</th>
                    <th>Laps</th>
                    <th>Lap range</th>
                    <th>Fuel to add</th>
                  </tr>
                </thead>
                <tbody>
                  ${live.stints.map(s => `
                    <tr>
                      <td class="mono text-dim">#${s.stintNum}</td>
                      <td>
                        <span class="driver-badge">
                          <span class="driver-dot" style="background:${Strategy.driverColor(s.driverIndex)}"></span>
                          ${escHtml(s.driver?.name || `Driver ${s.driverIndex + 1}`)}
                        </span>
                      </td>
                      <td class="mono">${s.laps}</td>
                      <td class="mono text-muted">${s.startLap}–${s.endLap}</td>
                      <td class="mono">${s.fuelToAdd > 0 ? s.fuelToAdd + 'L' : '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ${live.effectiveBurn && live.effectiveBurn !== cfg.burnRate ? `
              <div class="tolerance-note" style="color:var(--amber)">
                ⚠ Recalculated using actual burn rate of ${live.effectiveBurn} L/lap (tested: ${cfg.burnRate} L/lap)
              </div>
            ` : ''}
          ` : '<div class="text-dim" style="padding:12px 0">All stints complete.</div>'}
        </div>

        <!-- Pit log -->
        <div>
          <div class="card">
            <div class="card-title">Pit stop log</div>
            ${pitLog.length === 0 ? `
              <div class="text-dim" style="font-size:13px">No pit stops logged yet.</div>
            ` : `
              <div class="pit-log">
                ${pitLog.map(p => `
                  <div class="pit-log-entry">
                    <span class="pit-log-lap">Lap ${p.lap}</span>
                    <span class="driver-dot" style="background:${Strategy.driverColor(cfg.drivers?.findIndex(d => d.name === p.driverIn) ?? 0)}"></span>
                    <span class="pit-log-driver">${escHtml(p.driverIn)}</span>
                    <span class="pit-log-fuel">${p.fuelAdded}L</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    document.getElementById('log-pit-btn').addEventListener('click', () => openPitModal(cfg, pitLog, nextStint, stopNum, nextDriver, nextDriverIdx));
  }

  function openPitModal(cfg, pitLog, nextStint, stopNum, nextDriver, nextDriverIdx) {
    const drivers = cfg.drivers || [];
    const defaultDriver = nextDriver?.name || '';
    const defaultFuel = nextStint?.fuelToAdd || '';

    const html = `
      <div class="modal-overlay" id="pit-modal">
        <div class="modal">
          <div class="modal-header">
            <h2>Log pit stop #${stopNum}</h2>
            <button class="btn-icon" id="pit-modal-close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="modal-body">
            <div class="pit-form">
              <div class="field-group">
                <label class="field-label">Lap number (when you pit)</label>
                <input type="number" class="field-input" id="pit-lap" placeholder="${nextStint?.endLap || ''}" min="1" max="${state.activeRace.totalLaps}">
              </div>
              <div class="field-group">
                <label class="field-label">Driver getting in</label>
                <select class="field-input field-select" id="pit-driver">
                  ${drivers.map(d => `<option value="${escHtml(d.name)}" ${d.name === defaultDriver ? 'selected' : ''}>${escHtml(d.name)}</option>`).join('')}
                </select>
              </div>
              <div class="field-group">
                <label class="field-label">Fuel added (L)</label>
                <input type="number" class="field-input" id="pit-fuel" value="${defaultFuel}" placeholder="${defaultFuel}" step="0.1" min="0">
              </div>
              <div class="field-group">
                <label class="field-label">Actual burn rate this stint (L/lap) <span class="text-dim">— optional, updates strategy</span></label>
                <input type="number" class="field-input" id="pit-actual-burn" placeholder="${cfg.burnRate}" step="0.01" min="0">
              </div>
            </div>
            <div class="modal-actions">
              <button class="btn btn-secondary" id="pit-cancel">Cancel</button>
              <button class="btn btn-primary" id="pit-confirm">Log stop</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = document.getElementById('pit-modal');
    const close = () => modal.remove();
    document.getElementById('pit-modal-close').addEventListener('click', close);
    document.getElementById('pit-cancel').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('pit-confirm').addEventListener('click', async () => {
      const lap = Number(document.getElementById('pit-lap').value);
      const driverIn = document.getElementById('pit-driver').value;
      const fuelAdded = Number(document.getElementById('pit-fuel').value);
      const actualBurn = Number(document.getElementById('pit-actual-burn').value) || 0;

      if (!lap) { toast('Enter the lap number', 'error'); return; }
      if (!fuelAdded) { toast('Enter fuel added', 'error'); return; }

      const entry = {
        raceId: state.activeRace.id,
        stopNum,
        lap,
        driverIn,
        fuelAdded,
        actualBurn,
      };

      state.pitLog.push(entry);
      localSave('pitlog_' + state.activeRace.id, state.pitLog);
      if (Sheets.isConfigured()) await Sheets.logPitStop(entry);

      toast(`Pit stop #${stopNum} logged!`, 'success');
      close();
      renderLivePage(document.getElementById('page-container'));
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return dateStr; }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
