// The lib modules expect a browser localStorage; back one with a Map so they
// run under node. Cleared before every test to keep persistence tests independent.
import { beforeEach } from "vitest";

const store = new Map();

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(String(k), String(v)),
  removeItem: (k) => store.delete(String(k)),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

beforeEach(() => localStorage.clear());
