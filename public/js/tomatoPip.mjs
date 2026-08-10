import { createRainAnimator, isRainModeActive, COMPACT_RAIN_OPTIONS } from './rainEffect.mjs';
import { launchConfetti } from './confettiEffect.mjs';

let pipWindow = null;
let userDismissed = false;
let suppressDismissOnClose = false;
let onDismissCallback = null;
let pipRainAnimator = null;
let pipResizeHandler = null;
let stopPipConfetti = null;

export function isTomatoPipSupported() {
  return 'documentPictureInPicture' in window;
}

export function isTomatoPipOpen() {
  return Boolean(pipWindow && !pipWindow.closed);
}

export function wasTomatoPipDismissed() {
  return userDismissed;
}

export function resetTomatoPipDismissed() {
  userDismissed = false;
}

export function setTomatoPipDismissHandler(callback) {
  onDismissCallback = callback;
}

function buildPipMarkup() {
  return `
    <canvas class="pip-rain-canvas" id="pipRainCanvas" aria-hidden="true"></canvas>
    <canvas class="pip-confetti-canvas" id="pipConfettiCanvas" aria-hidden="true"></canvas>
    <div class="pip-tomato-shell">
      <button type="button" class="pip-tomato-close" aria-label="Close mini pomodoro">×</button>
      <div class="tomato-vessel-container pip-tomato-vessel-container">
        <div class="glass-tomato-vessel pip-tomato-vessel" id="pipTomatoVisual">
          <div class="tomato-fill-fluid" id="pipTomatoFillLevel"></div>
          <div class="tomato-stem-vessel"></div>
          <div class="tomato-leaf-vessel leaf-vessel-l"></div>
          <div class="tomato-leaf-vessel leaf-vessel-c"></div>
          <div class="tomato-leaf-vessel leaf-vessel-r"></div>
          <div class="glass-reflection-vessel"></div>
        </div>
      </div>
      <div class="pip-tomato-timer" id="pipTimerDisplay">25:00</div>
      <p class="pip-tomato-break-hint" id="pipBreakHint" hidden>Time to pause! Stand up and stretch.</p>
      <p class="pip-tomato-complete-hint" id="pipCompleteHint" hidden></p>
    </div>
  `;
}

function stopPipConfettiAnimation() {
  stopPipConfetti?.();
  stopPipConfetti = null;
}

function attachStyles(pipDocument) {
  const link = pipDocument.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('/css/styles.css', window.location.href).href;
  pipDocument.head.appendChild(link);
}

function applyPipTheme(pipDocument) {
  pipDocument.documentElement.classList.toggle('rain-mode', isRainModeActive());
}

function setupPipRain() {
  if (!pipWindow) return;

  const canvas = pipWindow.document.getElementById('pipRainCanvas');
  pipRainAnimator = createRainAnimator(canvas, COMPACT_RAIN_OPTIONS);

  pipResizeHandler = () => pipRainAnimator?.resize();
  pipWindow.addEventListener('resize', pipResizeHandler);

  if (isRainModeActive()) {
    pipRainAnimator.start();
  }
}

function teardownPipRain() {
  pipRainAnimator?.stop();
  pipRainAnimator = null;
  stopPipConfettiAnimation();

  if (pipWindow && pipResizeHandler) {
    pipWindow.removeEventListener('resize', pipResizeHandler);
  }

  pipResizeHandler = null;
}

export function syncTomatoPipRain(isRainActive = isRainModeActive()) {
  if (!isTomatoPipOpen()) return;

  pipWindow.document.documentElement.classList.toggle('rain-mode', isRainActive);

  if (isRainActive) {
    pipRainAnimator?.start();
    return;
  }

  pipRainAnimator?.stop();
}

export async function openTomatoPip() {
  if (!isTomatoPipSupported() || isTomatoPipOpen()) {
    return isTomatoPipOpen();
  }

  try {
    pipWindow = await window.documentPictureInPicture.requestWindow({
      width: 180,
      height: 280,
    });

    userDismissed = false;
    const pipDocument = pipWindow.document;

    attachStyles(pipDocument);
    pipDocument.body.className = 'pip-tomato-body';
    pipDocument.body.innerHTML = buildPipMarkup();
    applyPipTheme(pipDocument);

    pipDocument.querySelector('.pip-tomato-close')?.addEventListener('click', () => {
      closeTomatoPip({ markDismissed: true });
      onDismissCallback?.();
    });

    pipWindow.addEventListener('pagehide', () => {
      if (!suppressDismissOnClose) {
        userDismissed = true;
      }
      teardownPipRain();
      pipWindow = null;
      onDismissCallback?.();
    });

    setupPipRain();
    return true;
  } catch {
    pipWindow = null;
    return false;
  }
}

export function closeTomatoPip({ markDismissed = false } = {}) {
  teardownPipRain();

  if (pipWindow && !pipWindow.closed) {
    suppressDismissOnClose = !markDismissed;
    pipWindow.close();
    suppressDismissOnClose = false;
  }

  pipWindow = null;

  if (markDismissed) {
    userDismissed = true;
  }
}

export function closeTomatoPipForModal() {
  closeTomatoPip({ markDismissed: false });
}

export function syncTomatoPip({
  fillPercent = 0,
  timerText = '25:00',
  isBreak = false,
  isComplete = false,
  completionText = '',
} = {}) {
  if (!isTomatoPipOpen()) return;

  const pipDocument = pipWindow.document;
  applyPipTheme(pipDocument);
  syncTomatoPipRain(isRainModeActive());

  const fillEl = pipDocument.getElementById('pipTomatoFillLevel');
  const timerEl = pipDocument.getElementById('pipTimerDisplay');
  const breakHintEl = pipDocument.getElementById('pipBreakHint');
  const completeHintEl = pipDocument.getElementById('pipCompleteHint');
  const vesselEl = pipDocument.getElementById('pipTomatoVisual');

  if (fillEl) {
    fillEl.style.height = `${fillPercent}%`;
  }

  if (timerEl) {
    timerEl.textContent = timerText;
  }

  if (breakHintEl) {
    breakHintEl.hidden = isComplete || !isBreak;
  }

  if (completeHintEl) {
    completeHintEl.textContent = completionText;
    completeHintEl.hidden = !isComplete;
  }

  if (vesselEl) {
    vesselEl.classList.toggle('pip-tomato-vessel--break', isBreak && !isComplete);
    vesselEl.classList.toggle('pip-tomato-vessel--complete', isComplete);
  }
}

export function celebrateTomatoPipCompletion({
  completionText = 'Day plan complete — great work today!',
  timerText = '00:00',
} = {}) {
  if (!isTomatoPipOpen()) return;

  syncTomatoPip({
    fillPercent: 100,
    timerText,
    isBreak: false,
    isComplete: true,
    completionText,
  });

  stopPipConfettiAnimation();

  const canvas = pipWindow.document.getElementById('pipConfettiCanvas');
  stopPipConfetti = launchConfetti(canvas, {
    particleCount: 80,
    durationMs: 4200,
    originX: pipWindow.innerWidth / 2,
    originY: pipWindow.innerHeight * 0.38,
  });
}
