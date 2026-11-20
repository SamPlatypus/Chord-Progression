/** Service-worker registration with an "update available" hook. */
type UpdateCallback = (apply: () => void) => void;

const callbacks = new Set<UpdateCallback>();
let pendingApply: (() => void) | null = null;

export function onUpdateReady(cb: UpdateCallback): () => void {
  callbacks.add(cb);
  if (pendingApply) cb(pendingApply);
  return () => {
    callbacks.delete(cb);
  };
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const hadController = !!navigator.serviceWorker.controller;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      const notify = (worker: ServiceWorker) => {
        pendingApply = () => worker.postMessage('skipWaiting');
        callbacks.forEach((cb) => cb(pendingApply!));
      };
      if (reg.waiting && navigator.serviceWorker.controller) notify(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) notify(worker);
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // First install claims the page silently; only reload for real updates.
        if (!hadController || reloading) return;
        reloading = true;
        location.reload();
      });
      setInterval(() => reg.update().catch(() => undefined), 60 * 60 * 1000);
    } catch {
      /* offline support unavailable (e.g. private mode) */
    }
  });
}
