import * as config from '../config.js';
import { request } from './client.js';
import * as auth from './mock/auth.js';
import * as profile from './mock/profile.js';
import * as patients from './mock/patients.js';
import * as consultations from './mock/consultations.js';
import * as dictation from './mock/dictation.js';
import * as note from './mock/note.js';
import { getAccessToken, expireSession, captureSession } from '../auth/session.js';
import { refreshSession } from '../auth/refresh.js';
import { ApiError } from './client.js';
import { messageFor } from '../errors.js';

const idPath = (id) => `/api/consultations/${encodeURIComponent(id)}`;

async function protectedMock(operation) {
  const current = captureSession();
  const assertCurrent = () => { if (!current()) throw new ApiError('session_changed'); };
  const token = getAccessToken();
  try { const result = await operation(); assertCurrent(); return result; }
  catch (error) {
    assertCurrent();
    if (error.status !== 401) throw error;
    await refreshSession(token);
    assertCurrent();
    try { const result = await operation(); assertCurrent(); return result; }
    catch (retryError) {
      assertCurrent();
      if (retryError.status !== 401) throw retryError;
      expireSession();
      throw new ApiError('session_expired', messageFor('session_expired'), 401);
    }
  }
}

export function health() { return config.useMock ? auth.health() : request('GET', '/health'); }
export function signup(body) { return config.useMock ? auth.signup(body) : request('POST', '/api/auth/signup', body); }
export function login(body) { return config.useMock ? auth.login(body) : request('POST', '/api/auth/login', body, false, { refresh: false, login: true }); }
export function getMe() { return config.useMock ? protectedMock(auth.getMe) : request('GET', '/api/auth/me'); }
export function refresh(body) { return config.useMock ? auth.refresh(body) : request('POST', '/api/auth/refresh', body, false, { refresh: false }); }
export function logout() { return config.useMock ? protectedMock(auth.logout) : request('POST', '/api/auth/logout'); }
export function getProfile() { return config.useMock ? protectedMock(profile.getProfile) : request('GET', '/api/profile'); }
export function updateProfile(body) { return config.useMock ? protectedMock(() => profile.updateProfile(body)) : request('PUT', '/api/profile', body); }
export function createPatient(body) { return config.useMock ? protectedMock(() => patients.createPatient(body)) : request('POST', '/api/patients', body); }
export function searchPatients(query = '', options = {}) { return config.useMock ? protectedMock(() => patients.searchPatients(query)) : request('GET', `/api/patients?query=${encodeURIComponent(query)}`, undefined, false, options); }
export function getPatient(id) { return config.useMock ? protectedMock(() => patients.getPatient(id)) : request('GET', `/api/patients/${encodeURIComponent(id)}`); }
export function createConsultation(body) { return config.useMock ? protectedMock(() => consultations.createConsultation(body)) : request('POST', '/api/consultations', body); }
export function listConsultations({ limit = 50, offset = 0, signal } = {}) { return config.useMock ? protectedMock(() => consultations.listConsultations({ limit, offset })) : request('GET', `/api/consultations?limit=${limit}&offset=${offset}`, undefined, false, { signal }); }
export function getConsultation(id) { return config.useMock ? protectedMock(() => consultations.getConsultation(id)) : request('GET', idPath(id)); }
export function getConsultationStatus(id) { return config.useMock ? protectedMock(() => consultations.getConsultationStatus(id)) : request('GET', `${idPath(id)}/status`); }
export function updateConsultationNote(id, body) { return config.useMock ? protectedMock(() => consultations.updateConsultationNote(id, body)) : request('PUT', `${idPath(id)}/note`, body); }
export function pauseConsultation(id) { return config.useMock ? protectedMock(() => consultations.pauseConsultation(id)) : request('POST', `${idPath(id)}/pause`); }
export function signConsultation(id) { return config.useMock ? protectedMock(() => consultations.signConsultation(id)) : request('POST', `${idPath(id)}/sign`); }
export function deleteConsultation(id) { return config.useMock ? protectedMock(() => consultations.deleteConsultation(id)) : request('DELETE', idPath(id)); }
export function previewDictation(id, action) {
  if (!config.useMock) return Promise.reject(new ApiError('invalid_state', messageFor('invalid_state')));
  return protectedMock(() => dictation.previewDictation(id, action));
}
export function finishDictation(body) { return config.useMock ? protectedMock(() => dictation.finishDictation(body)) : request('POST', '/api/dictation/finish', body); }
export function listNoteFormats() { return config.useMock ? note.listNoteFormats() : request('GET', '/api/note-formats'); }
export function getNoteFormat(name = 'default') { return config.useMock ? note.getNoteFormat(name) : request('GET', `/api/note-formats/${encodeURIComponent(name)}`); }

export function dictationStreamUrl(id, token) {
  const url = new URL(`${config.apiBaseUrl}/api/dictation/stream/${encodeURIComponent(id)}`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token ?? '');
  return url;
}

