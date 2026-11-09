const API_BASE_URL = (window.GYMNI_API_BASE_URL || '').replace(/\/+$/, '');
const PAGE_SIZE = 100;
const state = {
  records: [],
  loaded: false,
  editingRecord: null,
  type: 'food',
  filter: 'all',
  view: 'overview',
  saving: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function parseRecord(log) {
  try {
    const data = JSON.parse(log.content);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return { ...log, data };
  } catch (error) {
    console.warn(`Skipping log ${log.id}: content is not valid JSON.`, error);
    return null;
  }
}

function logDate(record) {
  if (typeof record.data.date === 'string') return record.data.date;
  const timestamp = new Date(record.timestamp);
  return Number.isNaN(timestamp.getTime()) ? '' : localDate(timestamp);
}

function logTime(record) {
  if (typeof record.data.time === 'string') return record.data.time;
  const timestamp = new Date(record.timestamp);
  return Number.isNaN(timestamp.getTime())
    ? ''
    : timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
}

function setConnection(status, message) {
  const pill = $('#connection-pill');
  pill.dataset.status = status;
  $('#connection-label').textContent = message;
  $('#sidebar-connection').textContent = message;
  $('#sidebar-connection-dot').dataset.status = status;
  pill.querySelector('.connection-dot').dataset.status = status;
}

function showToast(message, isError = false) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.toggle('is-error', isError);
  toast.classList.add('is-visible');
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove('is-visible'), 3600);
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error(`Could not reach the Gymni API. Check the API URL and network connection. ${error.message}`);
  }

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`The Gymni API returned ${response.status}${detail ? `: ${detail}` : ''}`);
  }
  if (response.status === 204) return undefined;
  return response.json();
}

async function getLogs() {
  const logs = [];
  let skip = 0;
  while (true) {
    const page = await request(`/logs/?skip=${skip}&limit=${PAGE_SIZE}`);
    if (!Array.isArray(page)) throw new Error('The Gymni API returned an unexpected logs response.');
    logs.push(...page);
    if (page.length < PAGE_SIZE) return logs;
    skip += PAGE_SIZE;
  }
}

async function refreshLogs() {
  setConnection('pending', 'Connecting');
  try {
    const logs = await getLogs();
    state.records = logs
      .filter((log) => log && (log.category === 'food' || log.category === 'workout'))
      .map(parseRecord)
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
    state.loaded = true;
    setConnection('connected', 'Connected');
    render();
  } catch (error) {
    console.error('Could not load Gymni logs.', error);
    setConnection('error', 'Connection issue');
    showToast(error.message, true);
  }
}

function formattedDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

function entryMarkup(record, compact = false) {
  const data = record.data;
  const title = escapeHtml(data.title || (record.category === 'food' ? 'Food check-in' : 'Movement check-in'));
  const date = escapeHtml(formattedDate(logDate(record)));
  const time = escapeHtml(logTime(record));
  const isFood = record.category === 'food';
  const kind = isFood ? 'food' : 'workout';
  const icon = isFood ? '◒' : '⌁';
  const detail = isFood
    ? `${formatNumber(finiteNumber(data.calories))} kcal${data.type ? ` · ${escapeHtml(data.type)}` : ''}`
    : `${escapeHtml(data.exercise || data.category || 'Movement')}${Number(data.sets) > 0 ? ` · ${escapeHtml(data.sets)} sets` : ''}${Number(data.reps) > 0 ? ` × ${escapeHtml(data.reps)} reps` : ''}`;
  const amount = isFood
    ? `${formatNumber(finiteNumber(data.calories))}<small> kcal</small>`
    : `${formatNumber(finiteNumber(data.caloriesBurned))}<small> kcal</small>`;

  return `<article class="entry-row${compact ? ' is-compact' : ''}">
    <span class="entry-type-icon ${kind}" aria-hidden="true">${icon}</span>
    <div class="entry-main">
      <h3>${title}</h3>
      <p class="entry-detail">${detail}</p>
      <p class="entry-meta">${date}${time ? ` <span>·</span> ${time}` : ''}</p>
    </div>
    <div class="entry-side">
      <p class="entry-amount">${amount}</p>
      <div class="entry-actions">
        <button class="icon-button" data-action="edit" data-id="${escapeHtml(record.id)}" aria-label="Edit ${title}" title="Edit">✎</button>
        <button class="icon-button delete-button" data-action="delete" data-id="${escapeHtml(record.id)}" aria-label="Delete ${title}" title="Delete">×</button>
      </div>
    </div>
  </article>`;
}

