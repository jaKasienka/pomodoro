import {
  POMODORO_SECONDS,
  formatTime,
  formatSessionTime,
  calculateDaySchedule,
  DEFAULT_LONG_BREAK_MINS,
  LONG_BREAK_OPTIONS,
  createSessionState,
  hasSessionProgress,
  reconcileSessionWithSchedule,
  createDefaultSessionState,
  decrementSessionTimer,
  getStatusForSessionState,
  getStatusContentForSessionState,
  getCompletionStatusContent,
  getTomatoFillPercent,
  getRingProgressRatio,
  getSessionRingProgressRatio,
} from './timerLogic.mjs';
import {
  isTomatoPipSupported,
  isTomatoPipOpen,
  wasTomatoPipDismissed,
  resetTomatoPipDismissed,
  setTomatoPipDismissHandler,
  openTomatoPip,
  closeTomatoPip,
  closeTomatoPipForModal,
  syncTomatoPip,
  syncTomatoPipRain,
  celebrateTomatoPipCompletion,
} from './tomatoPip.mjs';
import {
  initTomatoFocus,
  closeTomatoFocus,
  isTomatoFocusOpen,
  syncTomatoFocus,
} from './tomatoFocus.mjs';
import { createRainAnimator } from './rainEffect.mjs';
import { launchConfetti } from './confettiEffect.mjs';
import {
  ensureSegmentNotificationPermission,
  notifySegmentStart,
  notifyDayComplete,
} from './segmentNotifications.mjs';

const timerDisplay = document.getElementById('timerDisplay');
const sessionTimerDisplay = document.getElementById('sessionTimerDisplay');
const progressCircle = document.getElementById('progressCircle');
const sessionProgressCircle = document.getElementById('sessionProgressCircle');
const sessionProgressRing = document.getElementById('sessionProgressRing');
const radius = progressCircle ? progressCircle.r.baseVal.value : 120;
const CIRCUMFERENCE = 2 * Math.PI * radius;
const sessionRadius = sessionProgressCircle ? sessionProgressCircle.r.baseVal.value : 139;
const SESSION_CIRCUMFERENCE = 2 * Math.PI * sessionRadius;

if (progressCircle) {
  progressCircle.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
}

if (sessionProgressCircle) {
  sessionProgressCircle.style.strokeDasharray = `${SESSION_CIRCUMFERENCE} ${SESSION_CIRCUMFERENCE}`;
}

const timerContainer = document.querySelector('.timer-container');
const pomodoroPanel = document.querySelector('.panel.pomodoro');
const completionBanner = document.getElementById('completionBanner');
const completionBannerTitle = completionBanner?.querySelector('.completion-banner__title');
const completionBannerHeadline = completionBanner?.querySelector('.completion-banner__headline');
const completionBannerBody = completionBanner?.querySelector('.completion-banner__body');
const confettiCanvas = document.getElementById('confettiCanvas');
const timerStart = document.getElementById('timer-start');
const timerPause = document.getElementById('timer-pause');
const timerReset = document.getElementById('timer-reset');
const timerStatus = document.getElementById('timer-status');

const taskForm = document.getElementById('task-form');
const tomatoFillLevel = document.getElementById('tomatoFillLevel');
const tomatoPopOutBtn = document.getElementById('tomatoPopOutBtn');
const longBreakChips = document.querySelectorAll('.long-break-chip');

const LONG_BREAK_STORAGE_KEY = 'longBreakMinutes';
const PIP_PREFERENCE_KEY = 'tomatoPipPreference';
const COMPACT_LAYOUT_MEDIA = window.matchMedia('(max-width: 800px)');

function isCompactLayout() {
  return COMPACT_LAYOUT_MEDIA.matches;
}

function shouldOfferTomatoPip() {
  return isTomatoPipSupported() && !isCompactLayout();
}

const resetConfirmDialog = document.getElementById('resetConfirmDialog');
const resetConfirmCancel = document.getElementById('resetConfirmCancel');
const resetConfirmOk = document.getElementById('resetConfirmOk');
const pipPromptDialog = document.getElementById('pipPromptDialog');
const pipPromptDecline = document.getElementById('pipPromptDecline');
const pipPromptAllow = document.getElementById('pipPromptAllow');

const TOTAL_FOCUS_SECONDS = POMODORO_SECONDS;
const taskInput = document.getElementById('task-input');
const taskList = document.getElementById('task-list');

let sessionState = createDefaultSessionState();
let timerInterval = null;
let reopenPipAfterResetCancel = false;
let isRunning = sessionState?.isRunning ?? false;
let timerMode = sessionState?.mode ?? 'focus';
let totalDuration = sessionState?.totalDuration ?? POMODORO_SECONDS;
let timeRemaining = sessionState?.timeRemaining ?? POMODORO_SECONDS;

