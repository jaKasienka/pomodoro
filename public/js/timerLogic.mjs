// Set to true to run focus/break timers in seconds instead of minutes (UI testing).
export const TEST_MODE = true;

const POMODORO_MINS = 25;
const BREAK_MINS = 5;

export const DEFAULT_LONG_BREAK_MINS = 20;
export const LONG_BREAK_OPTIONS = [15, 20, 30];

export function getLongBreakSeconds(longBreakMins = DEFAULT_LONG_BREAK_MINS) {
  const mins = LONG_BREAK_OPTIONS.includes(longBreakMins) ? longBreakMins : DEFAULT_LONG_BREAK_MINS;
  return TEST_MODE ? mins : mins * 60;
}

export const POMODORO_SECONDS = TEST_MODE ? POMODORO_MINS : POMODORO_MINS * 60;
export const BREAK_SECONDS = TEST_MODE ? BREAK_MINS : BREAK_MINS * 60;
export const LONG_BREAK_SECONDS = getLongBreakSeconds(DEFAULT_LONG_BREAK_MINS);
export const MAX_SESSION_SECONDS = 9 * 60 * 60;

function formatDurationLabel(totalSeconds) {
  if (totalSeconds >= 60) {
    return `${Math.floor(totalSeconds / 60)}m`;
  }

  return `${totalSeconds}s`;
}

export function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatSessionTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function buildSessionSegments(totalPoms, longBreakMins = DEFAULT_LONG_BREAK_MINS) {
  const longBreakSeconds = getLongBreakSeconds(longBreakMins);
  const segments = [];

  for (let pomIndex = 1; pomIndex <= totalPoms; pomIndex += 1) {
    segments.push({ type: 'focus', duration: POMODORO_SECONDS });

    const isLongBreak = pomIndex % 4 === 0;
    segments.push({
      type: isLongBreak ? 'long-break' : 'break',
      duration: isLongBreak ? longBreakSeconds : BREAK_SECONDS,
    });
  }

  return segments;
}

export function calculateDaySchedule(rawWorkMins, longBreakMins = DEFAULT_LONG_BREAK_MINS) {
  const totalRawWorkMins = Math.max(0, rawWorkMins);

  if (totalRawWorkMins === 0) {
    return {
      rawWorkMins: 0,
      totalPoms: 0,
      totalScheduleMins: 0,
      totalScheduleSeconds: 0,
      formattedSchedule: '0m (Standby)',
      segments: [],
      showSessionRing: false,
    };
  }

  const totalPoms = Math.ceil(totalRawWorkMins / POMODORO_MINS);
  const totalLongBreaks = Math.floor(totalPoms / 4);
  const totalShortBreaks = totalPoms - totalLongBreaks;
  const focusTime = totalPoms * POMODORO_MINS;
  const breakTime = (totalShortBreaks * BREAK_MINS) + (totalLongBreaks * longBreakMins);
  const totalScheduleMins = focusTime + breakTime;
  const segments = buildSessionSegments(totalPoms, longBreakMins);
  const totalScheduleSeconds = segments.reduce((sum, segment) => sum + segment.duration, 0);
  const cappedScheduleSeconds = Math.min(totalScheduleSeconds, MAX_SESSION_SECONDS);

  const hrs = Math.floor(totalScheduleMins / 60);
  const mins = totalScheduleMins % 60;
  const formattedSchedule = hrs > 0
    ? `${hrs}h ${mins > 0 ? `${mins}m` : ''}`.trim()
    : `${mins}m`;

  return {
    rawWorkMins: totalRawWorkMins,
    totalPoms,
    totalScheduleMins,
    totalScheduleSeconds: cappedScheduleSeconds,
    formattedSchedule,
    segments: cappedScheduleSeconds < totalScheduleSeconds
      ? trimSegmentsToDuration(segments, cappedScheduleSeconds)
      : segments,
    showSessionRing: totalScheduleMins > 30,
  };
}

function trimSegmentsToDuration(segments, maxSeconds) {
  const trimmed = [];
  let used = 0;

  for (const segment of segments) {
    if (used >= maxSeconds) break;

    const remaining = maxSeconds - used;
    if (segment.duration <= remaining) {
      trimmed.push(segment);
      used += segment.duration;
      continue;
    }

    trimmed.push({ ...segment, duration: remaining });
    used = maxSeconds;
  }

  return trimmed;
}

function segmentToMode(segment) {
  return segment.type === 'focus' ? 'focus' : 'break';
}

function segmentFromState(state) {
  return state.segments[state.segmentIndex];
}

