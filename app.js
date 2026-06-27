const STORAGE_KEY = 'cmo_media_tracker_v2';
const SHARED_DATA_URL = 'data/schedule.json';
const APP_VERSION = '3';
const DEFAULT_COMPLETE_LEAD_DAYS = 7;

/** fetch / localStorage 両方失敗時のフォールバック（file:// 直開き対策） */
const FALLBACK_DATA = {
  version: 3,
  updated: '2026-06-27',
  timezone: 'Asia/Tokyo',
  alerts: { complete_lead_days: 7 },
  slots: [
    { id: '2026-07-01-ronin_pop', date: '2026-07-01', day: 'wednesday', media: 'ronin_pop', status: 'in_progress', progress: 80, topic: '7/1 Ronin Pop — 編集仕上げ残り', owner: 'Tak', complete_by: '2026-06-24' },
    { id: '2026-07-02-note', date: '2026-07-02', day: 'thursday', media: 'note', status: 'draft_done', time: '07:00', topic: '原稿完成済み', owner: 'Tak', complete_by: '2026-06-25' },
    { id: '2026-07-03-medium', date: '2026-07-03', day: 'friday', media: 'medium', status: 'needs_translation', note_ref: '2026-07-02', topic: '7/2 note の英訳', owner: 'media-producer → Tak確認', complete_by: '2026-06-26' },
    { id: '2026-07-03-kanri', date: '2026-07-03', day: 'friday', media: 'kanri', status: 'planned', topic: '', owner: 'Tak', complete_by: '2026-06-26' },
  ],
};

const MEDIA_LABELS = {
  note: 'note',
  medium: 'Medium',
  ronin_pop: 'Ronin Pop',
  kanri: 'みうらくんと管理人',
  youtube: 'Ronin Pop', // 旧データ互換
};

const DAY_LABELS = {
  monday: '月', tuesday: '火', wednesday: '水',
  thursday: '木', friday: '金', saturday: '土', sunday: '日',
};

/** 週次リズム（金曜は Medium + 管理人の2枠） */
const CADENCE = [
  { day: 'monday', media: 'note', label: '月' },
  { day: 'tuesday', media: 'medium', label: '火' },
  { day: 'wednesday', media: 'ronin_pop', label: '水' },
  { day: 'thursday', media: 'note', label: '木' },
  { day: 'friday', media: 'medium', label: '金', sub: 'Medium' },
  { day: 'friday', media: 'kanri', label: '金', sub: '管理人' },
];

const STATUS_OPTIONS = {
  note: [
    { id: 'planned', label: '企画待ち' },
    { id: 'drafting', label: '執筆中' },
    { id: 'draft_done', label: '原稿完成' },
    { id: 'published', label: '公開済み' },
    { id: 'skipped', label: 'スキップ' },
  ],
  medium: [
    { id: 'planned', label: '予定' },
    { id: 'needs_translation', label: '英訳待ち' },
    { id: 'translating', label: '英訳中' },
    { id: 'review', label: '確認待ち' },
    { id: 'published', label: '公開済み' },
    { id: 'skipped', label: 'スキップ' },
  ],
  ronin_pop: [
    { id: 'planned', label: '企画待ち' },
    { id: 'shooting', label: '撮影中' },
    { id: 'editing', label: '編集中' },
    { id: 'in_progress', label: '制作中' },
    { id: 'published', label: '公開済み' },
    { id: 'skipped', label: 'スキップ' },
  ],
  kanri: [
    { id: 'planned', label: '企画待ち' },
    { id: 'shooting', label: '撮影中' },
    { id: 'editing', label: '編集中' },
    { id: 'in_progress', label: '制作中' },
    { id: 'published', label: '公開済み' },
    { id: 'skipped', label: 'スキップ' },
  ],
  youtube: [ // 旧データ互換
    { id: 'planned', label: '企画待ち' },
    { id: 'in_progress', label: '制作中' },
    { id: 'published', label: '公開済み' },
    { id: 'skipped', label: 'スキップ' },
  ],
};

