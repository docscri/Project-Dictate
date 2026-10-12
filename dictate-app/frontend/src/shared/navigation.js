import { setState } from './state/store.js';

export function navigate(path, { replace = false } = {}) {
  if (globalThis.window) window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  setState({ path });
}
