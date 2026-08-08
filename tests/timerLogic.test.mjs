import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  POMODORO_SECONDS,
  BREAK_SECONDS,
  formatTime,
  createFocusState,
  createBreakState,
  decrementTimer,
  getRunningStatusText,
  getPausedStatusText,
  getStatusForState,
  getTomatoFillPercent,
  getRingProgressRatio,
} from '../public/js/timerLogic.mjs';

describe('timerLogic', () => {
  it('starts focus mode at 25:00', () => {
    const state = createFocusState();
    assert.equal(state.mode, 'focus');
    assert.equal(state.timeRemaining, POMODORO_SECONDS);
    assert.equal(state.totalDuration, POMODORO_SECONDS);
    assert.equal(formatTime(state.timeRemaining), '25:00');
  });

  it('transitions from focus to break when focus hits zero', () => {
    const focusEnding = createFocusState({ timeRemaining: 0 });
    const { state, event } = decrementTimer(focusEnding);

    assert.equal(event, 'focus-complete');
    assert.equal(state.mode, 'break');
    assert.equal(state.timeRemaining, BREAK_SECONDS);
    assert.equal(state.totalDuration, BREAK_SECONDS);
    assert.equal(state.isRunning, true);
    assert.equal(formatTime(state.timeRemaining), '05:00');
    assert.equal(getRunningStatusText(state.mode), 'Time for a break!');
  });

  it('resets to 25 minutes after break completes', () => {
    const breakEnding = createBreakState({ timeRemaining: 0 });
    const { state, event } = decrementTimer(breakEnding);

    assert.equal(event, 'break-complete');
    assert.equal(state.mode, 'focus');
    assert.equal(state.timeRemaining, POMODORO_SECONDS);
    assert.equal(state.totalDuration, POMODORO_SECONDS);
    assert.equal(state.isRunning, false);
    assert.equal(formatTime(state.timeRemaining), '25:00');
    assert.equal(getStatusForState(state), 'Ready to focus');
  });

  it('counts down one second at a time during break', () => {
    let state = createBreakState({ timeRemaining: 3 });

    for (let expected = 2; expected >= 0; expected -= 1) {
      const result = decrementTimer(state);
      assert.equal(result.event, null);
      assert.equal(result.state.timeRemaining, expected);
      state = result.state;
    }

    const breakComplete = decrementTimer(state);
    assert.equal(breakComplete.event, 'break-complete');
    assert.equal(breakComplete.state.timeRemaining, POMODORO_SECONDS);
  });

  it('runs a full focus → break → focus cycle', () => {
    let state = createFocusState({ timeRemaining: 1, autoStart: true });

    const lastFocusSecond = decrementTimer(state);
    assert.equal(lastFocusSecond.event, null);
    assert.equal(lastFocusSecond.state.timeRemaining, 0);

    const toBreak = decrementTimer(lastFocusSecond.state);
    assert.equal(toBreak.event, 'focus-complete');
    state = toBreak.state;

    const toFocus = decrementTimer(createBreakState({ timeRemaining: 0 }));
    assert.equal(toFocus.event, 'break-complete');
    state = toFocus.state;

    assert.equal(state.mode, 'focus');
    assert.equal(formatTime(state.timeRemaining), '25:00');
    assert.equal(state.isRunning, false);
  });

  it('exposes mode-aware status text', () => {
    assert.equal(getRunningStatusText('focus'), 'Focus session in progress...');
    assert.equal(getRunningStatusText('break'), 'Time for a break!');
    assert.equal(getPausedStatusText('focus'), 'Paused');
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
    const breakHalf = createBreakState({ timeRemaining: BREAK_SECONDS / 2 });

    assert.equal(getRingProgressRatio(focusHalf), 0.5);
    assert.equal(getRingProgressRatio(breakHalf), 0.5);
  });
});
