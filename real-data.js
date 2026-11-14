// real-data.js (v3). Turns the archived NASA DONKI data into game days.
// Load AFTER archive.js. Everything here is "archived", not live.
// v3: window picker now skips stretches where most days have nothing logged.
(function () {
  "use strict";
  const A = window.DONKI_ARCHIVE;
  if (!A) {
    console.error("archive.js is missing or did not load");
    return;
  }

  const DAY = 86400000,
    HOUR = 3600000;
  const MON = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const NAMES = ["none logged", "minor", "moderate", "strong", "extreme"];
  const DOSE = [0, 2, 4, 6, 8]; // game units per storm level (first guess)
  const CUT = [450, 900, 1500]; // km/s cut-offs between levels
  const BANDS = [
    [0, 0.25],
    [0.1, 0.4],
    [0.25, 0.55],
    [0.4, 0.7],
    [0.55, 0.85],
    [0.7, 1],
  ]; // difficulty band per mission
  const DENSITY_DROP = 0.5; // drop the quietest half of windows (by days with something logged)
  const DENSITY_FLOOR = 0.3; // and any window with under 30% of days logged
  const MIN_POOL = 8; // if fewer windows survive, keep the busiest few instead

  const ms = (d) => Date.parse(d + "T00:00:00Z");
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const hm = (s) => +s.slice(0, 2) * HOUR + +s.slice(3, 5) * 60000;
  const two = (n) => (n < 10 ? "0" : "") + n;
  const fmtD = (d) => {
    const t = new Date(ms(d));
    return (
      t.getUTCDate() + " " + MON[t.getUTCMonth()] + " " + t.getUTCFullYear()
    );
  };
  const fmtDT = (t) => {
    const x = new Date(t);
    return (
      x.getUTCDate() +
      " " +
      MON[x.getUTCMonth()] +
      " " +
      two(x.getUTCHours()) +
      ":" +
      two(x.getUTCMinutes()) +
      " UTC"
    );
  };
  const hoursText = (h) => {
    const m = Math.round(h * 60);
    return Math.floor(m / 60) + " h " + two(m % 60) + " min";
  };

  const FIRST = ms(A.from),
    LAST = ms(A.to);
  const TOTAL = Math.round((LAST - FIRST) / DAY) + 1;
  const byDate = {};
  A.days.forEach((r) => {
    byDate[r.d] = r;
  });

  // ---- storm levels (0-4) ----
  // Mars: fastest predicted CME of the day; glancing blows count half.
  const eff = (e) => e[2] * (e[3] ? 0.5 : 1);
  const levelFromEff = (x) =>
    x < CUT[0] ? 1 : x < CUT[1] ? 2 : x < CUT[2] ? 3 : 4;
  function marsLevelOf(r) {
    if (!r || !r.m || !r.m.length) return 0;
    let best = 0;
    r.m.forEach((e) => {
      best = Math.max(best, eff(e));
    });
    return levelFromEff(best);
  }
  // Moon: particle detections. A PROXY, not a dose. (Not used by the Mars game yet.)
  function moonLevelOf(r) {
    if (!r || !r.s) return 0;
    if (r.h) return 4;
    if (r.s >= 5) return 3;
    if (r.s >= 3) return 2;
    return 1;
  }

  const lvl = { mars: [], moon: [] };
  const pre = { mars: [0], moon: [0] }; // running total of levels (how strong)
  const cnt = { mars: [0], moon: [0] }; // running count of days with something logged
  for (let i = 0; i < TOTAL; i++) {
    const r = byDate[iso(FIRST + i * DAY)];
    lvl.mars[i] = marsLevelOf(r);
    lvl.moon[i] = moonLevelOf(r);
    pre.mars[i + 1] = pre.mars[i] + lvl.mars[i];
    pre.moon[i + 1] = pre.moon[i] + lvl.moon[i];
    cnt.mars[i + 1] = cnt.mars[i] + (lvl.mars[i] ? 1 : 0);
    cnt.moon[i + 1] = cnt.moon[i] + (lvl.moon[i] ? 1 : 0);
  }

  // ---- choose which real stretch a mission replays ----
  // Rule (no hand-picked famous windows):
  //  1. list every possible start, skipping empty stretches and starts near `avoid`
  //  2. drop the quietest half by days-with-something-logged (and any under 30%)
  //  3. rank what is left by how strong it was, and draw from this mission's band
  function candidates(level, avoid, site) {
    const P = pre[site],
      C = cnt[site];
    const n = 10 * (level + 1),
      cand = [];
    for (let s = 0; s + n <= TOTAL; s++) {
      const sc = P[s + n] - P[s];
      if (sc > 0 && !(avoid != null && Math.abs(s - avoid) < n))
        cand.push({ s, sc, k: C[s + n] - C[s] });
    }
    if (!cand.length) return { n, all: cand, dense: cand, cut: 0 };
    const ks = cand.map((c) => c.k).sort((a, b) => a - b);
    const cut = Math.max(
      ks[Math.floor(ks.length * DENSITY_DROP)],
      Math.ceil(n * DENSITY_FLOOR),
    );
    let dense = cand.filter((c) => c.k >= cut);
    if (dense.length < MIN_POOL)
      dense = cand
        .slice()
        .sort((a, b) => b.k - a.k || a.s - b.s)
        .slice(0, Math.min(MIN_POOL, cand.length));
    return { n, all: cand, dense, cut };
  }

  function pickStart(level, avoid, rnd, site) {
    rnd = rnd || Math.random;
    const c = candidates(level, avoid, site || "mars");
    const dense = c.dense.slice();
    if (!dense.length) return 0;
    dense.sort((a, b) => a.sc - b.sc || a.s - b.s);
    const b = BANDS[Math.min(level, BANDS.length - 1)];
    const lo = Math.floor(dense.length * b[0]);
    const hi = Math.max(lo + 1, Math.ceil(dense.length * b[1]));
    const pool = dense.slice(lo, hi);
    return pool[Math.floor(rnd() * pool.length)].s;
  }

  // For checking in the console: how many windows were kept, and how dense are they?
  function info(level, site) {
    const c = candidates(level, null, site || "mars");
    const ks = c.dense.map((x) => x.k);
    return {
      days: c.n,
      windowsConsidered: c.all.length,
      windowsKept: c.dense.length,
      minLoggedDaysRequired: c.cut,
      keptLoggedDaysMin: ks.length ? Math.min.apply(null, ks) : 0,
      keptLoggedDaysMax: ks.length ? Math.max.apply(null, ks) : 0,
    };
  }

  // ---- one mission ----
  // level = 0..5 (10..60 days). opts: {start, avoid, rnd, site}
  function mission(level, opts) {
    opts = opts || {};
    const site0 = opts.site || "mars";
    const n = 10 * (level + 1);
    const s =
      opts.start != null
        ? opts.start
        : pickStart(level, opts.avoid, opts.rnd, site0);
    const date = (i) => iso(FIRST + (s + i) * DAY);
    const record = (i) => byDate[date(i)] || null;
    const level_ = (site, i) => lvl[site][s + i] || 0;

    function tag(site, i) {
      const r = record(i),
        L = level_(site, i);
      if (!r || !L) return null;
      if (site === "mars") {
        let top = r.m[0];
        r.m.forEach((e) => {
          if (eff(e) > eff(top)) top = e;
        });
        const arr = ms(date(i)) + hm(top[0]);
        let t =
          "A cloud of solar plasma (a CME) left the Sun on " +
          fmtD(top[4].slice(0, 10)) +
          " at " +
          top[4].slice(11) +
          " UTC. NASA's model predicted it would reach Mars on " +
          fmtDT(arr) +
          ". Predicted speed: " +
          top[2] +
          " km/s" +
          (top[3] ? " (a glancing blow, so counted as weaker)." : ".");
        if (top[1] > 0)
          t += " Different model runs disagreed by about " + top[1] + " hours.";
        if (r.m.length > 1)
          t +=
            " DONKI listed " +
            r.m.length +
            " predicted arrivals this day (some are the same CME run with different settings).";
        return {
          title: "Real event: predicted CME arrival at Mars",
          text: t,
          source: "NASA DONKI, archived copy",
          date: date(i),
          level: L,
        };
      }
      let t =
        "Space instruments logged " +
        r.s +
        " solar-particle detection" +
        (r.s > 1 ? "s" : "") +
        " on " +
        fmtD(date(i)) +
        ".";
      if (r.h)
        t += " This included protons above 100 MeV, the hardest kind to block.";
      return {
        title: "Real event: solar particles detected",
        text: t,
        source: "NASA DONKI, archived copy",
        date: date(i),
        level: L,
      };
    }

    // Mars forecast: only CMEs already launched by today can be seen.
    function forecast(site, i, o) {
      o = o || {};
      const H = o.horizon == null ? 3 : o.horizon,
        out = [];
      if (site !== "mars") return out;
      const today = date(i);
      for (let j = 0; j <= H && i + j < n; j++) {
        const r = record(i + j);
        if (!r || !r.m) continue;
        const seen = r.m.filter((e) => e[4].slice(0, 10) <= today);
        if (!seen.length) continue;
        let lo = Infinity,
          hi = -Infinity,
          top = 0,
          topE = null;
        seen.forEach((e) => {
          const a = ms(date(i + j)) + hm(e[0]);
          lo = Math.min(lo, a);
          hi = Math.max(hi, a + e[1] * HOUR);
          if (eff(e) > top) {
            top = eff(e);
            topE = e;
          }
        });
        out.push({
          offset: j,
          date: date(i + j),
          count: seen.length,
          from: lo,
          to: hi,
          windowText: fmtDT(lo) + (hi > lo ? " to " + fmtDT(hi) : ""),
          speed: topE[2],
          glancing: !!topE[3],
          level: o.precise ? levelFromEff(top) : null, // precise = the warning satellite measured the speed
        });
      }
      return out;
    }

    // Moon warning: flare time -> first particles. (Not used by the Mars game yet.)
    function warning(site, i) {
      if (site !== "moon") return null;
      const r = record(i);
      if (!r || !r.s) return null;
      if (r.f) {
        if (r.f.slice(0, 10) === date(i) && r.t) {
          const h = (ms(date(i)) + hm(r.t) - Date.parse(r.f + ":00Z")) / HOUR;
          if (h >= 0)
            return {
              kind: "new",
              flare: r.f.slice(11),
              first: r.t,
              hours: h,
              text: hoursText(h),
            };
        } else if (r.f.slice(0, 10) < date(i)) {
          return { kind: "ongoing" };
        }
      }
      return { kind: "nowarning" };
    }

    function recap(site) {
      const lines = [];
      for (let i = 0; i < n; i++) {
        const t = tag(site, i);
        if (t)
          lines.push({
            day: i + 1,
            date: date(i),
            level: t.level,
            name: NAMES[t.level],
            text: t.text,
          });
      }
      return lines;
    }

    function compare() {
      const c = { mars: { days: 0, max: 0 }, moon: { days: 0, max: 0 } };
      for (let i = 0; i < n; i++)
        ["mars", "moon"].forEach((k) => {
          const L = level_(k, i);
          if (L) {
            c[k].days++;
            c[k].max = Math.max(c[k].max, L);
          }
        });
      return c;
    }

    return {
      tier: level,
      n,
      start: s,
      startDate: date(0),
      endDate: date(n - 1),
      date,
      levelOf: level_,
      dose: (site, i) => DOSE[level_(site, i)],
      levelName: (site, i) => NAMES[level_(site, i)],
      tag,
      forecast,
      warning,
      recap,
      compare,
      record,
    };
  }

  // ---- archive-wide numbers for the "About the science" panel ----
  function stats() {
    let mars = 0,
      moon = 0,
      hard = 0,
      fastest = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (lvl.mars[i]) mars++;
      if (lvl.moon[i]) moon++;
    }
    A.days.forEach((r) => {
      if (r.h) hard++;
      (r.m || []).forEach((e) => {
        fastest = Math.max(fastest, e[2]);
      });
    });
    return {
      days: TOTAL,
      from: A.from,
      to: A.to,
      marsDays: mars,
      moonDays: moon,
      hardParticleDays: hard,
      fastestPredictedKmS: fastest,
    };
  }

  window.RealData = {
    meta: {
      source: A.source,
      fetched: A.fetched,
      from: A.from,
      to: A.to,
      note: A.note,
      label: "NASA DONKI, archived copy (fetched " + A.fetched + "), not live",
    },
    NAMES,
    DOSE,
    CUT,
    mission,
    stats,
    pickStart,
    info,
    fmtD,
    fmtDT,
  };
})();
