const POMODORO_SECONDS = 25 * 60;

const timerDisplay = document.getElementById('timer-display');
const timerStart = document.getElementById('timer-start');
const timerPause = document.getElementById('timer-pause');
const timerReset = document.getElementById('timer-reset');
const timerStatus = document.getElementById('timer-status');

const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');
const emptyState = document.getElementById('empty-state');

let remainingSeconds = POMODORO_SECONDS;
let timerInterval = null;
let isRunning = false;

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimerUI() {
  timerDisplay.textContent = formatTime(remainingSeconds);
}

function setTimerControls() {
  timerStart.disabled = isRunning;
  timerPause.disabled = !isRunning;
}

function tick() {
  if (remainingSeconds <= 0) {
    clearInterval(timerInterval);
    timerInterval = null;
    isRunning = false;
    setTimerControls();
    timerDisplay.classList.remove('pomodoro__display--running');
    timerStatus.textContent = 'Session complete! Take a break.';
    playCompletionAlert();
    return;
  }

  remainingSeconds -= 1;
  updateTimerUI();
}

function playCompletionAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.5);
  } catch {
    // Audio not available — visual alert is sufficient
  }
}

timerStart.addEventListener('click', () => {
  if (isRunning) return;
  isRunning = true;
  setTimerControls();
  timerDisplay.classList.add('pomodoro__display--running');
  timerStatus.textContent = 'Focus session in progress...';
  timerInterval = setInterval(tick, 1000);
});

timerPause.addEventListener('click', () => {
  if (!isRunning) return;
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  setTimerControls();
  timerDisplay.classList.remove('pomodoro__display--running');
  timerStatus.textContent = 'Paused';
});

timerReset.addEventListener('click', () => {
  isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  remainingSeconds = POMODORO_SECONDS;
  updateTimerUI();
  setTimerControls();
  timerDisplay.classList.remove('pomodoro__display--running');
  timerStatus.textContent = 'Ready to focus';
});

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (response.status === 204) return null;

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }

  return data;
}

function renderTasks(tasks) {
  taskList.innerHTML = '';

  tasks.forEach((task) => {
    const li = document.createElement('li');
    li.className = `task-item${task.completed ? ' task-item--completed' : ''}`;
    li.dataset.id = task.id;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-item__checkbox';
    checkbox.checked = task.completed;
    checkbox.setAttribute('aria-label', `Mark "${task.text}" as ${task.completed ? 'incomplete' : 'complete'}`);
    checkbox.addEventListener('change', () => toggleTask(task.id));

    const text = document.createElement('span');
    text.className = 'task-item__text';
    text.textContent = task.text;

    const actions = document.createElement('div');
    actions.className = 'task-item__actions';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn--danger';
    deleteBtn.type = 'button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.setAttribute('aria-label', `Delete "${task.text}"`);
    deleteBtn.addEventListener('click', () => deleteTask(task.id));

    actions.appendChild(deleteBtn);
    li.appendChild(checkbox);
    li.appendChild(text);
    li.appendChild(actions);
    taskList.appendChild(li);
  });

  emptyState.style.display = tasks.length === 0 ? 'block' : 'none';
}

async function loadTasks() {
  try {
    const tasks = await api('/api/tasks');
    renderTasks(tasks);
  } catch (err) {
    timerStatus.textContent = 'Could not load tasks.';
    console.error(err);
  }
}

async function addTask(text) {
  const task = await api('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  const tasks = await api('/api/tasks');
  renderTasks(tasks);
  return task;
}

async function toggleTask(id) {
  try {
    await api(`/api/tasks/${id}`, { method: 'PATCH' });
    await loadTasks();
  } catch (err) {
    console.error(err);
    await loadTasks();
  }
}

async function deleteTask(id) {
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    await loadTasks();
  } catch (err) {
    console.error(err);
  }
}

taskForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = taskInput.value.trim();
  if (!text) return;

  try {
    await addTask(text);
    taskInput.value = '';
    taskInput.focus();
  } catch (err) {
    console.error(err);
  }
});

updateTimerUI();
setTimerControls();
loadTasks();
