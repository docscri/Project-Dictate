const memory = new Map();

export function readMock(key, fallback) {
  try {
    const value = globalThis.localStorage?.getItem(`dictate.mock.${key}`);
    if (value) return JSON.parse(value);
  } catch { /* Mock mode also works without browser storage. */ }
  return memory.has(key) ? structuredClone(memory.get(key)) : structuredClone(fallback);
}
export function writeMock(key, value) {
  memory.set(key, structuredClone(value));
  try { globalThis.localStorage?.setItem(`dictate.mock.${key}`, JSON.stringify(value)); } catch { /* In-memory fallback. */ }
}
