// ── Strategy calculation engine ──────────────────────────────────────────────

const Strategy = (() => {

  // Driver colors for visual distinction
  const DRIVER_COLORS = ['#e8433a', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7'];

  function driverColor(index) {
    return DRIVER_COLORS[index % DRIVER_COLORS.length];
  }

  // Calculate burn rate from test laps
  function calcBurnRate(fuelUsed, lapsRun) {
    if (!lapsRun || lapsRun <= 0) return 0;
    return Math.round((fuelUsed / lapsRun) * 100) / 100;
  }

  // Core stint calculation for a given burn rate
  // Returns: { stops, stints[], fuelPerStop, totalFuelNeeded, lapsPerStint }
  function calcStints(config, burnRate) {
    const { totalLaps, tankCapacity, drivers } = config;
    if (!totalLaps || !tankCapacity || !burnRate || !drivers?.length) return null;

    // Max laps per tank (leave ~1L buffer for safety)
    const maxLapsPerTank = Math.floor((tankCapacity - 1) / burnRate);

    // Number of pit stops needed
    const stops = Math.max(0, Math.ceil(totalLaps / maxLapsPerTank) - 1);

    // Distribute laps across stints evenly
    const numStints = stops + 1;
    const baseLapsPerStint = Math.floor(totalLaps / numStints);
    const remainder = totalLaps % numStints;

    const stints = [];
    let lapCursor = 1;
    let driverIdx = 0;

    for (let i = 0; i < numStints; i++) {
      const stintLaps = baseLapsPerStint + (i < remainder ? 1 : 0);
      const fuelNeeded = Math.ceil(stintLaps * burnRate * 10) / 10;
      const isPit = i < numStints - 1;

      stints.push({
        stintNum: i + 1,
        driver: drivers[driverIdx % drivers.length],
        driverIndex: driverIdx % drivers.length,
        startLap: lapCursor,
        endLap: lapCursor + stintLaps - 1,
        laps: stintLaps,
        fuelNeeded: Math.min(fuelNeeded, tankCapacity),
        fuelToAdd: isPit ? Math.min(Math.ceil(stintLaps * burnRate * 10) / 10, tankCapacity) : 0,
        isPit,
        isLast: i === numStints - 1,
      });

      lapCursor += stintLaps;
      driverIdx++;
    }

    const totalFuelNeeded = Math.ceil(totalLaps * burnRate * 10) / 10;

    return {
      burnRate,
      stops,
      stints,
      lapsPerStint: baseLapsPerStint,
      totalFuelNeeded,
      maxLapsPerTank,
    };
  }

  // Generate three scenarios: safe (-5%), base, risky (+5%)
  function calcScenarios(config, baseBurnRate) {
    return {
      safe: calcStints(config, Math.round(baseBurnRate * 0.95 * 100) / 100),
      base: calcStints(config, baseBurnRate),
      risky: calcStints(config, Math.round(baseBurnRate * 1.05 * 100) / 100),
    };
  }

  // Recalculate remaining strategy from a mid-race point
  // pitLog: array of logged pit stops with actual lap/fuel data
  function recalcFromLive(config, baseBurnRate, pitLog) {
    if (!pitLog || pitLog.length === 0) return calcStints(config, baseBurnRate);

    const lastPit = pitLog[pitLog.length - 1];
    const lapsRemaining = config.totalLaps - lastPit.lap;

    if (lapsRemaining <= 0) return null;

    // Use actual burn rate if we have enough data
    let effectiveBurn = baseBurnRate;
    if (pitLog.length >= 1 && lastPit.actualBurn > 0) {
      effectiveBurn = lastPit.actualBurn;
    }

    const partialConfig = {
      ...config,
      totalLaps: lapsRemaining,
    };

    const result = calcStints(partialConfig, effectiveBurn);
    if (!result) return null;

    // Offset lap numbers by laps already done
    result.stints = result.stints.map(s => ({
      ...s,
      startLap: s.startLap + lastPit.lap,
      endLap: s.endLap + lastPit.lap,
    }));

    result.lapsCompleted = lastPit.lap;
    result.lapsRemaining = lapsRemaining;
    result.effectiveBurn = effectiveBurn;

    return result;
  }

  // Format lap time from seconds
  function formatLapTime(seconds) {
    if (!seconds) return '--:--.---';
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(3).padStart(6, '0');
    return `${m}:${s}`;
  }

  // Format race time from total minutes
  function formatDuration(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
    return `${m}m`;
  }

  return {
    driverColor,
    calcBurnRate,
    calcStints,
    calcScenarios,
    recalcFromLive,
    formatLapTime,
    formatDuration,
  };
})();
