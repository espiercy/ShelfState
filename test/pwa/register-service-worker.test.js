import assert from "node:assert/strict";
import test from "node:test";
import {
  registerServiceWorker,
  scheduleServiceWorkerRegistration,
} from "../../src/pwa/register-service-worker.js";

test("does not schedule registration when service workers are unsupported", () => {
  let listenerAdded = false;
  const windowObject = {
    navigator: {},
    addEventListener() {
      listenerAdded = true;
    },
  };

  assert.equal(scheduleServiceWorkerRegistration(windowObject), false);
  assert.equal(listenerAdded, false);
});

test("registers the root module worker with cache-bypassing updates", async () => {
  const calls = [];
  const registration = { scope: "https://example.test/" };
  const serviceWorkerContainer = {
    async register(...args) {
      calls.push(args);
      return registration;
    },
  };

  assert.equal(
    await registerServiceWorker(serviceWorkerContainer),
    registration,
  );
  assert.deepEqual(calls, [
    [
      "/service-worker.js",
      { scope: "/", type: "module", updateViaCache: "none" },
    ],
  ]);
});

test("schedules non-blocking registration for the load event", async () => {
  let loadListener;
  let registerCalled = false;
  const windowObject = {
    navigator: {
      serviceWorker: {
        async register() {
          registerCalled = true;
          return {};
        },
      },
    },
    addEventListener(type, listener, options) {
      assert.equal(type, "load");
      assert.deepEqual(options, { once: true });
      loadListener = listener;
    },
  };

  assert.equal(scheduleServiceWorkerRegistration(windowObject), true);
  assert.equal(registerCalled, false);

  loadListener();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(registerCalled, true);
});

test("registration failures resolve harmlessly", async () => {
  const serviceWorkerContainer = {
    async register() {
      throw new Error("registration unavailable");
    },
  };

  await assert.doesNotReject(async () => {
    assert.equal(await registerServiceWorker(serviceWorkerContainer), null);
  });
});
