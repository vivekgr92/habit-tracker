"use strict";

/* ---------- Storage ---------- */

const STORAGE_KEY = "habit-tracker-v1";

const EMOJIS = ["✅", "💪", "📚", "🏃", "🧘", "💧", "🥗", "😴", "✍️", "🎸", "🧠", "🚭", "💊", "🌱", "🧹", "💻"];
const COLORS = ["#39d353", "#2f81f7", "#a371f7", "#f778ba", "#f0883e", "#e3b341", "#33b3ae", "#f85149"];

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.habits)) return parsed;
    }
  } catch (e) { /* corrupted data falls through to fresh state */ }
  return { version: 1, habits: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

/* Start of the heatmap window: the Sunday that begins the week 52 weeks ago (GitHub-style). */
function gridStart() {
  const t = today();
  const start = addDays(t, -364);
  return addDays(start, -start.getDay());
}

/* ---------- Streaks & stats ---------- */

function streaks(log) {
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

  return { current, best, total: doneKeys.length };
}

/* ---------- Rendering ---------- */

const habitList = document.getElementById("habitList");
const emptyState = document.getElementById("emptyState");
const overviewCard = document.getElementById("overviewCard");
const overviewHeatmap = document.getElementById("overviewHeatmap");
const overviewSubtitle = document.getElementById("overviewSubtitle");

function render() {
  const has = state.habits.length > 0;
  emptyState.hidden = has;
  overviewCard.hidden = state.habits.length < 2;

  if (state.habits.length >= 2) renderOverview();
  renderHabits();
}

function buildMonthLabels(container, start, end) {
  const months = document.createElement("div");
  months.className = "hm-months";
  let lastLabelCol = -3;
  for (let d = new Date(start), week = 0; d <= end; d = addDays(d, 7), week++) {
    // Label a week when it contains the 1st of a month (or is the very first week).
    const weekEnd = addDays(d, 6);
    const isNewMonth = d.getDate() <= 7 || d.getMonth() !== weekEnd.getMonth();
    if ((week === 0 || isNewMonth) && week - lastLabelCol >= 3) {
      const label = document.createElement("span");
      label.textContent = MONTHS[weekEnd.getMonth()];
      label.style.gridColumn = `${week + 1} / span 3`;
      months.appendChild(label);
      lastLabelCol = week;
    }
  }
  const prev = container.parentElement.querySelector(".hm-months");
  if (prev) prev.remove();
  container.parentElement.insertBefore(months, container);
}

function buildHeatmap(container, getLevel, onToggle) {
  container.textContent = "";
  const start = gridStart();
  const t = today();
  const todayKey = toKey(t);
  buildMonthLabels(container, start, t);
  const frag = document.createDocumentFragment();

  for (let d = new Date(start); ; d = addDays(d, 1)) {
    const key = toKey(d);
    const cell = document.createElement(onToggle ? "button" : "span");
    cell.className = "hm-cell";
    if (d > t) {
      cell.classList.add("future");
    } else {
      const level = getLevel(key);
      if (level > 0) cell.classList.add(`l${level}`);
      if (key === todayKey) cell.classList.add("today");
      cell.title = prettyDate(key);
      if (onToggle) {
        cell.type = "button";
        cell.setAttribute("aria-label", prettyDate(key));
        cell.addEventListener("click", () => onToggle(key));
      }
    }
    frag.appendChild(cell);
    // Stop once we complete the week that contains today.
    if (d >= t && d.getDay() === 6) break;
  }

  container.appendChild(frag);
  // Show the most recent weeks first.
  requestAnimationFrame(() => {
    const wrap = container.parentElement;
    wrap.scrollLeft = wrap.scrollWidth;
  });
}

function renderOverview() {
  const total = state.habits.length;
  buildHeatmap(overviewHeatmap, (key) => {
    const done = state.habits.reduce((n, h) => n + (h.log[key] ? 1 : 0), 0);
    if (done === 0) return 0;
    return Math.max(1, Math.ceil((done / total) * 4));
  }, null);

  const todayKey = toKey(today());
  const doneToday = state.habits.filter((h) => h.log[todayKey]).length;
  overviewSubtitle.textContent = `${doneToday}/${total} today`;
}

function renderHabits() {
  habitList.textContent = "";
  const todayKey = toKey(today());

  for (const habit of state.habits) {
    const card = document.createElement("section");
    card.className = "card";
    card.style.setProperty("--cell-done", habit.color);

    const s = streaks(habit.log);
    const doneToday = !!habit.log[todayKey];

    const head = document.createElement("div");
    head.className = "card-head";
    head.innerHTML = `
      <div class="habit-title">
        <span class="habit-emoji"></span>
        <span class="habit-name"></span>
      </div>
      <div class="habit-meta">
        <span class="streak-badge ${s.current > 0 ? "hot" : ""}">🔥 ${s.current}</span>
        <button class="edit-link" type="button">Edit</button>
      </div>`;
    head.querySelector(".habit-emoji").textContent = habit.emoji;
    head.querySelector(".habit-name").textContent = habit.name;
    head.querySelector(".edit-link").addEventListener("click", () => openHabitDialog(habit));

    const wrap = document.createElement("div");
    wrap.className = "heatmap-wrap";
    const grid = document.createElement("div");
    grid.className = "heatmap";
    wrap.appendChild(grid);

    buildHeatmap(grid, (key) => (habit.log[key] ? 4 : 0), (key) => toggleDay(habit, key));
    // Tint done cells with the habit's own color.
    grid.style.setProperty("--cell-l4", habit.color);

    const foot = document.createElement("div");
    foot.className = "card-foot";

    const stats = document.createElement("span");
    stats.className = "stats-line";
    stats.textContent = `Best ${s.best} · Total ${s.total}`;

    const checkBtn = document.createElement("button");
    checkBtn.type = "button";
    checkBtn.className = "check-btn" + (doneToday ? " done" : "");
    checkBtn.innerHTML = `<span class="ring"></span><span>${doneToday ? "Done today" : "Mark today"}</span>`;
    if (doneToday) {
      checkBtn.style.background = habit.color;
      checkBtn.style.borderColor = habit.color;
    }
    checkBtn.addEventListener("click", () => toggleDay(habit, todayKey));

    foot.append(stats, checkBtn);
    card.append(head, wrap, foot);
    habitList.appendChild(card);
  }
}

function toggleDay(habit, key) {
  if (habit.log[key]) delete habit.log[key];
  else habit.log[key] = true;
  saveState();
  render();
}

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
let selectedColor = COLORS[0];

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
  for (const c of COLORS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "color-opt" + (c === selectedColor ? " selected" : "");
    b.style.background = c;
    b.setAttribute("aria-label", c);
    b.addEventListener("click", () => { selectedColor = c; buildPickers(); });
    colorRow.appendChild(b);
  }
}

function openHabitDialog(habit) {
  editingHabit = habit || null;
  dialogTitle.textContent = habit ? "Edit habit" : "New habit";
  habitNameInput.value = habit ? habit.name : "";
  selectedEmoji = habit ? habit.emoji : EMOJIS[0];
  selectedColor = habit ? habit.color : COLORS[0];
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
    editingHabit.color = selectedColor;
  } else {
    state.habits.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      name,
      emoji: selectedEmoji,
      color: selectedColor,
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
    state = parsed;
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
