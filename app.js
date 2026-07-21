"use strict";

/* ---------- Storage ---------- */

const STORAGE_KEY = "habit-tracker-v1";

const EMOJIS = ["✅", "💪", "📚", "🏃", "🧘", "💧", "🥗", "😴", "✍️", "🎸", "🧠", "🚭", "💊", "🌱", "🧹", "💻"];
const SLOT_COUNT = 8;

// Legacy hex colors (v1 data) → palette slot
const LEGACY_COLOR_SLOTS = {
  "#39d353": 4, "#2f81f7": 1, "#a371f7": 5, "#f778ba": 7,
  "#f0883e": 8, "#e3b341": 3, "#33b3ae": 2, "#f85149": 6,
};

function hueVar(slot) {
  return `var(--hue-${slot})`;
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.habits)) return migrate(parsed);
    }
  } catch (e) { /* corrupted data falls through to fresh state */ }
  return { version: 2, habits: [] };
}

function migrate(data) {
  for (const h of data.habits) {
    if (typeof h.color === "string") h.color = LEGACY_COLOR_SLOTS[h.color] || 1;
    if (!h.color || h.color < 1 || h.color > SLOT_COUNT) h.color = 1;
  }
  data.version = 2;
  return data;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function nextFreeSlot() {
  const used = new Set(state.habits.map((h) => h.color));
  for (let s = 1; s <= SLOT_COUNT; s++) if (!used.has(s)) return s;
  return ((state.habits.length) % SLOT_COUNT) + 1;
}

/* ---------- Date helpers (all local time) ---------- */

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function today() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function prettyDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/* ---------- Stats ---------- */

function habitStats(habit) {
  const log = habit.log;
  const t = today();

  let current = 0;
  // Today not done yet doesn't break the streak — start counting from yesterday in that case.
  let cursor = log[toKey(t)] ? t : addDays(t, -1);
  while (log[toKey(cursor)]) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const doneKeys = Object.keys(log).filter((k) => log[k]).sort();
  let best = 0, run = 0, prev = null;
  for (const key of doneKeys) {
    if (prev !== null && key === toKey(addDays(prev, 1))) run++;
    else run = 1;
    best = Math.max(best, run);
    const [y, m, d] = key.split("-").map(Number);
    prev = new Date(y, m - 1, d);
  }

  const monthPrefix = toKey(t).slice(0, 8);
  const monthCount = doneKeys.filter((k) => k.startsWith(monthPrefix)).length;
  const monthDays = t.getDate();

  let done30 = 0;
  for (let i = 0; i < 30; i++) if (log[toKey(addDays(t, -i))]) done30++;

  return { current, best, total: doneKeys.length, monthCount, monthDays, rate30: Math.round((done30 / 30) * 100) };
}

function globalStats() {
  const t = today();
  const todayKey = toKey(t);
  const total = state.habits.length;
  const todayDone = state.habits.filter((h) => h.log[todayKey]).length;

  let perfectDays = 0;
  for (let i = 0; i < 365; i++) {
    const key = toKey(addDays(t, -i));
    const existing = state.habits.filter((h) => !h.createdAt || h.createdAt <= key);
    if (existing.length && existing.every((h) => h.log[key])) perfectDays++;
  }

  let checkins = 0, bestStreak = 0;
  for (const h of state.habits) {
    const s = habitStats(h);
    checkins += s.total;
    bestStreak = Math.max(bestStreak, s.best);
  }

  return { total, todayDone, perfectDays, checkins, bestStreak };
}

/* ---------- Heatmap: current calendar year (Jan–Dec), no horizontal scroll ---------- */

const CELL_GAP = 3;
const MIN_CELL = 8; // below this, split the year into two stacked half-year rows

function weekCols(segStart, segEnd) {
  const start = addDays(segStart, -segStart.getDay());
  return Math.round((addDays(segEnd, 6 - segEnd.getDay()) - start) / (7 * 86400000)) + 1;
}

function buildSegment(wrap, segStart, segEnd, cellClassFor, onToggle) {
  const t = today();
  const todayKey = toKey(t);
  const start = addDays(segStart, -segStart.getDay());
  const end = addDays(segEnd, 6 - segEnd.getDay());
  const cols = weekCols(segStart, segEnd);

  // Month labels: label the week containing each month's 1st.
  const months = document.createElement("div");
  months.className = "hm-months";
  months.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  let lastLabelCol = -3;
  for (let w = 0; w < cols; w++) {
    const weekStart = addDays(start, w * 7);
    const weekEnd = addDays(weekStart, 6);
    const isNewMonth = weekStart.getMonth() !== weekEnd.getMonth() || weekStart.getDate() === 1;
    // Only label months whose 1st actually falls inside this segment (padding weeks spill into neighbors).
    const firstOfMonth = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), 1);
    if (isNewMonth && firstOfMonth >= segStart && firstOfMonth <= segEnd && w - lastLabelCol >= 3 && w <= cols - 2) {
      const label = document.createElement("span");
      label.textContent = MONTHS[weekEnd.getMonth()];
      label.style.gridColumn = `${w + 1} / span 3`;
      months.appendChild(label);
      lastLabelCol = w;
    }
  }

  const grid = document.createElement("div");
  grid.className = "heatmap";
  const frag = document.createDocumentFragment();

  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const key = toKey(d);
    const cell = document.createElement(onToggle ? "button" : "span");
    cell.className = "hm-cell";
    if (d < segStart || d > segEnd) {
      cell.classList.add("pad"); // filler day outside the segment, keeps week columns aligned
    } else if (d > t) {
      cell.classList.add("future");
    } else {
      const cls = cellClassFor(key);
      if (cls) cell.classList.add(cls);
      if (key === todayKey) cell.classList.add("today");
      cell.title = prettyDate(key);
      if (onToggle) {
        cell.type = "button";
        cell.setAttribute("aria-label", prettyDate(key));
        cell.addEventListener("click", () => onToggle(key));
      }
    }
    frag.appendChild(cell);
  }
  grid.appendChild(frag);
  wrap.append(months, grid);
}

