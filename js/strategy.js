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

  // Core stint calculation for a given burn rate.
  // Full-tank strategy: fill to capacity on every stop except the last one
  // (last stop adds only what's needed to finish, saving pit time).
  function calcStints(config, burnRate) {
    const { totalLaps, tankCapacity, drivers } = config;
    if (!totalLaps || !tankCapacity || !burnRate || !drivers?.length) return null;

    // Max laps on a full tank (leave ~1L buffer)
    const maxLapsPerTank = Math.floor((tankCapacity - 1) / burnRate);

    const numStints = Math.ceil(totalLaps / maxLapsPerTank);
    const stops = numStints - 1;

    const stints = [];
    let lapCursor = 1;

    for (let i = 0; i < numStints; i++) {
      const isLast = i === numStints - 1;
      const isPit = !isLast;
      const stintLaps = isLast ? (totalLaps - lapCursor + 1) : maxLapsPerTank;
      const fuelNeeded = Math.ceil(stintLaps * burnRate * 10) / 10;

      let fuelToAdd = 0;
      if (isPit) {
        if (i === numStints - 2) {
          // Last pit stop: add just enough fuel for the final stint
          const finalLaps = totalLaps - (lapCursor + stintLaps - 1);
          fuelToAdd = Math.min(Math.ceil((finalLaps * burnRate + 1) * 10) / 10, tankCapacity);
        } else {
          fuelToAdd = tankCapacity;
        }
      }

      stints.push({
        stintNum: i + 1,
        driver: drivers[i % drivers.length],
        driverIndex: i % drivers.length,
        startLap: lapCursor,
        endLap: lapCursor + stintLaps - 1,
        laps: stintLaps,
        fuelNeeded: Math.min(fuelNeeded, tankCapacity),
        fuelToAdd,
        isPit,
        isLast,
      });

      lapCursor += stintLaps;
    }

    return {
      burnRate,
      stops,
      stints,
      lapsPerStint: maxLapsPerTank,
      totalFuelNeeded: Math.ceil(totalLaps * burnRate * 10) / 10,
      maxLapsPerTank,
    };
  }

  // Generate three scenarios.
  // Safe = plan for +5% burn (conservative — you'll never run dry).
  // Risky = plan for -5% burn (optimistic fuel saving — risk running dry if you can't achieve it).
  function calcScenarios(config, baseBurnRate) {
    return {
      safe:  calcStints(config, Math.round(baseBurnRate * 1.05 * 100) / 100),
      base:  calcStints(config, baseBurnRate),
      risky: calcStints(config, Math.round(baseBurnRate * 0.95 * 100) / 100),
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
