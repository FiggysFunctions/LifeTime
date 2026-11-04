/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { clientsClaim } from "workbox-core";

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute((self as any).__WB_MANIFEST);

sw.addEventListener("push", (e) => {
  let data: {
    title?: string;
    body?: string;
    tag?: string;
    url?: string;
    renotify?: boolean;
  } = {};
  try {
    data = e.data?.json() ?? {};
  } catch {
    // non-JSON push — show a generic notification
  }
  // renotify makes a same-tag repeat buzz again instead of silently replacing
  // the last one; it's missing from TypeScript's notification options.
  const options: NotificationOptions & { renotify?: boolean } = {
    body: data.body ?? "",
    icon: "/icons/icon-192.png",
    tag: data.tag,
    renotify: !!(data.renotify && data.tag),
    data: { url: data.url ?? "/#/calendar" },
  };
  e.waitUntil(
    sw.registration.showNotification(data.title ?? "Lifetime", options)
  );
});

sw.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data?.url as string) ?? "/";
  e.waitUntil(
    sw.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clients) => {
        const open = clients[0];
        if (open) {
          open.navigate(url);
          return open.focus();
        }
        return sw.clients.openWindow(url);
      }
    )
  );
});