function syncTimerFromSession() {
  if (!sessionState) return;
  totalDuration = sessionState.totalDuration;
  timeRemaining = sessionState.timeRemaining;
  isRunning = sessionState.isRunning;
  timerMode = sessionState.mode;
}

function getLongBreakMinutes() {
  const stored = Number(localStorage.getItem(LONG_BREAK_STORAGE_KEY));
  return LONG_BREAK_OPTIONS.includes(stored) ? stored : DEFAULT_LONG_BREAK_MINS;
}

function setLongBreakMinutes(minutes) {
  const value = LONG_BREAK_OPTIONS.includes(minutes) ? minutes : DEFAULT_LONG_BREAK_MINS;
  localStorage.setItem(LONG_BREAK_STORAGE_KEY, String(value));
  updateLongBreakPillsUI();

  if (!isRunning && typeof window.updateOverallScheduleSummary === 'function') {
    window.updateOverallScheduleSummary();
  } else if (!isRunning && typeof window.refreshSessionPlan === 'function') {
    window.refreshSessionPlan();
  }
}

function updateLongBreakPillsUI() {
  const selected = getLongBreakMinutes();

  longBreakChips.forEach((chip) => {
    const minutes = Number(chip.dataset.minutes);
    const isSelected = minutes === selected;
    chip.classList.toggle('is-active', isSelected);
    chip.setAttribute('aria-pressed', String(isSelected));
    chip.disabled = isRunning || sessionState?.isComplete;
  });
}

function getActiveSchedule() {
  if (typeof window.getPomodoroSchedule === 'function') {
    return window.getPomodoroSchedule();
  }

  return calculateDaySchedule(0);
}

function loadSessionPlan() {
  applySessionPlan(getActiveSchedule());
}

function applySessionPlan(schedule, { preserveProgress = false } = {}) {
  if (preserveProgress && sessionState && hasSessionProgress(sessionState)) {
    sessionState = reconcileSessionWithSchedule(sessionState, schedule);
  } else if (schedule.totalPoms > 0) {
    sessionState = createSessionState(schedule.segments, {
      showSessionRing: schedule.showSessionRing,
    });
  } else {
    sessionState = createDefaultSessionState();
  }

  syncTimerFromSession();
  applySessionUI();
  updateDisplay(timeRemaining);
}

function shouldShowSessionUI() {
  return Boolean(sessionState?.showSessionRing);
}

function applySessionUI() {
  if (!timerContainer || !sessionState) return;
  timerContainer.classList.toggle('break-mode', sessionState.mode === 'break');
  timerContainer.classList.toggle('show-session-timer', shouldShowSessionUI());

  if (sessionProgressRing) {
    sessionProgressRing.setAttribute('aria-hidden', String(!shouldShowSessionUI()));
  }

  syncRainWithSession();
}

function syncTomatoPipState() {
  if (!sessionState) return;

  const completionContent = getCompletionStatusContent();

  syncTomatoPip({
    fillPercent: getTomatoFillPercent(sessionState),
    timerText: formatTimeDisplay(timeRemaining),
    isBreak: sessionState.mode === 'break',
    isComplete: sessionState.isComplete,
    completionText: completionContent.headline,
  });

  syncTomatoFocus({
    fillPercent: getTomatoFillPercent(sessionState),
    timerText: formatTimeDisplay(timeRemaining),
    isBreak: sessionState.mode === 'break',
    isComplete: sessionState.isComplete,
    completionText: completionContent.headline,
  });
}

function updatePopOutButton() {
  if (!tomatoPopOutBtn) return;

  const sessionActive = Boolean(
    sessionState
    && !sessionState.isComplete
    && timeRemaining > 0,
  );

  const shouldShow = shouldOfferTomatoPip()
    && sessionActive
    && !isTomatoPipOpen()
    && wasTomatoPipDismissed();

  tomatoPopOutBtn.hidden = !shouldShow;
}

async function openTomatoPipIfAllowed() {
  if (!shouldOfferTomatoPip() || wasTomatoPipDismissed() || !isRunning || isTomatoPipOpen()) {
    return;
  }

  const preference = localStorage.getItem(PIP_PREFERENCE_KEY);

  if (preference === 'declined') return;

  if (preference === 'allowed') {
    await openTomatoPip();
    syncTomatoPipState();
    return;
  }

  if (!pipPromptDialog || !pipPromptAllow || !pipPromptDecline) return;

  const choice = await new Promise((resolve) => {
    const cleanup = () => {
      pipPromptAllow.removeEventListener('click', onAllow);
      pipPromptDecline.removeEventListener('click', onDecline);
      pipPromptDialog.removeEventListener('cancel', onDecline);
      pipPromptDialog.close();
    };

    const onAllow = () => {
      cleanup();
      resolve('allowed');
    };

    const onDecline = () => {
      cleanup();
      resolve('declined');
    };

    pipPromptAllow.addEventListener('click', onAllow);
    pipPromptDecline.addEventListener('click', onDecline);
    pipPromptDialog.addEventListener('cancel', onDecline);
    pipPromptDialog.showModal();
  });

  localStorage.setItem(PIP_PREFERENCE_KEY, choice);

  if (choice === 'allowed' && isRunning && !wasTomatoPipDismissed()) {
    await openTomatoPip();
    syncTomatoPipState();
  }
}

