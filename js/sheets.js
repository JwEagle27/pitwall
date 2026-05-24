// ── Google Sheets API layer ──────────────────────────────────────────────────
// All reads/writes go through this module.
// Data is stored in three tabs: Config, Strategy, LiveLog

const Sheets = (() => {
  const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

  function getCreds() {
    return {
      sheetId: localStorage.getItem('pw_sheet_id') || '',
      apiKey: localStorage.getItem('pw_api_key') || '',
    };
  }

  function isConfigured() {
    const { sheetId, apiKey } = getCreds();
    return !!(sheetId && apiKey);
  }

  async function read(range) {
    const { sheetId, apiKey } = getCreds();
    if (!sheetId || !apiKey) throw new Error('Not configured');
    const url = `${BASE}/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Sheets read failed');
    }
    const data = await res.json();
    return data.values || [];
  }

  async function write(range, values) {
    const { sheetId, apiKey } = getCreds();
    if (!sheetId || !apiKey) throw new Error('Not configured');
    // For write operations we need OAuth — use a simple fetch with the stored token
    // In production this would use gapi.client — for now we POST via the API
    const url = `${BASE}/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW&key=${apiKey}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Sheets write failed');
    }
    return await res.json();
  }

  async function append(range, values) {
    const { sheetId, apiKey } = getCreds();
    if (!sheetId || !apiKey) throw new Error('Not configured');
    const url = `${BASE}/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'Sheets append failed');
    }
    return await res.json();
  }

  async function testConnection() {
    const { sheetId, apiKey } = getCreds();
    if (!sheetId || !apiKey) return false;
    try {
      const url = `${BASE}/${sheetId}?key=${apiKey}&fields=properties.title`;
      const res = await fetch(url);
      return res.ok;
    } catch {
      return false;
    }
  }

  // ── Race list ──────────────────────────────────────────────────────────────
  // Stored in tab "Races" as rows: [id, name, date, durationMins, totalLaps, driverCount, status]

  async function loadRaces() {
    if (!isConfigured()) return [];
    try {
      const rows = await read('Races!A2:H');
      return rows.map(r => ({
        id: r[0],
        name: r[1] || '',
        date: r[2] || '',
        durationMins: Number(r[3]) || 0,
        totalLaps: Number(r[4]) || 0,
        driverCount: Number(r[5]) || 0,
        status: r[6] || 'setup',
        tankCapacity: Number(r[7]) || 0,
      }));
    } catch {
      return [];
    }
  }

  async function saveRace(race) {
    const row = [
      race.id, race.name, race.date,
      race.durationMins, race.totalLaps,
      race.driverCount, race.status, race.tankCapacity,
    ];
    // Try to find existing row and update, else append
    try {
      const rows = await read('Races!A2:A');
      const idx = rows.findIndex(r => r[0] === race.id);
      if (idx >= 0) {
        await write(`Races!A${idx + 2}:H${idx + 2}`, [row]);
      } else {
        await append('Races!A:H', [row]);
      }
    } catch {
      await append('Races!A:H', [row]);
    }
  }

  async function deleteRace(raceId) {
    // Mark as deleted rather than actually deleting rows (simpler with Sheets API)
    try {
      const rows = await read('Races!A2:A');
      const idx = rows.findIndex(r => r[0] === raceId);
      if (idx >= 0) {
        await write(`Races!G${idx + 2}`, [['deleted']]);
      }
    } catch (e) {
      console.warn('Delete failed', e);
    }
  }

  // ── Race config (drivers, fuel settings) ──────────────────────────────────
  // Stored in "Config" tab: [raceId, key, value]

  async function loadConfig(raceId) {
    if (!isConfigured()) return null;
    try {
      const rows = await read('Config!A2:C');
      const raceRows = rows.filter(r => r[0] === raceId);
      const config = {};
      raceRows.forEach(r => { config[r[1]] = r[2]; });
      // Parse drivers JSON
      if (config.drivers) {
        try { config.drivers = JSON.parse(config.drivers); } catch { config.drivers = []; }
      }
      return config;
    } catch {
      return null;
    }
  }

  async function saveConfig(raceId, key, value) {
    const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
    try {
      const rows = await read('Config!A2:C');
      const idx = rows.findIndex(r => r[0] === raceId && r[1] === key);
      if (idx >= 0) {
        await write(`Config!A${idx + 2}:C${idx + 2}`, [[raceId, key, strVal]]);
      } else {
        await append('Config!A:C', [[raceId, key, strVal]]);
      }
    } catch {
      await append('Config!A:C', [[raceId, key, strVal]]);
    }
  }

  // ── Live pit log ───────────────────────────────────────────────────────────
  // Stored in "LiveLog" tab: [raceId, stopNum, lap, driverIn, fuelAdded, timestamp, actualBurn]

  async function loadPitLog(raceId) {
    if (!isConfigured()) return [];
    try {
      const rows = await read('LiveLog!A2:G');
      return rows
        .filter(r => r[0] === raceId)
        .map(r => ({
          raceId: r[0],
          stopNum: Number(r[1]),
          lap: Number(r[2]),
          driverIn: r[3] || '',
          fuelAdded: Number(r[4]) || 0,
          timestamp: r[5] || '',
          actualBurn: Number(r[6]) || 0,
        }));
    } catch {
      return [];
    }
  }

  async function logPitStop(entry) {
    const row = [
      entry.raceId,
      entry.stopNum,
      entry.lap,
      entry.driverIn,
      entry.fuelAdded,
      new Date().toISOString(),
      entry.actualBurn || '',
    ];
    await append('LiveLog!A:G', [row]);
  }

  return {
    getCreds,
    isConfigured,
    testConnection,
    loadRaces,
    saveRace,
    deleteRace,
    loadConfig,
    saveConfig,
    loadPitLog,
    logPitStop,
    read,
    write,
  };
})();
