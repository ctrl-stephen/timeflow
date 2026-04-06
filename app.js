'use strict';

/* ── Colour palette ── */
const COLORS = [
  '#7c6af7','#34d399','#f87171','#fbbf24',
  '#60a5fa','#f472b6','#a78bfa','#2dd4bf',
  '#fb923c','#a3e635'
];

/* ── State ── */
let state = {
  activities: [],
  sessions: [],          // completed sessions [{date, splits:[{activityId,name,color,start,duration}]}]
  currentSession: {
    running: false,
    startTs: null,
    elapsed: 0,
    splits: [],
    activeActivityId: null,
    splitStart: null
  },
  nextId: 1,
  newColor: COLORS[0],
  editColor: COLORS[0],
  editingId: null
};

/* ── Persistence ── */
function save() {
  try { localStorage.setItem('tf_state', JSON.stringify(state)); } catch(e){}
}

function load() {
  try {
    const raw = localStorage.getItem('tf_state');
    if (raw) state = JSON.parse(raw);
    // Ensure currentSession exists after load
    if (!state.currentSession) state.currentSession = { running:false, startTs:null, elapsed:0, splits:[], activeActivityId:null, splitStart:null };
    // Reset running state (timer can't survive page close)
    if (state.currentSession.running) {
      // Was running when page closed — accumulate elapsed
      if (state.currentSession.startTs) {
        state.currentSession.elapsed += Date.now() - state.currentSession.startTs;
      }
      if (state.currentSession.activeActivityId && state.currentSession.splitStart) {
        finishSplit(true);
      }
      state.currentSession.running = false;
      state.currentSession.startTs = null;
    }
  } catch(e) { console.warn('Load failed', e); }
}

/* ── Helpers ── */
function pad(n){ return String(Math.floor(n)).padStart(2,'0'); }

function fmtMs(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

function fmtMsLong(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDayLabel(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short' });
}

function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay()+6)%7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime()-week1.getTime())/86400000 - 3 + (week1.getDay()+6)%7)/7);
}

function activityById(id) { return state.activities.find(a => a.id === id); }

function liveElapsed() {
  if (!state.currentSession.running) return state.currentSession.elapsed;
  return state.currentSession.elapsed + (Date.now() - state.currentSession.startTs);
}

function liveSplitMs() {
  if (!state.currentSession.running || !state.currentSession.splitStart) return 0;
  return Date.now() - state.currentSession.splitStart;
}

function getTotalsToday() {
  const totals = {};
  state.currentSession.splits.forEach(s => {
    totals[s.activityId] = (totals[s.activityId] || 0) + s.duration;
  });
  if (state.currentSession.activeActivityId && state.currentSession.running) {
    const id = state.currentSession.activeActivityId;
    totals[id] = (totals[id] || 0) + liveSplitMs();
  }
  return totals;
}

function getWeekTotals() {
  const totals = {};
  const now = new Date();
  const thisWeek = getWeekNumber(now);
  const thisYear = now.getFullYear();

  state.sessions.forEach(session => {
    const d = new Date(session.date);
    if (getWeekNumber(d) === thisWeek && d.getFullYear() === thisYear) {
      session.splits.forEach(s => {
        totals[s.activityId] = (totals[s.activityId] || 0) + s.duration;
        if (!totals[`__name_${s.activityId}`]) {
          totals[`__name_${s.activityId}`] = s.name;
          totals[`__color_${s.activityId}`] = s.color;
        }
      });
    }
  });
  // Also add current session
  const todayTotals = getTotalsToday();
  Object.entries(todayTotals).forEach(([id, ms]) => {
    totals[id] = (totals[id] || 0) + ms;
    const act = activityById(Number(id));
    if (act && !totals[`__name_${id}`]) {
      totals[`__name_${id}`] = act.name;
      totals[`__color_${id}`] = act.color;
    }
  });
  return totals;
}