function stopTomatoPipSession() {
  closeTomatoPip();
  resetTomatoPipDismissed();
  updatePopOutButton();
}

function formatTimeDisplay(totalSeconds) {
  return formatTime(totalSeconds);
}

setTomatoPipDismissHandler(updatePopOutButton);

COMPACT_LAYOUT_MEDIA.addEventListener('change', () => {
  if (isCompactLayout() && isTomatoPipOpen()) {
    closeTomatoPip({ markDismissed: false });
  }

  if (!isCompactLayout() && isTomatoFocusOpen()) {
    closeTomatoFocus();
  }

  updatePopOutButton();
});

if (tomatoPopOutBtn) {
  tomatoPopOutBtn.addEventListener('click', async () => {
    resetTomatoPipDismissed();
    localStorage.setItem(PIP_PREFERENCE_KEY, 'allowed');
    await openTomatoPip();
    syncTomatoPipState();
    updatePopOutButton();
  });
}

function shakePresetChip(chip) {
  chip.classList.remove('preset-chip--shake');
  void chip.offsetWidth;
  chip.classList.add('preset-chip--shake');
  chip.addEventListener('animationend', () => {
    chip.classList.remove('preset-chip--shake');
  }, { once: true });
}

// Updates just ONE task row and total schedule instantly
function updateSingleTaskUI(task, taskItemElement) {
  const mins = task.plannedMinutes ?? 25;
  const isStandby = mins === 0;

  // 1. Toggle Standby / Active classes instantly
  taskItemElement.classList.toggle('task-item--standby', isStandby);

  // 2. Update the time text under the task name immediately
  const timeTag = taskItemElement.querySelector('.task-item__time-tag');
  if (timeTag) {
    if (isStandby) {
      timeTag.textContent = '⏱️ Standby (0m)';
      timeTag.classList.add('muted');
    } else {
      timeTag.textContent = `⏱️ ${mins}m focus block`;
      timeTag.classList.remove('muted');
    }
  }

  // 3. Save to localStorage immediately
  localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));

  // 4. Recalculate total schedule
  updateOverallScheduleSummary();
}

let stopConfetti = null;

function renderRichStatusLines(container, content, titleClass, headlineClass, bodyClass) {
  container.replaceChildren(
    createStatusLine(titleClass, content.title),
    createStatusLine(headlineClass, content.headline),
    createStatusLine(bodyClass, content.body),
  );
}

function hideCompletionBanner() {
  if (!completionBanner) return;
  completionBanner.hidden = true;
  completionBanner.classList.remove('active');
}

function showCompletionBanner(content) {
  if (!completionBanner || !completionBannerTitle || !completionBannerHeadline || !completionBannerBody) {
    return;
  }

  completionBannerTitle.textContent = content.title;
  completionBannerHeadline.textContent = content.headline;
  completionBannerBody.textContent = content.body;
  completionBanner.hidden = false;
  completionBanner.classList.add('active');
}

function updateTimerStatus() {
  if (!timerStatus || !sessionState) return;

  const content = getStatusContentForSessionState(sessionState);
  timerStatus.classList.toggle('pomodoro__status--break', content.type === 'break');

  if (content.type === 'complete') {
    timerStatus.hidden = true;
    showCompletionBanner(content);
    return;
  }

  hideCompletionBanner();
  timerStatus.hidden = false;

  if (content.type === 'break') {
    renderRichStatusLines(
      timerStatus,
      content,
      'pomodoro__status-title',
      'pomodoro__status-headline',
      'pomodoro__status-body',
    );
    return;
  }

  timerStatus.textContent = content.text;
}

function createStatusLine(className, text) {
  const line = document.createElement('span');
  line.className = className;
  line.textContent = text;
  return line;
}

function updateDisplay(seconds) {
  if (timerDisplay) {
    timerDisplay.textContent = formatTimeDisplay(seconds);
  }

  setRingProgress(seconds, totalDuration);
  setSessionRingProgress();
  updateTomatoVisualizer(seconds);
  updateTimerStatus();

  if (sessionTimerDisplay && shouldShowSessionUI()) {
    sessionTimerDisplay.textContent = formatSessionTime(sessionState.sessionTimeRemaining);
  }
}