const DONE_STATUSES = new Set(['published', 'skipped']);

const TODAY = startOfDay(new Date());
let data = null;
let activeTab = 'week';
let editingId = null;

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDisplay(str) {
  const d = parseDate(str);
  if (!d) return '—';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function dayNameFromDate(str) {
  const names = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return names[parseDate(str).getDay()];
}

function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
}

function ensureSlotIds(slots) {
  return slots.map(s => ({
    ...s,
    id: s.id || `${s.date}-${s.media}`,
  }));
}

function normalizeData(raw) {
  const lead = raw.alerts?.complete_lead_days ?? DEFAULT_COMPLETE_LEAD_DAYS;
  const slots = ensureSlotIds(raw.slots || []).map(s => {
    const media = s.media === 'youtube' ? 'ronin_pop' : s.media;
    const id = s.id?.replace('-youtube', '-ronin_pop') || `${s.date}-${media}`;
    const progress = s.progress == null ? null : Number(String(s.progress).replace('%', '')) || 0;
    let complete_by = s.complete_by;
    if (!complete_by && s.date) {
      const d = parseDate(s.date);
      d.setDate(d.getDate() - lead);
      complete_by = fmtDate(d);
    }
    return { ...s, media, id, progress, complete_by };
  });
  slots.sort((a, b) => a.date.localeCompare(b.date) || a.media.localeCompare(b.media));
  return {
    ...raw,
    version: raw.version || 3,
    slots,
    alerts: { complete_lead_days: lead, ...raw.alerts },
    updated: raw.updated || new Date().toISOString().slice(0, 10),
  };
}

function applyFallbackData(reason) {
  data = normalizeData(structuredClone(FALLBACK_DATA));
  setSaveStatus(reason || '初期データ');
}

function getCompleteLeadDays() {
  return data?.alerts?.complete_lead_days ?? DEFAULT_COMPLETE_LEAD_DAYS;
}

function getCompleteBy(slot) {
  if (slot.complete_by) return slot.complete_by;
  const d = parseDate(slot.date);
  d.setDate(d.getDate() - getCompleteLeadDays());
  return fmtDate(d);
}

function getSlot(id) {
  return data.slots.find(s => s.id === id);
}

function isDone(slot) {
  return DONE_STATUSES.has(slot.status);
}

function statusLabel(slot) {
  const opts = STATUS_OPTIONS[slot.media] || [];
  return opts.find(o => o.id === slot.status)?.label || slot.status;
}

function persist() {
  if (!data) return;
  data.updated = new Date().toISOString().slice(0, 10);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  setSaveStatus('保存済み', true);
}

function setSaveStatus(text, saved = false) {
  const el = document.getElementById('save-status');
  el.textContent = text;
  el.classList.toggle('saved', saved);
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2200);
}

async function loadSharedData() {
  setSaveStatus('更新中…');
  try {
    const res = await fetch(`${SHARED_DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    const server = normalizeData(await res.json());
    const localRaw = localStorage.getItem(STORAGE_KEY);
    if (localRaw) {
      const local = JSON.parse(localRaw);
      const localTs = Date.parse(local.updated || 0) || 0;
      const serverTs = Date.parse(server.updated || 0) || 0;
      if (localTs > serverTs && local.slots?.length) {
        data = normalizeData(local);
        setSaveStatus('ローカル優先');
        render();
        return;
      }
    }
    data = server;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setSaveStatus('サーバーから読込', true);
  } catch {
    const localRaw = localStorage.getItem(STORAGE_KEY);
    if (localRaw) {
      try {
        data = normalizeData(JSON.parse(localRaw));
        setSaveStatus('ローカルから読込');
      } catch {
        applyFallbackData('データ修復（初期値）');
      }
    } else {
      applyFallbackData('初期データ（ローカルサーバー推奨）');
    }
  }
  render();
}

function exportJSON() {
  persist();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cmo-schedule-${data.updated || 'export'}.json`;
  a.click();
  toast('JSONをダウンロードしました');
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      data = normalizeData(JSON.parse(reader.result));
      persist();
      render();
      toast('取込完了');
    } catch {
      toast('JSONの形式が不正です');
    }
  };
  reader.readAsText(file);
}