function buildHeatmap(wrap, cellClassFor, onToggle) {
  wrap.textContent = "";
  const year = today().getFullYear();
  const jan1 = new Date(year, 0, 1);
  const jun30 = new Date(year, 5, 30);
  const jul1 = new Date(year, 6, 1);
  const dec31 = new Date(year, 11, 31);

  const width = wrap.clientWidth || 300;
  const fullCols = weekCols(jan1, dec31);
  const cellPx = (width - (fullCols - 1) * CELL_GAP) / fullCols;

  if (cellPx >= MIN_CELL) {
    buildSegment(wrap, jan1, dec31, cellClassFor, onToggle);
  } else {
    buildSegment(wrap, jan1, jun30, cellClassFor, onToggle);
    buildSegment(wrap, jul1, dec31, cellClassFor, onToggle);
  }
}

/* ---------- Rendering ---------- */

const habitList = document.getElementById("habitList");
const emptyState = document.getElementById("emptyState");
const overviewCard = document.getElementById("overviewCard");
const overviewHeatmap = document.getElementById("overviewHeatmap");
const overviewSubtitle = document.getElementById("overviewSubtitle");
const globalTiles = document.getElementById("globalTiles");
const ringFill = document.getElementById("ringFill");
const ringText = document.getElementById("ringText");

function tile(value, label, unit) {
  const el = document.createElement("div");
  el.className = "tile";
  const v = document.createElement("span");
  v.className = "tile-value";
  v.textContent = value;
  if (unit) {
    const u = document.createElement("span");
    u.className = "unit";
    u.textContent = ` ${unit}`;
    v.appendChild(u);
  }
  const l = document.createElement("span");
  l.className = "tile-label";
  l.textContent = label;
  el.append(v, l);
  return el;
}

