// H3.3: Compass push service worker (minimal — tylko push handling).
// Nie cache'uje resources — to NIE jest pełen PWA service worker, tylko push receiver.
//
// Rejestrujemy go z `usePushSubscription` hook (browser-side).
// Jeśli kiedyś dorobimy pełen offline cache, można rozszerzyć ten plik.

self.addEventListener('install', (event) => {
    self.skipWaiting()
})

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim())
})

self.addEventListener('push', (event) => {
    if (!event.data) return
    let payload
    try {
        payload = event.data.json()
    } catch {
        payload = { title: 'ComPass', body: event.data.text() }
    }

    const options = {
        body: payload.body ?? '',
        icon: payload.icon ?? '/compass_icon_192.png',
        badge: payload.badge ?? '/compass_icon_192.png',
        tag: payload.tag ?? 'compass',
        data: { url: payload.url ?? '/' },
        renotify: false,
        requireInteraction: false,
    }

    event.waitUntil(self.registration.showNotification(payload.title ?? 'ComPass', options))
})

self.addEventListener('notificationclick', (event) => {
    event.notification.close()
    const url = event.notification.data?.url ?? '/'
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
            // Focus existing tab z compass.dynaminds.pl jeśli istnieje
            for (const w of wins) {
                if (w.url.includes(self.location.host)) {
                    w.navigate(url)
                    return w.focus()
                }
            }
            return clients.openWindow(url)
        }),
    )
})
