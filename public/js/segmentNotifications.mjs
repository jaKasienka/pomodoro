let notificationSequence = 0;

export function isSegmentNotificationSupported() {
  return 'Notification' in window;
}

export async function ensureSegmentNotificationPermission() {
  if (!isSegmentNotificationSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;

  return (await Notification.requestPermission()) === 'granted';
}

function showNotification(title, { body, tagPrefix }) {
  if (!isSegmentNotificationSupported() || Notification.permission !== 'granted') {
    return;
  }

  notificationSequence += 1;

  try {
    new Notification(title, {
      body,
      tag: `${tagPrefix}-${notificationSequence}`,
      renotify: true,
    });
  } catch {
    // Notifications may be blocked in this browsing context.
  }
}

export function notifySegmentStart(segment) {
  const title = segment === 'break' ? 'Break time!' : 'Focus time!';
  showNotification(title, { tagPrefix: `pomodoro-${segment}` });
}

export function notifyDayComplete() {
  showNotification('Day plan complete!', {
    body: 'Great work today.',
    tagPrefix: 'pomodoro-day-complete',
  });
}