/* ── Session control ── */
function toggleSession() {
  const cs = state.currentSession;
  if (!cs.running) {
    cs.running = true;
    cs.startTs = Date.now();
    if (cs.activeActivityId && !cs.splitStart) cs.splitStart = Date.now();
  } else {
    cs.elapsed += Date.now() - cs.startTs;
    cs.running = false;
    cs.startTs = null;
    if (cs.activeActivityId && cs.splitStart) finishSplit(true);
  }
  save();
  renderAll();
}

function finishSplit(clearActive) {
  const cs = state.currentSession;
  if (!cs.activeActivityId || !cs.splitStart) return;
  const duration = Date.now() - cs.splitStart;
  if (duration >= 1000) {
    const act = activityById(cs.activeActivityId);
    cs.splits.push({
      activityId: cs.activeActivityId,
      name: act ? act.name : 'Unknown',
      color: act ? act.color : '#888',
      start: cs.splitStart,
      duration
    });
  }
  cs.splitStart = null;
  if (clearActive) cs.activeActivityId = null;
}

function selectActivity(id) {
  const cs = state.currentSession;
  if (!cs.running) return;
  if (cs.activeActivityId === id) return; // already active
  if (cs.activeActivityId && cs.splitStart) finishSplit(false);
  cs.activeActivityId = id;
  cs.splitStart = Date.now();
  save();
  renderTracker();
}

function commitSession() {
  const cs = state.currentSession;
  if (cs.splits.length === 0 && cs.elapsed === 0) return;
  state.sessions.push({
    date: Date.now(),
    duration: cs.elapsed,
    splits: [...cs.splits]
  });
  state.currentSession = { running:false, startTs:null, elapsed:0, splits:[], activeActivityId:null, splitStart:null };
}

function confirmReset() {
  openConfirm(
    'Reset session?',
    'This clears the current session timer. All logged time is saved to history.',
    () => {
      if (state.currentSession.running) toggleSession();
      commitSession();
      save();
      renderAll();
    }
  );
}

/* ── Activities CRUD ── */
function addActivity() {
  const name = document.getElementById('new-name').value.trim();
  if (!name) { document.getElementById('new-name').focus(); return; }
  const target = parseFloat(document.getElementById('new-target').value) || 0;
  state.activities.push({ id: state.nextId++, name, color: state.newColor, target, active: true });
  document.getElementById('new-name').value = '';
  document.getElementById('new-target').value = '';
  save();
  renderAll();
}

let deleteConfirmId = null;

function openEdit(id) {
  const act = activityById(id);
  if (!act) return;
  state.editingId = id;
  state.editColor = act.color;
  document.getElementById('edit-name').value = act.name;
  document.getElementById('edit-target').value = act.target || '';
  document.getElementById('edit-active').checked = act.active !== false;
  renderColorPicker('edit-color-picker', 'editColor', state.editColor);
  document.getElementById('edit-modal').classList.add('open');
}

function saveEdit() {
  const act = activityById(state.editingId);
  if (!act) return;
  const newName = document.getElementById('edit-name').value.trim();
  if (!newName) return;
  // Preserve old name in historical splits if name changed
  if (newName !== act.name) {
    state.sessions.forEach(session => {
      session.splits.forEach(s => {
        if (s.activityId === act.id) s.name = act.name; // keep old name in history
      });
    });
  }
  act.name = newName;
  act.target = parseFloat(document.getElementById('edit-target').value) || 0;
  act.active = document.getElementById('edit-active').checked;
  act.color = state.editColor;
  closeEditModal();
  save();
  renderAll();
}

function deleteActivity() {
  openConfirm(
    'Delete activity?',
    'Historical records will be preserved under the original name. This cannot be undone.',
    () => {
      // Preserve name in historical data
      const act = activityById(state.editingId);
      state.sessions.forEach(session => {
        session.splits.forEach(s => {
          if (s.activityId === state.editingId && act) s.name = act.name;
        });
      });
      state.activities = state.activities.filter(a => a.id !== state.editingId);
      if (state.currentSession.activeActivityId === state.editingId) {
        if (state.currentSession.splitStart) finishSplit(true);
        state.currentSession.activeActivityId = null;
      }
      closeEditModal();
      save();
      renderAll();
    }
  );
}

