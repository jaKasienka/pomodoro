import { createRainAnimator, isRainModeActive } from './rainEffect.mjs';

let overlayEl = null;
let openButtonEl = null;
let backButtonEl = null;
let rainCanvasEl = null;
let onOpenCallback = null;
let initialized = false;
let focusRainAnimator = null;
let focusResizeHandler = null;

export function isTomatoFocusOpen() {
  return Boolean(overlayEl && !overlayEl.hidden);
}

function setupFocusRain() {
  if (!rainCanvasEl || focusRainAnimator) return;

  focusRainAnimator = createRainAnimator(rainCanvasEl);
  focusResizeHandler = () => focusRainAnimator?.resize();
  window.addEventListener('resize', focusResizeHandler);
}

export function syncTomatoFocusRain(isRainActive = isRainModeActive()) {
  if (!isTomatoFocusOpen()) return;

  if (isRainActive) {
    focusRainAnimator?.start();
    return;
  }

  focusRainAnimator?.stop();
}

export function initTomatoFocus({
  overlay,
  openButton,
  backButton,
  rainCanvas,
  onOpen,
} = {}) {
  if (initialized) return;

  overlayEl = overlay;
  openButtonEl = openButton;
  backButtonEl = backButton;
  rainCanvasEl = rainCanvas;
  onOpenCallback = onOpen;

  setupFocusRain();

  openButtonEl?.addEventListener('click', openTomatoFocus);
  backButtonEl?.addEventListener('click', closeTomatoFocus);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isTomatoFocusOpen()) {
      closeTomatoFocus();
    }
  });

  initialized = true;
}

export function openTomatoFocus() {
  if (!overlayEl) return;

  overlayEl.hidden = false;
  overlayEl.setAttribute('aria-hidden', 'false');
  document.body.classList.add('tomato-focus-active');
  syncTomatoFocusRain(isRainModeActive());
  onOpenCallback?.();
  backButtonEl?.focus();
}

export function closeTomatoFocus() {
  if (!overlayEl) return;

  focusRainAnimator?.stop();
  overlayEl.hidden = true;
  overlayEl.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('tomato-focus-active');
  openButtonEl?.focus();
}

export function syncTomatoFocus({
  fillPercent = 0,
  timerText = '25:00',
  isBreak = false,
  isComplete = false,
  completionText = '',
} = {}) {
  if (!isTomatoFocusOpen()) return;

  const fillEl = document.getElementById('tomatoFocusFillLevel');
  const timerEl = document.getElementById('tomatoFocusTimerDisplay');
  const breakHintEl = document.getElementById('tomatoFocusBreakHint');
  const completeHintEl = document.getElementById('tomatoFocusCompleteHint');
  const vesselEl = document.getElementById('tomatoFocusVisual');

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
    vesselEl.classList.toggle('tomato-focus-vessel--break', isBreak && !isComplete);
    vesselEl.classList.toggle('tomato-focus-vessel--complete', isComplete);
  }
}
