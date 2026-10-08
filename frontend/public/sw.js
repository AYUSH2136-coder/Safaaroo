/**
 * Service Worker for Web Push Notifications
 * This file MUST be in the /public directory to be served at the root scope.
 * It runs in a separate thread and can receive push events even when the browser is backgrounded.
 */

// Listen for push events from the browser's push service
self.addEventListener('push', (event) => {
  const data = event.data
    ? event.data.json()
    : { title: 'Location Tracker', body: 'Tracking was interrupted.' };

  const options = {
    body: data.body,
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    tag: 'tracking-interrupted', // Replace previous notification instead of stacking
    renotify: true,
    data: {
      url: data.url || '/'
    },
    actions: [
      { action: 'open', title: 'Open & Resume' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle clicking on the notification — focus or open the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