function render() {
  const has = state.habits.length > 0;
  emptyState.hidden = has;
  overviewCard.hidden = !has;
  if (has) renderOverview();
  renderHabits();
}

function renderOverview() {
  const g = globalStats();

  const frac = g.total ? g.todayDone / g.total : 0;
  const C = 2 * Math.PI * 26;
  ringFill.style.strokeDasharray = `${frac * C} ${C}`;
  ringText.textContent = `${Math.round(frac * 100)}%`;

  const t = today();
  overviewSubtitle.textContent = `${g.todayDone} of ${g.total} done · ${MONTHS[t.getMonth()]} ${t.getDate()}`;

  globalTiles.textContent = "";
  globalTiles.append(
    tile(g.perfectDays, "Perfect days"),
    tile(g.checkins, "Check-ins"),
    tile(g.bestStreak, "Best streak", g.bestStreak === 1 ? "day" : "days"),
  );

  buildHeatmap(overviewHeatmap, (key) => {
    const done = state.habits.reduce((n, h) => n + (h.log[key] ? 1 : 0), 0);
    if (done === 0) return "";
    return `l${Math.max(1, Math.ceil((done / state.habits.length) * 4))}`;
  }, null);
}

function renderHabits() {
  habitList.textContent = "";
  const todayKey = toKey(today());

  for (const habit of state.habits) {
    const card = document.createElement("section");
    card.className = "card habit-card";
    card.style.setProperty("--hue", hueVar(habit.color));

    const s = habitStats(habit);
    const doneToday = !!habit.log[todayKey];

    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `
      <div class="habit-title">
        <span class="emoji-chip"></span>
        <span class="habit-name"></span>
      </div>
      <div class="habit-meta">
        <span class="streak-badge ${s.current > 0 ? "hot" : ""}">🔥 ${s.current}</span>
        <button class="edit-link" type="button">Edit</button>
      </div>`;
    head.querySelector(".emoji-chip").textContent = habit.emoji;
    head.querySelector(".habit-name").textContent = habit.name;
    head.querySelector(".edit-link").addEventListener("click", () => openHabitDialog(habit));

    const tiles = document.createElement("div");
    tiles.className = "stat-tiles";
    tiles.append(
      tile(s.current, "Streak", s.current === 1 ? "day" : "days"),
      tile(s.best, "Best", s.best === 1 ? "day" : "days"),
      tile(`${s.monthCount}/${s.monthDays}`, "Month"),
      tile(`${s.rate30}%`, "30 days"),
    );

    const wrap = document.createElement("div");
    wrap.className = "heatmap-wrap";

    const foot = document.createElement("div");
    foot.className = "card-foot";
    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "check-btn" + (doneToday ? " done" : "");
    checkBtn.innerHTML = `<span class="ring-dot"></span><span>${doneToday ? "Done today" : "Mark today"}</span>`;
    checkBtn.addEventListener("click", () => toggleDay(habit, todayKey));
    foot.appendChild(checkBtn);

    card.append(head, tiles, wrap, foot);
    habitList.appendChild(card);

    // Card is in the DOM now, so the wrap has a real width to size the grid against.
    buildHeatmap(wrap, (key) => (habit.log[key] ? "done" : ""), (key) => toggleDay(habit, key));
  }
}

function toggleDay(habit, key) {
  const marking = !habit.log[key];
  if (marking) habit.log[key] = true;
  else delete habit.log[key];
  saveState();
  render();

  if (marking && key === toKey(today())) {
    const s = habitStats(habit);
    toast(s.current > 1 ? `🔥 ${s.current}-day streak!` : `${habit.emoji} Nice, day one!`);
  }
}

/* ---------- Re-render on resize (heatmap density changes) ---------- */

let lastWidth = 0;
let resizeTimer = null;
const containerEl = document.querySelector(".container");

new ResizeObserver(() => {
  const w = containerEl.clientWidth;
  if (w === lastWidth) return;
  lastWidth = w;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(render, 120);
}).observe(containerEl);

/* ---------- Habit dialog ---------- */

