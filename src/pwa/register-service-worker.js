const SERVICE_WORKER_URL = "/service-worker.js";
const SERVICE_WORKER_OPTIONS = Object.freeze({
  scope: "/",
  type: "module",
  updateViaCache: "none",
});

export async function registerServiceWorker(serviceWorkerContainer) {
  if (!serviceWorkerContainer?.register) return null;

  try {
    return await serviceWorkerContainer.register(
      SERVICE_WORKER_URL,
      SERVICE_WORKER_OPTIONS,
    );
  } catch {
    return null;
  }
}

export function scheduleServiceWorkerRegistration(windowObject) {
  const serviceWorkerContainer = windowObject?.navigator?.serviceWorker;

  if (!serviceWorkerContainer?.register) return false;

  windowObject.addEventListener(
    "load",
    () => {
      void registerServiceWorker(serviceWorkerContainer);
    },
    { once: true },
  );

  return true;
}

if (typeof window !== "undefined") {
  scheduleServiceWorkerRegistration(window);
}
