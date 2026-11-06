// Shared travel logic — used by both the web app (app.js) and the archiver (archive.js).
// Turns TripIt flight segments into "away from Singapore" trips, and counts days per year.

const AIRPORT_CITY = {
  SIN: 'Singapore', MNL: 'Manila', SYD: 'Sydney', KUL: 'Kuala Lumpur',
  JFK: 'New York', EWR: 'New York', LGA: 'New York', SGN: 'Ho Chi Minh City',
  HND: 'Tokyo', NRT: 'Tokyo', KIX: 'Osaka', HAK: 'Haikou', CAN: 'Guangzhou',
  PVG: 'Shanghai', SHA: 'Shanghai', ORD: 'Chicago', PBI: 'West Palm Beach',
  IAH: 'Houston', LHR: 'London', HAM: 'Hamburg', CMB: 'Colombo', BKK: 'Bangkok',
  HKG: 'Hong Kong', ICN: 'Seoul', CGK: 'Jakarta', DPS: 'Bali', TPE: 'Taipei',
};

function asText(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v.val === 'string') return v.val;
  return '';
}
function iso(d) { return new Date(d).toISOString().slice(0, 10); }

// Pair SIN departures with the next SIN arrival → closed "away" trips.
function flightsToTrips(events) {
  const flights = [];
  for (const e of events) {
    const s = asText(e.summary);
    const m = s.match(/\b([A-Z]{3})\s+to\s+([A-Z]{3})\b/);
    if (m && e.start) flights.push({ from: m[1], to: m[2], start: new Date(e.start) });
  }
  flights.sort((a, b) => a.start - b.start);
  // de-duplicate identical segments (TripIt sometimes lists a flight several times)
  const seen = new Set(), uniq = [];
  for (const f of flights) {
    const k = iso(f.start) + '|' + f.from + '|' + f.to;
    if (!seen.has(k)) { seen.add(k); uniq.push(f); }
  }
  // Track whether she's currently away from Singapore. A trip is open from the first flight that
  // takes her out of SIN (or departs a non-SIN city when we thought she was home — e.g. a KL→BKK
  // leg that doesn't start in Singapore) until the next flight that lands her back in SIN.
  const trips = [];
  let open = null;
  for (const f of uniq) {
    if (f.to === 'SIN') {
      if (open) { open.ret = f.start; trips.push(open); open = null; } // arrived home → close trip
    } else if (!open) {
      open = { dep: f.start, dest: f.to }; // departing to somewhere not-SIN and not already away
    }
    // a non-SIN→non-SIN leg while already away is an intermediate hop — keep the trip open
  }
  return trips.filter(t => t.ret).map(t => ({
    id: 'f-' + iso(t.dep) + '-' + t.dest,
    label: AIRPORT_CITY[t.dest] || t.dest,
    start: iso(t.dep),
    end: iso(t.ret),
    source: 'tripit',
  }));
}

// Merge archive + freshly-derived trips (by id); later entries win, nothing is dropped.
function mergeTrips(...lists) {
  const byId = new Map();
  for (const list of lists) for (const t of (list || [])) byId.set(t.id, { ...(byId.get(t.id) || {}), ...t });
  return [...byId.values()].sort((a, b) => a.start < b.start ? -1 : 1);
}

function addDays(d, n) { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }

// Count unique days / nights outside Singapore within a given calendar year (unions overlaps).
function yearStats(trips, year) {
  const yPrefix = String(year) + '-';
  const daySet = new Set(), nightSet = new Set();
  const inYear = [];
  for (const t of trips) {
    if (!t.start || !t.end) continue;
    let touched = false;
    for (let d = t.start; d <= t.end; d = addDays(d, 1)) {
      if (d.startsWith(yPrefix)) { daySet.add(d); touched = true; }
    }
    for (let d = t.start; d < t.end; d = addDays(d, 1)) {           // nights exclude the return day
      if (d.startsWith(yPrefix)) nightSet.add(d);
    }
    if (touched) {
      const cStart = t.start < yPrefix + '01-01' ? yPrefix + '01-01' : t.start;
      const cEnd = t.end > yPrefix + '12-31' ? yPrefix + '12-31' : t.end;
      let days = 0;
      for (let d = cStart; d <= cEnd; d = addDays(d, 1)) days++;
      inYear.push({ label: t.label, start: t.start, end: t.end, days, source: t.source || 'tripit' });
    }
  }
  inYear.sort((a, b) => a.start < b.start ? -1 : 1);
  return { year, days: daySet.size, nights: nightSet.size, trips: inYear };
}

module.exports = { flightsToTrips, mergeTrips, yearStats, AIRPORT_CITY };