function updateTomatoVisualizer(secondsLeft) {
  if (!tomatoFillLevel || !sessionState) return;
  tomatoFillLevel.style.height = `${getTomatoFillPercent(sessionState)}%`;
  syncTomatoPipState();
}

function setRingProgress(secondsLeft, segmentTotal) {
  if (!progressCircle || !sessionState) return;
  const progressRatio = getRingProgressRatio({
    ...sessionState,
    timeRemaining: secondsLeft,
    totalDuration: segmentTotal,
  });
  const offset = CIRCUMFERENCE - (progressRatio * CIRCUMFERENCE);
  progressCircle.style.strokeDashoffset = offset;
}

function setSessionRingProgress() {
  if (!sessionProgressCircle || !shouldShowSessionUI()) return;
  const progressRatio = getSessionRingProgressRatio(sessionState);
  const offset = SESSION_CIRCUMFERENCE - (progressRatio * SESSION_CIRCUMFERENCE);
  sessionProgressCircle.style.strokeDashoffset = offset;
}

function updateTimerUI() {
  updateDisplay(timeRemaining);
}

function handleSessionComplete() {
  if (timerContainer) {
    timerContainer.classList.add('completed');
  }

  if (stopConfetti) {
    stopConfetti();
    stopConfetti = null;
  }

  if (confettiCanvas) {
    const origin = timerContainer?.getBoundingClientRect();
    stopConfetti = launchConfetti(confettiCanvas, {
      originX: origin ? origin.left + origin.width / 2 : undefined,
      originY: origin ? origin.top + origin.height * 0.35 : undefined,
    });
  }

  playCompletionAlert();
  notifyDayComplete();

  const completionContent = getCompletionStatusContent();
  celebrateTomatoPipCompletion({
    completionText: completionContent.headline,
    timerText: formatTimeDisplay(0),
  });

  syncRainWithSession();
}

function setResetButtonStyle(isComplete) {
  if (!timerReset) return;

  timerReset.classList.toggle('btn--primary', isComplete);
  timerReset.classList.toggle('btn--ghost', !isComplete);
}

function setTimerControls() {
  if (sessionState?.isComplete) {
    timerStart.disabled = true;
    timerPause.disabled = true;
    if (timerReset) timerReset.disabled = false;
    setResetButtonStyle(true);
    updateLongBreakPillsUI();
    return;
  }

  timerStart.disabled = isRunning;
  timerPause.disabled = !isRunning;
  if (timerReset) timerReset.disabled = false;
  setResetButtonStyle(false);
  updateLongBreakPillsUI();
}

function stopTimerInterval() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function tick() {
  if (!sessionState) return;

  const { state, event } = decrementSessionTimer(sessionState);
  sessionState = state;
  syncTimerFromSession();
  applySessionUI();
  updateDisplay(timeRemaining);

  if (event && event !== 'session-complete') {
    playCompletionAlert();
    handleSegmentTransitionEvent(event);
  }

  if (event === 'session-complete') {
    stopTimerInterval();
    sessionState.isRunning = false;
    syncTimerFromSession();
    setTimerControls();
    timerDisplay.classList.remove('pomodoro__display--running');
    updateTimerStatus();
    handleSessionComplete();
  }

  syncRainAudioFadeBeforeBreak();
}

function handleSegmentTransitionEvent(event) {
  if (event === 'focus-complete') {
    notifySegmentStart('break');
    return;
  }

  if (event === 'break-complete') {
    notifySegmentStart('focus');
  }
}

function setLongBreakPresetsPosition(started) {
  pomodoroPanel?.classList.toggle('pomodoro--started', started);
}

async function startTimerRun({ notifyFocusStart = false } = {}) {
  if (!sessionState || sessionState.isComplete) return;

  await ensureSegmentNotificationPermission();

  if (notifyFocusStart && sessionState.mode === 'focus') {
    notifySegmentStart('focus');
  }

  sessionState = { ...sessionState, isRunning: true };
  rainPausedForTimer = false;
  syncTimerFromSession();
  if (timerContainer) timerContainer.classList.remove('completed');
  hideCompletionBanner();
  if (timerStatus) timerStatus.hidden = false;
  setLongBreakPresetsPosition(true);
  setTimerControls();
  timerDisplay.classList.add('pomodoro__display--running');
  updateTimerStatus();
  timerInterval = setInterval(tick, 1000);
  await openTomatoPipIfAllowed();
  updatePopOutButton();
  syncRainWithSession();
  syncRainAudioFadeBeforeBreak();
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
  if (isRunning || !sessionState || sessionState.isComplete) return;
  startTimerRun({ notifyFocusStart: true });
});