const habitDialog = document.getElementById("habitDialog");
const habitForm = document.getElementById("habitForm");
const dialogTitle = document.getElementById("dialogTitle");
const habitNameInput = document.getElementById("habitName");
const emojiRow = document.getElementById("emojiRow");
const colorRow = document.getElementById("colorRow");
const deleteHabitBtn = document.getElementById("deleteHabitBtn");

let editingHabit = null;
let selectedEmoji = EMOJIS[0];
let selectedSlot = 1;

function buildPickers() {
  emojiRow.textContent = "";
  for (const e of EMOJIS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "emoji-opt" + (e === selectedEmoji ? " selected" : "");
    b.textContent = e;
    b.addEventListener("click", () => { selectedEmoji = e; buildPickers(); });
    emojiRow.appendChild(b);
  }
  colorRow.textContent = "";
  for (let slot = 1; slot <= SLOT_COUNT; slot++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "color-opt" + (slot === selectedSlot ? " selected" : "");
    b.style.background = hueVar(slot);
    b.setAttribute("aria-label", `Color ${slot}`);
    b.addEventListener("click", () => { selectedSlot = slot; buildPickers(); });
    colorRow.appendChild(b);
  }
}

function openHabitDialog(habit) {
  editingHabit = habit || null;
  dialogTitle.textContent = habit ? "Edit habit" : "New habit";
  habitNameInput.value = habit ? habit.name : "";
  selectedEmoji = habit ? habit.emoji : EMOJIS[0];
  selectedSlot = habit ? habit.color : nextFreeSlot();
  deleteHabitBtn.hidden = !habit;
  buildPickers();
  habitDialog.showModal();
  if (!habit) habitNameInput.focus();
}

habitForm.addEventListener("submit", (e) => {
  const name = habitNameInput.value.trim();
  if (!name) { e.preventDefault(); return; }

  if (editingHabit) {
    editingHabit.name = name;
    editingHabit.emoji = selectedEmoji;
    editingHabit.color = selectedSlot;
  } else {
    state.habits.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      emoji: selectedEmoji,
      color: selectedSlot,
      createdAt: toKey(today()),
      log: {},
    });
  }
  saveState();
  render();
});

deleteHabitBtn.addEventListener("click", () => {
  if (!editingHabit) return;
  if (!confirm(`Delete "${editingHabit.name}" and all its history?`)) return;
  state.habits = state.habits.filter((h) => h !== editingHabit);
  saveState();
  habitDialog.close();
  render();
});

document.getElementById("cancelDialogBtn").addEventListener("click", () => habitDialog.close());
document.getElementById("addHabitBtn").addEventListener("click", () => openHabitDialog(null));
document.getElementById("emptyAddBtn").addEventListener("click", () => openHabitDialog(null));

/* ---------- Settings: export / import ---------- */

const settingsDialog = document.getElementById("settingsDialog");
document.getElementById("settingsBtn").addEventListener("click", () => settingsDialog.showModal());
document.getElementById("closeSettingsBtn").addEventListener("click", () => settingsDialog.close());

document.getElementById("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `habits-${toKey(today())}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const importFile = document.getElementById("importFile");
document.getElementById("importBtn").addEventListener("click", () => importFile.click());

importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.habits)) throw new Error("bad format");
    if (!confirm(`Replace current data with ${parsed.habits.length} imported habit(s)?`)) return;
    state = migrate(parsed);
    saveState();
    settingsDialog.close();
    render();
    toast("Data imported");
  } catch (e) {
    toast("Import failed: not a valid backup file");
  } finally {
    importFile.value = "";
  }
});

/* ---------- Toast ---------- */

const toastEl = document.getElementById("toast");
let toastTimer = null;

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2500);
}

/* ---------- Refresh at midnight / on return ---------- */

let renderedFor = toKey(today());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && renderedFor !== toKey(today())) {
    renderedFor = toKey(today());
    render();
  }
});

/* ---------- Service worker ---------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline support unavailable */ });
  });
}

render();
