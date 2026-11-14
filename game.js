/* ============================================================
   MARS OUTPOST – game logic
   Edit the CONFIG section to change balance, events and text.
   ============================================================ */

/* ---------- CONFIG: tweak the game here ---------- */
const CONFIG = {
  daysPerStep: 10, // Mission 1 = 10 days, Mission 2 = 20, Mission 3 = 30 ...
  maxLevel: 5, // last mission tier (5 = 60 days). Replay it for stars.
  normalPower: 8, // power units on a normal day
  dustPower: 4, // power units on a dust storm day (gets lower on harder missions)
  startAir: 8,
  startFood: 8,
  maxStock: 12,
  crewAir: 6, // air the crew uses each day
  crewFood: 2, // food the crew eats each day
  doseLimit: 10, // reach this and the crew goes home
  stormStrength: 6, // radiation of a storm on Mission 1 (grows on harder missions)
  emergencyTime: 12, // seconds to decide on Mission 1 (shorter on harder missions)
  starScience: 2, // research points per day needed for the science star
  baseCargoSlots: 2, // how many upgrades/items fit in the rocket
  stormRate: 0.18, // storms per day (18% of days)
  dustRate: 0.12,
  emergencyRate: 0.15,
  rateGrowth: 0.01, // how much those rates grow per mission level

  // Consequences
  stormThreatBoost: 1.5, // storm "risk days" per real storm (not every risk day becomes a storm)
  strainDays: 2, // days in a row at full power before a system overheats
  strainPenalty: 2, // power lost the day after an overheat
  tiredPenalty: 1, // power lost the day after the crew runs low on air or food
  lowStock: 2, // air or food at or below this makes the crew tired
  discoveryEvery: 6, // research points per discovery
  maxDiscoveries: 2, // each discovery gives +1 power for the rest of the mission
  riskWarnPct: 50, // ask "run anyway?" if a storm is at least this likely and shelter is too low
};

const RANKS = ["Rookie", "Cadet", "Pilot", "Commander", "Captain", "Legend"];

// Everything that depends on the mission level lives here.
function tierInfo(lvl) {
  const t = Math.min(Math.max(0, lvl), CONFIG.maxLevel);
  const days = CONFIG.daysPerStep * (t + 1);
  const g = CONFIG.rateGrowth * t;
  return {
    level: t,
    days,
    rank: RANKS[t] || "Legend",
    storms: Math.max(1, Math.round(days * (CONFIG.stormRate + g))),
    dusts: Math.max(1, Math.round(days * (CONFIG.dustRate + g))),
    emergencies: Math.max(1, Math.round(days * (CONFIG.emergencyRate + g))),
    storm: CONFIG.stormStrength + Math.floor(t / 2), // radiation of a storm
    dust: Math.max(2, CONFIG.dustPower - Math.floor(t / 2)), // power on dust days
    time: Math.max(6, CONFIG.emergencyTime - t), // emergency timer
  };
}
const missionDays = (lvl) => tierInfo(lvl).days;
const cargoSlots = (lvl) =>
  Math.min(
    3,
    CONFIG.baseCargoSlots + Math.floor(Math.min(lvl, CONFIG.maxLevel) / 2),
  );

// The four things the player powers.
const SYSTEMS = [
  {
    key: "L",
    name: "Life support",
    hint: `Makes air. The crew breathes ${CONFIG.crewAir} air a day and each unit makes 2.`,
  },
  {
    key: "G",
    name: "Greenhouse",
    hint: `Each unit grows 2 food and 1 air. The crew eats ${CONFIG.crewFood} food a day.`,
  },
  {
    key: "S",
    name: "Storm shelter",
    hint: "Each unit blocks 2 radiation in a storm. With no shelter you also take a little radiation every day.",
  },
  {
    key: "R",
    name: "Science lab",
    hint: "Earns research points. Nothing else.",
  },
];

// Real, archived NASA events. Add your own here!
const STORMS = [
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
    title: "Fast particle burst",
    fact: "Charged particles from the Sun can arrive within hours, so warning time is short.",
  },
];
const DUST = {
  title: "Mars dust storm",
  fact: "In 2018 a global dust storm blocked so much sunlight that NASA’s Opportunity rover lost power.",
};
const DELAYS = ["4 minutes", "9 minutes", "14 minutes", "20 minutes"]; // Earth-Mars signal time varies 3–22 min

// Surprise emergencies. Every emergency has a GOOD, an OK and a BAD choice (order is shuffled).
// grade: "good" | "ok" | "bad".  effect can change: air, food, dose (radiation), science,
// and powerNext (power change tomorrow, from damage). "lesson" is the real-world tip shown to the player.
const EMERGENCIES = [
  {
    title: "Air leak!",
    text: "A hissing sound! A small crack is letting air escape.",
    choices: [
      {
        grade: "good",
        label: "Find the leak and patch it",
        cost: "Lose 1 research point",
        effect: { science: -1 },
        result: "The leak is sealed fast and almost no air was lost.",
        lesson: "Real crews find the leak first, then patch it.",
      },
      {
        grade: "ok",
        label: "Close the door to that room",
        cost: "Lose 2 air",
        effect: { air: -2 },
        result: "The leak is cut off, but the air in that room is gone.",
        lesson:
          "Sealing a room stops the problem spreading, but does not fix the hole.",
      },
      {
        grade: "bad",
        label: "Turn up life support to cover it",
        cost: "Lose 3 air, and 2 less power tomorrow",
        effect: { air: -3, powerNext: -2 },
        result: "Life support worked too hard and wore out.",
        lesson: "Making more air does not fix a hole. It wastes power.",
      },
    ],
    timeout: {
      grade: "bad",
      label: "",
      effect: { air: -5 },
      result: "Nobody acted, so a lot of air escaped.",
      lesson: "In an emergency, a quick plan beats no plan.",
    },
  },
  {
    title: "Surprise particle burst!",
    text: "Sensors beep. Fast particles from the Sun are arriving with no warning.",
    choices: [
      {
        grade: "good",
        label: "Go to the shielded shelter",
        cost: "Lose 1 food (no time to harvest)",
        effect: { food: -1 },
        result: "The crew stayed safe behind thick walls.",
        lesson: "Crews plan a shielded safe room for exactly this.",
      },
      {
        grade: "ok",
        label: "Move to the middle of the base",
        cost: "Gain 1 radiation",
        effect: { dose: 1 },
        result: "Being deeper inside helped a little.",
        lesson: "Walls help, but only a shelter is built to block particles.",
      },
      {
        grade: "bad",
        label: "Finish the experiment first",
        cost: "Gain 1 research point, but 3 radiation",
        effect: { science: 1, dose: 3 },
        result: "The experiment worked, but the crew took a big dose.",
        lesson: "Radiation dose adds up and cannot be undone.",
      },
    ],
    timeout: {
      grade: "bad",
      label: "",
      effect: { dose: 4 },
      result: "The crew froze and took a big dose.",
      lesson: "Warning alarms only help if you act on them.",
    },
  },
  {
    title: "Greenhouse pump broke!",
    text: "The water pump stopped. The plants are getting thirsty.",
    choices: [
      {
        grade: "good",
        label: "Swap in the spare part",
        cost: "Lose 1 research point",
        effect: { science: -1 },
        result: "The pump works again and the plants are fine.",
        lesson: "Missions carry spare parts because help is far away.",
      },
      {
        grade: "ok",
        label: "Water the plants by hand",
        cost: "Lose 1 food and 1 research point",
        effect: { food: -1, science: -1 },
        result: "Some plants made it, but it took all day.",
        lesson: "A workaround works, but fixing the cause is better.",
      },
      {
        grade: "bad",
        label: "Wait for Earth to reply",
        cost: "Lose 3 food",
        effect: { food: -3 },
        result: "Earth’s answer came too late and the plants wilted.",
        lesson: "Messages to Earth take minutes, so crews must decide alone.",
      },
    ],
    timeout: {
      grade: "bad",
      label: "",
      effect: { food: -4 },
      result: "The plants wilted badly.",
      lesson: "Waiting is also a choice, and often a costly one.",
    },
  },
  {
    title: "Dusty solar panels!",
    text: "Dust covers the solar panels and power is dropping.",
    choices: [
      {
        grade: "good",
        label: "Clean them with the robot arm",
        cost: "Lose 1 research point",
        effect: { science: -1 },
        result: "The panels shine again and power is back.",
        lesson: "Robots can do dusty jobs without risking the crew.",
      },
      {
        grade: "ok",
        label: "Wipe them by hand (spacewalk)",
        cost: "Gain 1 radiation",
        effect: { dose: 1 },
        result: "Clean panels, but the crew spent time in the open.",
        lesson: "Spacewalks mean more radiation and more risk.",
      },
      {
        grade: "bad",
        label: "Ignore it",
        cost: "Lose 2 research points, and 2 less power tomorrow",
        effect: { science: -2, powerNext: -2 },
        result: "More dust piled up and power kept falling.",
        lesson: "Dust builds up, so waiting makes it worse.",
      },
    ],
    timeout: {
      grade: "bad",
      label: "",
      effect: { science: -3, powerNext: -2 },
      result: "The dust kept piling up.",
      lesson: "Small problems grow if you wait.",
    },
  },
];

