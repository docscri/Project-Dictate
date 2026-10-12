import { useMemo, useSyncExternalStore } from 'react';
import { useMock } from '../config.js';

let state = {
  selectedConsultation: null,
  selectedPatient: null,
  consultations: [],
  consultationsLoaded: false,
  consultationsRevision: 0,
  patientPopupOpen: false,
  doctorProfile: null,
  dictationSessions: {},
  noteSessions: {},
};
const listeners = new Set();

export function getState() { return state; }
export function setState(update) {
  const changes = typeof update === 'function' ? update(state) : update;
  if (Object.keys(changes).every(key => Object.is(state[key], changes[key]))) return;
  state = { ...state, ...changes };
  if (state.user && Object.hasOwn(changes, 'selectedConsultation')) {
    try {
      const key = `dictate.${useMock ? 'mock' : 'backend'}.selection.${state.user.id}`;
      if (state.selectedConsultation?.id) localStorage.setItem(key, state.selectedConsultation.id);
      else localStorage.removeItem(key);
    } catch { /* Selection still works when browser storage is unavailable. */ }
  }
  listeners.forEach((listener) => listener());
}
export function rememberedConsultationId() {
  try { return localStorage.getItem(`dictate.${useMock ? 'mock' : 'backend'}.selection.${state.user?.id}`); }
  catch { return null; }
}
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function shallowEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && Object.is(left[key], right[key]));
}
export function createStoreSnapshot(selector) {
  let previousState, value, initialized = false;
  return () => {
    if (previousState === state) return value;
    const next = selector(state);
    if (!initialized || !shallowEqual(value, next)) value = next;
    initialized = true; previousState = state;
    return value;
  };
}
const identity = state => state;
export function useStore(selector = identity) {
  const snapshot = useMemo(() => createStoreSnapshot(selector), [selector]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