function getWeekStart(d = TODAY) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function getWeekSlots(weekStart) {
  const end = new Date(weekStart);
  end.setDate(end.getDate() + 6);
  const startStr = fmtDate(weekStart);
  const endStr = fmtDate(end);
  return data.slots.filter(s => s.date >= startStr && s.date <= endStr);
}

function getUpcomingSlots(limit = 8) {
  const todayStr = fmtDate(TODAY);
  return data.slots
    .filter(s => s.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

function isVideoMedia(media) {
  return media === 'ronin_pop' || media === 'kanri' || media === 'youtube';
}

function getAlerts() {
  const alerts = [];
  for (const slot of data.slots) {
    if (isDone(slot)) continue;
    const publishDiff = daysBetween(TODAY, parseDate(slot.date));
    const completeBy = getCompleteBy(slot);
    const completeDiff = daysBetween(TODAY, parseDate(completeBy));
    let urgency = 'normal';
    let title = '';
    let desc = '';

    if (completeDiff < 0) {
      urgency = 'urgent';
      title = `完成期限超過：${MEDIA_LABELS[slot.media]}（公開 ${fmtDisplay(slot.date)}）`;
      desc = `完成目標 ${fmtDisplay(completeBy)} — ${statusLabel(slot)}`;
    } else if (completeDiff === 0) {
      urgency = 'urgent';
      title = `完成期限・今日：${MEDIA_LABELS[slot.media]}`;
      desc = `公開 ${fmtDisplay(slot.date)} — ${statusLabel(slot)}`;
    } else if (completeDiff <= 2) {
      urgency = 'urgent';
      title = `完成まで${completeDiff}日：${MEDIA_LABELS[slot.media]}`;
      desc = `公開 ${fmtDisplay(slot.date)} — ${statusLabel(slot)}`;
    } else if (publishDiff < 0) {
      urgency = 'urgent';
      title = `公開期限超過：${fmtDisplay(slot.date)} ${MEDIA_LABELS[slot.media]}`;
      desc = statusLabel(slot);
    } else if (publishDiff <= 1) {
      urgency = 'urgent';
      title = `${publishDiff === 0 ? '今日' : '明日'}公開：${MEDIA_LABELS[slot.media]}`;
      desc = statusLabel(slot);
    } else if (slot.status === 'needs_translation') {
      title = `英訳待ち：${fmtDisplay(slot.date)} Medium`;
      desc = slot.note_ref ? `${fmtDisplay(slot.note_ref)} note` : '';
      if (completeDiff <= 5) urgency = 'urgent';
    } else if (isVideoMedia(slot.media) && ['in_progress', 'editing', 'shooting'].includes(slot.status)) {
      title = `制作中：${MEDIA_LABELS[slot.media]}${slot.progress != null ? `（${slot.progress}%）` : ''}`;
      desc = `公開 ${fmtDisplay(slot.date)} / 完成目標 ${fmtDisplay(completeBy)}`;
      if (completeDiff <= 4) urgency = 'urgent';
    } else if (slot.status === 'draft_done' && publishDiff <= 3) {
      title = `公開待ち note：${fmtDisplay(slot.date)}`;
      desc = '原稿完成済み';
      urgency = publishDiff <= 1 ? 'urgent' : 'normal';
    } else if (slot.status === 'planned' && completeDiff <= 5) {
      title = `未着手：${MEDIA_LABELS[slot.media]}（公開 ${fmtDisplay(slot.date)}）`;
      desc = `完成目標 ${fmtDisplay(completeBy)}`;
      if (completeDiff <= 3) urgency = 'urgent';
    } else {
      continue;
    }

    alerts.push({ slot, urgency, title, desc, diff: publishDiff, completeDiff });
  }
  alerts.sort((a, b) => {
    const u = { urgent: 0, normal: 1 };
    if (u[a.urgency] !== u[b.urgency]) return u[a.urgency] - u[b.urgency];
    return a.completeDiff - b.completeDiff;
  });
  return alerts;
}

function renderCadenceBar() {
  const todayName = dayNameFromDate(fmtDate(TODAY));
  document.getElementById('cadence-bar').innerHTML = CADENCE.map(c => `
    <div class="cadence-chip ${c.day === todayName ? 'is-today' : ''}">
      <strong>${c.label}</strong>
      ${c.sub || MEDIA_LABELS[c.media]}
    </div>
  `).join('');
}

function slotCardHTML(slot, { showProgress = true } = {}) {
  const d = parseDate(slot.date);
  const diff = daysBetween(TODAY, d);
  const completeBy = getCompleteBy(slot);
  const completeDiff = daysBetween(TODAY, parseDate(completeBy));
  const publishOverdue = diff < 0 && !isDone(slot);
  const completeOverdue = completeDiff < 0 && !isDone(slot);
  const isToday = diff === 0;
  const done = isDone(slot);
  const progressHTML = showProgress && isVideoMedia(slot.media) && slot.status === 'in_progress' && slot.progress != null
    ? `<div class="progress-bar"><div class="progress-fill" style="width:${slot.progress}%"></div></div><span>${slot.progress}%</span>`
    : '';
  const completeClass = completeOverdue ? 'complete-overdue' : (completeDiff <= 2 ? 'complete-soon' : '');

  return `
    <article class="slot-card media-${slot.media} ${publishOverdue || completeOverdue ? 'is-overdue' : ''} ${isToday ? 'is-today' : ''} ${done ? 'is-done' : ''}"
             data-id="${slot.id}" role="button" tabindex="0">
      <div class="slot-top">
        <span class="slot-date">${fmtDisplay(slot.date)}<span class="slot-day">${DAY_LABELS[slot.day] || ''}</span></span>
        <span class="media-badge ${slot.media}">${MEDIA_LABELS[slot.media]}</span>
      </div>
      <div class="slot-topic ${slot.topic ? '' : 'empty'}">${slot.topic || '（トピック未設定）'}</div>
      <div class="slot-meta">
        <span class="status-pill status-${slot.status}">${statusLabel(slot)}</span>
        ${progressHTML}
        ${slot.note_ref ? `<span>↳ note ${fmtDisplay(slot.note_ref)}</span>` : ''}
        <span class="complete-by ${completeClass}">完成目標 ${fmtDisplay(completeBy)}</span>
      </div>
    </article>
  `;
}

function bindSlotCards(root) {
  root.querySelectorAll('.slot-card').forEach(el => {
    const open = () => openModal(el.dataset.id);
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  });
}

function renderWeek() {
  const weekStart = getWeekStart();
  const weekSlots = getWeekSlots(weekStart);
  const displaySlots = weekSlots.length ? weekSlots : getUpcomingSlots(8);
  const weekLabel = weekSlots.length
    ? `${weekStart.getMonth() + 1}/${weekStart.getDate()} 週`
    : '次の投稿';
  const urgentCount = getAlerts().filter(a => a.urgency === 'urgent').length;

  let html = `<div class="kpi-grid">
    <div class="kpi"><div class="kpi-val">${displaySlots.length}</div><div class="kpi-label">${weekSlots.length ? '今週の枠' : '直近の枠'}</div></div>
    <div class="kpi ${displaySlots.filter(s => isDone(s)).length === displaySlots.length && displaySlots.length ? 'ok' : ''}"><div class="kpi-val">${displaySlots.filter(s => isDone(s)).length}</div><div class="kpi-label">完了</div></div>
    <div class="kpi ${urgentCount ? 'danger' : ''}"><div class="kpi-val">${urgentCount}</div><div class="kpi-label">要対応</div></div>
    <div class="kpi"><div class="kpi-val">${displaySlots.filter(s => !isDone(s)).length}</div><div class="kpi-label">残り</div></div>
  </div>`;

  if (!weekSlots.length && displaySlots.length) {
    html += `<p class="week-hint">今週（カレンダー週）に枠はありません。直近の投稿を表示しています。</p>`;
  }

  html += `<div class="section-title">${weekLabel}</div>`;
  if (!displaySlots.length) {
    html += `<div class="empty-state">投稿枠がありません。「＋ 週を追加」で生成できます。</div>`;
  } else {
    html += displaySlots.map(s => slotCardHTML(s)).join('');
  }
  return html;
}

function renderAlerts() {
  const alerts = getAlerts();
  let html = `<div class="kpi-grid">
    <div class="kpi danger"><div class="kpi-val">${alerts.filter(a => a.urgency === 'urgent').length}</div><div class="kpi-label">緊急</div></div>
    <div class="kpi"><div class="kpi-val">${alerts.length}</div><div class="kpi-label">アラート計</div></div>
  </div>`;

  if (!alerts.length) {
    html += `<div class="empty-state">🔔 現在アラートはありません</div>`;
    return html;
  }

  html += alerts.map(a => `
    <div class="alert-card ${a.urgency}" data-id="${a.slot.id}" role="button" tabindex="0">
      <div class="alert-title">${a.title}</div>
      <div class="alert-desc">${a.desc}</div>
    </div>
  `).join('');
  return html;
}

function renderMonth() {
  const ym = document.getElementById('month-picker')?.value;
  const [year, month] = (ym || `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}`).split('-').map(Number);
  const first = new Date(year, month - 1, 1);
  const startPad = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const gridStart = new Date(first);
  gridStart.setDate(gridStart.getDate() - startPad);

  const monthSlots = data.slots.filter(s => {
    const d = parseDate(s.date);
    return d.getFullYear() === year && d.getMonth() === month - 1;
  });
  const slotsByDate = {};
  monthSlots.forEach(s => {
    if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
    slotsByDate[s.date].push(s);
  });

  let html = `<div class="fg" style="max-width:200px;margin-bottom:12px">
    <label for="month-picker">表示月</label>
    <input type="month" id="month-picker" value="${year}-${String(month).padStart(2, '0')}">
  </div>`;

  html += '<div class="month-grid">';
  ['月', '火', '水', '木', '金', '土', '日'].forEach(d => { html += `<div class="month-hd">${d}</div>`; });

  for (let i = 0; i < 42; i++) {
    const cell = new Date(gridStart);
    cell.setDate(cell.getDate() + i);
    const ds = fmtDate(cell);
    const daySlots = slotsByDate[ds] || [];
    const other = cell.getMonth() !== month - 1;
    const isToday = ds === fmtDate(TODAY);
    html += `<div class="month-cell ${other ? 'other-month' : ''} ${isToday ? 'is-today' : ''}" data-date="${ds}">
      <div class="month-num">${cell.getDate()}</div>
      ${daySlots.map(s => `<span class="month-dot ${s.media}">${MEDIA_LABELS[s.media]}</span>`).join('')}
    </div>`;
  }
  html += '</div>';
  return html;
}

function renderList() {
  const upcoming = data.slots.filter(s => !isDone(s) || daysBetween(parseDate(s.date), TODAY) <= 7);
  let html = `<div class="list-table-wrap"><table class="list-table"><thead><tr>
    <th>日付</th><th>媒体</th><th>トピック</th><th>ステータス</th><th>進捗</th>
  </tr></thead><tbody>`;
  for (const s of upcoming.length ? upcoming : data.slots) {
    html += `<tr data-id="${s.id}">
      <td>${fmtDisplay(s.date)} (${DAY_LABELS[s.day] || ''})</td>
      <td>${MEDIA_LABELS[s.media]}</td>
      <td>${s.topic || '—'}</td>
      <td>${statusLabel(s)}</td>
      <td>${isVideoMedia(s.media) && s.progress != null ? s.progress + '%' : '—'}</td>
    </tr>`;
  }
  html += '</tbody></table></div>';
  return html;
}

function renderDash() {
  const total = data.slots.length;
  const done = data.slots.filter(isDone).length;
  const published = data.slots.filter(s => s.status === 'published').length;
  const overdue = data.slots.filter(s => daysBetween(TODAY, parseDate(s.date)) < 0 && !isDone(s)).length;

  const byMedia = { note: [], medium: [], ronin_pop: [], kanri: [] };
  data.slots.forEach(s => {
    const key = s.media === 'youtube' ? 'ronin_pop' : s.media;
    if (byMedia[key]) byMedia[key].push(s);
  });

  let html = `<div class="kpi-grid">
    <div class="kpi ok"><div class="kpi-val">${published}</div><div class="kpi-label">公開済み</div></div>
    <div class="kpi"><div class="kpi-val">${done}/${total}</div><div class="kpi-label">完了率</div></div>
    <div class="kpi ${overdue ? 'danger' : ''}"><div class="kpi-val">${overdue}</div><div class="kpi-label">期限超過</div></div>
    <div class="kpi"><div class="kpi-val">${getAlerts().length}</div><div class="kpi-label">アラート</div></div>
  </div>`;

  for (const [media, slots] of Object.entries(byMedia)) {
    const pub = slots.filter(s => s.status === 'published').length;
    html += `<div class="section-title">${MEDIA_LABELS[media]}（${pub}/${slots.length} 公開）</div>`;
    html += slots.slice(-5).map(s => slotCardHTML(s)).join('');
  }
  return html;
}

function render() {
  if (!data?.slots) {
    document.getElementById('main').innerHTML =
      '<div class="empty-state">データを読み込めませんでした。<button type="button" class="btn btn-primary" onclick="loadSharedData()">再読込</button></div>';
    return;
  }
  renderCadenceBar();
  const main = document.getElementById('main');
  const renderers = {
    week: renderWeek,
    alerts: renderAlerts,
    month: renderMonth,
    list: renderList,
    dash: renderDash,
  };
  main.innerHTML = renderers[activeTab]();
  bindSlotCards(main);
  main.querySelectorAll('.alert-card').forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.id));
  });
  main.querySelectorAll('.list-table tr[data-id]').forEach(el => {
    el.addEventListener('click', () => openModal(el.dataset.id));
  });
  main.querySelectorAll('.month-cell[data-date]').forEach(el => {
    el.addEventListener('click', () => {
      const daySlots = data.slots.filter(s => s.date === el.dataset.date);
      if (daySlots.length === 1) openModal(daySlots[0].id);
      else if (daySlots.length > 1) {
        activeTab = 'list';
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'list'));
        render();
      }
    });
  });
  const mp = document.getElementById('month-picker');
  if (mp) mp.addEventListener('change', () => render());
}

