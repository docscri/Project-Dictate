import { activeAccount } from './auth.js';
import { findPatient } from './patients.js';
import { ApiError } from '../client.js';
import { messageFor } from '../../errors.js';
import { readMock, writeMock } from './storage.js';
import { advanceNoteProcessing, sampleNote, sampleTerms } from './note.js';

function records() {
  const existing = readMock('consultations', null);
  if (existing) return existing;
  const samples = [
    ['consultation-demo', 'patient-demo', 'ready', 10, 0, 0],
    ['consultation-brandt', 'patient-brandt', 'signed', 9, 15, 0],
    ['consultation-haddad', 'patient-haddad', 'signed', 8, 30, 0],
    ['consultation-varga', 'patient-varga', 'saved', 11, 20, 0],
    ['consultation-nakamura', 'patient-nakamura', 'failed', 14, 10, 0],
    ['consultation-singh', 'patient-singh', 'signed', 16, 40, 1],
    ['consultation-costa', 'patient-costa', 'signed', 11, 5, 1],
  ].map(([id, patient_id, status, hour, minute, daysAgo]) => {
    const created = new Date(); created.setDate(created.getDate() - daysAgo); created.setHours(hour, minute, 0, 0);
    return { id, patient_id, doctor_id: 'doctor-demo', created_at: created.toISOString(), status,
      transcript: '', note: ['signed', 'saved'].includes(status) ? { ...sampleNote, highlights: [] } : null,
      terms: ['signed', 'saved'].includes(status) ? sampleTerms : [], signed_at: status === 'signed' ? created.toISOString() : null,
      processing_stage: status === 'failed' ? 'failed' : status === 'ready' ? null : 'completed', processing_error: status === 'failed' ? 'note_failed' : null };
  });
  writeMock('consultations', samples);
  return samples;
}
export function saveConsultation(consultation) { writeMock('consultations', records().map((item) => item.id === consultation.id ? consultation : item)); }
const copy = (value) => structuredClone(value);

function fail(code, status = 409) { throw new ApiError(code, messageFor(code), status); }
export function findConsultation(id) {
  const doctor = activeAccount();
  const result = records().find((item) => item.id === id && item.doctor_id === doctor.id);
  if (!result) fail('not_found', 404);
  return result;
}
function allow(consultation, states) {
  if (consultation.status === 'signed') fail('locked');
  if (!states.includes(consultation.status)) fail('invalid_state');
}
function withPatient(consultation) {
  let patient = null;
  try { const { id, name, age, sex } = findPatient(consultation.patient_id); patient = { id, name, age, sex }; }
  catch (error) { if (error.code !== 'not_found') throw error; }
  return { ...copy(consultation), patient };
}
export async function createConsultation(body) {
  const doctor = activeAccount();
  findPatient(body.patient_id);
  const consultation = {
    id: crypto.randomUUID(), doctor_id: doctor.id, patient_id: body.patient_id,
    created_at: new Date().toISOString(), status: 'ready', transcript: '',
    note: null, processing_stage: null, processing_error: null,
  };
  writeMock('consultations', [consultation, ...records()]);
  return copy(consultation);
}
export async function listConsultations({ limit = 50, offset = 0 } = {}) {
  const doctor = activeAccount();
  return records().filter(item => item.doctor_id === doctor.id)
    .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id))
    .slice(offset, offset + limit).map(withPatient)
    .map(({ id, doctor_id, patient_id, status, created_at, patient }) => ({ id, doctor_id, patient_id, status, created_at, patient }));
}
export async function getConsultation(id) { return withPatient(findConsultation(id)); }
export async function getConsultationStatus(id) {
  advanceNoteProcessing(id);
  const { status, processing_stage, processing_error } = findConsultation(id);
  return { status, processing_stage, processing_error };
}
export async function updateConsultationNote(id, body) {
  const consultation = findConsultation(id);
  allow(consultation, ['ready', 'failed', 'saved']);
  if (!body?.note || ['subjective', 'objective', 'assessment', 'plan'].some((section) => typeof body.note[section] !== 'string')) {
    fail('validation_error', 422);
  }
  consultation.note = { ...body.note, highlights: [] };
  consultation.status = 'saved';
  saveConsultation(consultation);
  return copy(consultation);
}
export async function pauseConsultation(id) {
  const consultation = findConsultation(id);
  allow(consultation, ['dictating']);
  consultation.status = 'paused';
  saveConsultation(consultation);
  return copy(consultation);
}
export async function signConsultation(id) {
  const consultation = findConsultation(id);
  allow(consultation, ['saved']);
  consultation.status = 'signed';
  consultation.signed_at = new Date().toISOString();
  saveConsultation(consultation);
  return copy(consultation);
}
export async function deleteConsultation(id) {
  const consultation = findConsultation(id);
  allow(consultation, ['ready', 'dictating', 'paused', 'saved', 'failed']);
  writeMock('consultations', records().filter((item) => item.id !== consultation.id));
  // The documented 204 response intentionally has no data.
  return undefined;
}