// Daily "question from Earth". Put the right answer in "right"; answers are shuffled when shown.
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

/* ---------- ICONS (simple line icons, edit paths freely) ---------- */
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
  rover:
    '<circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M4 14h16l-2-5h-6l-1-3H8l1 3H6z"/>',
};
ICON.panels = ICON.sun;
ICON.seeds = ICON.G;
const ic = (k) =>
  `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] || ""}</svg>`;
const AVC = ["#62c3ff", "#35d8a0", "#ffc933", "#ff8fa0"];

/* ---------- DARK / LIGHT MODE ---------- */
const THEME_KEY = "marsOutpostTheme";
let theme = "dark"; // default. Change to "light" if you prefer
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

/* ---------- COLLAPSIBLE SECTIONS (stay open/closed after re-render) ---------- */
const setUI = (k, v) => {
  if (game) game.ui[k] = v;
};
// Small "tap to read more" link inside a card
const more = (key, title, body) =>
  `<details class="more" ${game.ui[key] ? "open" : ""} ontoggle="setUI('${key}',this.open)"><summary>${title}</summary>${body}</details>`;
// A whole card that opens and closes
const fold = (key, title, body, badge = "") =>
  `<details class="card fold" ${game.ui[key] ? "open" : ""} ontoggle="setUI('${key}',this.open)"><summary>${title}${badge}</summary><div class="body">${body}</div></details>`;

/* ---------- SAVE DATA (stays in the browser between missions) ---------- */
const SAVE_KEY = "marsOutpostSave";
const freshSave = () => ({
  points: 0,
  up: {}, // upgrades you own: { key: level }
  items: {}, // one-mission items you bought: { key: 1 }
  cargo: [], // what is packed for the next mission
  level: 0, // which mission you are on (0 = Mission 1)
  stars: {}, // best stars per mission level
});
let save = freshSave();
try {
  const t = JSON.parse(localStorage.getItem(SAVE_KEY));
  if (t)
    save = {
      points: t.points || 0,
      up: t.up || {},
      items: t.items || {},
      cargo: Array.isArray(t.cargo) ? t.cargo : [],
      level: Math.min(CONFIG.maxLevel, t.level || 0),
      stars: t.stars || {},
    };
} catch (e) {}
const persist = () => {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (e) {}
};
const owned = (k) => save.up[k] || 0; // level you own (used in menus)
// Level that counts in a mission: only upgrades packed in the rocket work!
const lv = (k) => (game && game.cargo && game.cargo.includes(k) ? owned(k) : 0);