function renderOverview() {
  const today = localDate();
  const todays = state.records.filter((record) => logDate(record) === today);
  const foods = todays.filter((record) => record.category === 'food');
  const workouts = todays.filter((record) => record.category === 'workout');
  const caloriesIn = foods.reduce((sum, record) => sum + finiteNumber(record.data.calories), 0);
  const caloriesOut = workouts.reduce((sum, record) => sum + finiteNumber(record.data.caloriesBurned), 0);
  const protein = foods.reduce((sum, record) => sum + finiteNumber(record.data.protein), 0);
  $('#calories-in').textContent = state.loaded ? formatNumber(caloriesIn) : '—';
  $('#calories-out').textContent = state.loaded ? formatNumber(caloriesOut) : '—';
  $('#protein-total').textContent = state.loaded ? formatNumber(protein) : '—';
  $('#entry-count').textContent = state.loaded ? String(todays.length) : '—';

  const recent = state.records.slice(0, 4);
  $('#recent-list').innerHTML = recent.map((record) => entryMarkup(record, true)).join('');
  $('#recent-empty').hidden = recent.length > 0;
  $('#recent-list').hidden = recent.length === 0;
  renderWeekChart();
}

function renderWeekChart() {
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = localDate(date);
    const total = state.records
      .filter((record) => record.category === 'food' && logDate(record) === key)
      .reduce((sum, record) => sum + finiteNumber(record.data.calories), 0);
    return { date, key, total };
  });
  const max = Math.max(...days.map((day) => day.total), 1);
  $('#week-chart').innerHTML = days.map(({ date, key, total }) => {
    const height = total ? Math.max(5, (total / max) * 100) : 3;
    const dayLabel = new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
    return `<div class="chart-column" aria-label="${escapeHtml(dayLabel)}: ${formatNumber(total)} calories">
      <span class="chart-value">${total ? formatNumber(total) : '—'}</span>
      <div class="chart-track"><div class="chart-bar${key === localDate() ? ' is-today' : ''}" style="height:${height}%"></div></div>
      <span class="chart-day">${escapeHtml(dayLabel)}</span>
    </div>`;
  }).join('');
}

function renderActivity() {
  const records = state.filter === 'all'
    ? state.records
    : state.records.filter((record) => record.category === state.filter);
  $('#activity-list').innerHTML = records.map((record) => entryMarkup(record)).join('');
  $('#activity-list').hidden = records.length === 0;
  $('#activity-empty').hidden = records.length !== 0;
}

function render() {
  renderOverview();
  renderActivity();
}

