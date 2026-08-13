let overlayEl = null;
let openButtonEl = null;
let backButtonEl = null;
let onOpenCallback = null;
let initialized = false;

export function isTomatoFocusOpen() {
  return Boolean(overlayEl && !overlayEl.hidden);
}

export function initTomatoFocus({
  overlay,
  openButton,
  backButton,
  onOpen,
} = {}) {
  if (initialized) return;

  overlayEl = overlay;
  openButtonEl = openButton;
  backButtonEl = backButton;
  onOpenCallback = onOpen;

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
  onOpenCallback?.();
  backButtonEl?.focus();
}

export function closeTomatoFocus() {
  if (!overlayEl) return;

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
