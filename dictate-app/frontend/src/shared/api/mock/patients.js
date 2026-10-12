import { activeAccount } from './auth.js';
import { ApiError } from '../client.js';
import { messageFor } from '../../errors.js';
import { readMock, writeMock } from './storage.js';

const samplePatients = [
  ['patient-demo', 'M. Okafor', 58, 'male'],
  ['patient-brandt', 'L. Brandt', 62, 'female'],
  ['patient-haddad', 'A. Haddad', 45, 'male'],
  ['patient-varga', 'S. Varga', 70, 'female'],
  ['patient-nakamura', 'T. Nakamura', 53, 'male'],
  ['patient-singh', 'R. Singh', 61, 'male'],
  ['patient-costa', 'E. Costa', 49, 'female'],
].map(([id, name, age, sex]) => ({ id, name, age, sex, doctor_id: 'doctor-demo' }));
function records() {
  const existing = readMock('patients', null);
  if (existing) return existing;
  writeMock('patients', samplePatients);
  return structuredClone(samplePatients);
}
const copy = (value) => structuredClone(value);

export function findPatient(id) {
  const doctor = activeAccount();
  const patient = records().find((item) => item.id === id && item.doctor_id === doctor.id);
  if (!patient) throw new ApiError('not_found', messageFor('not_found'), 404);
  return copy(patient);
}
export async function createPatient(body) {
  const doctor = activeAccount();
  if (!body?.name?.trim() || (body.age != null && (!Number.isInteger(body.age) || body.age < 0)) || (body.sex != null && !['male', 'female', 'other'].includes(body.sex))) throw new ApiError('validation_error', messageFor('validation_error'), 422);
  const patient = { id: crypto.randomUUID(), doctor_id: doctor.id, name: body.name.trim(), age: body.age ?? null, sex: body.sex ?? null };
  writeMock('patients', [...records(), patient]);
  return copy(patient);
}
export async function searchPatients(query = '') {
  const doctor = activeAccount();
  return copy(records().filter((item) => item.doctor_id === doctor.id && item.name.toLowerCase().includes(query.trim().toLowerCase())));
}
export async function getPatient(id) { return findPatient(id); }
