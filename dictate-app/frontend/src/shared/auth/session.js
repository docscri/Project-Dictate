import { setState } from '../state/store.js';
import { navigate } from '../navigation.js';
import { getState } from '../state/store.js';
import { useMock } from '../config.js';

// Demo sessions must never be sent to the real backend (or vice versa).
const storageKey = useMock ? 'dictate.mock.session' : 'dictate.backend.session';
let memory = null;
let revision = 0;
let generation = 0;
const invalidationListeners = new Set();

function invalidate() {
  generation += 1;
  invalidationListeners.forEach(listener => listener());
}
function clearAccount(user = null) {
  setState({ user, selectedConsultation: null, selectedPatient: null, consultations: [], consultationsLoaded: false,
    patientPopupOpen: false, doctorProfile: null, dictationSessions: {}, noteSessions: {} });
}
export function captureSession() {
  const captured = generation;
  const owner = getState().user?.id;
  return () => {
    const stored = read();
    return captured === generation && (!owner || Boolean(stored && (!stored.user_id || stored.user_id === owner)));
  };
}
export function onSessionInvalidated(listener) {
  invalidationListeners.add(listener);
  return () => invalidationListeners.delete(listener);
}

function read() {
  try {
    if (!globalThis.localStorage) return memory;
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : null;
  } catch { return memory; }
}
export function getAccessToken() { return read()?.access_token ?? null; }
export function getRefreshToken() { return read()?.refresh_token ?? null; }
export function getSessionRevision() { return revision; }
export function setTokens(tokens, { newSession = true } = {}) {
  const previous = read();
  if (newSession) { invalidate(); clearAccount(tokens.user ?? null); }
  memory = { access_token: tokens.access_token ?? null, refresh_token: tokens.refresh_token ?? null,
    user_id: tokens.user?.id ?? previous?.user_id ?? getState().user?.id ?? null };
  revision += 1;
  try { globalThis.localStorage?.setItem(storageKey, JSON.stringify(memory)); } catch { /* Keep the current session in memory. */ }
}
export function clearTokens() {
  invalidate();
  memory = null;
  revision += 1;
  try { globalThis.localStorage?.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
  clearAccount();
}
export function expireSession() {
  clearTokens();
  setState({ user: null, sessionNotice: 'session_expired', sessionReady: true });
  navigate('/login', { replace: true });
}
export function listenForSessionChanges(onChange) {
  const listener = event => {
    if (event.key !== storageKey && event.key !== null) return;
    const previousUser = getState().user?.id ?? memory?.user_id;
    const next = read();
    memory = next; revision += 1;
    if (next?.user_id && previousUser === next.user_id) return;
    invalidate(); clearAccount();
    setState({ sessionNotice: next ? null : 'session_expired' });
    onChange(Boolean(next?.access_token || next?.refresh_token));
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
}