/* ── Color picker ── */
function renderColorPicker(containerId, stateKey, selectedColor) {
  const container = document.getElementById(containerId);
  container.innerHTML = COLORS.map(c =>
    `<div class="color-swatch${c===selectedColor?' selected':''}" style="background:${c};"
      onclick="selectColor('${containerId}','${stateKey}','${c}')"></div>`
  ).join('');
}

function selectColor(containerId, stateKey, color) {
  state[stateKey] = color;
  renderColorPicker(containerId, stateKey, color);
}

/* ── Modal helpers ── */
function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  state.editingId = null;
}

function closeModal(e) {
  if (e.target.classList.contains('modal-overlay')) closeEditModal();
}

let confirmCallback = null;

function openConfirm(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent = msg;
  confirmCallback = cb;
  document.getElementById('confirm-ok').onclick = () => { closeConfirm(); if(confirmCallback) confirmCallback(); };
  document.getElementById('confirm-modal').classList.add('open');
}

function closeConfirm(e) {
  if (e && e.target && !e.target.classList.contains('modal-overlay') && !e.target.classList.contains('btn-modal-cancel')) return;
  document.getElementById('confirm-modal').classList.remove('open');
}

/* ── Render ── */
function renderAll() {
  renderHeader();
  renderSessionBar();
  renderTracker();
  renderSummary();
  renderHistory();
  renderSettings();
}

function renderHeader() {
  const wk = getWeekNumber(new Date());
  document.getElementById('week-label').textContent = `Week ${wk}`;
  const elapsed = liveElapsed();
  const clock = document.getElementById('session-clock');
  const s = Math.floor(elapsed / 1000);
  clock.textContent = `${pad(Math.floor(s/3600))}:${pad(Math.floor((s%3600)/60))}:${pad(s%60)}`;
  clock.className = 'session-clock' + (state.currentSession.running ? ' running' : '');
}

function renderSessionBar() {
  const cs = state.currentSession;
  const dot = document.getElementById('session-dot');
  const status = document.getElementById('session-status');
  const btn = document.getElementById('toggle-btn');

  if (cs.running) {
    dot.className = 'session-dot running';
    status.textContent = 'Session running';
    btn.textContent = 'Pause';
    btn.className = 'btn-session stop';
  } else if (cs.elapsed > 0 || cs.splits.length > 0) {
    dot.className = 'session-dot paused';
    status.textContent = 'Session paused';
    btn.textContent = 'Resume';
    btn.className = 'btn-session';
  } else {
    dot.className = 'session-dot';
    status.textContent = 'Ready to start';
    btn.textContent = 'Start';
    btn.className = 'btn-session';
  }
}

function renderTracker() {
  const cs = state.currentSession;
  const activeAct = activityById(cs.activeActivityId);
  const card = document.getElementById('current-card');
  const timerEl = document.getElementById('current-timer');

  if (activeAct && cs.running) {
    card.className = 'current-activity-card active-card';
    card.innerHTML = `
      <div class="current-label">Currently tracking</div>
      <div class="current-name" style="color:${activeAct.color}">${activeAct.name}</div>
      <div class="current-timer" id="current-timer" style="color:${activeAct.color}">${fmtMs(liveSplitMs())}</div>
      <div class="current-hint">Tap another activity to switch</div>`;
  } else {
    card.className = 'current-activity-card';
    card.innerHTML = cs.running
      ? `<div class="current-label">No activity selected</div><div class="current-timer" id="current-timer" style="color:var(--text3)">—</div><div class="current-hint">Tap an activity below to start</div>`
      : `<div class="current-label">Session not running</div><div class="current-timer" style="color:var(--text3)">—</div><div class="current-hint">Press Start to begin your session</div>`;
  }

  const totals = getTotalsToday();
  const activeOnly = state.activities.filter(a => a.active !== false);
  const grid = document.getElementById('activity-grid');
  grid.innerHTML = activeOnly.map(act => {
    const isActive = act.id === cs.activeActivityId && cs.running;
    const dur = totals[act.id] || 0;
    return `<div class="activity-tile${isActive?' active-tile':''}" 
        style="${isActive?`border-color:${act.color};`:''}"
        onclick="selectActivity(${act.id})">
      <div class="tile-color-bar" style="background:${act.color};opacity:${isActive?1:0.5};"></div>
      <div class="tile-name">${act.name}</div>
      <div>
        ${isActive
          ? `<div class="tile-live"><div class="tile-live-dot" style="background:${act.color};"></div><div class="tile-live-label" style="color:${act.color};">Live</div></div>`
          : `<div class="tile-time">${dur>0?fmtMs(dur):'—'}</div>`}
      </div>
    </div>`;
  }).join('');
}

