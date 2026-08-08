export const POMODORO_SECONDS = 25 * 60;
export const BREAK_SECONDS = 5 * 60;

export function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function getRunningStatusText(mode) {
  return mode === 'break' ? 'Time for a break!' : 'Focus session in progress...';
}

export function getPausedStatusText(mode) {
  return mode === 'break' ? 'Break paused' : 'Paused';
}

export function createFocusState({ autoStart = false, timeRemaining = POMODORO_SECONDS } = {}) {
  return {
    mode: 'focus',
    totalDuration: POMODORO_SECONDS,
    timeRemaining,
    isRunning: autoStart,
  };
}

export function createBreakState({ timeRemaining = BREAK_SECONDS } = {}) {
  return {
    mode: 'break',
    totalDuration: BREAK_SECONDS,
    timeRemaining,
    isRunning: true,
  };
}

export function getStatusForState(state) {
  if (state.isRunning) {
    return getRunningStatusText(state.mode);
  }

  if (state.mode === 'focus' && state.timeRemaining === POMODORO_SECONDS) {
    return 'Ready to focus';
  }

  return getPausedStatusText(state.mode);
}

/**
 * Advance the timer by one second.
 * Returns the next state and an optional completion event.
 */
export function decrementTimer(state) {
  if (state.timeRemaining > 0) {
    return {
      state: {
        ...state,
        timeRemaining: state.timeRemaining - 1,
      },
      event: null,
    };
  }

  if (state.mode === 'focus') {
    return {
      state: createBreakState(),
      event: 'focus-complete',
    };
  }

  return {
    state: createFocusState(),
    event: 'break-complete',
  };
}

export function getTomatoFillPercent(state) {
  if (state.mode === 'break') {
    return 100;
  }

  const fillRatio = 1 - (state.timeRemaining / POMODORO_SECONDS);
  return Math.max(0, Math.min(100, fillRatio * 100));
}

export function getRingProgressRatio(state) {
  return state.timeRemaining / state.totalDuration;
}