timerPause.addEventListener('click', () => {
  if (!isRunning || !sessionState) return;
  clearInterval(timerInterval);
  timerInterval = null;
  sessionState = { ...sessionState, isRunning: false };
  rainPausedForTimer = true;
  syncTimerFromSession();
  setTimerControls();
  timerDisplay.classList.remove('pomodoro__display--running');
  updateTimerStatus();
  syncRainWithSession();
  updatePopOutButton();
});

function needsResetConfirmation() {
  if (!sessionState || sessionState.isComplete) return false;
  if (pomodoroPanel?.classList.contains('pomodoro--started')) return true;
  if (isRunning) return true;
  if (sessionState.segmentIndex > 0) return true;

  const segmentDuration = sessionState.segments?.[sessionState.segmentIndex]?.duration;
  if (segmentDuration != null && sessionState.timeRemaining < segmentDuration) return true;

  return false;
}

function requestResetTimer() {
  if (!needsResetConfirmation()) {
    resetTimer();
    return;
  }

  if (!resetConfirmDialog) {
    resetTimer();
    return;
  }

  reopenPipAfterResetCancel = isTomatoPipOpen();
  if (reopenPipAfterResetCancel) {
    closeTomatoPipForModal();
  }

  resetConfirmDialog.showModal();
}

function initResetConfirmDialog() {
  if (!resetConfirmDialog) return;

  resetConfirmCancel?.addEventListener('click', async () => {
    resetConfirmDialog.close();

    if (reopenPipAfterResetCancel && isRunning && !wasTomatoPipDismissed()) {
      await openTomatoPip();
      syncTomatoPipState();
    }

    reopenPipAfterResetCancel = false;
  });

  resetConfirmOk?.addEventListener('click', () => {
    resetConfirmDialog.close();
    reopenPipAfterResetCancel = false;
    resetTimer();
  });

  resetConfirmDialog.addEventListener('cancel', async () => {
    if (reopenPipAfterResetCancel && isRunning && !wasTomatoPipDismissed()) {
      await openTomatoPip();
      syncTomatoPipState();
    }

    reopenPipAfterResetCancel = false;
  });
}

timerReset.addEventListener('click', () => {
  requestResetTimer();
});

timerDisplay.addEventListener('click', () => {
  if (!sessionState || sessionState.isComplete) return;

  if (isRunning) {
    clearInterval(timerInterval);
    timerInterval = null;
    sessionState = { ...sessionState, isRunning: false };
    rainPausedForTimer = true;
    syncTimerFromSession();
    setTimerControls();
    timerDisplay.classList.remove('pomodoro__display--running');
    updateTimerStatus();
    syncRainWithSession();
    updatePopOutButton();
  } else if (timeRemaining > 0) {
    startTimerRun();
  }

  timerDisplay.blur();
});