export function createSessionState(segments, { autoStart = false, showSessionRing = false } = {}) {
  if (!segments.length) {
    return null;
  }

  const totalSessionSeconds = segments.reduce((sum, segment) => sum + segment.duration, 0);
  const firstSegment = segments[0];

  return {
    segments,
    segmentIndex: 0,
    timeRemaining: firstSegment.duration,
    totalDuration: firstSegment.duration,
    mode: segmentToMode(firstSegment),
    isLongBreak: firstSegment.type === 'long-break',
    sessionTimeRemaining: totalSessionSeconds,
    totalSessionSeconds,
    isRunning: autoStart,
    isComplete: false,
    showSessionRing,
  };
}

export function createDefaultSessionState(options = {}) {
  return createSessionState(buildSessionSegments(1), {
    ...options,
    showSessionRing: false,
  });
}

export function getCompletionStatusContent() {
  return {
    type: 'complete',
    title: 'Session complete',
    headline: 'Day plan complete — great work today!',
    body: 'You finished everything you planned. Take a well-earned rest and recharge.',
  };
}

export function getBreakStatusContent(isLongBreak = false, breakDurationSeconds = null) {
  if (isLongBreak) {
    const duration = breakDurationSeconds ?? LONG_BREAK_SECONDS;
    return {
      type: 'break',
      title: `Long Break (${formatDurationLabel(duration)}):`,
      headline: 'Well-earned long break!',
      body: 'Step away entirely—grab a drink, take a walk, and let your brain process your hard work.',
    };
  }

  return {
    type: 'break',
    title: `Short Break (${formatDurationLabel(BREAK_SECONDS)}):`,
    headline: 'Time to pause!',
    body: 'Stand up and stretch. A quick mental reset boosts your next sprint.',
  };
}

export function getRunningStatusText(mode, isLongBreak = false) {
  if (mode === 'break') {
    return isLongBreak ? 'Time for a long break!' : 'Time for a break!';
  }

  return 'Focus session in progress...';
}

export function getPausedStatusText(mode, isLongBreak = false) {
  if (mode === 'break') {
    return isLongBreak ? 'Long break paused' : 'Break paused';
  }

  return 'Paused';
}

export function getStatusContentForSessionState(state) {
  if (state.isComplete) {
    return getCompletionStatusContent();
  }

  if (state.isRunning && state.mode === 'break') {
    const breakDuration = state.isLongBreak ? state.totalDuration : BREAK_SECONDS;
    return getBreakStatusContent(state.isLongBreak, breakDuration);
  }

  if (state.isRunning) {
    return { type: 'plain', text: 'Focus session in progress...' };
  }

  if (state.segmentIndex === 0 && state.timeRemaining === state.segments[0]?.duration) {
    return { type: 'plain', text: 'Ready to focus' };
  }

  return {
    type: 'plain',
    text: getPausedStatusText(state.mode, state.isLongBreak),
  };
}

export function getStatusForSessionState(state) {
  const content = getStatusContentForSessionState(state);
  if (content.type === 'break' || content.type === 'complete') {
    return `${content.title} ${content.headline}`;
  }

  return content.text;
}

export function decrementSessionTimer(state) {
  if (state.isComplete) {
    return { state, event: null };
  }

  if (state.timeRemaining > 0) {
    return {
      state: {
        ...state,
        timeRemaining: state.timeRemaining - 1,
        sessionTimeRemaining: Math.max(0, state.sessionTimeRemaining - 1),
      },
      event: null,
    };
  }

  const currentSegment = segmentFromState(state);
  const nextIndex = state.segmentIndex + 1;

  if (nextIndex >= state.segments.length) {
    return {
      state: {
        ...state,
        isRunning: false,
        isComplete: true,
        timeRemaining: 0,
      },
      event: 'session-complete',
    };
  }

  const nextSegment = state.segments[nextIndex];
  const focusCompleted = currentSegment.type === 'focus';

  return {
    state: {
      ...state,
      segmentIndex: nextIndex,
      timeRemaining: nextSegment.duration,
      totalDuration: nextSegment.duration,
      mode: segmentToMode(nextSegment),
      isLongBreak: nextSegment.type === 'long-break',
      isRunning: true,
    },
    event: focusCompleted ? 'focus-complete' : 'break-complete',
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

export function getSessionRingProgressRatio(state) {
  if (!state.totalSessionSeconds) return 0;
  return state.sessionTimeRemaining / state.totalSessionSeconds;
}

// Legacy single-pomodoro helpers kept for existing tests.
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
