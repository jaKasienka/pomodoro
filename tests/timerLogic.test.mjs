import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  POMODORO_SECONDS,
  BREAK_SECONDS,
  LONG_BREAK_SECONDS,
  DEFAULT_LONG_BREAK_MINS,
  getLongBreakSeconds,
  formatTime,
  formatSessionTime,
  calculateDaySchedule,
  buildSessionSegments,
  createFocusState,
  createBreakState,
  createSessionState,
  decrementTimer,
  decrementSessionTimer,
  getRunningStatusText,
  getPausedStatusText,
  getStatusForState,
  getStatusForSessionState,
  getStatusContentForSessionState,
  getBreakStatusContent,
  getCompletionStatusContent,
  getTomatoFillPercent,
  getRingProgressRatio,
  getSessionRingProgressRatio,
} from '../public/js/timerLogic.mjs';

describe('timerLogic', () => {
  it('starts focus mode at the configured pomodoro duration', () => {
    const state = createFocusState();
    assert.equal(state.mode, 'focus');
    assert.equal(state.timeRemaining, POMODORO_SECONDS);
    assert.equal(state.totalDuration, POMODORO_SECONDS);
    assert.equal(formatTime(state.timeRemaining), formatTime(POMODORO_SECONDS));
  });

  it('transitions from focus to break when focus hits zero', () => {
    const focusEnding = createFocusState({ timeRemaining: 0 });
    const { state, event } = decrementTimer(focusEnding);

    assert.equal(event, 'focus-complete');
    assert.equal(state.mode, 'break');
    assert.equal(state.timeRemaining, BREAK_SECONDS);
    assert.equal(formatTime(state.timeRemaining), formatTime(BREAK_SECONDS));
  });

  it('resets to focus after break completes in legacy mode', () => {
    const breakEnding = createBreakState({ timeRemaining: 0 });
    const { state, event } = decrementTimer(breakEnding);

    assert.equal(event, 'break-complete');
    assert.equal(state.mode, 'focus');
    assert.equal(formatTime(state.timeRemaining), formatTime(POMODORO_SECONDS));
    assert.equal(getStatusForState(state), 'Ready to focus');
  });

  it('builds (25+5) x3 + (25+20) pattern for four pomodoros', () => {
    const segments = buildSessionSegments(4);
    assert.equal(segments.length, 8);
    assert.equal(segments[0].duration, POMODORO_SECONDS);
    assert.equal(segments[1].duration, BREAK_SECONDS);
    assert.equal(segments[7].duration, LONG_BREAK_SECONDS);
  });

  it('calculates total planned schedule from task minutes', () => {
    const schedule = calculateDaySchedule(30);
    assert.equal(schedule.totalPoms, 2);
    assert.equal(schedule.totalScheduleMins, 60);
    assert.equal(schedule.showSessionRing, true);
  });

  it('shows session ring only when total planned time is above 30 minutes', () => {
    const singlePomPlan = calculateDaySchedule(25);
    const multiPomPlan = calculateDaySchedule(30);

    assert.equal(singlePomPlan.totalScheduleMins, 30);
    assert.equal(singlePomPlan.showSessionRing, false);
    assert.equal(multiPomPlan.totalScheduleMins, 60);
    assert.equal(multiPomPlan.showSessionRing, true);
  });

  it('runs through a multi-pomodoro session until complete', () => {
    const schedule = calculateDaySchedule(30);
    let state = createSessionState(schedule.segments, { showSessionRing: true });

    while (!state.isComplete) {
      const result = decrementSessionTimer(state);
      state = result.state;
      if (result.event === 'session-complete') break;
    }

    assert.equal(state.isComplete, true);
    assert.equal(state.sessionTimeRemaining, 0);
  });

  it('uses the chosen long break duration after every fourth pomodoro', () => {
    const defaultSchedule = calculateDaySchedule(100);
    const extendedSchedule = calculateDaySchedule(100, 30);
    const defaultLongBreaks = defaultSchedule.segments.filter((segment) => segment.type === 'long-break');
    const extendedLongBreaks = extendedSchedule.segments.filter((segment) => segment.type === 'long-break');

    assert.equal(defaultLongBreaks.length, 1);
    assert.equal(defaultLongBreaks[0].duration, getLongBreakSeconds(DEFAULT_LONG_BREAK_MINS));
    assert.equal(extendedLongBreaks[0].duration, getLongBreakSeconds(30));
    assert.equal(defaultSchedule.totalScheduleMins, 135);
    assert.equal(extendedSchedule.totalScheduleMins, 145);
  });

  it('builds segments with a custom long break length', () => {
    const segments = buildSessionSegments(4, 15);
    assert.equal(segments[7].duration, getLongBreakSeconds(15));
  });

  it('keeps session ring progress independent from break segments', () => {
    const schedule = calculateDaySchedule(50);
    const state = createSessionState(schedule.segments, { showSessionRing: true });
    const onBreak = {
      ...state,
      mode: 'break',
      timeRemaining: BREAK_SECONDS,
      sessionTimeRemaining: schedule.totalScheduleSeconds / 2,
    };

    assert.equal(getSessionRingProgressRatio(onBreak), 0.5);
  });

  it('formats long session times with hours', () => {
    assert.equal(formatSessionTime(3661), '1:01:01');
  });

  it('exposes mode-aware status text', () => {
    assert.equal(getRunningStatusText('focus'), 'Focus session in progress...');
    assert.equal(getRunningStatusText('break', true), 'Time for a long break!');
    assert.equal(getPausedStatusText('break'), 'Break paused');
  });

  it('keeps tomato fill full during break and scales during focus', () => {
    const focusHalf = createFocusState({ timeRemaining: POMODORO_SECONDS / 2 });
    const onBreak = createBreakState();

    assert.equal(getTomatoFillPercent(focusHalf), 50);
    assert.equal(getTomatoFillPercent(onBreak), 100);
  });

  it('calculates ring progress from remaining time', () => {
    const focusHalf = createFocusState({ timeRemaining: POMODORO_SECONDS / 2 });
    assert.equal(getRingProgressRatio(focusHalf), 0.5);
  });

  it('reports ready status at the start of a session', () => {
    const schedule = calculateDaySchedule(60);
    const state = createSessionState(schedule.segments);
    assert.equal(getStatusForSessionState(state), 'Ready to focus');
  });

  it('updates status immediately when segments change', () => {
    const segments = buildSessionSegments(2);
    let state = createSessionState(segments, { autoStart: true });

    assert.equal(getStatusContentForSessionState(state).text, 'Focus session in progress...');

    state = { ...state, timeRemaining: 0 };
    const toBreak = decrementSessionTimer(state);
    state = toBreak.state;
    const shortBreak = getStatusContentForSessionState(state);
    assert.equal(shortBreak.type, 'break');
    assert.equal(shortBreak.title, getBreakStatusContent(false).title);
    assert.equal(shortBreak.headline, 'Time to pause!');

    state = { ...state, timeRemaining: 0 };
    const toFocus = decrementSessionTimer(state);
    state = toFocus.state;
    assert.equal(getStatusContentForSessionState(state).text, 'Focus session in progress...');
  });

  it('shows long break status after the fourth pomodoro', () => {
    const segments = buildSessionSegments(4);
    let state = createSessionState(segments, { autoStart: true });

    for (let i = 0; i < 3; i += 1) {
      state = { ...state, timeRemaining: 0 };
      state = decrementSessionTimer(state).state;
      state = { ...state, timeRemaining: 0 };
      state = decrementSessionTimer(state).state;
    }

    assert.equal(getStatusContentForSessionState(state).text, 'Focus session in progress...');
    state = { ...state, timeRemaining: 0 };
    state = decrementSessionTimer(state).state;
    const longBreak = getStatusContentForSessionState(state);
    assert.equal(longBreak.type, 'break');
    assert.equal(longBreak.title, getBreakStatusContent(true).title);
    assert.equal(longBreak.headline, 'Well-earned long break!');
  });

  it('returns rich break copy for short and long breaks', () => {
    const shortBreak = getBreakStatusContent(false);
    const longBreak = getBreakStatusContent(true);

    assert.match(shortBreak.body, /Stand up and stretch/);
    assert.match(longBreak.body, /Step away entirely/);
  });

  it('returns rich completion copy when the session is complete', () => {
    const completion = getCompletionStatusContent();
    const schedule = calculateDaySchedule(30);
    let state = createSessionState(schedule.segments, { autoStart: true });

    while (!state.isComplete) {
      state = { ...state, timeRemaining: 0 };
      const result = decrementSessionTimer(state);
      state = result.state;
      if (result.event === 'session-complete') break;
    }

    const status = getStatusContentForSessionState(state);
    assert.equal(status.type, completion.type);
    assert.equal(status.title, completion.title);
    assert.match(status.headline, /great work today/);
    assert.match(status.body, /well-earned rest/);
    assert.match(getStatusForSessionState(state), /Session complete/);
  });
});