// Task State Management with LocalStorage
(function initTaskManager() {
  const taskFormEl = document.querySelector('.task-form');
  const taskInputEl = document.querySelector('.task-form__input');
  const taskListEl = document.querySelector('.task-list');

  // Load tasks from localStorage or default to empty array and normalize fields
  let tasks = (JSON.parse(localStorage.getItem('pomodoro_tasks')) || []).map((task) => {
    const plannedMinutes = Number.isFinite(task.plannedMinutes) && task.plannedMinutes >= 0
      ? task.plannedMinutes
      : (Number.isFinite(task.estimatedPoms) && task.estimatedPoms >= 0 ? task.estimatedPoms * 25 : 30);
    const completed = Boolean(task.completed);

    return {
      ...task,
      plannedMinutes,
      completed,
      completedMinutes: completed ? plannedMinutes : 0,
    };
  });

  function getTaskDurationString(minutes) {
    if (!minutes || minutes === 0) return 'Standby';

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h${mins > 0 ? ' ' + mins + 'm' : ''}`;
    }
    return `${mins}m`;
  }

  function saveAndRender() {
    localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));
    renderTasks();
    updateOverallScheduleSummary();
  }

  function updateOverallScheduleSummary() {
    const activeTasks = tasks.filter(t => !t.completed);
    const schedule = calculateDaySchedule(
      activeTasks.reduce((sum, task) => sum + (task.plannedMinutes || 0), 0),
      getLongBreakMinutes(),
    );
    const summaryEl = document.getElementById('timeRemainingText');

    if (summaryEl) {
      summaryEl.textContent = schedule.rawWorkMins > 0
        ? `${schedule.formattedSchedule} of your day`
        : '0m planned (All clear! ☕)';
    }

    const totalCompletedMinutes = tasks.reduce((sum, t) => sum + (t.completed ? (t.plannedMinutes || 0) : 0), 0);
    const totalAllMinutes = tasks.reduce((sum, t) => sum + (t.plannedMinutes || 0), 0);
    const progressBar = document.getElementById('taskProgressBar');
    if (progressBar) {
      const percentage = totalAllMinutes > 0 ? (totalCompletedMinutes / totalAllMinutes) * 100 : 0;
      progressBar.style.width = `${percentage}%`;
    }

    if (typeof window.refreshSessionPlan === 'function') {
      window.refreshSessionPlan();
    }
  }

  window.getPomodoroSchedule = () => calculateDaySchedule(
    tasks
      .filter(t => !t.completed)
      .reduce((sum, task) => sum + (task.plannedMinutes || 0), 0),
    getLongBreakMinutes(),
  );

  window.updateOverallScheduleSummary = updateOverallScheduleSummary;

  function renderTaskItem(task) {
    const rawMins = Number.isFinite(task.plannedMinutes) ? task.plannedMinutes : 25;
    const isStandby = rawMins === 0;

      // Inside function renderTaskItem(task) ...
  return `
    <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
    <input type="checkbox" class="task-item__checkbox" ${task.completed ? 'checked' : ''} />
    <div class="task-item__details">
      <span class="task-item__text">${escapeHTML(task.text)}</span>
      <span class="task-item__time-tag ${isStandby ? 'muted' : ''}">
        ⏱️ ${getTaskDurationString(rawMins)}${isStandby ? '' : ` (${rawMins}m)`}
      </span>
    </div>
    <div class="compact-time-pill">
      <input
        type="number"
        class="task-time-field"
        value="${rawMins}"
        min="0"
        max="480"
        step="5"
        data-id="${task.id}"
      />
      <span class="time-unit-label">m</span>
    </div>
    <button class="btn btn--save task-time-save-btn" title="Save time" aria-label="Save time" data-id="${task.id}">✓</button>
    <button class="btn btn--danger task-item__delete-btn" aria-label="Delete task">🗑️</button>
  `;
  }

  function renderTasks() {
    taskListEl.innerHTML = '';

    tasks.forEach((task) => {
      const rawMins = Number.isFinite(task.plannedMinutes) ? task.plannedMinutes : 25;
      const isStandby = rawMins === 0;
      const li = document.createElement('li');
      li.className = `task-item ${task.completed ? 'task-item--completed' : ''} ${isStandby ? 'task-item--standby' : ''}`;
      li.dataset.id = task.id;
      li.draggable = true;
      li.innerHTML = renderTaskItem(task);
      taskListEl.appendChild(li);
    });
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
  }

  if (taskFormEl) {
    taskFormEl.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = taskInputEl.value.trim();
      if (!text) return;

      const newTask = {
        id: Date.now().toString(),
        text,
        plannedMinutes: 25,
        completedMinutes: 0,
        completed: false,
      };
      tasks.push(newTask);
      taskInputEl.value = '';
      saveAndRender();
    });
  }

  const presetsContainer = document.querySelector('.task-presets__chips');
  if (presetsContainer) {
    presetsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.preset-chip');
      if (!chip) return;

      const taskText = chip.dataset.task;
      if (!taskText) return;

      const exists = tasks.some(t => t.text.toLowerCase() === taskText.toLowerCase());
      if (exists) {
        shakePresetChip(chip);
        return;
      }

      const newTask = {
        id: Date.now().toString(),
        text: taskText,
        plannedMinutes: 25,
        completedMinutes: 0,
        completed: false,
      };

      tasks.push(newTask);
      saveAndRender();
    });
  }

  function saveTaskTime(inputEl) {
    const taskId = inputEl.dataset.id;
    let newMinutes = parseInt(inputEl.value, 10);

    if (isNaN(newMinutes) || newMinutes < 0) newMinutes = 0;
    if (newMinutes > 480) newMinutes = 480;
    newMinutes = Math.round(newMinutes / 5) * 5;

    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    task.plannedMinutes = newMinutes;
    inputEl.value = newMinutes;

    const liEl = inputEl.closest('.task-item');
    if (liEl) {
      const isStandby = newMinutes === 0;
      liEl.classList.toggle('task-item--standby', isStandby);

      const timeTagEl = liEl.querySelector('.task-item__time-tag');
      if (timeTagEl) {
        timeTagEl.className = `task-item__time-tag ${isStandby ? 'muted' : ''}`;
        timeTagEl.innerHTML = `⏱️ ${getTaskDurationString(newMinutes)}${isStandby ? '' : ` (${newMinutes}m)`}`;
      }
    }

    localStorage.setItem('pomodoro_tasks', JSON.stringify(tasks));
    updateOverallScheduleSummary();
  }

  if (taskListEl) {
    taskListEl.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('task-time-field')) {
        e.target.select();
      }
    });

    taskListEl.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('task-time-field') && e.key === 'Enter') {
        e.preventDefault();
        saveTaskTime(e.target);
      }
    });

    taskListEl.addEventListener('click', (e) => {
      const taskItem = e.target.closest('.task-item');
      if (!taskItem) return;

      const taskId = taskItem.dataset.id;

      if (e.target.closest('.task-time-save-btn')) {
        const inputEl = taskItem.querySelector('.task-time-field');
        if (inputEl) saveTaskTime(inputEl);
        return;
      }

      if (e.target.closest('.task-item__delete-btn')) {
        e.stopPropagation();

        // Add animation class first
        taskItem.classList.add('deleting');

        // Wait for the CSS transition (300ms) before updating state
        setTimeout(() => {
          tasks = tasks.filter(task => task.id !== taskId);
          saveAndRender();
        }, 300);

        return;
      }

      if (e.target.classList.contains('task-item__checkbox')) {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          task.completed = e.target.checked;
          task.completedMinutes = task.completed ? task.plannedMinutes : 0;
          saveAndRender();
        }
      }
    });


    let draggedItem = null;

    taskListEl.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.task-item');
      if (!item) return;

      draggedItem = item;
      setTimeout(() => item.classList.add('dragging'), 0);
    });

    taskListEl.addEventListener('dragend', (e) => {
      const item = e.target.closest('.task-item');
      if (item) item.classList.remove('dragging');

      taskListEl.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
      draggedItem = null;
    });

    taskListEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const targetItem = e.target.closest('.task-item');
      if (!targetItem || targetItem === draggedItem) return;

      taskListEl.querySelectorAll('.task-item').forEach(el => el.classList.remove('drag-over'));
      targetItem.classList.add('drag-over');
    });

    taskListEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const dropTarget = e.target.closest('.task-item');
      if (!dropTarget || !draggedItem || dropTarget === draggedItem) return;

      const draggedId = draggedItem.dataset.id;
      const targetId = dropTarget.dataset.id;
      const fromIndex = tasks.findIndex(t => t.id === draggedId);
      const toIndex = tasks.findIndex(t => t.id === targetId);

      if (fromIndex !== -1 && toIndex !== -1) {
        const [movedTask] = tasks.splice(fromIndex, 1);
        tasks.splice(toIndex, 0, movedTask);
        saveAndRender();
      }
    });
  }

  // Initial render
  renderTasks();
  updateOverallScheduleSummary();

})();

let syncRainWithSession = () => {};
let syncRainAudioFadeBeforeBreak = () => {};
let rainPausedForTimer = false;

const PRE_BREAK_RAIN_FADE_SECONDS = 3;

function initRainyMode() {
  const canvas = document.getElementById('rainCanvas');
  const toggleBtn = document.getElementById('moodBtn') || document.getElementById('rainToggleBtn');
  const btnText = toggleBtn ? toggleBtn.querySelector('.btn-text') : null;
  const audio = document.getElementById('rainAudio');
  const volumeSlider = document.getElementById('rainVolumeSlider');

  if (!canvas || !toggleBtn) return;

  const rainAnimator = createRainAnimator(canvas);
  let fadeInterval = null;
  let rainEnabledByUser = false;
  let rainVisuallyActive = false;
  let targetVolume = volumeSlider ? parseFloat(volumeSlider.value) : 0.35;

  if (audio) {
    audio.volume = targetVolume;
    audio.setAttribute('playsinline', '');
    audio.setAttribute('webkit-playsinline', '');
  }

  function stopRainAudio() {
    if (!audio) return;

    clearInterval(fadeInterval);
    fadeInterval = null;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;
  }

  function fadeAudioIn() {
    if (!audio) return;

    clearInterval(fadeInterval);
    audio.volume = 0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        console.log('Audio play blocked until user gesture');
      });
    }

    const step = 0.05;
    fadeInterval = setInterval(() => {
      if (audio.volume < targetVolume - step) {
        audio.volume += step;
      } else {
        audio.volume = targetVolume;
        clearInterval(fadeInterval);
        fadeInterval = null;
      }
    }, 50);
  }

  function fadeAudio(direction) {
    if (!audio) return;

    if (direction === 'out') {
      stopRainAudio();
      return;
    }

    fadeAudioIn();
  }

  function setRainButtonLabel() {
    const label = rainEnabledByUser ? 'Clear up' : 'Let it rain';

    if (btnText) {
      btnText.textContent = label;
    } else {
      toggleBtn.textContent = label;
    }
  }

  function updateRainButtonUI() {
    const isBreak = sessionState?.mode === 'break';
    const isComplete = sessionState?.isComplete;
    const buttonInactive = isBreak || isComplete;

    toggleBtn.disabled = buttonInactive;
    toggleBtn.setAttribute('aria-pressed', String(rainEnabledByUser));
    setRainButtonLabel();
  }

  function setRainVisualActive(active) {
    if (rainVisuallyActive === active) return;

    rainVisuallyActive = active;
    document.documentElement.classList.toggle('rain-mode', active);
    syncTomatoPipRain(active);

    if (active) {
      rainAnimator.start();
      fadeAudio('in');
      return;
    }

    rainAnimator.stop();
    stopRainAudio();
  }

  syncRainWithSession = function syncRainWithSessionState() {
    updateRainButtonUI();

    if (sessionState?.isComplete) {
      rainEnabledByUser = false;
      stopRainAudio();
      setRainVisualActive(false);
      return;
    }

    if (!rainEnabledByUser) {
      stopRainAudio();
      setRainVisualActive(false);
      return;
    }

    if (sessionState?.mode === 'break' || rainPausedForTimer) {
      stopRainAudio();
      setRainVisualActive(false);
      return;
    }

    setRainVisualActive(true);
  };

  syncRainAudioFadeBeforeBreak = function syncRainAudioFadeBeforeBreakState() {
    if (!audio || !rainEnabledByUser || !rainVisuallyActive) return;

    const inFocusRun = sessionState
      && sessionState.mode === 'focus'
      && !sessionState.isComplete
      && isRunning;

    if (!inFocusRun || timeRemaining > PRE_BREAK_RAIN_FADE_SECONDS) {
      return;
    }

    clearInterval(fadeInterval);
    fadeInterval = null;

    if (timeRemaining > 0) {
      const fadeRatio = timeRemaining / PRE_BREAK_RAIN_FADE_SECONDS;
      audio.volume = Math.max(0, targetVolume * fadeRatio);
    }
  };

  if (volumeSlider) {
    volumeSlider.addEventListener('input', (event) => {
      targetVolume = parseFloat(event.target.value);
      if (audio) {
        audio.volume = targetVolume;
      }
    });
  }

  toggleBtn.addEventListener('click', () => {
    if (sessionState?.mode === 'break' || sessionState?.isComplete) return;

    rainEnabledByUser = !rainEnabledByUser;

    if (rainEnabledByUser) {
      setRainVisualActive(true);
    } else {
      setRainVisualActive(false);
    }

    updateRainButtonUI();
  });

  window.addEventListener('resize', () => {
    rainAnimator.resize();
  });

  syncRainWithSession();
}

initRainyMode();

function resetTimer() {
  stopTimerInterval();
  rainPausedForTimer = false;
  if (timerContainer) timerContainer.classList.remove('completed');
  hideCompletionBanner();
  if (stopConfetti) {
    stopConfetti();
    stopConfetti = null;
  }
  if (timerStatus) timerStatus.hidden = false;
  setLongBreakPresetsPosition(false);
  loadSessionPlan();
  setTimerControls();
  timerDisplay.classList.remove('pomodoro__display--running');
  updateTimerStatus();
  stopTomatoPipSession();
}

window.refreshSessionPlan = () => {
  applySessionPlan(getActiveSchedule(), { preserveProgress: true });
  updateTimerStatus();
};

loadSessionPlan();
updateTimerUI();
setTimerControls();
updatePopOutButton();
updateLongBreakPillsUI();
initResetConfirmDialog();

initTomatoFocus({
  overlay: document.getElementById('tomatoFocusOverlay'),
  openButton: document.getElementById('tomatoFocusOpenBtn'),
  backButton: document.getElementById('tomatoFocusBackBtn'),
  onOpen: syncTomatoPipState,
});

(function initLongBreakPresets() {
  document.querySelectorAll('.long-break-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (isRunning || sessionState?.isComplete) return;
      setLongBreakMinutes(Number(chip.dataset.minutes));
    });
  });
})();

(function initTaskSummaryNotes() {
  const notesWrap = document.getElementById('taskSummaryNotesWrap');
  const notesList = document.getElementById('taskSummaryNotes');
  const readMoreBtn = document.getElementById('taskSummaryReadMore');

  if (!notesWrap || !notesList || !readMoreBtn) return;

  const items = notesList.querySelectorAll('li');
  if (items.length <= 1) {
    readMoreBtn.hidden = true;
    return;
  }

  readMoreBtn.addEventListener('click', () => {
    const isExpanded = notesWrap.classList.toggle('is-expanded');
    readMoreBtn.setAttribute('aria-expanded', String(isExpanded));
    readMoreBtn.textContent = isExpanded ? 'Read less' : 'Read more';
  });
})();
