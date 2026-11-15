/* ============================================================
   MARS OUTPOST – game logic (less reading, more doing)
   Storm days come from NASA DONKI (archive.js + real-data.js).
   Quiet days can get GAME events, always labelled as not from NASA.
   Emergencies can ask Earth: the signal delay is computed (delay.js).
   Rules unlock one mission at a time (see the "From" settings).
   ============================================================ */

/* ---------- CONFIG: tweak the game here ---------- */
const CONFIG = {
  daysPerStep: 10, // Mission 1 = 10 days, Mission 2 = 20, Mission 3 = 30 ...
  maxLevel: 5, // last mission tier (5 = 60 days). Replay it for stars.
  normalPower: 8,
  dustPower: 4, // power on a dust day (lower on harder missions)
  startAir: 8,
  startFood: 8,
  maxStock: 12,
  crewAir: 6, // air the crew uses each day
  crewFood: 2, // food the crew eats each day
  doseLimit: 10, // reach this and the crew goes home
  emergencyTime: 12, // seconds to decide on Mission 3 (shorter later)
  starScience: 2, // research per day needed for the science star
  baseCargoSlots: 2,
  dustRate: 0.12, // dust storms are GAME events
  emergencyRate: 0.15,
  rateGrowth: 0.01,
  lookAhead: 2, // days of forecast you can see
  lookAheadSat: 4, // with the early-warning satellite

  // Which mission level each rule starts at (0 = Mission 1)
  dustFrom: 1,
  batteryFrom: 1,
  emergencyFrom: 2,
  evaFrom: 2,

  // Quiet-day GAME events (not from NASA data)
  maxQuietRun: 2, // never more than this many quiet days in a row
  fillerEvery: 5, // at most one filler event per this many days
  burstDose: 2,
  dentAir: 2,
  bloomFood: 3,
  bloomNeed: 2,

  batteryCap: 3, // most power you can store in one day

  evaBase: 2, // spacewalks per mission when they unlock
  evaScience: 4,
  evaDose: 0.5,

  discoveryEvery: 6, // research points per discovery
  maxDiscoveries: 2, // each gives +1 power for the rest of the mission
};

const RANKS = ["Rookie", "Cadet", "Pilot", "Commander", "Captain", "Legend"];

function tierInfo(lvl) {
  const t = Math.min(Math.max(0, lvl), CONFIG.maxLevel);
  const days = CONFIG.daysPerStep * (t + 1);
  const g = CONFIG.rateGrowth * t;
  return {
    level: t,
    days,
    rank: RANKS[t] || "Legend",
    dusts:
      t >= CONFIG.dustFrom
        ? Math.max(1, Math.round(days * (CONFIG.dustRate + g)))
        : 0,
    emergencies:
      t >= CONFIG.emergencyFrom
        ? Math.max(1, Math.round(days * (CONFIG.emergencyRate + g)))
        : 0,
    dust: Math.max(2, CONFIG.dustPower - Math.floor(t / 2)),
    time: Math.max(
      6,
      CONFIG.emergencyTime - Math.max(0, t - CONFIG.emergencyFrom),
    ),
  };
}
const missionDays = (lvl) => tierInfo(lvl).days;
const cargoSlots = (lvl) =>
  Math.min(
    3,
    CONFIG.baseCargoSlots + Math.floor(Math.min(lvl, CONFIG.maxLevel) / 2),
  );
const evaSlotsFor = (lvl) =>
  lvl >= CONFIG.evaFrom
    ? CONFIG.evaBase + Math.floor((lvl - CONFIG.evaFrom) / 2)
    : 0;

// The four things the player powers. "short" is the one word on the tile.
const SYSTEMS = [
  {
    key: "L",
    name: "Life support",
    short: "Air",
    hint: `Makes air. The crew breathes ${CONFIG.crewAir} a day and each unit makes 2.`,
  },
  {
    key: "G",
    name: "Greenhouse",
    short: "Food",
    hint: `Each unit grows 2 food and 1 air. The crew eats ${CONFIG.crewFood} a day.`,
  },
  {
    key: "S",
    name: "Storm shelter",
    short: "Shield",
    hint: "Each unit blocks 2 radiation in a storm. With no shelter you also take a little radiation every day.",
  },
  {
    key: "R",
    name: "Science lab",
    short: "Lab",
    hint: "Earns research points.",
  },
];

// History facts (hand-written, NOT from the DONKI archive the game replays).
const HISTORY = [
  {
    title: "Big solar flare (May 2024)",
    fact: "In May 2024 strong flares caused the biggest geomagnetic storm in about 20 years. NASA’s DONKI database logs events like this.",
  },
  {
    title: "Halloween solar storms (Oct 2003)",
    fact: "Many huge flares hit within days in 2003. Spacecraft had to protect their electronics.",
  },
  {
    title: "Giant flare (Aug 1972)",
    fact: "This storm happened between Apollo 16 and 17. Astronauts on the Moon would have needed shelter fast.",
  },
  {
    title: "Fast particle bursts",
    fact: "Charged particles from the Sun can arrive within hours, so warning time can be short.",
  },
];
const DUST_FACT =
  "In 2018 a global dust storm blocked so much sunlight that NASA’s Opportunity rover lost power.";

const GAME_TAG = "Game event, not from NASA’s log";

// Emergencies (game events). Each answer costs a DIFFERENT kind of thing.
// minutes = story time the emergency lasts (the countdown is a sped-up version).
const EMERGENCIES = [
  {
    title: "Air leak!",
    icon: "L",
    minutes: 30,
    choices: [
      {
        label: "Patch it inside",
        effect: { powerNext: -2 },
        result: "Sealed! The crew was busy all night.",
        lesson: "A repair that takes crew time is paid for in power later.",
      },
      {
        label: "Close the door",
        effect: { air: -3 },
        result: "The leak is cut off, but that room’s air is gone.",
        lesson: "Sealing a room stops the problem, but costs the air inside.",
      },
      {
        label: "Fix it outside",
        effect: { dose: 1, science: -1 },
        result: "Fixed from outside, but the crew was exposed.",
        lesson:
          "Going outside saves air and costs radiation that never goes away.",
      },
    ],
    timeout: {
      effect: { air: -5 },
      result: "Nobody acted. A lot of air escaped.",
      lesson: "In an emergency, a quick plan beats no plan.",
    },
  },
  {
    title: "Pump broke!",
    icon: "G",
    minutes: 45,
    choices: [
      {
        label: "Fit the spare part",
        effect: { powerNext: -2 },
        result: "The pump works again. Fitting it took all evening.",
        lesson: "Missions carry spare parts because help is far away.",
      },
      {
        label: "Water by hand",
        effect: { food: -3 },
        result: "Some plants made it. Others wilted.",
        lesson: "A workaround works, but some of the harvest is lost.",
      },
      {
        label: "Share crew water",
        effect: { air: -2, food: -1 },
        result: "The plants drank. The air makers had less water.",
        lesson: "On a base, water, air and food are all connected.",
      },
    ],
    timeout: {
      effect: { food: -4 },
      result: "The plants wilted badly.",
      lesson: "Waiting is also a choice, and often a costly one.",
    },
  },
  {
    title: "Dusty panels!",
    icon: "panels",
    minutes: 60,
    choices: [
      {
        label: "Robot arm cleans",
        effect: { science: -2, powerNext: -1 },
        result: "Clean panels, but the robot used power and lab time.",
        lesson:
          "Robots do dusty jobs without risking the crew, but they use power.",
      },
      {
        label: "Wipe by hand",
        effect: { dose: 1 },
        result: "Clean panels. The crew spent time in the open.",
        lesson: "Spacewalks mean more radiation and more risk.",
      },
      {
        label: "Backup generator",
        effect: { air: -3 },
        result: "Power is covered, but the generator used up air.",
        lesson: "Backups work, but they spend something else.",
      },
    ],
    timeout: {
      effect: { science: -3, powerNext: -2 },
      result: "The dust kept piling up.",
      lesson: "Small problems grow if you wait.",
    },
  },
];

// Optional quiz. Put the right answer in "right"; answers are shuffled when shown.
const QUIZ = [
  {
    q: "How long does a message take to travel one way between Earth and Mars?",
    right: "3 to 22 minutes",
    wrong: ["About 1 second", "About 2 days"],
    why: "It depends on where the planets are in their orbits.",
  },
  {
    q: "What can send dangerous radiation toward astronauts?",
    right: "Solar flares",
    wrong: ["Moon dust", "Mars wind"],
    why: "NASA’s DONKI database tracks flares and other space weather.",
  },
  {
    q: "Why do astronauts go into a shelter during a solar storm?",
    right: "It blocks radiation",
    wrong: ["It is quieter", "It is warmer"],
    why: "Thick walls and supplies stop many fast particles.",
  },
  {
    q: "What do we call one day on Mars?",
    right: "A sol",
    wrong: ["A moon", "A rover"],
    why: "A sol is about 24 hours and 39 minutes.",
  },
  {
    q: "What blocked the Sun from NASA’s Opportunity rover in 2018?",
    right: "A giant dust storm",
    wrong: ["A volcano", "A comet"],
    why: "Without sunlight its solar panels could not make power.",
  },
  {
    q: "How can a greenhouse help astronauts?",
    right: "It grows food and some air",
    wrong: ["It makes rocket fuel", "It sends radio signals"],
    why: "Plants take in carbon dioxide and make oxygen.",
  },
  {
    q: "Does Mars have a thick atmosphere that blocks radiation?",
    right: "No, it is very thin",
    wrong: ["Yes, thicker than Earth’s", "Yes, the same as Earth’s"],
    why: "That is one reason Mars crews need shielding.",
  },
  {
    q: "What does NASA’s DONKI database keep track of?",
    right: "Space weather events",
    wrong: ["Rocket prices", "Rover paint colors"],
    why: "DONKI records flares and eruptions from the Sun.",
  },
];

