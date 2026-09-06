import assert from "node:assert/strict";
import test from "node:test";
import { SHELL_CACHE_NAME } from "../../src/pwa/precache-manifest.js";

test("failed installation removes only the incomplete release cache", async () => {
  const origin = "https://shelfstate.example";
  const activeCacheName = "shelfstate-shell-existing-release";
  const cacheNames = new Set([activeCacheName]);
  const deletedCacheNames = [];
  const eventHandlers = new Map();

  globalThis.self = {
    location: { origin },
    addEventListener(type, handler) {
      eventHandlers.set(type, handler);
    },
  };
  globalThis.caches = {
    async delete(cacheName) {
      deletedCacheNames.push(cacheName);
      return cacheNames.delete(cacheName);
    },
    async open(cacheName) {
      cacheNames.add(cacheName);
      return {
        async put() {
          throw new Error("Invalid index must not be cached");
        },
      };
    },
    async keys() {
      return [...cacheNames];
    },
  };
  globalThis.fetch = async (request) => {
    const body = new TextEncoder().encode("unexpected production HTML");
    return {
      ok: true,
      status: 200,
      url: request.url,
      headers: new Headers({ "content-type": "text/html" }),
      clone() {
        return {
          async arrayBuffer() {
            return body.buffer.slice(
              body.byteOffset,
              body.byteOffset + body.byteLength,
            );
          },
        };
      },
    };
  };

  await import(`../../service-worker.js?test=${Date.now()}`);
  const installHandler = eventHandlers.get("install");
  assert.equal(typeof installHandler, "function");

  let installation;
  installHandler({
    waitUntil(promise) {
      installation = promise;
    },
  });

  await assert.rejects(installation, /digest mismatch/);
  assert.deepEqual(deletedCacheNames, [SHELL_CACHE_NAME, SHELL_CACHE_NAME]);
  assert.deepEqual([...cacheNames], [activeCacheName]);
});