function renderSummary() {
  const totals = getTotalsToday();
  const weekTotals = getWeekTotals();
  const totalMs = Object.values(totals).reduce((a,b)=>a+b,0);

  document.getElementById('summary-total').textContent =
    totalMs > 0 ? fmtMsLong(totalMs) + ' tracked' : '0m tracked';

  const sumList = document.getElementById('summary-list');
  const withTime = state.activities.filter(a => (totals[a.id]||0) > 0);

  if (withTime.length === 0) {
    sumList.innerHTML = '<div class="empty-state">No activity tracked yet today.<br>Start a session and select an activity.</div>';
  } else {
    sumList.innerHTML = withTime.map(act => {
      const ms = totals[act.id] || 0;
      const targetMs = (act.target || 0) * 3600000;
      const pct = targetMs > 0 ? Math.min(120, Math.round(ms / targetMs * 100)) : null;
      const diff = targetMs > 0 ? ms - targetMs : null;
      let deltaHtml = '';
      if (diff !== null) {
        const sign = diff >= 0 ? '+' : '−';
        const cls = diff > 600000 ? 'delta-over' : diff < -600000 ? 'delta-under' : 'delta-ok';
        deltaHtml = `<span class="summary-delta ${cls}">${sign}${fmtMsLong(Math.abs(diff))}</span>`;
      }
      return `<div class="summary-item">
        <div class="summary-item-header">
          <div class="summary-item-name"><div class="summary-dot" style="background:${act.color};"></div>${act.name}</div>
          <div class="summary-item-time" style="color:${act.color};">${fmtMs(ms)}</div>
        </div>
        ${pct!==null?`<div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100,pct)}%;background:${pct>100?'var(--red)':'var(--green)}"></div></div>`:''}
        <div class="summary-item-footer">
          <div class="summary-target">${act.target?`Target: ${act.target}h/week`:''}</div>
          ${deltaHtml}
        </div>
      </div>`;
    }).join('');
  }

  // Week totals
  const weekList = document.getElementById('week-list');
  const weekIds = Object.keys(weekTotals).filter(k => !k.startsWith('__')).map(Number);
  if (weekIds.length === 0) {
    weekList.innerHTML = '<div class="empty-state">No data this week yet.</div>';
  } else {
    weekList.innerHTML = weekIds.map(id => {
      const ms = weekTotals[id];
      const act = activityById(id);
      const name = act ? act.name : (weekTotals[`__name_${id}`] || 'Unknown');
      const color = act ? act.color : (weekTotals[`__color_${id}`] || '#888');
      const target = act ? (act.target || 0) : 0;
      const targetMs = target * 3600000;
      const pct = targetMs > 0 ? Math.min(120, Math.round(ms / targetMs * 100)) : null;
      const diff = targetMs > 0 ? ms - targetMs : null;
      let deltaHtml = '';
      if (diff !== null) {
        const sign = diff >= 0 ? '+' : '−';
        const cls = diff > 1800000 ? 'delta-over' : diff < -1800000 ? 'delta-under' : 'delta-ok';
        deltaHtml = `<span class="summary-delta ${cls}">${sign}${fmtMsLong(Math.abs(diff))}</span>`;
      }
      return `<div class="summary-item">
        <div class="summary-item-header">
          <div class="summary-item-name"><div class="summary-dot" style="background:${color};"></div>${name}</div>
          <div class="summary-item-time" style="color:${color};">${fmtMsLong(ms)}</div>
        </div>
        ${pct!==null?`<div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100,pct)}%;background:${pct>100?'var(--red)':'var(--green)'}"></div></div>`:''}
        <div class="summary-item-footer">
          <div class="summary-target">${target?`Target: ${target}h/week`:''}</div>
          ${deltaHtml}
        </div>
      </div>`;
    }).join('');
  }
}

function renderHistory() {
  const list = document.getElementById('history-list');
  // Group current session splits + saved sessions
  const allSplits = [];

  // Current session
  state.currentSession.splits.forEach(s => {
    allSplits.push({ ...s, sessionDate: Date.now() });
  });

  // Saved sessions (newest first)
  [...state.sessions].reverse().forEach(sess => {
    sess.splits.forEach(s => allSplits.push({ ...s, sessionDate: sess.date }));
  });

  if (allSplits.length === 0) {
    list.innerHTML = '<div class="empty-state">No history yet.<br>Complete a session to see it here.</div>';
    return;
  }

  // Group by day
  const byDay = {};
  allSplits.forEach(s => {
    const d = new Date(s.start || s.sessionDate);
    const key = d.toDateString();
    if (!byDay[key]) byDay[key] = { label: fmtDayLabel(d.getTime()), ts: d.getTime(), splits: [] };
    byDay[key].splits.push(s);
  });

  list.innerHTML = Object.values(byDay)
    .sort((a,b) => b.ts - a.ts)
    .map(day => `
    <div class="history-day">
      <div class="history-day-label">${day.label}</div>
      ${[...day.splits].reverse().map(s => `
        <div class="history-split">
          <div class="split-left">
            <div class="split-dot" style="background:${s.color};"></div>
            <div>
              <div class="split-name">${s.name}</div>
              ${s.start?`<div class="split-time-label">${fmtTime(s.start)}</div>`:''}
            </div>
          </div>
          <div class="split-duration">${fmtMs(s.duration)}</div>
        </div>`).join('')}
    </div>`).join('');
}

function renderSettings() {
  renderColorPicker('color-picker', 'newColor', state.newColor);
  const list = document.getElementById('settings-list');
  if (state.activities.length === 0) {
    list.innerHTML = '<div class="empty-state">No activities yet. Add one below.</div>';
    return;
  }
  list.innerHTML = state.activities.map(act => `
    <div class="settings-item${act.active===false?' inactive':''}">
      <div class="settings-dot" style="background:${act.color};"></div>
      <div class="settings-item-info">
        <div class="settings-item-name">${act.name}</div>
        <div class="settings-item-meta">${act.target?`${act.target}h/week target · `:''}${act.active===false?'Hidden from tracker':'Active'}</div>
      </div>
      <button class="btn-edit" onclick="openEdit(${act.id})">Edit</button>
    </div>`).join('');
}

/* ── Tab switching ── */
function showTab(tab, el) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  if (el) el.classList.add('active');
  if (tab === 'summary') renderSummary();
  if (tab === 'history') renderHistory();
  if (tab === 'settings') renderSettings();
}

/* ── Tick loop ── */
let tickInterval = null;

function startTick() {
  if (tickInterval) return;
  tickInterval = setInterval(() => {
    if (state.currentSession.running) {
      renderHeader();
      renderTracker();
    }
  }, 1000);
}

/* ── Seed default activities ── */
function seedDefaults() {
  if (state.activities.length > 0) return;
  const defaults = [
    { name:'Meetings', color: COLORS[0], target: 8 },
    { name:'Project delivery', color: COLORS[1], target: 10 },
    { name:'Emails & admin', color: COLORS[2], target: 4 },
    { name:'Strategic work', color: COLORS[3], target: 6 },
    { name:'1:1s & coaching', color: COLORS[4], target: 3 },
  ];
  defaults.forEach(d => {
    state.activities.push({ id: state.nextId++, ...d, active: true });
  });
}

/* ── Init ── */
load();
seedDefaults();
renderAll();
startTick();

/* ── Service worker registration ── */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.log('SW:', e));
  });
}