/* ---------- ICONS (simple line icons) ---------- */
const ICON = {
  L: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>',
  G: '<path d="M12 21v-9M12 12C12 7 8 5 4 5c0 5 3 7 8 7zM12 14c0-4 3-6 8-6 0 5-3 7-8 6z"/>',
  S: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  R: '<path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3M7.5 15h9"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  dose: '<circle cx="12" cy="12" r="1.5"/><path d="M12 10.5 8.5 4.5a9 9 0 0 1 7 0zM13.3 12.8l3.5 6a9 9 0 0 1-7 .2zM10.7 12.8l-3.5 6A9 9 0 0 1 3 12z"/>',
  food: '<path d="M12 7c-4-3-9 0-7 6 1 4 4 8 7 6 3 2 6-2 7-6 2-6-3-9-7-6zM12 7c0-2 1-4 3-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/>',
  dust: '<path d="M2 8c3-3 5 3 8 0s5 3 8 0M2 14c3-3 5 3 8 0s5 3 8 0M2 20c3-3 5 3 8 0s5 3 8 0"/>',
  walls: '<path d="M3 5h18v14H3zM3 12h18M9 5v7M15 12v7"/>',
  tanks: '<rect x="6" y="3" width="12" height="18" rx="5"/><path d="M6 9h12"/>',
  drills: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  warning:
    '<rect x="9" y="9" width="6" height="6" rx="1"/><path d="M3 11l4-4 3 3-4 4zM21 13l-4 4-3-3 4-4zM12 9V5"/>',
  battery:
    '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M7 10v4M11 10v4"/>',
  eva: '<circle cx="12" cy="10" r="6"/><path d="M8.5 10h7M5 21c1-3.5 4-5 7-5s6 1.5 7 5"/>',
  earth:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3.5 3 3.5 15 0 18M12 3c-3.5 3-3.5 15 0 18"/>',
  check: '<path d="M5 13l4 4L19 7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
  undo: '<path d="M4 8h10a6 6 0 0 1 0 12H8M4 8l4-4M4 8l4 4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
};
ICON.panels = ICON.sun;
ICON.seeds = ICON.G;
const ic = (k) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ""}</svg>`;
const AVC = ["#62c3ff", "#35d8a0", "#ffc933", "#ff8fa0"];

/* ---------- DARK / LIGHT MODE ---------- */
const THEME_KEY = "marsOutpostTheme";
let theme = "dark";
try {
  theme = localStorage.getItem(THEME_KEY) || theme;
} catch (e) {}
const themeBtn = document.createElement("button");
themeBtn.className = "theme-toggle";
function setTheme(t, store) {
  theme = t;
  document.documentElement.dataset.theme = t;
  themeBtn.innerHTML = ic(t === "dark" ? "sun" : "moon");
  themeBtn.setAttribute(
    "aria-label",
    t === "dark" ? "Switch to light mode" : "Switch to dark mode",
  );
  if (store)
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch (e) {}
}
themeBtn.onclick = () => setTheme(theme === "dark" ? "light" : "dark", true);
document.body.appendChild(themeBtn);
setTheme(theme, false);

/* ---------- STATE ---------- */
let game = null;
const app = document.getElementById("app");

const setUI = (k, v) => {
  if (game) game.ui[k] = v;
};
const more = (key, title, body) =>
  `<details class="more" ${game.ui[key] ? "open" : ""} ontoggle="setUI('${key}',this.open)"><summary>${title}</summary>${body}</details>`;
const fold = (key, title, body, badge = "") =>
  `<details class="card fold" ${game.ui[key] ? "open" : ""} ontoggle="setUI('${key}',this.open)"><summary>${title}${badge}</summary><div class="body">${body}</div></details>`;

/* ---------- SAVE DATA ---------- */
const SAVE_KEY = "marsOutpostSave";
const freshSave = () => ({
  points: 0,
  up: {},
  items: {},
  cargo: [],
  level: 0,
  stars: {},
  lastStart: {},
  tips: {}, // which one-time tips the player has already seen
});
let save = freshSave();
try {
  const t = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (t) {
    const items = Object.assign({}, t.items || {});
    let refund = 0;
    if (items.battery) {
      refund = 8;
      delete items.battery;
    }
    save = {
      points: (t.points || 0) + refund,
      up: t.up || {},
      items,
      cargo: Array.isArray(t.cargo) ? t.cargo : [],
      level: Math.min(CONFIG.maxLevel, t.level || 0),
      stars: t.stars || {},
      lastStart: t.lastStart || {},
      tips: t.tips || {},
    };
  }
} catch (e) {}
const persist = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {}
};
const owned = (k) => save.up[k] || 0;
const lv = (k) => (game && game.cargo && game.cargo.includes(k) ? owned(k) : 0);

const UPGRADES = [
  {
    key: "panels",
    name: "Better solar panels",
    desc: "+1 power every day.",
    costs: [15, 30],
  },
  {
    key: "walls",
    name: "Thicker shelter walls",
    desc: "Blocks 1 more radiation in every storm.",
    costs: [12, 25],
  },
  {
    key: "tanks",
    name: "Bigger tanks",
    desc: "Start with +2 air and +2 food, and store more.",
    costs: [10, 20],
  },
  {
    key: "seeds",
    name: "Hardy seeds",
    desc: "Each greenhouse unit grows 1 more food.",
    costs: [20],
  },
  {
    key: "drills",
    name: "Emergency drills",
    desc: "+4 seconds to decide in emergencies.",
    costs: [8, 16],
  },
];
const ITEMS = [
  {
    key: "warning",
    name: "Early-warning satellite",
    desc: "One mission only: see storm clouds 4 days ahead (not 2) and learn how strong each one is.",
    cost: 6,
  },
];

/* ---------- CARGO BAY ---------- */
const isItem = (k) => ITEMS.some((i) => i.key === k);
const nameOf = (k) =>
  (
    UPGRADES.find((u) => u.key === k) ||
    ITEMS.find((i) => i.key === k) || { name: k }
  ).name;
const isPackable = (k) =>
  isItem(k)
    ? !!save.items[k]
    : UPGRADES.some((u) => u.key === k) && owned(k) > 0;
function cleanCargo() {
  const n = cargoSlots(save.level);
  save.cargo = [...new Set(save.cargo)].filter(isPackable).slice(0, n);
  return n;
}
function autoPack(k) {
  const n = cleanCargo();
  if (!save.cargo.includes(k) && save.cargo.length < n) save.cargo.push(k);
}
function togglePack(k) {
  const n = cleanCargo();
  const i = save.cargo.indexOf(k);
  if (i >= 0) save.cargo.splice(i, 1);
  else if (save.cargo.length < n) save.cargo.push(k);
  persist();
  showMenu(true);
}

const emptyPlan = () => ({ L: 0, G: 0, S: 0, R: 0, B: 0 }); // B = battery

function dataMissing() {
  game = null;
  app.className = "";
  app.innerHTML = `<h1>Mars Outpost</h1><div class="card warn"><h2>NASA data file missing</h2>
    <p>archive.js or real-data.js did not load. Put both next to index.html and load them before game.js.</p></div>`;
}

function newGame() {
  if (!window.RealData) return dataMissing();
  const tier = tierInfo(save.level);
  const days = tier.days;
  cleanCargo();
  const cargo = [...save.cargo];
  const L = (k) => (cargo.includes(k) ? owned(k) : 0);

  ITEMS.forEach((it) => {
    if (cargo.includes(it.key)) save.items[it.key] = 0;
  });
  save.cargo = cargo.filter((k) => !isItem(k));

  // Consecutive REAL days from the archive. A retry draws a different stretch.
  const M = RealData.mission(tier.level, { avoid: save.lastStart[tier.level] });
  save.lastStart[tier.level] = M.start;
  persist();

  // Dust storms (GAME events). Never day 1, never back to back. None before CONFIG.dustFrom.
  const dust = {};
  let placed = 0,
    tries = 0;
  while (placed < tier.dusts && tries++ < 300) {
    const d = 2 + Math.floor(Math.random() * Math.max(1, days - 2));
    if (!dust[d] && !dust[d - 1] && !dust[d + 1]) {
      dust[d] = true;
      placed++;
    }
  }

  // Emergencies (GAME events). None before CONFIG.emergencyFrom.
  const emergencies = {};
  const order = EMERGENCIES.map((_, i) => i).sort(() => Math.random() - 0.5);
  let n = 0,
    guard = 0;
  while (Object.keys(emergencies).length < tier.emergencies && guard++ < 500) {
    const d = 2 + Math.floor(Math.random() * (days - 1));
    if (!emergencies[d])
      emergencies[d] = EMERGENCIES[order[n++ % EMERGENCIES.length]];
  }

  // Quiet-day GAME events. Early missions only use the two that need no new button.
  const kindsAll =
    tier.level >= CONFIG.dustFrom
      ? ["burst", "dent", "bloom"]
      : ["burst", "bloom"];
  const extra = {};
  const kinds = [...kindsAll].sort(() => Math.random() - 0.5);
  const cap = Math.ceil(days / CONFIG.fillerEvery);
  let quietRun = 0,
    ki = 0;
  for (let d = 1; d <= days; d++) {
    const busy = M.levelOf("mars", d - 1) > 0 || dust[d] || emergencies[d];
    if (busy) {
      quietRun = 0;
      continue;
    }
    quietRun++;
    if (
      quietRun > CONFIG.maxQuietRun &&
      d > 1 &&
      Object.keys(extra).length < cap
    ) {
      extra[d] = kinds[ki++ % kinds.length];
      quietRun = 0;
    }
  }

  game = {
    level: tier.level,
    tier,
    M,
    total: days,
    cargo,
    sol: 1,
    air: CONFIG.startAir + 2 * L("tanks"),
    food: CONFIG.startFood + 2 * L("tanks"),
    maxStock: CONFIG.maxStock + 2 * L("tanks"),
    bonus: {}, // power added or removed on a given day (battery, bot, spacewalk)
    carry: {},
    quizOrder: QUIZ.map((_, i) => i).sort(() => Math.random() - 0.5),
    quizOpts: {},
    quizRes: {},
    warning: cargo.includes("warning"),
    dose: 0,
    science: 0,
    alloc: emptyPlan(),
    lastPlan: null, // yesterday's plan, for "Same as yesterday"
    pick: null, // day tapped in the sky strip
    dust,
    emergencies,
    extra,
    repair: {},
    eva: {},
    evaUsed: 0,
    evaSlots: evaSlotsFor(tier.level),
    penalty: {},
    penaltyWhy: {},
    discoveries: 0,
    log: [],
    ui: {},
    result: null,
  };
  render();
}

/* ---------- RULES ---------- */
const dateOf = (d) => RealData.fmtD(game.M.date(d - 1));
const shortDate = (d) => dateOf(d).split(" ").slice(0, 2).join(" ");
function isoOf(d) {
  const v = game.M.date(d - 1);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
const fmtMin = (m) => (m >= 10 ? String(Math.round(m)) : m.toFixed(1));
const oneWayMin = (d = game.sol) =>
  window.Delay ? Delay.oneWayMin(isoOf(d)) : null;
const stormLevel = (d = game.sol) => game.M.levelOf("mars", d - 1);
const stormDose = (d = game.sol) => game.M.dose("mars", d - 1);
const dustToday = () => !!game.dust[game.sol];
const gameEventToday = () => game.extra[game.sol] || null;
const lookAhead = () => (game.warning ? CONFIG.lookAheadSat : CONFIG.lookAhead);
const forecast = () =>
  game.M.forecast("mars", game.sol - 1, { horizon: 3, precise: game.warning });
const batteryOn = () => game.level >= CONFIG.batteryFrom;
const isOut = () => !!game.eva[game.sol];
const tmrStorm = () =>
  game.sol < game.total && forecast().some((x) => x.offset === 1);

const power = () =>
  Math.max(
    2,
    (dustToday() ? game.tier.dust : CONFIG.normalPower) +
      lv("panels") +
      game.discoveries +
      (game.bonus[game.sol] || 0) -
      (game.penalty[game.sol] || 0),
  );
const used = () => Object.values(game.alloc).reduce((a, b) => a + b, 0);

function addPenalty(day, n, why) {
  game.penalty[day] = (game.penalty[day] || 0) + n;
  (game.penaltyWhy[day] = game.penaltyWhy[day] || []).push(why);
}

const needFor = (dose) =>
  Math.min(4, Math.ceil(Math.max(0, dose - lv("walls")) / 2));
const shelterNeed = () => needFor(stormDose());
const stormHit = (shelter) =>
  Math.max(0, stormDose() - lv("walls") - 2 * shelter);
const needLo = () => needFor(RealData.DOSE[1]);
const needHi = () => needFor(RealData.DOSE[4]);
const needRange = () => `${needLo()} to ${needHi()}`;

function change(key, delta) {
  const next = game.alloc[key] + delta;
  const cap = key === "B" ? (game.sol < game.total ? CONFIG.batteryCap : 0) : 4;
  if (next < 0 || next > cap) return;
  if (delta > 0 && used() >= power()) return;
  game.alloc[key] = next;
  render();
}

// One tap: copy yesterday's plan, trimmed to today's power
function sameAsYesterday() {
  if (!game.lastPlan || used() > 0) return;
  let free = power();
  const lastDay = game.sol >= game.total;
  for (const k of ["L", "G", "S", "R", "B"]) {
    if (k === "B" && (!batteryOn() || lastDay)) continue;
    const v = Math.min(
      game.lastPlan[k] || 0,
      free,
      k === "B" ? CONFIG.batteryCap : 4,
    );
    game.alloc[k] = v;
    free -= v;
  }
  render();
}

function sendBot() {
  if (used() >= power() || game.repair[game.sol]) return;
  game.repair[game.sol] = true;
  game.bonus[game.sol] = (game.bonus[game.sol] || 0) - 1;
  render();
}

function toggleEva() {
  const d = game.sol;
  if (game.eva[d]) {
    game.eva[d] = false;
    game.bonus[d] = (game.bonus[d] || 0) + 1;
  } else {
    if (game.evaSlots - game.evaUsed <= 0 || used() >= power()) return;
    game.eva[d] = true;
    game.bonus[d] = (game.bonus[d] || 0) - 1;
  }
  render();
}

function pickDay(d) {
  game.pick = d;
  render();
}

// ----- Emergencies: what each answer costs, and which is cheapest right now -----
const COSTICON = {
  air: "L",
  food: "food",
  dose: "dose",
  science: "R",
  powerNext: "bolt",
};
const costChips = (e) =>
  Object.keys(e)
    .map((k) => {
      const v = e[k],
        bad = k === "dose" ? v > 0 : v < 0;
      return `<span class="cc ${bad ? "minus" : "plus"}">${ic(COSTICON[k])}<b>${v > 0 ? "+" : "−"}${Math.abs(v)}</b>${k === "powerNext" ? "<small>next day</small>" : ""}</span>`;
    })
    .join("");
const tomorrowTight = () =>
  game.sol < game.total &&
  (stormLevel(game.sol + 1) > 0 || !!game.dust[game.sol + 1]);
function harmOf(e) {
  const stock = (v) => (v >= 9 ? 0.5 : v >= 5 ? 1 : 2);
  const pw = tomorrowTight() ? 2 : 1;
  let h = 0;
  if (e.air) h += -e.air * stock(game.air);
  if (e.food) h += -e.food * stock(game.food);
  if (e.dose) h += e.dose * (2 + game.dose / 2);
  if (e.science) h += Math.min(game.science, -e.science) * 0.5;
  if (e.powerNext) h += -e.powerNext * pw;
  return h;
}
const recommend = (em) =>
  em.choices.reduce((b, c) => (harmOf(c.effect) < harmOf(b.effect) ? c : b));

function runSol() {
  if (used() < power()) return;
  const lvl = stormLevel(),
    need = shelterNeed(),
    S = game.alloc.S,
    out = isOut();
  const risky = lvl > 0 && (out || (game.warning ? S < need : S === 0));
  if (risky) {
    const msg = out
      ? "Storm today, and the crew is outside!"
      : game.warning
        ? `Storm today. The shield has ${S} of ${need}.`
        : "Storm today, and the shield is empty!";
    const box =
      popup(`<div class="bigic g-bad">${ic("dose")}</div><h2>Risky plan</h2><p>${msg}</p>
      <button class="go" id="back">Change my plan</button>
      <button class="go alt" id="yes">Run anyway</button>`);
    box.querySelector("#back").onclick = () => box.remove();
    box.querySelector("#yes").onclick = () => {
      box.remove();
      startDay();
    };
    return;
  }
  startDay();
}
function startDay() {
  const em = game.emergencies[game.sol];
  if (em) showEmergency(em);
  else finishDay();
}

function finishDay(prenotes = []) {
  const a = game.alloc,
    today = game.sol,
    lvl = stormLevel(today),
    out = !!game.eva[today];
  const notes = [...prenotes];
  const before = {
    air: game.air,
    food: game.food,
    dose: game.dose,
    science: game.science,
  };
  // "warn" and "game" notes are shown but not saved for the debrief
  const note = (tone, text) => {
    notes.push({ tone, text });
    if (tone !== "warn" && tone !== "game")
      game.log.push({ day: today, tone, text });
  };

  game.air = Math.min(game.maxStock, game.air - CONFIG.crewAir + 2 * a.L + a.G);
  game.food = Math.min(
    game.maxStock,
    game.food - CONFIG.crewFood + (2 + lv("seeds")) * a.G,
  );

  // Radiation: a little each day with no shelter. A storm adds more unless the shelter is powered.
  let dose = a.S === 0 ? 0.25 : 0;
  if (lvl > 0) {
    const nm = RealData.NAMES[lvl],
      need = shelterNeed(),
      hit = out ? stormDose(today) : stormHit(a.S);
    const t = game.M.tag("mars", today - 1);
    if (t) notes.push({ tone: "info", text: `<b>${t.title}.</b> ${t.text}` });
    dose += hit;
    if (out) note("bad", `Outside in a ${nm} storm! Radiation +${hit}.`);
    else if (hit === 0) {
      note("good", `A ${nm} storm hit and the shield blocked all of it!`);
      if (a.S > need)
        notes.push({
          tone: "warn",
          text: `${need} shield power was enough. The other ${a.S - need} could have gone to science.`,
        });
    } else if (a.S === 0)
      note("bad", `No shield! A ${nm} storm hit. Radiation +${hit}.`);
    else
      note(
        "bad",
        `The shield was too weak for the ${nm} storm. Radiation +${hit}. It needed ${need}.`,
      );
    if (today > 1) {
      const yest = game.M.forecast("mars", today - 2, { horizon: 1 });
      if (!yest.some((x) => x.offset === 1))
        notes.push({
          tone: "warn",
          text: "This storm was not in yesterday's forecast. It left the Sun too recently to be predicted.",
        });
    }
  } else if (a.S >= 2 && !out && game.extra[today] !== "burst") {
    notes.push({
      tone: "warn",
      text: "No storm was predicted today, so the shield power blocked nothing.",
    });
  }

  // Quiet-day GAME events
  const ev = game.extra[today];
  if (ev === "burst") {
    const hit = out
      ? CONFIG.burstDose
      : Math.max(0, CONFIG.burstDose - lv("walls") - 2 * a.S);
    dose += hit;
    notes.push({
      tone: "game",
      text: "NASA’s log was quiet, but a small burst of particles hit anyway. “None logged” never means safe.",
    });
    if (hit === 0)
      note(
        "good",
        a.S > 0
          ? "The shield blocked the burst."
          : "Thick walls blocked the burst.",
      );
    else if (out) note("bad", `Outside when the burst hit! Radiation +${hit}.`);
    else note("bad", `No shield on. The burst added radiation +${hit}.`);
  } else if (ev === "dent") {
    notes.push({ tone: "game", text: "A tiny space rock dented the wall." });
    if (game.repair[today])
      note("good", "The repair bot sealed the dent. No air lost.");
    else {
      game.air = Math.max(0, game.air - CONFIG.dentAir);
      note("bad", `Nobody fixed the dent. ${CONFIG.dentAir} air leaked out.`);
    }
  } else if (ev === "bloom") {
    notes.push({ tone: "game", text: "The plants were blooming." });
    if (a.G >= CONFIG.bloomNeed) {
      const was = game.food;
      game.food = Math.min(game.maxStock, game.food + CONFIG.bloomFood);
      const got = game.food - was;
      if (got >= CONFIG.bloomFood)
        note("good", `Harvested the blooms: +${got} food.`);
      else if (got > 0)
        note(
          "warn",
          `Harvested the blooms, but the tank was nearly full. Only +${got} fit.`,
        );
      else
        note(
          "warn",
          "Harvested the blooms, but the tank was full. The food was wasted.",
        );
    } else
      notes.push({
        tone: "warn",
        text: `The blooms needed ${CONFIG.bloomNeed} greenhouse power. They got ${a.G}, so they were wasted.`,
      });
  }

  if (out) {
    dose += CONFIG.evaDose;
    game.evaUsed++;
    game.science += CONFIG.evaScience;
    note(
      "good",
      `Spacewalk! Samples brought back: +${CONFIG.evaScience} research.`,
    );
  }

  game.dose += dose;
  game.science += a.R;

  const dNow = Math.min(
    CONFIG.maxDiscoveries,
    Math.floor(game.science / CONFIG.discoveryEvery),
  );
  if (dNow > game.discoveries) {
    game.discoveries = dNow;
    note("good", "Discovery! +1 power for the rest of the mission.");
  }

  if (a.B > 0 && today < game.total) {
    game.bonus[today + 1] = (game.bonus[today + 1] || 0) + a.B;
    game.carry[today + 1] = a.B;
    notes.push({
      tone: "info",
      text: `${a.B} power saved. It arrives tomorrow.`,
    });
  }

  game.lastPlan = { ...a };
  game.pick = null;

  if (game.air <= 0) game.result = "air";
  else if (game.food <= 0) game.result = "food";
  else if (game.dose >= CONFIG.doseLimit) game.result = "dose";
  else if (game.sol >= game.total) game.result = "win";
  else {
    game.sol++;
    game.alloc = emptyPlan();
  }
  if (game.result) award();
  render();
  showReport(today, notes, before);
  window.scrollTo(0, 0);
}

/* ---------- DAY REPORT: big pictures first, one short line, details on request ---------- */
function showReport(day, notes, before) {
  const big = (icon, name, v, badUp) => {
    const bad = badUp ? v > 0 : v < 0;
    return `<div class="bigchip ${v === 0 ? "zero" : bad ? "minus" : "plus"}">${ic(icon)}<b>${v > 0 ? "+" : v < 0 ? "−" : ""}${fmt(Math.abs(v))}</b><small>${name}</small></div>`;
  };
  const sci = game.science - before.science;
  const chips =
    big("L", "Air", game.air - before.air, false) +
    big("food", "Food", game.food - before.food, false) +
    big("dose", "Radiation", game.dose - before.dose, true) +
    (sci ? big("R", "Research", sci, false) : "");
  const li = (n) =>
    `<li class="${n.tone}">${n.text}${n.tone === "game" ? `<small class="gtag">${GAME_TAG}</small>` : ""}</li>`;
  const list = notes.length ? notes : [{ tone: "good", text: "A calm day." }];
  const main = list
    .filter((n) => ["good", "bad", "game"].includes(n.tone))
    .slice(0, 3);
  const rest = list.filter((n) => !main.includes(n));
  const box = popup(`<h2>Day ${day}</h2>
    <div class="bigchips">${chips}</div>
    ${main.length ? `<ul class="rep">${main.map(li).join("")}</ul>` : ""}
    ${rest.length ? `<details class="more"><summary>More</summary><ul class="rep">${rest.map(li).join("")}</ul></details>` : ""}
    <button class="go" id="cont">${game.result ? "See results ▶" : "Start Day " + game.sol + " ▶"}</button>`);
  box.querySelector("#cont").onclick = () => {
    box.remove();
    window.scrollTo(0, 0);
    tipSoon();
  };
}

/* ---------- POP-UPS ---------- */
function popup(html) {
  const box = document.createElement("div");
  box.className = "overlay";
  box.setAttribute("role", "alertdialog");
  box.innerHTML = `<div class="alert">${html}</div>`;
  document.body.appendChild(box);
  return box;
}

/* ---------- EMERGENCY: countdown ring, three icon buttons, Ask Earth ---------- */
function showEmergency(em) {
  const total = game.tier.time + 4 * lv("drills");
  const k = em.minutes / game.tier.time;
  const D = window.Delay;
  const iso = isoOf(game.sol);
  const one = D ? D.oneWayMin(iso) : 0;
  const rt = 2 * one;
  const need = D ? rt / k : 0;
  const best = recommend(em);
  let left = total,
    asked = false;
  const opts = [...em.choices].sort(() => Math.random() - 0.5);
  const R = 34,
    C = 2 * Math.PI * R;

  const earth = D
    ? `<button class="ask" id="ask">${ic("earth")}<span><b>Ask Earth</b><small id="asksub"></small></span><i class="sig"></i></button>
       <p class="fact" id="advice"></p>
       <details class="more"><summary>Why does asking take time?</summary>
         <p class="fact">On ${dateOf(game.sol)} Mars is about <b>${D.auAt(iso).toFixed(1)} AU</b> from Earth (1 AU = the Sun–Earth distance). A radio message takes <b>${fmtMin(one)} min</b> each way, so an answer takes <b>${fmtMin(rt)} min</b>. The ring is sped up: it shows about <span id="story"></span> min of the emergency left. ${D.label}.</p>
       </details>`
    : "";

  const box = popup(`
    <div class="bigic">${ic(em.icon)}</div>
    <h2>${em.title}</h2>
    <div class="ring"><svg viewBox="0 0 80 80"><circle class="bg" cx="40" cy="40" r="${R}"/><circle class="fg" cx="40" cy="40" r="${R}" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><b>${left}</b></div>
    ${earth}
    ${opts.map((c, i) => `<button class="choice" data-i="${i}"><b>${c.label}</b><span class="cost">${costChips(c.effect)}</span></button>`).join("")}`);

  const al = box.querySelector(".alert"),
    num = box.querySelector(".ring b"),
    fg = box.querySelector(".ring .fg"),
    ask = box.querySelector("#ask"),
    asksub = box.querySelector("#asksub"),
    advice = box.querySelector("#advice"),
    story = box.querySelector("#story");

  const refresh = () => {
    const sec = Math.max(0, Math.ceil(left));
    num.textContent = sec;
    fg.style.strokeDashoffset = C * (1 - Math.max(0, left) / total);
    if (sec <= 3) al.classList.add("urgent");
    if (!D) return;
    story.textContent = Math.max(0, Math.ceil(left * k));
    if (asked) return;
    const can = left - need >= 1.5;
    ask.disabled = !can;
    ask.classList.toggle("late", !can);
    asksub.textContent = can
      ? `reply in ${fmtMin(rt)} min`
      : `too late: reply takes ${fmtMin(rt)} min`;
  };

  const done = (choice, timedOut) => {
    clearInterval(timer);
    box.remove();
    applyEmergency(em, choice, timedOut);
  };
  const timer = setInterval(() => {
    left--;
    refresh();
    if (left <= 0) done(em.timeout, true);
  }, 1000);

  if (ask)
    ask.onclick = () => {
      if (asked || left - need < 1.5) return;
      asked = true;
      left -= need; // the round trip uses up part of the clock
      ask.classList.add("sent");
      ask.disabled = true;
      asksub.textContent = "Earth replied!";
      advice.innerHTML = `${ic("check")} <b>Earth says:</b> ${best.label}. (The wait used ${fmtMin(rt)} min.)`;
      box.querySelectorAll(".choice").forEach((b) => {
        if (opts[b.dataset.i] === best) b.classList.add("best");
      });
      refresh();
    };
  box
    .querySelectorAll(".choice")
    .forEach((b) => (b.onclick = () => done(opts[b.dataset.i], false)));
  refresh();
}

const GRADES = { good: "Great choice!", ok: "Not bad", bad: "Risky choice" };

function applyEmergency(em, choice, timedOut) {
  const best = recommend(em);
  const gap = timedOut ? 99 : harmOf(choice.effect) - harmOf(best.effect);
  const grade = timedOut
    ? "bad"
    : gap <= 0.5
      ? "good"
      : gap <= 1.5
        ? "ok"
        : "bad";

  const e = choice.effect;
  game.air = Math.max(0, Math.min(game.maxStock, game.air + (e.air || 0)));
  game.food = Math.max(0, Math.min(game.maxStock, game.food + (e.food || 0)));
  game.dose = Math.max(0, game.dose + (e.dose || 0));
  game.science = Math.max(0, game.science + (e.science || 0));
  if (e.powerNext)
    addPenalty(
      game.sol + 1,
      -e.powerNext,
      timedOut
        ? "an emergency was not handled in time"
        : "an emergency was handled badly",
    );

  const tone = grade === "good" ? "good" : grade === "ok" ? "warn" : "bad";
  const text = timedOut
    ? `${em.title} Time ran out. ${choice.result}`
    : `${em.title} You chose “${choice.label}”. ${choice.result}`;
  if (tone !== "warn") game.log.push({ day: game.sol, tone, text });

  const hint =
    grade !== "good"
      ? `<p class="fact">With your supplies that day, the cheapest answer was “${best.label}”.</p>`
      : "";
  const box = popup(`
    <div class="bigic g-${grade}">${ic(em.icon)}</div>
    <h2 class="g-${grade}">${timedOut ? "Time ran out!" : GRADES[grade]}</h2>
    <p>${choice.result}</p>
    <div class="cost big">${costChips(e)}</div>
    <details class="more"><summary>Why?</summary><p class="fact">${choice.lesson}</p>${hint}</details>
    <button class="go" id="cont">Continue ▶</button>`);
  box.querySelector("#cont").onclick = () => {
    box.remove();
    finishDay([
      {
        tone,
        text: `${em.title} ${timedOut ? "Time ran out." : choice.label + "."}`,
      },
    ]);
  };
}

/* ---------- MAIN MENU + HOW TO PLAY + ABOUT ---------- */
const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
const starsStr = (n) => "★".repeat(n) + "☆".repeat(3 - n);

function showMain() {
  game = null;
  app.className = "";
  if (!window.RealData) return dataMissing();
  const tr = tierInfo(save.level);
  app.innerHTML = `
    <div class="hero">
      <svg class="logo" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#c4553b" stroke="#1e1a3c" stroke-width="4"/><ellipse cx="32" cy="34" rx="30" ry="9" fill="none" stroke="#ffc933" stroke-width="4" transform="rotate(-20 32 34)"/><circle cx="24" cy="26" r="4" fill="#8e3a3a"/><circle cx="38" cy="40" r="3" fill="#8e3a3a"/></svg>
      <h1>Mars Outpost</h1>
      <p class="sub">Mission ${tr.level + 1}: ${tr.days} days of real space weather.</p>
    </div>
    <button class="go" onclick="startMission()">▶ Play Mission ${tr.level + 1}</button>
    <button class="go alt" onclick="showMenu()">Cargo &amp; upgrades <span class="pill">${save.points}</span></button>
    <button class="go alt" onclick="showHow()">How to play</button>
    <button class="go alt" onclick="showAbout()">About the science</button>`;
  window.scrollTo(0, 0);
}

function showHow() {
  app.innerHTML = `
    <h1>How to play</h1>
    <div class="card howlist">
      <p>${ic("bolt")}<span>Tap a tile to send it a power cell. Use all cells, then run the day.</span></p>
      <p>${ic("S")}<span>Storm coming? Fill the shield. The storms are from real NASA records.</span></p>
      <p>${ic("L")}<span>Keep air and food up. Radiation never goes down.</span></p>
      <p>${ic("info")}<span>New tools unlock in later missions. A tip pops up when they do.</span></p>
    </div>
    <button class="go" onclick="showMain()">◀ Back</button>`;
  window.scrollTo(0, 0);
}

// Short write-up of what NASA data is used and how (also meant for judges)
function showAbout() {
  game = null;
  app.className = "";
  const S = window.RealData ? RealData.stats() : null;
  const R = window.RealData;
  const cut = R ? R.CUT : [450, 900, 1500];
  const dose = R ? R.DOSE : [0, 2, 4, 6, 8];
  const delayLabel = window.Delay
    ? Delay.label
    : "Computed from approximate orbit tables";
  app.innerHTML = `
    <h1>About the science</h1>
    <div class="card sci"><h2>What NASA data does the game use?</h2>
      <p><b>NASA DONKI</b> (Space Weather Database Of Notifications, Knowledge, Information), read through <b>api.nasa.gov</b>. The game uses the <b>CME analysis</b> records, which include NASA’s model predictions of when each solar storm cloud reaches Mars.</p>
      <p><b>It is an archived copy, not live data.</b>${S ? ` The copy covers ${S.days} days (${R.fmtD(S.from)} to ${R.fmtD(S.to)}), fetched ${R.meta.fetched}. In that time the model listed a predicted Mars arrival on ${S.marsDays} days. The fastest predicted speed was ${S.fastestPredictedKmS} km/s.` : ""}</p>
      <p>The archive also holds DONKI solar-particle (SEP) detections. This version of the game does not use them.</p>

      <h2>How the data drives the game</h2>
      <table>
        <tr><th>In the game</th><th>From the data</th></tr>
        <tr><td>Which days are real</td><td>Each mission replays consecutive real days. Stretches where most days had nothing logged are skipped. Mission 1 draws from the milder of the busy stretches, later missions from stronger ones. A retry picks a different stretch.</td></tr>
        <tr><td>A storm day</td><td>A day with a predicted CME arrival at Mars.</td></tr>
        <tr><td>Storm strength</td><td>The predicted speed: under ${cut[0]} km/s is minor, under ${cut[1]} moderate, under ${cut[2]} strong, and above that extreme. A glancing blow counts as half its speed.</td></tr>
        <tr><td>Radiation in the game</td><td>${dose.slice(1).join(", ")} game units for minor to extreme storms. These are game units, not real doses.</td></tr>
        <tr><td>The forecast</td><td>You can only see clouds that have already left the Sun, with the predicted arrival window. The window comes from the different model runs, which disagree by hours.</td></tr>
        <tr><td>Early-warning satellite</td><td>A game item. It shows 4 days ahead and reveals the predicted speed. DONKI publishes speeds for everyone. The game hides it so that cargo choices matter.</td></tr>
        <tr><td>How long Earth takes to answer</td><td>Worked out for each replayed date from where Earth and Mars were, using approximate planet orbit tables (JPL, E. M. Standish), then distance divided by the speed of light. <b>It is a calculation, not live NASA data, and it is not from DONKI.</b></td></tr>
      </table>

      <h2>What is simplified</h2>
      <p>A CME arriving is not the same as a radiation dose. Real doses depend on particles, shielding and where you are. The game uses the predicted speed as a stand-in for storm strength.</p>
      <p>The data are <b>model predictions, not measurements</b>. Real clouds can miss or arrive at other times. The game treats a prediction as an arrival on its first predicted day.</p>
      <p>“None logged” does not mean safe. It can mean the model never ran.</p>
      <p>Even the busiest stretches have quiet days, because the Sun does not send a cloud toward Mars every day. That is why the game adds its own small events (below).</p>
      <p>The signal time uses the Earth–Mars distance on each date, and ignores the time the Sun can block the signal. The emergency clock is sped up: a few seconds in the game stand for a few dozen minutes.</p>
      <p>Earth’s Kp storm index is not used, because it measures Earth, not Mars.</p>

      <h2>What is NOT from NASA data</h2>
      <p><b>Game events</b> are marked “${GAME_TAG}”. They are dust storms, emergencies, and quiet-day surprises (a particle burst, a dented wall, blooming plants). The game never lets more than ${CONFIG.maxQuietRun} days in a row pass with nothing happening, and adds at most one quiet-day surprise per ${CONFIG.fillerEvery} days. The surprise particle burst is made up. It exists to show that a quiet log is not a promise of safety.</p>
      <p>Mission Control’s advice in an emergency comes from the game’s own cost scale, not from NASA. The upgrades, the battery, the spacewalk rewards and all game numbers are made up for play. The 2018 dust storm that stopped the Opportunity rover, the 2003 and 1972 storms and the length of a sol (about 24 h 39 min) are facts written by hand. They are not DONKI data.</p>
      <p>New rules unlock one mission at a time: dust and the battery in Mission 2, emergencies, Ask Earth and spacewalks in Mission 3.</p>

      <h2>Credits</h2>
      <p>Data: NASA DONKI via api.nasa.gov. Signal time: ${delayLabel}. This game is not made or endorsed by NASA.</p>
    </div>
    <button class="go" onclick="showMain()">◀ Back</button>`;
  window.scrollTo(0, 0);
}

/* ---------- RESEARCH POINTS + UPGRADE MENU ---------- */
function award() {
  const win = game.result === "win";
  game.goal = CONFIG.starScience * game.total;
  game.okDose = game.dose <= CONFIG.doseLimit * 0.3;
  game.okSci = game.science >= game.goal;
  game.stars = win ? 1 + (game.okDose ? 1 : 0) + (game.okSci ? 1 : 0) : 0;
  game.earned = game.science + (win ? 10 + 3 * (game.stars - 1) : 0);
  save.points += game.earned;

  game.unlocked = false;
  if (win) {
    save.stars[game.level] = Math.max(save.stars[game.level] || 0, game.stars);
    if (game.level === save.level && save.level < CONFIG.maxLevel) {
      save.level++;
      game.unlocked = true;
    }
  }
  persist();
}
function quitMission() {
  if (
    confirm("Leave this mission? Your progress in this mission will be lost.")
  )
    showMain();
}
function startMission() {
  newGame();
}
function buyUpgrade(k) {
  const u = UPGRADES.find((x) => x.key === k),
    cost = u.costs[owned(k)];
  if (cost === undefined || save.points < cost) return;
  save.points -= cost;
  save.up[k] = owned(k) + 1;
  autoPack(k);
  persist();
  showMenu(true);
}
function buyItem(k) {
  const it = ITEMS.find((x) => x.key === k);
  if (save.items[k] || save.points < it.cost) return;
  save.points -= it.cost;
  save.items[k] = 1;
  autoPack(k);
  persist();
  showMenu(true);
}
function resetSave() {
  if (confirm("Erase all points, upgrades, tips and mission progress?")) {
    save = freshSave();
    persist();
    showMenu();
  }
}

function showMenu(keepScroll) {
  game = null;
  app.className = "";
  const slots = cleanCargo();
  const tr = tierInfo(save.level);
  const best = save.stars[save.level] || 0;
  const full = save.cargo.length >= slots;

  const packBtn = (k) => {
    const on = save.cargo.includes(k);
    return `<button class="pack ${on ? "on" : ""}" onclick="togglePack('${k}')" ${!on && full ? "disabled" : ""}>${on ? "Packed ✓" : "Pack"}</button>`;
  };

  const bay = Array.from({ length: slots }, (_, i) => {
    const k = save.cargo[i];
    return k
      ? `<span class="full">${ic(k)}<small>${nameOf(k)}</small></span>`
      : `<span><small>Empty slot</small></span>`;
  }).join("");

  const ups = UPGRADES.map((u) => {
    const L = owned(u.key),
      cost = u.costs[L],
      maxed = cost === undefined;
    return `<div class="system"><div class="icon">${ic(u.key)}</div>
      <div class="info"><b>${u.name}</b><small>${u.desc}</small><span class="pips">${"●".repeat(L)}${"○".repeat(u.costs.length - L)}</span></div>
      <div class="btns">
        <button class="buy" onclick="buyUpgrade('${u.key}')" ${maxed || save.points < cost ? "disabled" : ""}>${maxed ? "Maxed" : (L ? "Level up · " : "Buy · ") + cost}</button>
        ${L ? packBtn(u.key) : ""}
      </div></div>`;
  }).join("");

  const items = ITEMS.map((it) => {
    const have = !!save.items[it.key];
    return `<div class="system"><div class="icon">${ic(it.key)}</div>
      <div class="info"><b>${it.name}</b><small>${it.desc}</small></div>
      <div class="btns">
        <button class="buy" onclick="buyItem('${it.key}')" ${have || save.points < it.cost ? "disabled" : ""}>${have ? "Bought" : "Buy · " + it.cost}</button>
        ${have ? packBtn(it.key) : ""}
      </div></div>`;
  }).join("");

  const lastTier = save.level >= CONFIG.maxLevel;
  app.innerHTML = `
    <h1>Mars Outpost</h1>
    <div class="card"><h2>Mission ${tr.level + 1}: ${tr.days} days</h2>
      <p class="fact">Rank: ${tr.rank}. ${best ? `Best so far: <span class="stars">${starsStr(best)}</span>. ` : ""}${lastTier ? "Final mission. Replay it for more stars." : `Clear it to unlock Mission ${tr.level + 2} (${missionDays(save.level + 1)} days).`}</p></div>
    <div class="card"><h2>Cargo bay: ${save.cargo.length} of ${slots} packed</h2>
      <div class="bay">${bay}</div>
      <p class="fact">The rocket can only carry ${slots} things, like a real one.</p></div>
    <div class="card"><h2>${save.points} research points</h2></div>
    <div class="card"><h2>Upgrades</h2><p class="fact">You keep these forever, but you must pack them to use them.</p>${ups}</div>
    <div class="card"><h2>One-mission items</h2><p class="fact">Used up when the mission starts.</p>${items}</div>
    <button class="go" onclick="startMission()">Start Mission ${tr.level + 1} ▶</button>
    <button class="go alt" onclick="showMain()">◀ Main menu</button>
    <p class="fact" style="text-align:center"><a href="#" onclick="resetSave();return false" style="color:inherit">Reset progress</a></p>`;
  if (!keepScroll) window.scrollTo(0, 0);
}

/* ---------- SKY STRIP: one picture per day, tap a day for one line ---------- */
function skyStrip() {
  const look = lookAhead(),
    fc = forecast(),
    N = RealData.NAMES;
  const page = Math.floor((game.sol - 1) / 10) * 10 + 1; // 10 days at a time
  const sel = game.pick || (tmrStorm() ? game.sol + 1 : game.sol);

  const kindOf = (d) => {
    const off = d - game.sol;
    if (off <= 0)
      return stormLevel(d) > 0 ? "storm" : game.dust[d] ? "dust" : "calm";
    if (off < look) return fc.find((x) => x.offset === off) ? "storm" : "calm";
    return "unk";
  };

  const lineFor = (d) => {
    const off = d - game.sol,
      kind = kindOf(d),
      lvl = stormLevel(d);
    if (off < 0)
      return kind === "storm"
        ? `Day ${d}: a ${N[lvl]} storm hit.`
        : kind === "dust"
          ? `Day ${d}: a dust storm.`
          : `Day ${d}: a quiet day.`;
    if (off === 0)
      return kind === "storm"
        ? `Storm cloud reaching Mars today${game.warning ? " (" + N[lvl] + ")" : ""}.`
        : kind === "dust"
          ? "Dust storm today."
          : "Nothing predicted today. That is not a promise.";
    if (kind === "unk") return `Day ${d}: too far ahead to see.`;
    if (kind === "storm") {
      const e = fc.find((x) => x.offset === off);
      return `NASA’s model: a ${game.warning && e.level != null ? N[e.level] + " " : ""}storm cloud reaches Mars ${shortDate(d)}. Predicted arrival ${e.windowText}.`;
    }
    return `Nothing predicted for ${shortDate(d)}. Not a promise.`;
  };

  let tiles = "";
  for (let d = page; d < page + 10 && d <= game.total; d++) {
    const off = d - game.sol,
      kind = kindOf(d);
    tiles += `<button class="stile ${kind} ${d === sel ? "sel" : ""} ${off === 0 ? "now" : ""} ${off < 0 ? "past" : ""}" onclick="pickDay(${d})" aria-label="Day ${d}">${kind === "unk" ? '<span class="q">?</span>' : ic(kind === "storm" ? "dose" : kind === "dust" ? "dust" : "sun")}<small>${d}</small></button>`;
  }
  return `<div class="card sky"><div class="evhead"><h2>Sky</h2>
      <button class="nasabadge" onclick="showSource()">${ic("info")} NASA forecast</button></div>
    <div class="strip">${tiles}</div>
    <p class="skyinfo">${lineFor(sel)}</p></div>`;
}

/* ---------- SOURCE POP-UP (the NASA badge) ---------- */
function showSource() {
  const h = HISTORY[(game ? game.sol + game.level : 0) % HISTORY.length];
  const range = game
    ? `Replaying real days: ${RealData.fmtD(game.M.startDate)} to ${RealData.fmtD(game.M.endDate)}.`
    : "";
  const box =
    popup(`<div class="bigic">${ic("info")}</div><h2>Where is this from?</h2>
    <p><b>Storms:</b> NASA’s DONKI space-weather records (${RealData.meta.label}). ${range} NASA’s model predicted when each storm cloud reaches Mars.</p>
    <p><b>Dashed purple cards:</b> game events. Dust, emergencies and surprises are made up by the game.</p>
    <details class="more"><summary>History fact</summary><p class="fact"><b>${h.title}.</b> ${h.fact}</p>
    <p class="fact">${DUST_FACT}</p></details>
    <button class="go" id="x">Close</button>`);
  box.querySelector("#x").onclick = () => box.remove();
}

/* ---------- OPTIONAL: QUIZ + EARTH MAIL (small buttons, no free points) ---------- */
function showQuiz() {
  const d = game.sol,
    Q = QUIZ[game.quizOrder[(d - 1) % QUIZ.length]];
  if (!game.quizOpts[d])
    game.quizOpts[d] = [Q.right, ...Q.wrong].sort(() => Math.random() - 0.5);
  const result = (ok) =>
    `<p class="${ok ? "g-good" : "g-bad"}"><b>${ok ? "Correct!" : "Not quite."}</b> ${ok ? "" : "It is: " + Q.right + ". "}${Q.why}</p>`;
  const box =
    popup(`<div class="bigic">${ic("quiz")}</div><h2>Quiz</h2><p>${Q.q}</p>
    <div id="qa">${
      game.quizRes[d]
        ? result(game.quizRes[d].ok)
        : game.quizOpts[d]
            .map(
              (o, i) =>
                `<button class="choice" data-i="${i}"><b>${o}</b></button>`,
            )
            .join("")
    }</div>
    <button class="go alt" id="x">Close</button>`);
  box.querySelector("#x").onclick = () => box.remove();
  box.querySelectorAll("#qa .choice").forEach((b) => {
    b.onclick = () => {
      const ok = game.quizOpts[d][b.dataset.i] === Q.right;
      game.quizRes[d] = { ok };
      box.querySelector("#qa").innerHTML = result(ok);
    };
  });
}

const NEWS = [
  "Curiosity rover has explored Gale Crater on Mars since 2012.",
  "Perseverance landed in Jezero Crater in February 2021.",
  "The Ingenuity helicopter made the first powered flights on another planet.",
  "Mars sunsets look blue, the opposite of Earth’s.",
  "Mars gravity is only about 38% of Earth’s gravity.",
  "Mars looks red because its dust contains iron oxide, like rust.",
  "Olympus Mons on Mars is the tallest known volcano in the solar system.",
  "Mars has two small moons named Phobos and Deimos.",
  "NASA’s InSight lander recorded marsquakes, Mars’ version of earthquakes.",
  "Astronauts have lived on the Space Station nonstop since November 2000.",
  "NASA’s Artemis program plans to send astronauts back to the Moon.",
  "DONKI is NASA’s database that logs solar flares and other space weather.",
];
const MESSAGES = [
  {
    from: "Mission Control",
    text: "Good morning, crew! Check the sky before you share out power.",
  },
  {
    from: "Dr. Rivera, solar scientist",
    text: "Fast clouds hit hardest, so shelter early.",
  },
  {
    from: "Your family",
    text: "We looked up at Mars tonight. It was a tiny red dot. We are so proud of you!",
  },
  {
    from: "Class 5, Earth School",
    text: "We are growing beans in class, just like your greenhouse!",
  },
  {
    from: "Engineer Sam",
    text: "Spare parts and a calm plan fix most problems.",
  },
  {
    from: "Chef Amara",
    text: "One greenhouse unit feeds the crew for a day. Plants make a little air too!",
  },
];
function showMail() {
  const MC = "Mission Control";
  let hot = null;
  if (stormLevel() > 0)
    hot = {
      from: MC,
      text: "A storm cloud is reaching Mars today. Is the shield worth the power?",
    };
  else if (tmrStorm())
    hot = {
      from: MC,
      text: "Our scouts spotted a storm cloud. Plan your shield power.",
    };
  else if (game.air <= 3)
    hot = {
      from: MC,
      text: "Your air is getting low. Put more power into life support!",
    };
  else if (game.food <= 3)
    hot = { from: MC, text: "Food is low. Don’t forget the greenhouse!" };
  else if (game.dose >= 6)
    hot = { from: MC, text: "Your radiation is high. Use the shield." };
  const list = [
    hot || MESSAGES[game.sol % MESSAGES.length],
    MESSAGES[(game.sol + 3) % MESSAGES.length],
  ];
  const w = oneWayMin();
  const ago = w == null ? "a few minutes" : `${fmtMin(w)} minutes`;
  const html = list
    .map(
      (m) =>
        `<div class="msg"><span class="av" style="background:${AVC[m.from.length % 4]}">${m.from[0]}</span><div><b>${m.from}</b><p>${m.text}</p><small>Sent ${ago} ago</small></div></div>`,
    )
    .join("");
  const box =
    popup(`<div class="bigic">${ic("mail")}</div><h2>Mail from Earth</h2>${html}
    <p class="fact"><b>Did you know?</b> ${NEWS[(game.sol * 3) % NEWS.length]}</p>
    <button class="go alt" id="x">Close</button>`);
  box.querySelector("#x").onclick = () => box.remove();
}

/* ---------- ONE-TIME TIPS: a bubble with an arrow, shown once ---------- */
const TIPS = [
  {
    id: "pads",
    when: () => true,
    target: ".pads",
    text: "Tap a tile to send it a power cell.",
  },
  {
    id: "run",
    when: () => used() >= power(),
    target: ".rungo",
    text: "All cells used. Run the day!",
  },
  {
    id: "storm",
    when: () => stormLevel() > 0 || tmrStorm(),
    target: ".p-S",
    text: "Storm! Fill the shield.",
  },
  {
    id: "sky",
    when: () => game.sol >= 2,
    target: ".sky .strip",
    text: "Tap a day to see NASA’s forecast.",
  },
  {
    id: "battery",
    when: () => batteryOn(),
    target: ".p-B",
    text: "Save a cell for tomorrow.",
  },
  {
    id: "dust",
    when: () => dustToday(),
    target: ".dustcard",
    text: "Dust means less power today.",
  },
  {
    id: "bloom",
    when: () => gameEventToday() === "bloom",
    target: ".bloomcard",
    text: "Give Food 2 cells for bonus food.",
  },
  {
    id: "bot",
    when: () => gameEventToday() === "dent",
    target: ".botbtn",
    text: "Send the bot or lose air.",
  },
  {
    id: "eva",
    when: () => !!game.evaSlots,
    target: ".evabtn",
    text: "Go outside for science. No shield out there!",
  },
];
let tipEl = null;
function clearTip() {
  if (tipEl) {
    tipEl.remove();
    tipEl = null;
  }
  app.querySelectorAll(".hint").forEach((e) => e.classList.remove("hint"));
}
const tipSoon = () => setTimeout(showTip, 120);
function showTip() {
  if (!game || game.result || tipEl || document.querySelector(".overlay"))
    return;
  for (const t of TIPS) {
    if (save.tips[t.id]) continue;
    let ok = false;
    try {
      ok = t.when();
    } catch (e) {}
    const el = ok && app.querySelector(t.target);
    if (!el) continue;
    save.tips[t.id] = 1; // shown once, never again
    persist();
    el.classList.add("hint");
    const b = document.createElement("div");
    b.className = "tip";
    b.innerHTML = `<span>${t.text}</span><button aria-label="Got it">OK</button>`;
    document.body.appendChild(b);
    const r = el.getBoundingClientRect(),
      W = document.documentElement.clientWidth;
    const bw = Math.min(260, W - 20);
    b.style.width = bw + "px";
    const left = Math.max(
      10,
      Math.min(W - bw - 10, r.left + r.width / 2 - bw / 2),
    );
    const below =
      r.bottom + b.offsetHeight + 16 < window.innerHeight ||
      r.top < b.offsetHeight + 20;
    b.style.left = left + "px";
    b.style.top =
      (below
        ? r.bottom + window.scrollY + 12
        : r.top + window.scrollY - b.offsetHeight - 12) + "px";
    b.classList.add(below ? "below" : "above");
    b.style.setProperty(
      "--ax",
      Math.max(16, Math.min(bw - 16, r.left + r.width / 2 - left)) + "px",
    );
    b.querySelector("button").onclick = clearTip;
    tipEl = b;
    return;
  }
}

/* ---------- THE SCREEN ---------- */
const pipsHTML = (n, cap) =>
  `<span class="pips">${Array.from({ length: cap }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;

function projection() {
  const a = game.alloc,
    lvl = stormLevel(),
    ev = gameEventToday(),
    out = isOut();
  let risk = 0;
  if (lvl > 0)
    risk = out
      ? game.warning
        ? stormDose()
        : RealData.DOSE[4]
      : game.warning
        ? stormHit(a.S)
        : Math.max(0, RealData.DOSE[4] - lv("walls") - 2 * a.S);
  let air = -CONFIG.crewAir + 2 * a.L + a.G;
  let food = -CONFIG.crewFood + (2 + lv("seeds")) * a.G;
  if (ev === "dent" && !game.repair[game.sol]) air -= CONFIG.dentAir;
  if (ev === "bloom" && a.G >= CONFIG.bloomNeed) food += CONFIG.bloomFood;
  return {
    air,
    food,
    dose: (a.S ? 0 : 0.25) + (out ? CONFIG.evaDose : 0),
    risk,
    unknown: lvl > 0 && !game.warning,
    research: out ? CONFIG.evaScience : 0,
    carry: a.B,
  };
}

function scene() {
  const a = game.alloc;
  const t = dustToday() ? "dust" : stormLevel() > 0 ? "storm" : "";
  const lamp = (v, x, y) =>
    `<circle cx="${x}" cy="${y}" r="5" fill="${v > 0 ? "#ffc933" : "#6b6690"}" stroke="#1e1a3c" stroke-width="2"/>`;
  const st = 'stroke="#1e1a3c" stroke-width="3" stroke-linejoin="round"';
  return `<svg class="scene ${t}" viewBox="0 0 600 170" role="img" aria-label="Your Mars outpost">
    <defs><linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2f78"/><stop offset="1" stop-color="#f2a37f"/></linearGradient></defs>
    <rect width="600" height="170" fill="url(#sk)"/>
    <circle cx="505" cy="46" r="20" fill="#ffe08a"/>
    ${t === "storm" ? '<g class="rays" stroke="#ff5a6e" stroke-width="4" stroke-linecap="round"><path d="M505 8v-4M505 84v4M467 46h-5M543 46h5M478 19l-3-3M532 73l3 3M532 19l3-3M478 73l-3 3"/></g>' : ""}
    <path d="M0 118Q150 88 300 116T600 106V170H0z" fill="#c4553b"/>
    <path d="M0 142Q200 126 400 142T600 136V170H0z" fill="#8e3a3a"/>
    <g fill="#62c3ff" ${st}><path d="M24 142l12-18h30l-12 18z"/><path d="M66 142l12-18h30l-12 18z"/><path d="M108 142l12-18h30l-12 18z"/></g>
    <path d="M195 142a42 42 0 0 1 84 0z" fill="#cfeaff" ${st}/>${lamp(a.L, 237, 128)}
    <path d="M305 142v-30l26-18 26 18v30z" fill="#9ff0c9" ${st}/><path d="M318 142v-12M331 142v-18M344 142v-10" stroke="#25a06a" stroke-width="3"/>${lamp(a.G, 331, 108)}
    <path d="M385 142v-20h62v20z" fill="#ffc933" ${st}/>${lamp(a.S, 416, 132)}
    <rect x="465" y="120" width="42" height="22" fill="#d9d2ff" ${st}/><path d="M486 120V102" ${st}/>${lamp(a.R, 486, 131)}
    ${t === "dust" ? '<rect width="600" height="170" fill="#b8742f" opacity=".5"/>' : ""}
  </svg>`;
}

function meter(icon, label, value, max, lowWhen) {
  const low = lowWhen(value);
  return `<div class="meter ${low ? "low" : ""}" title="${label}">
    <div class="icon">${ic(icon)}</div>
    <div class="bar"><i style="width:${Math.max(0, (value / max) * 100)}%"></i></div>
    <div class="label">${label} ${fmt(value)}</div></div>`;
}

// One big tap target per system. Tap = +1 cell, small − = take one back.
function pad(k, name, n, cap, canAdd, hint) {
  return `<div class="pad p-${k}" title="${hint}">
    <button class="padmain" onclick="change('${k}',1)" ${canAdd ? "" : "disabled"} aria-label="Add power to ${name}">${ic(k === "B" ? "battery" : k)}<b>${name}</b>${pipsHTML(n, cap)}</button>
    <button class="padminus" onclick="change('${k}',-1)" ${n === 0 ? "disabled" : ""} aria-label="Take power from ${name}">−</button>
  </div>`;
}

function evaCard() {
  if (!game.evaSlots) return "";
  const on = isOut(),
    left = game.evaSlots - game.evaUsed;
  const noPower = !on && used() >= power();
  return `<div class="evacard ${stormLevel() > 0 ? "danger" : ""}">
    <button class="evabtn" onclick="toggleEva()" ${!on && (left <= 0 || noPower) ? "disabled" : ""}>
      ${ic("eva")}<span><b>${on ? "Going outside! Tap to cancel" : left <= 0 ? "No spacewalks left" : "Spacewalk"}</b>
      <small>${on ? "" : `+${CONFIG.evaScience} research · costs 1 power · no shield outside`}${noPower && left > 0 ? " · free up 1 power first" : ""}</small></span>
      ${pipsHTML(left, game.evaSlots)}
    </button>
    ${stormLevel() > 0 ? `<p class="warnline">Storm today. Nothing protects you outside!</p>` : ""}
  </div>`;
}

function render() {
  clearTip();
  if (game.result) return renderEnd();
  const p = power(),
    lvl = stormLevel(),
    u = used();

  // Today's events. Storm = real data (solid). Dust and game events = made by the game (dashed).
  let eventCard = "";
  if (lvl > 0) {
    const S = game.alloc.S,
      need = shelterNeed(),
      lo = needLo(),
      hi = needHi();
    const spips = Array.from({ length: 4 }, (_, i) => {
      const cls = game.warning
        ? i < need
          ? "need"
          : ""
        : i < lo
          ? "need"
          : i < hi
            ? "maybe"
            : "";
      return `<i class="${cls} ${i < S ? "on" : ""}"></i>`;
    }).join("");
    const enough = game.warning ? S >= need : S >= hi;
    eventCard += `<div class="card warn eventcard stormcard">
      <div class="evhead">${ic("dose")}<h2>Storm today!</h2>
        <button class="nasabadge" onclick="showSource()">${ic("info")} Real NASA data</button></div>
      <div class="shieldrow">${ic("S")}<span class="spips">${spips}</span>
        <b class="${enough ? "okk" : ""}">${enough ? "Safe" : game.warning ? `${S}/${need}` : `${S}/?`}</b></div>
      <p class="short">${game.warning ? `${RealData.NAMES[lvl]} storm. Fill the shield to ${need}.` : `Strength unknown. Fill the shield (${needRange()}).`}</p>
    </div>`;
  }
  if (dustToday())
    eventCard += `<div class="card gameevt eventcard dustcard">
      <div class="evhead">${ic("dust")}<h2>Dust storm</h2></div>
      <p class="short">Power is only <b>${p}</b> today.</p>
      <small class="gtag">${GAME_TAG}</small></div>`;

  const gev = gameEventToday();
  if (gev === "dent") {
    const fixed = !!game.repair[game.sol];
    eventCard += `<div class="card gameevt eventcard">
      <div class="evhead">${ic("L")}<h2>Dented wall</h2></div>
      ${
        fixed
          ? `<p class="short">${ic("check")} Bot sent. The dent will be sealed.</p>`
          : `<button class="bigbtn botbtn" onclick="sendBot()" ${u >= p ? "disabled" : ""}>Send the repair bot<small>costs 1 power · saves ${CONFIG.dentAir} air${u >= p ? " · free up 1 power first" : ""}</small></button>`
      }
      <small class="gtag">${GAME_TAG}</small></div>`;
  } else if (gev === "bloom") {
    const g = game.alloc.G;
    eventCard += `<div class="card gameevt eventcard bloomcard">
      <div class="evhead">${ic("G")}<h2>Blooming plants</h2></div>
      <p class="short">Food ${CONFIG.bloomNeed}+ cells = <b>+${CONFIG.bloomFood} food</b>. Now: ${g}.${g >= CONFIG.bloomNeed ? " " + "Harvest is on!" : ""}</p>
      <small class="gtag">${GAME_TAG}</small></div>`;
  }

  const cells = Array.from(
    {
      length: Math.max(p, CONFIG.normalPower + lv("panels") + game.discoveries),
    },
    (_, i) =>
      `<div class="cell ${i < u ? "on" : ""} ${i >= p ? "dead" : ""}"></div>`,
  ).join("");

  const sgn = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0");
  const pr = projection();
  const proj = `<div class="proj">
    <span class="${pr.air < 0 ? "neg" : "pos"}">${ic("L")} ${sgn(pr.air)}</span>
    <span class="${pr.food < 0 ? "neg" : "pos"}">${ic("food")} ${sgn(pr.food)}</span>
    <span class="${pr.dose > 0 ? "neg" : "pos"}">${ic("dose")} ${sgn(pr.dose)}</span>
    ${pr.research ? `<span class="pos">${ic("R")} +${pr.research}</span>` : ""}
    ${pr.carry ? `<span class="pos">${ic("battery")} +${pr.carry} tomorrow</span>` : ""}
    ${pr.risk > 0 ? `<span class="neg">${ic("dose")} ${pr.unknown ? "up to +" : "+"}${pr.risk} storm</span>` : ""}</div>`;

  const lastDay = game.sol >= game.total;
  const pads =
    SYSTEMS.map((s) =>
      pad(
        s.key,
        s.short,
        game.alloc[s.key],
        4,
        u < p && game.alloc[s.key] < 4,
        s.hint,
      ),
    ).join("") +
    (batteryOn()
      ? pad(
          "B",
          "Battery",
          game.alloc.B,
          CONFIG.batteryCap,
          u < p && game.alloc.B < CONFIG.batteryCap && !lastDay,
          lastDay
            ? "No tomorrow to save for."
            : "Power you store today arrives tomorrow.",
        )
      : "");

  const help = more(
    "sys",
    "What does each tile do?",
    SYSTEMS.map((s) => `<p class="fact"><b>${s.short}:</b> ${s.hint}</p>`).join(
      "",
    ) +
      (batteryOn()
        ? `<p class="fact"><b>Battery:</b> power stored today shows up tomorrow (up to ${CONFIG.batteryCap}). It does nothing for you today.</p>`
        : "") +
      `<p class="fact"><b>Radiation</b> never goes down. At ${CONFIG.doseLimit}, the crew goes home.</p>` +
      `<p class="fact"><b>Discoveries:</b> every ${CONFIG.discoveryEvery} research points gives +1 power for the rest of the mission. You have ${game.discoveries}.</p>` +
      `<p class="fact"><b>Cargo:</b> ${game.cargo.map(nameOf).join(", ") || "nothing packed"}.</p>`,
  );

  const left = p - u;
  const why = game.penaltyWhy[game.sol] || [];
  const carried = game.carry[game.sol] || 0;

  app.className = "wide";
  app.innerHTML = `<div class="layout">
    <div class="topbar">
      <button class="back" onclick="quitMission()">◀ Menu</button>
      <span class="brand">Mission ${game.level + 1} · ${game.total} days</span>
    </div>

    <div class="col">
      <div class="card hud">
        <div class="hudrow">
          <span class="big">Day ${game.sol}<small> / ${game.total}</small></span>
          <span>${ic("R")} ${game.science}${game.discoveries ? ` · +${game.discoveries} power` : ""}</span>
        </div>
        <div class="progress"><i style="width:${(game.sol / game.total) * 100}%"></i></div>
        <div class="meters">
          ${meter("L", "Air", game.air, game.maxStock, (v) => v <= 3)}
          ${meter("food", "Food", game.food, game.maxStock, (v) => v <= 3)}
          ${meter("dose", "Radiation", game.dose, CONFIG.doseLimit, (v) => v >= 6)}
        </div>
        <small class="replay">${shortDate(game.sol)} · replaying ${RealData.fmtD(game.M.startDate)} to ${RealData.fmtD(game.M.endDate)}</small>
      </div>
      ${game.penalty[game.sol] ? `<div class="card warn"><b>−${game.penalty[game.sol]} power today</b> (${why.join(" and ")})</div>` : ""}
      ${eventCard}
      ${skyStrip()}
    </div>

    <div class="col">
      <div class="card">
        ${scene()}
        <div class="powerhead"><h2>Power ${u} / ${p}</h2><div class="cells">${cells}</div></div>
        ${carried ? `<small class="fact">Includes +${carried} saved in the battery yesterday.</small>` : ""}
        <div class="pads">${pads}</div>
        ${proj}
        ${evaCard()}
        <div class="runrow">
          ${game.lastPlan && u === 0 ? `<button class="go alt" onclick="sameAsYesterday()">${ic("undo")} Same as yesterday</button>` : ""}
          <button class="go rungo" onclick="runSol()" ${left > 0 ? "disabled" : ""}>${left > 0 ? `Use ${left} more cell${left > 1 ? "s" : ""}` : `Run Day ${game.sol} ▶`}</button>
        </div>
        <div class="tools">
          <button class="mini" onclick="showMail()">${ic("mail")} Earth mail</button>
          <button class="mini" onclick="showQuiz()">${ic("quiz")} Quiz</button>
        </div>
        ${help}
      </div>
    </div>
  </div>`;
  tipSoon();
}

/* ---------- END SCREEN ---------- */
function debriefHTML() {
  const good = game.log.filter((e) => e.tone === "good").slice(0, 2);
  const bad = game.log.filter((e) => e.tone === "bad").slice(-3);
  const rows = [...good, ...bad]
    .sort((a, b) => a.day - b.day)
    .map((e) => `<li class="${e.tone}"><b>Day ${e.day}:</b> ${e.text}</li>`)
    .join("");
  return `<div class="card"><h2>What your choices led to</h2>${
    rows
      ? `<ul class="debrief">${rows}</ul>`
      : "<p>A quiet mission. Nothing big happened.</p>"
  }</div>`;
}

function recapCard() {
  const M = game.M,
    played = game.result === "win" ? game.total : game.sol;
  const all = M.recap("mars").filter((l) => l.day <= played);
  const top = all
    .slice()
    .sort((a, b) => b.level - a.level || a.day - b.day)
    .slice(0, 5)
    .sort((a, b) => a.day - b.day);
  const rows = top
    .map(
      (l) =>
        `<li><b>Day ${l.day} · ${RealData.fmtD(l.date)} · ${l.name}</b>${l.text}</li>`,
    )
    .join("");
  return fold(
    "real",
    "What really happened in this window",
    `<p class="fact">Your mission replayed ${RealData.fmtD(M.startDate)} to ${RealData.fmtD(M.endDate)}${played < game.total ? ` (you played ${played} days)` : ""}. NASA’s DONKI listed a predicted storm cloud at Mars on ${all.length} of those days${all.length > top.length ? `. The ${top.length} strongest are below` : ""}. Dust storms, emergencies and quiet-day surprises were the game’s own events, not NASA’s.</p>
    ${rows ? `<ul class="recap">${rows}</ul>` : ""}
    <p class="fact">These are model predictions, not measurements. Source: ${RealData.meta.label}.</p>`,
  );
}

function renderEnd() {
  app.className = "";
  const win = game.result === "win";
  const nxt = tierInfo(save.level);
  const msg = {
    win: `Mission ${game.level + 1} cleared!`,
    air: "The air ran out.",
    food: "The food ran out.",
    dose: "Too much radiation. The crew went home.",
  }[game.result];
  const chk = (ok, text) =>
    `<p class="chk ${ok ? "ok" : "no"}">${ok ? "✔" : "✖"} ${text}</p>`;

  let result;
  if (win) {
    const nextLine = game.unlocked
      ? `Unlocked: <b>Mission ${nxt.level + 1}</b>, ${nxt.days} days. It will be harder!`
      : save.level >= CONFIG.maxLevel
        ? "That was the final mission. Replay it for more stars."
        : "Replaying an old mission. Your next mission is still waiting.";
    result = `<div class="card news"><h2>Stars: <span class="stars">${starsStr(game.stars)}</span></h2>
      ${chk(true, `Survived all ${game.total} days`)}
      ${chk(game.okDose, `Radiation under ${fmt(CONFIG.doseLimit * 0.3)} (you had ${fmt(game.dose)})`)}
      ${chk(game.okSci, `${game.goal}+ research (you had ${game.science})`)}
      <p>+<b>${game.earned}</b> points. You have <b>${save.points}</b>.</p>
      <p>${nextLine}</p></div>`;
  } else {
    result = `<div class="card news"><h2>+${game.earned} research points</h2>
      <p>You have <b>${save.points}</b> to spend. You stay on <b>Mission ${nxt.level + 1}</b>. The next try replays a different real stretch. Try different cargo!</p></div>`;
  }

  app.innerHTML = `
    <h1>${msg}</h1>
    ${result}
    ${debriefHTML()}
    ${recapCard()}
    ${fold(
      "learn",
      "What you learned",
      `<p><b>Power is limited.</b> Every cell for science was a cell not used to stay safe.</p>
      <p><b>Warnings are predictions.</b> NASA’s DONKI model predicts when solar storm clouds reach Mars. Real clouds can arrive early, late or miss.</p>
      <p><b>Fast clouds hit harder.</b> A cloud’s speed tells you how much shelter you need.</p>
      <p><b>Quiet is not safe.</b> A day with nothing in the log can still have surprises.</p>
      <p><b>Help is far away.</b> Signals between Earth and Mars take about 3 to 22 minutes each way, so crews must sometimes decide on their own.</p>
      <p><b>Cargo is limited.</b> A rocket can only carry so much.</p>`,
    )}
    <button class="go" onclick="showMenu()">Cargo &amp; upgrades</button>
    <button class="go alt" onclick="startMission()">${win ? "Start Mission " + (nxt.level + 1) + " now" : "Try again now"}</button>
    <button class="go alt" onclick="showAbout()">About the science</button>
    <button class="go alt" onclick="showMain()">◀ Main menu</button>`;
}

/* ---------- ANIMATION EXTRAS (safe to delete: the game works without it) ---------- */
(function () {
  const reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $$ = (sel) => Array.from(app.querySelectorAll(sel));
  let enterTimer = 0;

  function confetti(n) {
    if (reduce) return;
    const wrap = document.createElement("div");
    wrap.className = "confetti";
    const cols = ["#ffc933", "#35d8a0", "#62c3ff", "#ff8fa0", "#c4553b"];
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.style.cssText =
        `--x:${Math.random() * 100}vw;--dx:${(Math.random() - 0.5) * 30}vw;` +
        `--r:${Math.random() * 720}deg;--d:${1.6 + Math.random() * 1.6}s;` +
        `--w:${Math.random() * 0.6}s;background:${cols[i % cols.length]}`;
      wrap.appendChild(s);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 4000);
  }

  function stagger() {
    if (reduce) return;
    $$(":scope > :not(.layout), .col > *, .topbar").forEach((el) => {
      const i = Array.prototype.indexOf.call(el.parentNode.children, el);
      el.style.setProperty("--i", Math.min(7, i));
    });
    $$(".chk").forEach((el, i) => el.style.setProperty("--i", i));
    $$(".debrief li").forEach((el, i) => el.style.setProperty("--i", i));
    app.classList.add("enter");
    clearTimeout(enterTimer);
    enterTimer = setTimeout(() => app.classList.remove("enter"), 1400);
  }

  const SYNC = [
    ".rays",
    '.scene circle[cx="505"]',
    '.scene.dust rect[fill="#b8742f"]',
    ".card.warn",
    ".col button.go:not(:disabled):not(.alt)",
    ".meter.low .icon",
    ".hint",
  ].join(",");
  function sync() {
    if (reduce) return;
    $$(SYNC).forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.animationIterationCount.indexOf("infinite") < 0) return;
      const d = parseFloat(cs.animationDuration) * 1000;
      if (d) el.style.animationDelay = -(performance.now() % d) + "ms";
    });
  }

  let last = { g: null };
  const origRender = window.render;
  window.render = function () {
    const same = last.g === game;
    const barsBefore = same
      ? $$(".meter .bar i, .progress i").map((b) => b.style.width)
      : [];
    const onBefore = $$(".cell.on").length;

    origRender.apply(this, arguments);

    const g = game;
    const sameDay = same && last.sol === g.sol;
    if (!reduce) {
      if (!same || !sameDay || (g.result && !last.result)) stagger();
      if (same && !g.result) {
        const now = $$(".meter .bar i, .progress i");
        if (now.length === barsBefore.length)
          now.forEach((b, i) => {
            const to = b.style.width;
            b.style.width = barsBefore[i];
            void b.offsetWidth;
            b.style.width = to;
          });
        const m = $$(".meter");
        const vals = [g.air, g.food, g.dose];
        const prev = [last.air, last.food, last.dose];
        vals.forEach((v, i) => {
          if (m[i] && prev[i] !== undefined && v !== prev[i]) {
            const better = i === 2 ? v < prev[i] : v > prev[i];
            m[i].classList.add(better ? "gain" : "loss");
          }
        });
        if (sameDay)
          $$(".cell.on").forEach((c, i) => {
            if (i >= onBefore) c.classList.add("fresh");
          });
      }
    }
    if (g.result === "win" && !g.celebrated) {
      g.celebrated = true;
      confetti(60);
    }
    last = {
      g,
      sol: g.sol,
      result: g.result,
      air: g.air,
      food: g.food,
      dose: g.dose,
    };
    sync();
  };

  const origPopup = window.popup;
  window.popup = function (html) {
    const box = origPopup.call(this, html);
    const al = box.querySelector(".alert");
    if (!al) return box;
    clearTip();
    if (!reduce) {
      [".rep li", ".bigchip", ".choice"].forEach((sel) =>
        Array.from(box.querySelectorAll(sel)).forEach((el, i) =>
          el.style.setProperty("--i", i),
        ),
      );
      if (al.querySelector("li.bad, .g-bad")) al.classList.add("shake");
      if (html.indexOf("Discovery!") >= 0) setTimeout(() => confetti(26), 450);
    }
    return box;
  };

  ["showMain", "showMenu", "showHow", "showAbout"].forEach((name) => {
    const orig = window[name];
    window[name] = function (a) {
      const r = orig.apply(this, arguments);
      last = { g: null };
      clearTip();
      if (!(name === "showMenu" && a === true)) stagger();
      return r;
    };
  });
})();

showMain();