function openModal(id) {
  editingId = id;
  const slot = getSlot(id);
  if (!slot) return;
  const statuses = STATUS_OPTIONS[slot.media] || [];

  document.getElementById('modal-title').textContent =
    `${fmtDisplay(slot.date)} ${MEDIA_LABELS[slot.media]}`;

  const completeBy = getCompleteBy(slot);
  let body = `
    <p class="modal-rule">公開 ${fmtDisplay(slot.date)} / 完成目標 ${fmtDisplay(completeBy)}（1週間前）</p>
    <div class="fg"><label>トピック</label><input type="text" id="m-topic" value="${esc(slot.topic || '')}"></div>
    <div class="fg"><label>ステータス</label>
      <select id="m-status">${statuses.map(o =>
        `<option value="${o.id}" ${o.id === slot.status ? 'selected' : ''}>${o.label}</option>`
      ).join('')}</select>
    </div>
  `;

  if (isVideoMedia(slot.media)) {
    body += `<div class="fg"><label>進捗（%）</label><input type="number" id="m-progress" min="0" max="100" value="${slot.progress ?? ''}"></div>`;
  }
  if (slot.media === 'medium') {
    body += `<div class="fg"><label>対応 note 日付</label><input type="date" id="m-note-ref" value="${slot.note_ref || ''}"></div>`;
  }
  body += `<div class="fg"><label>メモ</label><textarea id="m-note">${esc(slot.note || '')}</textarea></div>`;

  document.getElementById('modal-body').innerHTML = body;
  document.getElementById('overlay').hidden = false;
  document.getElementById('btn-delete-slot').hidden = false;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function closeModal() {
  document.getElementById('overlay').hidden = true;
  editingId = null;
}

function saveModal() {
  const slot = getSlot(editingId);
  if (!slot) return;
  slot.topic = document.getElementById('m-topic').value.trim();
  slot.status = document.getElementById('m-status').value;
  slot.note = document.getElementById('m-note').value.trim();
  if (isVideoMedia(slot.media)) {
    const p = document.getElementById('m-progress').value;
    slot.progress = p === '' ? null : Math.min(100, Math.max(0, Number(p)));
  }
  if (slot.media === 'medium') {
    slot.note_ref = document.getElementById('m-note-ref').value || null;
  }
  persist();
  closeModal();
  render();
  toast('保存しました');
}

function deleteSlot() {
  if (!editingId || !confirm('この枠を削除しますか？')) return;
  data.slots = data.slots.filter(s => s.id !== editingId);
  persist();
  closeModal();
  render();
  toast('削除しました');
}

function addWeek() {
  if (!data?.slots) return;
  const last = data.slots[data.slots.length - 1];
  let weekStart = getWeekStart();
  if (last) {
    const lastDate = parseDate(last.date);
    weekStart = getWeekStart(new Date(lastDate.getTime() + 7 * 86400000));
  }

  const newSlots = [];
  for (const c of CADENCE) {
    const d = new Date(weekStart);
    const dayIdx = { monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4 }[c.day];
    d.setDate(d.getDate() + dayIdx);
    const dateStr = fmtDate(d);
    if (data.slots.some(s => s.date === dateStr && s.media === c.media)) continue;

    const slot = {
      id: `${dateStr}-${c.media}`,
      date: dateStr,
      day: c.day,
      media: c.media,
      status: 'planned',
      topic: '',
      owner: (c.media === 'note' || isVideoMedia(c.media)) ? 'Tak' : 'media-producer → Tak確認',
    };
    const pub = parseDate(dateStr);
    pub.setDate(pub.getDate() - getCompleteLeadDays());
    slot.complete_by = fmtDate(pub);
    if (c.media === 'note') slot.time = '07:00';
    if (c.media === 'medium') {
      const noteDay = c.day === 'tuesday' ? 0 : 3;
      const noteDate = new Date(weekStart);
      noteDate.setDate(noteDate.getDate() + noteDay);
      slot.note_ref = fmtDate(noteDate);
    }
    newSlots.push(slot);
  }

  if (!newSlots.length) {
    toast('追加する枠がありません');
    return;
  }
  data.slots.push(...newSlots);
  data.slots.sort((a, b) => a.date.localeCompare(b.date));
  persist();
  render();
  toast(`${newSlots.length}件の枠を追加しました`);
}

function init() {
  document.getElementById('today-label').textContent =
    `${TODAY.getFullYear()}/${TODAY.getMonth() + 1}/${TODAY.getDate()}`;

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      render();
    });
  });

  document.getElementById('btn-sync').addEventListener('click', loadSharedData);
  document.getElementById('btn-export').addEventListener('click', exportJSON);
  document.getElementById('import-file').addEventListener('change', e => {
    if (e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btn-add-week').addEventListener('click', addWeek);
  document.getElementById('btn-close-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  document.getElementById('btn-save-modal').addEventListener('click', saveModal);
  document.getElementById('btn-delete-slot').addEventListener('click', deleteSlot);
  document.getElementById('overlay').addEventListener('click', e => {
    if (e.target.id === 'overlay') closeModal();
  });

  loadSharedData();
}

init();
