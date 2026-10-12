import { ApiError } from '../client.js';
import { messageFor } from '../../errors.js';
import { getAccessToken } from '../../auth/session.js';
import { readMock, writeMock } from './storage.js';

export const doctor = { id: 'doctor-demo', email: 'priya@hospital.com' };
const seededAccount = { ...doctor, name: 'Dr. Priya Sharma', specialty: 'Cardiology' };

function fail(code, status) { throw new ApiError(code, messageFor(code), status); }
async function digest(password) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function accounts() {
  const existing = readMock('accounts', null);
  if (existing) return existing;
  const seed = [{ ...seededAccount, passwordDigest: await digest('Dictate123!') }];
  writeMock('accounts', seed);
  return seed;
}
function tokens(account) {
  Object.assign(doctor, { id: account.id, email: account.email });
  const result = {
    user: { id: account.id, email: account.email },
    access_token: `mock-access-${crypto.randomUUID()}`,
    refresh_token: `mock-refresh-${crypto.randomUUID()}`,
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  const sessions = readMock('sessions', {});
  sessions[result.access_token] = { id: account.id, refresh: result.refresh_token, expires: result.expires_at };
  writeMock('sessions', sessions);
  return result;
}
export function activeAccount() {
  const session = readMock('sessions', {})[getAccessToken()];
  if (!session || session.expires <= Date.now() / 1000) fail('unauthorized', 401);
  const account = readMock('accounts', []).find((entry) => entry.id === session.id);
  if (!account) fail('unauthorized', 401);
  Object.assign(doctor, { id: account.id, email: account.email });
  return account;
}
export function saveAccount(updated) {
  const list = readMock('accounts', []);
  writeMock('accounts', list.map((account) => account.id === updated.id ? updated : account));
}
export async function health() { return { status: 'ok' }; }
export async function login(body) {
  const account = (await accounts()).find((entry) => entry.email === body?.email?.trim().toLowerCase());
  if (!account || account.passwordDigest !== await digest(body?.password ?? '')) fail('invalid_credentials', 401);
  return tokens(account);
}
export async function signup(body) {
  if (!body?.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body?.email ?? '') || !body?.password || !body?.specialty) fail('validation_error', 422);
  const list = await accounts();
  const email = body.email.trim().toLowerCase();
  if (list.some((account) => account.email === email)) fail('signup_failed', 400);
  const account = { id: crypto.randomUUID(), email, name: body.name.trim(), specialty: body.specialty, passwordDigest: await digest(body.password) };
  writeMock('accounts', [...list, account]);
  return { ...tokens(account), confirmation_required: false };
}
export async function getMe() {
  const { id, email } = activeAccount();
  return { id, email };
}
export async function refresh(body) {
  const sessions = readMock('sessions', {});
  const entry = Object.entries(sessions).find(([, session]) => session.refresh && session.refresh === body?.refresh_token);
  if (!entry) fail('session_expired', 401);
  const account = (await accounts()).find((item) => item.id === entry[1].id);
  if (!account) fail('session_expired', 401);
  sessions[entry[0]].refresh = null;
  writeMock('sessions', sessions);
  return tokens(account);
}
export async function logout() {
  activeAccount();
  const sessions = readMock('sessions', {});
  sessions[getAccessToken()].refresh = null;
  writeMock('sessions', sessions);
  return { message: 'Logged out' };
}