// Permanent upgrades. costs = price of each level.
// You keep them forever, but only a few fit in the rocket each mission.
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
// One-mission items. Used up when the mission starts.
const ITEMS = [
  {
    key: "warning",
    name: "Early-warning satellite",
    desc: "One mission only: see storms 4 days ahead, and forecasts become much more accurate.",
    cost: 6,
  },
  {
    key: "battery",
    name: "Battery pack",
    desc: "One mission only: +3 power on a day you choose.",
    cost: 8,
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
// Removes anything invalid from the cargo list and returns how many slots there are
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

const emptyPlan = () => ({ L: 0, G: 0, S: 0, R: 0 });

function newGame() {
  const tier = tierInfo(save.level);
  const days = tier.days;
  cleanCargo();
  const cargo = [...save.cargo];
  const L = (k) => (cargo.includes(k) ? owned(k) : 0);

  // One-mission items are used up now
  ITEMS.forEach((it) => {
    if (cargo.includes(it.key)) save.items[it.key] = 0;
  });
  save.cargo = cargo.filter((k) => !isItem(k));
  persist();

  // Schedule "risk days". Each has a chance (40-90%) and the result is rolled now,
  // so a "70%" forecast really does come true about 7 times out of 10.
  // Never on day 1 and never back-to-back.
  const events = Array(days + 2).fill(null);
  const place = (ev) => {
    const free = [];
    for (let s = 2; s <= days - 1; s++)
      if (!events[s] && !events[s - 1] && !events[s + 1]) free.push(s);
    if (free.length) events[free[Math.floor(Math.random() * free.length)]] = ev;
  };
  const risk = (type, data) => {
    const pct = 40 + 10 * Math.floor(Math.random() * 6); // 40..90
    return { type, data, chance: pct, happens: Math.random() < pct / 100 };
  };
  const stormOrder = STORMS.map((_, i) => i).sort(() => Math.random() - 0.5);
  const stormRisks = Math.round(tier.storms * CONFIG.stormThreatBoost);
  for (let i = 0; i < stormRisks; i++)
    place(risk("storm", STORMS[stormOrder[i % STORMS.length]]));
  for (let i = 0; i < tier.dusts; i++) place(risk("dust", DUST));

  // Schedule surprise emergencies on random days (never day 1)
  const emergencies = {};
  const order = EMERGENCIES.map((_, i) => i).sort(() => Math.random() - 0.5);
  let n = 0;
  while (Object.keys(emergencies).length < tier.emergencies) {
    const d = 2 + Math.floor(Math.random() * (days - 1));
    if (!emergencies[d])
      emergencies[d] = EMERGENCIES[order[n++ % EMERGENCIES.length]];
  }

  game = {
    level: tier.level,
    tier,
    total: days,
    cargo,
    sol: 1,
    air: CONFIG.startAir + 2 * L("tanks"),
    food: CONFIG.startFood + 2 * L("tanks"),
    maxStock: CONFIG.maxStock + 2 * L("tanks"),
    bonus: {},
    quizOrder: QUIZ.map((_, i) => i).sort(() => Math.random() - 0.5),
    quizOpts: {},
    quizRes: {},
    battery: cargo.includes("battery") ? 1 : 0,
    warning: cargo.includes("warning"),
    dose: 0,
    science: 0,
    alloc: emptyPlan(), // starts empty every day: no autopilot!
    events,
    emergencies,
    penalty: {}, // power lost on a given day
    penaltyWhy: {}, // the reasons, so the player learns the cause
    strain: emptyPlan(), // days in a row each system ran at full power
    discoveries: 0,
    log: [], // good and bad moments for the end-of-mission debrief
    ui: {}, // which collapsible sections are open
    result: null,
  };
  render();
}

/* ---------- RULES ---------- */
const threat = (d) => game.events[d] || null; // a risk day (may or may not happen)
const todayEvent = () => {
  const e = game.events[game.sol];
  return e && e.happens ? e : null; // only things that REALLY happen today
};
const power = () =>
  Math.max(
    2,
    (todayEvent()?.type === "dust" ? game.tier.dust : CONFIG.normalPower) +
      lv("panels") +
      game.discoveries +
      (game.bonus[game.sol] || 0) -
      (game.penalty[game.sol] || 0),
  );
const used = () => Object.values(game.alloc).reduce((a, b) => a + b, 0);

// What the player is TOLD about a risk day (percent). Dust shows up on the panels at the
// start of the day, so it is known on the day. Radiation is never known until it hits.
function shownChance(d) {
  const e = game.events[d];
  if (!e) return 0;
  if (e.type === "dust" && d === game.sol) return e.happens ? 100 : 0;
  if (game.warning) return e.happens ? 90 : 10; // the satellite makes forecasts sharper
  return e.chance;
}
const odds = (p) =>
  p >= 70
    ? "very likely"
    : p >= 50
      ? "likely"
      : p >= 30
        ? "possible"
        : "unlikely";

function addPenalty(day, n, why) {
  game.penalty[day] = (game.penalty[day] || 0) + n;
  (game.penaltyWhy[day] = game.penaltyWhy[day] || []).push(why);
}

// Radiation that gets through in a storm, and how much shelter power blocks all of it
const stormHit = (shelter) =>
  Math.max(0, game.tier.storm - lv("walls") - 2 * shelter);
const shelterNeed = () =>
  Math.min(4, Math.ceil(Math.max(0, game.tier.storm - lv("walls")) / 2));

function change(key, delta) {
  const next = game.alloc[key] + delta;
  if (next < 0 || next > 4) return;
  if (delta > 0 && used() >= power()) return;
  game.alloc[key] = next;
  render();
}

// Called when the player presses Run Day. Asks first if the plan is risky.
function runSol() {
  if (used() < power()) return; // all power must be assigned
  const t = threat(game.sol),
    need = shelterNeed(),
    pct = shownChance(game.sol);
  if (t?.type === "storm" && pct >= CONFIG.riskWarnPct && game.alloc.S < need) {
    const box = popup(`<h2>Risky plan</h2>
      <p>A storm is <b>${pct}%</b> likely today. Blocking all of it needs <b>${need}</b> shelter power and you set <b>${game.alloc.S}</b>.</p>
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
    thr = threat(today),
    seen = thr ? shownChance(today) : 0;
  const notes = [...prenotes];
  const before = {
    air: game.air,
    food: game.food,
    dose: game.dose,
    science: game.science,
  };
  // "warn" notes are shown but not saved for the debrief
  const note = (tone, text) => {
    notes.push({ tone, text });
    if (tone !== "warn") game.log.push({ day: today, tone, text });
  };

  // Air: crew uses some each day. Life support adds 2 per unit, greenhouse adds 1 per unit.
  // Food: crew eats some each day. Greenhouse grows 2 per unit.
  game.air = Math.min(game.maxStock, game.air - CONFIG.crewAir + 2 * a.L + a.G);
  game.food = Math.min(
    game.maxStock,
    game.food - CONFIG.crewFood + (2 + lv("seeds")) * a.G,
  );

  // Radiation: a little each day with no shelter. A storm adds a lot unless the shelter is powered.
  let dose = a.S === 0 ? 0.25 : 0;
  if (thr?.type === "storm") {
    const need = shelterNeed();
    if (thr.happens) {
      const hit = stormHit(a.S);
      dose += hit;
      if (hit === 0)
        note(
          "good",
          `A storm came (${seen}% likely) and your shelter blocked all of it. Protecting the crew paid off.`,
        );
      else if (a.S === 0)
        note(
          "bad",
          `You skipped the shelter and the storm came (${seen}% likely). Radiation +${hit}, and it never goes away.`,
        );
      else
        note(
          "bad",
          `The shelter blocked some, but radiation +${hit} got through. Blocking it all needed ${need} power.`,
        );
    } else if (a.S >= need) {
      note(
        "warn",
        `The storm did not come (it was ${seen}% likely). The shelter power was not needed this time, but it was a safe bet.`,
      );
    } else if (a.S === 0) {
      note(
        "good",
        `You gambled that the storm would not come (${seen}% likely) and you were right. That power went to something else.`,
      );
    } else {
      note(
        "warn",
        "The storm did not come, so your half-protection used power for nothing. A gamble can go either way.",
      );
    }
  }
  if (thr?.type === "dust")
    note(
      "warn",
      thr.happens
        ? "The dust storm cut your solar power today."
        : "The dust cloud missed the base. Stocking up was not needed this time.",
    );
  game.dose += dose;
  game.science += a.R;

  // Discovery: research pays off later, so patience is rewarded
  const dNow = Math.min(
    CONFIG.maxDiscoveries,
    Math.floor(game.science / CONFIG.discoveryEvery),
  );
  if (dNow > game.discoveries) {
    game.discoveries = dNow;
    note(
      "good",
      "Discovery! Your research found a better way to aim the solar panels. +1 power for the rest of the mission.",
    );
  }

  // Strain: full power again and again overheats a system
  for (const s of SYSTEMS) {
    const k = s.key;
    game.strain[k] = a[k] >= 4 ? game.strain[k] + 1 : 0;
    if (game.strain[k] >= CONFIG.strainDays) {
      game.strain[k] = 0;
      addPenalty(
        today + 1,
        CONFIG.strainPenalty,
        `${s.name.toLowerCase()} overheated`,
      );
      note(
        "bad",
        `${s.name} ran at full power ${CONFIG.strainDays} days in a row and overheated. Repairs cost ${CONFIG.strainPenalty} power tomorrow.`,
      );
    }
  }

  // Tired crew: low air or food drains tomorrow's power
  if (
    game.air > 0 &&
    game.food > 0 &&
    (game.air <= CONFIG.lowStock || game.food <= CONFIG.lowStock)
  ) {
    addPenalty(
      today + 1,
      CONFIG.tiredPenalty,
      "the crew is tired from low air or food",
    );
    note(
      "bad",
      `The crew is low on ${game.air <= CONFIG.lowStock ? "air" : "food"} and tired. That means ${CONFIG.tiredPenalty} less power tomorrow.`,
    );
  }

  // Win or lose?
  if (game.air <= 0) game.result = "air";
  else if (game.food <= 0) game.result = "food";
  else if (game.dose >= CONFIG.doseLimit) game.result = "dose";
  else if (game.sol >= game.total) game.result = "win";
  else {
    game.sol++;
    game.alloc = emptyPlan(); // a new day, a new decision
  }
  if (game.result) award();
  render();
  showReport(today, notes, before);
  window.scrollTo(0, 0);
}

/* ---------- DAY REPORT (must be read before the next day) ---------- */
function showReport(day, notes, before) {
  const chip = (name, v, badWhenUp) => {
    if (!v) return "";
    const bad = badWhenUp ? v > 0 : v < 0;
    return `<span class="chip ${bad ? "minus" : "plus"}">${name} ${v > 0 ? "+" : "−"}${fmt(Math.abs(v))}</span>`;
  };
  const chips =
    chip("Air", game.air - before.air, false) +
    chip("Food", game.food - before.food, false) +
    chip("Radiation", game.dose - before.dose, true) +
    chip("Research", game.science - before.science, false);
  const rows = (
    notes.length
      ? notes
      : [{ tone: "good", text: "A calm day. Nothing unexpected." }]
  )
    .map((n) => `<li class="${n.tone}">${n.text}</li>`)
    .join("");
  const box = popup(`<h2>Day ${day} report</h2>
    <div class="chips">${chips}</div>
    <ul class="rep">${rows}</ul>
    <button class="go" id="cont">${game.result ? "See results ▶" : "Start Day " + game.sol + " ▶"}</button>`);
  box.querySelector("#cont").onclick = () => {
    box.remove();
    window.scrollTo(0, 0);
  };
}

/* ---------- EMERGENCY POP-UP WITH COUNTDOWN ---------- */
function popup(html) {
  const box = document.createElement("div");
  box.className = "overlay";
  box.setAttribute("role", "alertdialog");
  box.innerHTML = `<div class="alert">${html}</div>`;
  document.body.appendChild(box);
  return box;
}

function showEmergency(em) {
  const total = game.tier.time + 4 * lv("drills");
  let left = total;
  const opts = [...em.choices].sort(() => Math.random() - 0.5); // shuffle so the best one moves around
  const box = popup(`
    <h2>${em.title}</h2><p>${em.text}</p>
    <div class="timer"><i></i></div>
    <p class="count">Decide in <b>${left}</b> seconds!</p>
    ${opts.map((c, i) => `<button class="choice" data-i="${i}"><b>${c.label}</b><small>${c.cost}</small></button>`).join("")}
    <p class="fact">Earth would take about ${DELAYS[game.sol % 4]} to answer, which is too slow. You decide!</p>`);

  const bar = box.querySelector(".timer i"),
    num = box.querySelector(".count b");
  const done = (choice, timedOut) => {
    clearInterval(timer);
    box.remove();
    applyEmergency(em, choice, timedOut);
  };
  const timer = setInterval(() => {
    left--;
    num.textContent = left;
    bar.style.width = (left / total) * 100 + "%";
    if (left <= 0) done(em.timeout, true);
  }, 1000);
  box
    .querySelectorAll(".choice")
    .forEach((b) => (b.onclick = () => done(opts[b.dataset.i], false)));
}

const CHIPS = {
  air: "Air",
  food: "Food",
  dose: "Radiation",
  science: "Research",
  powerNext: "Power tomorrow",
};
const GRADES = { good: "Great choice!", ok: "Not bad", bad: "Risky choice" };

function applyEmergency(em, choice, timedOut) {
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

  // Show the consequence, then play the day
  const chips = Object.keys(e)
    .map(
      (k) =>
        `<span class="chip ${(k === "dose" ? e[k] > 0 : e[k] < 0) ? "minus" : "plus"}">${CHIPS[k]} ${e[k] > 0 ? "+" : ""}${e[k]}</span>`,
    )
    .join("");
  const grade = timedOut ? "bad" : choice.grade;
  const tone = grade === "good" ? "good" : grade === "ok" ? "warn" : "bad";
  const text = timedOut
    ? `${em.title} You did not decide in time. ${choice.result}`
    : `${em.title} You chose "${choice.label}". ${choice.result}`;
  if (tone !== "warn") game.log.push({ day: game.sol, tone, text });

  const box = popup(`
    <h2 class="g-${grade}">${timedOut ? "⏰ Time ran out!" : GRADES[grade]}</h2>
    <p>${choice.result}</p><div class="chips">${chips}</div>
    <p class="fact">${choice.lesson}</p>
    <button class="go" id="cont">Continue ▶</button>`);
  box.querySelector("#cont").onclick = () => {
    box.remove();
    finishDay([{ tone, text }]);
  };
}

/* ---------- MAIN MENU + HOW TO PLAY ---------- */
const fmt = (n) => (Number.isInteger(n) ? n : n.toFixed(1));
const starsStr = (n) => "★".repeat(n) + "☆".repeat(3 - n);

function showMain() {
  game = null;
  app.className = "";
  const tr = tierInfo(save.level);
  app.innerHTML = `
    <div class="hero">
      <svg class="logo" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#c4553b" stroke="#1e1a3c" stroke-width="4"/><ellipse cx="32" cy="34" rx="30" ry="9" fill="none" stroke="#ffc933" stroke-width="4" transform="rotate(-20 32 34)"/><circle cx="24" cy="26" r="4" fill="#8e3a3a"/><circle cx="38" cy="40" r="3" fill="#8e3a3a"/></svg>
      <h1>Mars Outpost</h1>
      <p class="sub">Mission ${tr.level + 1}: keep your crew alive for ${tr.days} days.</p>
    </div>
    <button class="go" onclick="startMission()">▶ Play Mission ${tr.level + 1}</button>
    <button class="go alt" onclick="showMenu()">Cargo &amp; upgrades <span class="pill">${save.points}</span></button>
    <button class="go alt" onclick="showHow()">How to play</button>`;
  window.scrollTo(0, 0);
}

function showHow() {
  app.innerHTML = `
    <h1>How to play</h1>
    <div class="card"><h2>Your job</h2>
      <p>Each day you get a few <b>power units</b>. Share <b>all of them</b> between life support, the greenhouse, the storm shelter and the science lab. Press <b>Run Day</b> to see what happens.</p>
      <p>Your plan starts empty every day, because every day is different. Power is never enough for everything, so every choice has a cost.</p></div>
    <div class="card"><h2>Watch out for</h2>
      <p><b>Radiation storms</b>: forecasts are never certain. 70% means a storm comes about 7 times out of 10. Protect the crew, or gamble and use the power elsewhere?</p>
      <p><b>Dust storms</b>: less sunlight means less power.</p>
      <p><b>Emergencies</b>: pick fast before the timer runs out!</p></div>
    <div class="card"><h2>Choices have results</h2>
      <p><b>Overheating:</b> a system at full power ${CONFIG.strainDays} days in a row breaks, and repairs cost power.</p>
      <p><b>Tired crew:</b> low air or food means less power tomorrow.</p>
      <p><b>Discoveries:</b> every ${CONFIG.discoveryEvery} research points gives +1 power for the rest of the mission.</p>
      <p>After every day a report tells you what happened and why.</p></div>
    <div class="card"><h2>Missions and cargo</h2>
      <p>Mission 1 lasts ${CONFIG.daysPerStep} days. Clear it to unlock a longer, harder mission. If you do not make it, you try the same mission again.</p>
      <p>Research points buy upgrades. A rocket can only carry a few, so you choose which ones to pack. Real missions have weight limits too!</p></div>
    <div class="card"><h2>Real NASA science</h2>
      <p class="fact">The storms and dust storms are based on real, archived NASA records: DONKI space weather (May 2024 and Oct 2003 storms), the 1972 Apollo-era flare, and the 2018 Mars dust storm that stopped the Opportunity rover. They are not live data. Game numbers are simplified for play.</p></div>
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
  // +10 for surviving, +3 for each extra star
  game.earned = game.science + (win ? 10 + 3 * (game.stars - 1) : 0);
  save.points += game.earned;

  game.unlocked = false;
  if (win) {
    save.stars[game.level] = Math.max(save.stars[game.level] || 0, game.stars);
    // Clearing your current mission unlocks the next one. Losing changes nothing.
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
function useBattery() {
  game.bonus[game.sol] = (game.bonus[game.sol] || 0) + 3;
  game.batteryDay = game.sol;
  game.battery--;
  render();
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
  if (confirm("Erase all points, upgrades and mission progress?")) {
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
      <p class="fact">Rank: ${tr.rank}. ${best ? `Best so far: <span class="stars">${starsStr(best)}</span>. ` : ""}${lastTier ? "This is the final mission. Replay it to earn more stars." : `Clear it to unlock Mission ${tr.level + 2} (${missionDays(save.level + 1)} days). If you do not make it, you try this one again.`}</p></div>
    <div class="card"><h2>Cargo bay: ${save.cargo.length} of ${slots} packed</h2>
      <div class="bay">${bay}</div>
      <p class="fact">The rocket can only carry ${slots} things. Pick what your crew needs most. Real rockets have weight limits too!</p></div>
    <div class="card"><h2>${save.points} research points</h2>
      <p class="fact">Earn points from science each mission, plus a bonus for surviving and for stars.</p></div>
    <div class="card"><h2>Upgrades</h2><p class="fact">You keep these forever, but you must pack them to use them.</p>${ups}</div>
    <div class="card"><h2>One-mission items</h2><p class="fact">Packed items are used up when the mission starts.</p>${items}</div>
    <button class="go" onclick="startMission()">Start Mission ${tr.level + 1} ▶</button>
    <button class="go alt" onclick="showMain()">◀ Main menu</button>
    <p class="fact" style="text-align:center"><a href="#" onclick="resetSave();return false" style="color:inherit">Reset progress</a></p>`;
  if (!keepScroll) window.scrollTo(0, 0);
}

/* ---------- ACTIVITIES: forecast, Earth quiz, rover mini-game ---------- */
function forecastStrip() {
  const look = game.warning ? 4 : 2; // days you can see (the satellite shows more)
  let tiles = "";
  for (let d = game.sol; d < game.sol + 4 && d <= game.total; d++) {
    const known = d - game.sol < look,
      e = game.events[d],
      pct = known ? shownChance(d) : 0;
    const risky = known && e && pct > 0;
    const icon = !known
      ? "?"
      : risky
        ? ic(e.type === "storm" ? "dose" : "dust")
        : ic("sun");
    const name = !known
      ? "Unknown"
      : risky
        ? `${e.type === "storm" ? "Storm" : "Dust"} ${pct}%`
        : "Calm";
    tiles += `<div class="ftile ${risky ? e.type : ""} ${d === game.sol ? "now" : ""}"><small>${d === game.sol ? "Today" : "Day " + d}</small><span>${icon}</span><small>${name}</small></div>`;
  }
  const nx = game.events[game.sol + 1],
    pct = nx ? shownChance(game.sol + 1) : 0;
  const advice =
    game.sol >= game.total
      ? ""
      : nx && pct > 0
        ? nx.type === "storm"
          ? `<div class="advice storm"><b>Storm ${pct}% likely tomorrow (${odds(pct)}).</b> Blocking it all takes ${shelterNeed()} shelter power. Protect, or gamble and use that power elsewhere?</div>`
          : `<div class="advice dust"><b>Dust ${pct}% likely tomorrow (${odds(pct)}).</b> If it comes, power drops to ${Math.max(2, game.tier.dust + lv("panels") + game.discoveries)}. Stock up today, or gamble?</div>`
        : `<div class="advice calm">Tomorrow looks calm. Good time for science.</div>`;
  return `<div class="card"><h2>Forecast</h2><div class="fgrid">${tiles}</div>${advice}
    ${more("odds", "What does % mean?", `<p class="fact">Forecasts are never certain. 70% means a storm comes about 7 times out of 10. Real space weather forecasters work with chances like this every day.${game.warning ? " Your satellite makes the numbers sharper." : ""}</p>`)}</div>`;
}

function quizCard() {
  const d = game.sol,
    Q = QUIZ[game.quizOrder[(d - 1) % QUIZ.length]],
    res = game.quizRes[d];
  if (res)
    return `<div class="act"><b>Question from Earth</b><p class="fact">${res.ok ? "Correct! +1 research point." : "Not quite. The answer is: " + Q.right + "."} ${Q.why}</p></div>`;
  if (!game.quizOpts[d])
    game.quizOpts[d] = [Q.right, ...Q.wrong].sort(() => Math.random() - 0.5);
  return `<div class="act"><b>Quick question from Earth</b> <small>(+1 research point)</small><p>${Q.q}</p>
    ${game.quizOpts[d].map((o, i) => `<button class="opt" onclick="answerQuiz(${i})">${o}</button>`).join("")}</div>`;
}
function answerQuiz(i) {
  const d = game.sol,
    Q = QUIZ[game.quizOrder[(d - 1) % QUIZ.length]];
  const ok = game.quizOpts[d][i] === Q.right;
  game.quizRes[d] = { ok };
  if (ok) game.science++;
  render();
}

function roverButton() {
  if (game.roverDay === game.sol)
    return `<div class="act"><b>Rover</b><p class="fact">The rover is charging. Send it again tomorrow.</p></div>`;
  return `<button class="item" onclick="startRover()" ${used() >= power() ? "disabled" : ""}>${ic("rover")} Rover sample mission<br><small>Costs 1 power. Tap rocks to earn up to 4 research points.</small></button>`;
}
function startRover() {
  if (used() >= power() || game.roverDay === game.sol) return;
  game.roverDay = game.sol;
  game.bonus[game.sol] = (game.bonus[game.sol] || 0) - 1; // the rover uses 1 power
  render();
  let left = 10,
    got = 0;
  const box =
    popup(`<h2>Rover sample mission</h2><p>Tap the rocks before they roll away!</p>
    <p class="count">⏱<b>${left}</b>s · Samples: <span id="got">0</span></p><div class="arena"></div>`);
  const arena = box.querySelector(".arena"),
    gotEl = box.querySelector("#got"),
    num = box.querySelector(".count b");
  const sp = setInterval(() => {
    const r = document.createElement("button");
    r.className = "rock";
    r.textContent = "🪨";
    r.style.left = Math.random() * 80 + "%";
    r.style.top = Math.random() * 75 + "%";
    r.onclick = () => {
      got++;
      gotEl.textContent = got;
      r.remove();
    };
    arena.appendChild(r);
    setTimeout(() => r.remove(), 1300);
  }, 650);
  const t = setInterval(() => {
    left--;
    num.textContent = left;
    if (left > 0) return;
    clearInterval(t);
    clearInterval(sp);
    const pts = Math.min(4, Math.floor(got / 2));
    game.science += pts;
    box.querySelector(".alert").innerHTML = `<h2>${got} samples collected!</h2>
      <p>${pts ? "+" + pts + " research points!" : "No points this time. Try again tomorrow!"}</p>
      <p class="fact">Real rovers like Curiosity and Perseverance collect rocks to study Mars. Their power is limited too.</p>
      <button class="go" id="ok">Back to base ▶</button>`;
    box.querySelector("#ok").onclick = () => {
      box.remove();
      render();
    };
  }, 1000);
}

/* ---------- NEWS + MESSAGES FROM EARTH ---------- */
// Real facts about Mars and NASA missions. Add your own!
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
    text: "Good morning, crew! Check the forecast before you share out power.",
  },
  {
    from: "Dr. Rivera, solar scientist",
    text: "We watch the Sun every day. Flares can reach Mars fast, so shelter early.",
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
    text: "Tip: spare parts and a calm plan fix most problems. And don’t run one system flat out day after day!",
  },
  {
    from: "Mission Control",
    text: "Remember: radiation dose never goes down. Shelter is cheaper than going home.",
  },
  {
    from: "Chef Amara",
    text: "One greenhouse unit feeds the crew for a day. Plants make a little air too!",
  },
  {
    from: "Mission Control",
    text: "Our messages take minutes to reach you. You are the experts on the ground.",
  },
];

// Messages react to what is happening in the game.
function todaysMessages() {
  const tt = threat(game.sol),
    nx = threat(game.sol + 1),
    MC = { from: "Mission Control" };
  const pt = tt ? shownChance(game.sol) : 0,
    pn = nx ? shownChance(game.sol + 1) : 0;
  let hot = null;
  if (tt?.type === "storm" && pt > 0)
    hot = {
      ...MC,
      text: `RADIATION WATCH! Our sensors say a ${pt}% chance of a storm today. Is the shelter worth the power?`,
      urgent: true,
    };
  else if (nx?.type === "storm" && pn > 0)
    hot = {
      ...MC,
      text: `Our solar scouts spotted a flare. There is a ${pn}% chance it reaches you tomorrow. Plan your shelter power.`,
      urgent: true,
    };
  else if (nx?.type === "dust" && pn > 0)
    hot = {
      ...MC,
      text: `A dust cloud is rolling in (${pn}% likely tomorrow). Sunshine would be weak. Stock up today?`,
      urgent: true,
    };
  else if (game.air <= 3)
    hot = {
      ...MC,
      text: "Your air is getting low. Put more power into life support!",
      urgent: true,
    };
  else if (game.food <= 3)
    hot = {
      ...MC,
      text: "Food is low. Don’t forget the greenhouse!",
      urgent: true,
    };
  else if (game.dose >= 6)
    hot = {
      ...MC,
      text: "Your radiation dose is high. Spend more time in the shelter.",
      urgent: true,
    };
  const list = [
    hot || MESSAGES[game.sol % MESSAGES.length],
    MESSAGES[(game.sol + 3) % MESSAGES.length],
  ];
  return list.map((m, i) => ({ ...m, ago: DELAYS[(game.sol + i) % 4] }));
}
const msgHTML = (m) =>
  `<div class="msg ${m.urgent ? "urgent" : ""}"><span class="av" style="background:${AVC[m.from.length % 4]}">${m.from[0]}</span><div><b>${m.from}</b><p>${m.text}</p><small>Sent ${m.ago} ago</small></div></div>`;

// One collapsible card with messages + two news facts. Shows a "!" when a message is urgent.
function extras() {
  const msgs = todaysMessages();
  const news = [0, 1].map((i) => NEWS[(game.sol * 3 + i) % NEWS.length]);
  return fold(
    "news",
    "From Earth &amp; news",
    msgs.map(msgHTML).join("") +
      news.map((l) => `<p class="headline">${l}</p>`).join(""),
    msgs[0].urgent ? '<span class="dot">!</span>' : "",
  );
}

function projection() {
  const a = game.alloc,
    thr = threat(game.sol);
  return {
    air: -CONFIG.crewAir + 2 * a.L + a.G,
    food: -CONFIG.crewFood + (2 + lv("seeds")) * a.G,
    dose: a.S ? 0 : 0.25,
    risk: thr?.type === "storm" ? stormHit(a.S) : 0, // extra radiation IF the storm hits
  };
}
// Little picture of the base. Lights turn on when you give a building power.
function scene() {
  const a = game.alloc,
    th = threat(game.sol);
  // Dust shows only if it is real. Storm rays show on any storm-risk day (no spoilers).
  const t =
    todayEvent()?.type === "dust"
      ? "dust"
      : th?.type === "storm"
        ? "storm"
        : "";
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

/* ---------- DRAWING THE SCREEN ---------- */
function meter(icon, label, value, max, lowWhen) {
  const low = lowWhen(value);
  return `<div class="meter ${low ? "low" : ""}">
    <div class="icon">${ic(icon)}</div>
    <div class="bar"><i style="width:${Math.max(0, (value / max) * 100)}%"></i></div>
    <div class="label">${label} ${fmt(value)}/${max}</div></div>`;
}

function render() {
  if (game.result) return renderEnd();
  const ev = todayEvent(),
    thr = threat(game.sol),
    p = power();

  // Today's event (short, with the NASA fact tucked away)
  let eventCard = "";
  if (thr?.type === "storm") {
    const pct = shownChance(game.sol),
      need = shelterNeed();
    eventCard = `<div class="card warn"><h2>${ic("dose")} Storm risk today: ${pct}%</h2>
      <p>It is ${odds(pct)}. Blocking it all takes <b>${need}</b> shelter power. Skip it and you are gambling.</p>
      ${more("fact", "Real NASA fact", `<p class="fact"><b>${thr.data.title}.</b> ${thr.data.fact}</p>`)}</div>`;
  }
  if (ev?.type === "dust")
    eventCard = `<div class="card warn"><h2>${ic("dust")} ${ev.data.title}</h2>
      <p>Power drops to <b>${p} units</b> today.</p>
      ${more("fact", "Real NASA fact", `<p class="fact">${ev.data.fact}</p>`)}</div>`;

  const cells = Array.from(
    {
      length: Math.max(p, CONFIG.normalPower + lv("panels") + game.discoveries),
    },
    (_, i) =>
      `<div class="cell ${i < used() ? "on" : ""} ${i >= p ? "dead" : ""}"></div>`,
  ).join("");

  const sgn = (n) => (n > 0 ? "+" + n : n < 0 ? "−" + Math.abs(n) : "0");
  const pr = projection();
  const proj = `<div class="proj"><b>Result:</b>
    <span class="${pr.air < 0 ? "neg" : "pos"}">${ic("L")} Air ${sgn(pr.air)}</span>
    <span class="${pr.food < 0 ? "neg" : "pos"}">${ic("food")} Food ${sgn(pr.food)}</span>
    <span class="${pr.dose > 0 ? "neg" : "pos"}">${ic("dose")} Rad ${sgn(pr.dose)}</span>
    ${pr.risk > 0 ? `<span class="neg">${ic("dose")} +${pr.risk} more if the storm hits</span>` : ""}</div>`;

  const systems = SYSTEMS.map(
    (s) => `
    <div class="mod m-${s.key}" title="${s.hint}">
      <div class="mh">${ic(s.key)}<b>${s.name}</b></div>
      <div class="stepper">
        <button onclick="change('${s.key}',-1)" aria-label="Less power to ${s.name}" ${game.alloc[s.key] === 0 ? "disabled" : ""}>−</button>
        <span>${game.alloc[s.key]}</span>
        <button onclick="change('${s.key}',1)" aria-label="More power to ${s.name}" ${used() >= p || game.alloc[s.key] >= 4 ? "disabled" : ""}>+</button>
      </div>
      ${game.strain[s.key] >= 1 && game.strain[s.key] < CONFIG.strainDays ? `<small class="hotnote">Running hot! Full power again will overheat it.</small>` : ""}
    </div>`,
  ).join("");

  // The hints live here, so the tiles stay small
  const help = more(
    "sys",
    "What does each system do?",
    SYSTEMS.map((s) => `<p class="fact"><b>${s.name}:</b> ${s.hint}</p>`).join(
      "",
    ) +
      `<p class="fact"><b>Radiation</b> never goes down. At ${CONFIG.doseLimit}, the crew must go home.</p>` +
      `<p class="fact"><b>Overheating:</b> a system at full power ${CONFIG.strainDays} days in a row breaks (${CONFIG.strainPenalty} less power next day).</p>` +
      `<p class="fact"><b>Discoveries:</b> every ${CONFIG.discoveryEvery} research points gives +1 power for the rest of the mission (max ${CONFIG.maxDiscoveries}). You have ${game.discoveries}.</p>` +
      `<p class="fact"><b>Cargo on this mission:</b> ${game.cargo.map(nameOf).join(", ") || "nothing packed"}.</p>`,
  );

  // How many bonus activities are still open today (shown as a small number)
  const bonusLeft =
    (game.quizRes[game.sol] ? 0 : 1) + (game.roverDay === game.sol ? 0 : 1);

  const left = p - used();
  const why = game.penaltyWhy[game.sol] || [];

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
          <span>${ic("R")} ${game.science} pts${game.discoveries ? ` · +${game.discoveries} power` : ""}</span>
        </div>
        <div class="progress"><i style="width:${(game.sol / game.total) * 100}%"></i></div>
        <div class="meters">
          ${meter("L", "Air", game.air, game.maxStock, (v) => v <= 3)}
          ${meter("food", "Food", game.food, game.maxStock, (v) => v <= 3)}
          ${meter("dose", "Radiation", game.dose, CONFIG.doseLimit, (v) => v >= 6)}
        </div>
      </div>
      ${game.penalty[game.sol] ? `<div class="card warn"><b>${game.penalty[game.sol]} less power today</b> because ${why.join(" and ")}.</div>` : ""}
      ${eventCard}
      ${forecastStrip()}
    </div>

    <div class="col">
      <div class="card">
        ${scene()}
        <div class="powerhead"><h2>Power ${used()} / ${p}</h2><div class="cells">${cells}</div></div>
        <div class="mods">${systems}</div>
        ${proj}
        ${help}
        ${game.battery > 0 && game.batteryDay !== game.sol ? `<button class="item" onclick="useBattery()">${ic("battery")} Use battery pack (+3 power today)</button>` : ""}
        <button class="go" onclick="runSol()" ${left > 0 ? "disabled" : ""}>${left > 0 ? `Use ${left} more power to run the day` : `Run Day ${game.sol} ▶`}</button>
      </div>
      ${fold("bonus", "Bonus activities", quizCard() + roverButton(), bonusLeft ? `<span class="pill">${bonusLeft}</span>` : "")}
      ${extras()}
    </div>
  </div>`;
}

// Best and worst moments of the mission, with the day they happened
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

function renderEnd() {
  app.className = "";
  const win = game.result === "win";
  const nxt = tierInfo(save.level);
  const msg = {
    win: `Mission ${game.level + 1} cleared! ${game.science} research points.`,
    air: "The air ran out.",
    food: "The food ran out.",
    dose: "The crew reached the radiation limit and had to go home.",
  }[game.result];
  const chk = (ok, text) =>
    `<p class="chk ${ok ? "ok" : "no"}">${ok ? "✔" : "✖"} ${text}</p>`;

  let result;
  if (win) {
    const nextLine = game.unlocked
      ? `Unlocked: <b>Mission ${nxt.level + 1}</b>, ${nxt.days} days. It will be harder!`
      : save.level >= CONFIG.maxLevel
        ? "That was the final mission tier. Replay it to earn more stars."
        : "Replaying an old mission. Your next mission is still waiting.";
    result = `<div class="card news"><h2>Stars: <span class="stars">${starsStr(game.stars)}</span></h2>
      ${chk(true, `Survived all ${game.total} days`)}
      ${chk(game.okDose, `Radiation under ${fmt(CONFIG.doseLimit * 0.3)} (you had ${fmt(game.dose)})`)}
      ${chk(game.okSci, `${game.goal}+ research points (you had ${game.science})`)}
      <p>You earned <b>${game.earned}</b> points and now have <b>${save.points}</b> to spend.</p>
      <p>${nextLine}</p></div>`;
  } else {
    result = `<div class="card news"><h2>You earned ${game.earned} research points</h2>
      <p>You now have <b>${save.points}</b> to spend.</p>
      <p>You stay on <b>Mission ${nxt.level + 1}</b> (${nxt.days} days) until you clear it. Try packing different cargo!</p></div>`;
  }

  app.innerHTML = `
    <h1>${msg}</h1>
    ${result}
    ${debriefHTML()}
    ${fold(
      "learn",
      "What you learned",
      `<p><b>Power is limited.</b> Every unit for science was a unit not used to stay safe.</p>
      <p><b>Forecasts are chances, not promises.</b> Mission planners watch NASA’s DONKI database for flares, then decide when to shelter and when to risk it.</p>
      <p><b>Mars can surprise you.</b> Dust storms cut solar power, like the one in 2018 that stopped the Opportunity rover.</p>
      <p><b>Help is far away.</b> Signals between Earth and Mars take 3 to 22 minutes, so crews decide on their own.</p>
      <p><b>Everything is connected.</b> Pushing one system too hard breaks it, and a tired crew makes less power.</p>
      <p><b>Cargo is limited.</b> A rocket can only carry so much, so crews choose what to bring.</p>`,
    )}
    <button class="go" onclick="showMenu()">Cargo &amp; upgrades</button>
    <button class="go alt" onclick="startMission()">${win ? "Start Mission " + (nxt.level + 1) + " now" : "Try again now"}</button>
    <button class="go alt" onclick="showMain()">◀ Main menu</button>`;
}

/* ---------- ANIMATION EXTRAS (safe to delete: the game works without it) ---------- */
(function () {
  const reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $$ = (sel) => Array.from(app.querySelectorAll(sel));
  let enterTimer = 0;

  // Confetti for wins and discoveries
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

  // Slide the screen's cards in one after another
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

  // Looping animations restart on every redraw. This keeps them in step so they do not jump.
  const SYNC = [
    ".rays",
    '.scene circle[cx="505"]',
    '.scene.dust rect[fill="#b8742f"]',
    ".ftile.storm .ic",
    ".ftile.dust .ic",
    ".card.warn",
    ".dot",
    ".hotnote",
    ".col button.go:not(:disabled):not(.alt)",
    ".meter.low .icon",
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

  // ----- Game screen -----
  let last = { g: null };
  const origRender = window.render;
  window.render = function () {
    const same = last.g === game;
    const barsBefore = same
      ? $$(".meter .bar i, .progress i").map((b) => b.style.width)
      : [];
    const stepsBefore = $$(".stepper span").map((s) => s.textContent);
    const onBefore = $$(".cell.on").length;

    origRender.apply(this, arguments);

    const g = game;
    const sameDay = same && last.sol === g.sol;
    if (!reduce) {
      if (!same || !sameDay || (g.result && !last.result)) stagger();

      if (same && !g.result) {
        // Bars slide from their old value to the new one
        const now = $$(".meter .bar i, .progress i");
        if (now.length === barsBefore.length)
          now.forEach((b, i) => {
            const to = b.style.width;
            b.style.width = barsBefore[i];
            void b.offsetWidth;
            b.style.width = to;
          });
        // Meters flash when they change
        const m = $$(".meter");
        const vals = [g.air, g.food, g.dose];
        const prev = [last.air, last.food, last.dose];
        vals.forEach((v, i) => {
          if (m[i] && prev[i] !== undefined && v !== prev[i]) {
            const better = i === 2 ? v < prev[i] : v > prev[i];
            m[i].classList.add(better ? "gain" : "loss");
          }
        });
        // Power cells and stepper numbers react to the player's clicks
        if (sameDay) {
          $$(".stepper span").forEach((s, i) => {
            if (
              stepsBefore[i] !== undefined &&
              stepsBefore[i] !== s.textContent
            )
              s.classList.add("pop");
          });
          $$(".cell.on").forEach((c, i) => {
            if (i >= onBefore) c.classList.add("fresh");
          });
        }
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

  // ----- Pop-ups -----
  const origPopup = window.popup;
  window.popup = function (html) {
    const box = origPopup.call(this, html);
    const al = box.querySelector(".alert");
    if (!al) return box;
    if (!reduce) {
      [".rep li", ".chips .chip", ".choice"].forEach((sel) =>
        Array.from(box.querySelectorAll(sel)).forEach((el, i) =>
          el.style.setProperty("--i", i),
        ),
      );
      if (al.querySelector("li.bad, .g-bad")) al.classList.add("shake");
      if (html.indexOf("Discovery!") >= 0) setTimeout(() => confetti(26), 450);
    }
    // Emergency countdown: tick each second, glow red in the last 3 seconds
    const num = box.querySelector(".timer ~ .count b");
    if (num)
      new MutationObserver(() => {
        num.classList.remove("tick");
        void num.offsetWidth;
        num.classList.add("tick");
        if (+num.textContent <= 3) al.classList.add("urgent");
      }).observe(num, { childList: true, characterData: true, subtree: true });
    return box;
  };

  // ----- Menu screens -----
  ["showMain", "showMenu", "showHow"].forEach((name) => {
    const orig = window[name];
    window[name] = function (a) {
      const r = orig.apply(this, arguments);
      last = { g: null };
      // Buying or packing redraws the menu. Do not replay the entrance for that.
      if (!(name === "showMenu" && a === true)) stagger();
      return r;
    };
  });
})();

showMain();