function navigate(view) {
  state.view = view;
  $$('.view').forEach((section) => {
    const active = section.id === `view-${view}`;
    section.hidden = !active;
    section.classList.toggle('is-visible', active);
  });
  $$('[data-view]').forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (view === 'log') $('#food-title').focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setType(type) {
  state.type = type;
  const food = type === 'food';
  $('#food-tab').classList.toggle('is-selected', food);
  $('#workout-tab').classList.toggle('is-selected', !food);
  $('#food-tab').setAttribute('aria-selected', String(food));
  $('#workout-tab').setAttribute('aria-selected', String(!food));
  $('#food-fields').hidden = !food;
  $('#workout-fields').hidden = food;
  $('#form-heading').textContent = food ? 'What did you enjoy?' : 'How did you move?';
  $('#form-description').textContent = food
    ? 'Add a meal or snack, just as it was.'
    : 'Celebrate any kind of movement, at your own pace.';
  $('#food-title').required = food;
  $('#food-calories').required = food;
  $('#workout-title').required = !food;
  $('#save-button').textContent = $('#record-id').value ? 'Save changes →' : 'Save check-in →';
}

function clearForm() {
  $('#log-form').reset();
  $('#record-id').value = '';
  state.editingRecord = null;
  $('#cancel-edit').hidden = true;
  $('#save-button').disabled = false;
  $('#save-button').textContent = 'Save check-in →';
  setType(state.type);
}

function editRecord(id) {
  const record = state.records.find((item) => String(item.id) === String(id));
  if (!record) return;
  state.editingRecord = record;
  setType(record.category);
  $('#record-id').value = record.id;
  const data = record.data;
  if (record.category === 'food') {
    $('#food-title').value = data.title || '';
    $('#food-type').value = data.type || data.mealType || 'Breakfast';
    $('#food-calories').value = data.calories ?? '';
    $('#food-protein').value = data.protein ?? '';
    $('#food-carbs').value = data.carbs ?? '';
    $('#food-fat').value = data.fat ?? '';
    $('#food-fiber').value = data.fiber ?? '';
    $('#food-notes').value = data.notes || '';
  } else {
    $('#workout-title').value = data.title || '';
    $('#workout-exercise').value = data.exercise || '';
    $('#workout-category').value = data.category || 'General';
    $('#workout-sets').value = data.sets ?? '';
    $('#workout-reps').value = data.reps ?? '';
    $('#workout-weight').value = data.weight || '';
    $('#workout-calories').value = data.caloriesBurned ?? '';
  }
  $('#cancel-edit').hidden = false;
  $('#save-button').textContent = 'Save changes →';
  navigate('log');
}

function numericValue(id) {
  const value = $(`#${id}`).value.trim();
  return value === '' ? 0 : Number(value);
}

function createPayload() {
  const now = new Date();
  const previous = state.editingRecord?.data;
  const common = {
    date: typeof previous?.date === 'string' ? previous.date : localDate(now),
    time: typeof previous?.time === 'string'
      ? previous.time
      : now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
    title: $(`#${state.type}-title`).value.trim(),
    imageUrl: typeof previous?.imageUrl === 'string' ? previous.imageUrl : '',
    aiConfidence: typeof previous?.aiConfidence === 'string' ? previous.aiConfidence : 'Manual entry',
  };
  if (state.type === 'food') {
    return {
      category: 'food',
      content: JSON.stringify({
        ...common,
        calories: numericValue('food-calories'),
        protein: numericValue('food-protein'),
        carbs: numericValue('food-carbs'),
        fat: numericValue('food-fat'),
        fiber: numericValue('food-fiber'),
        type: $('#food-type').value,
        notes: $('#food-notes').value.trim(),
      }),
    };
  }
  return {
    category: 'workout',
    content: JSON.stringify({
      ...common,
      exercise: $('#workout-exercise').value.trim() || 'Movement',
      sets: numericValue('workout-sets'),
      reps: numericValue('workout-reps'),
      weight: $('#workout-weight').value.trim() || 'Bodyweight',
      caloriesBurned: numericValue('workout-calories'),
      category: $('#workout-category').value,
    }),
  };
}

async function saveRecord(event) {
  event.preventDefault();
  if (state.saving) return;
  const id = $('#record-id').value;
  const payload = createPayload();
  state.saving = true;
  $('#save-button').disabled = true;
  $('#save-button').textContent = id ? 'Saving changes…' : 'Saving…';
  try {
    const result = await request(id ? `/logs/${encodeURIComponent(id)}` : '/logs/', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(payload),
    });
    if (!id && (!result || result.id === undefined)) {
      throw new Error('The Gymni API saved the record but did not return its ID.');
    }
    showToast(id ? 'Your check-in has been updated.' : 'Your check-in has been saved.');
    clearForm();
    await refreshLogs();
    navigate('activity');
  } catch (error) {
    console.error('Could not save Gymni log.', error);
    showToast(error.message, true);
    $('#save-button').disabled = false;
    $('#save-button').textContent = id ? 'Save changes →' : 'Save check-in →';
  } finally {
    state.saving = false;
  }
}

async function deleteRecord(id) {
  const record = state.records.find((item) => String(item.id) === String(id));
  if (!record || !window.confirm(`Delete “${record.data.title || 'this check-in'}”? This cannot be undone.`)) return;
  try {
    await request(`/logs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    state.records = state.records.filter((item) => String(item.id) !== String(id));
    render();
    showToast('Check-in deleted.');
  } catch (error) {
    console.error('Could not delete Gymni log.', error);
    showToast(error.message, true);
  }
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) navigate(viewButton.dataset.view);

  const goButton = event.target.closest('[data-go]');
  if (goButton) navigate(goButton.dataset.go);

  const typeButton = event.target.closest('[data-type]');
  if (typeButton) {
    clearForm();
    setType(typeButton.dataset.type);
  }

  const filterButton = event.target.closest('[data-filter]');
  if (filterButton) {
    state.filter = filterButton.dataset.filter;
    $$('.filter-button').forEach((button) => {
      const active = button === filterButton;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    renderActivity();
  }

  const actionButton = event.target.closest('[data-action]');
  if (actionButton?.dataset.action === 'edit') editRecord(actionButton.dataset.id);
  if (actionButton?.dataset.action === 'delete') deleteRecord(actionButton.dataset.id);
});

$('#log-form').addEventListener('submit', saveRecord);
$('#cancel-edit').addEventListener('click', clearForm);
$('#today-label').textContent = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
}).format(new Date());
setType('food');
render();
refreshLogs();
