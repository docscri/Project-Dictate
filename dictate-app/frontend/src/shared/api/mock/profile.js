import { activeAccount, saveAccount } from './auth.js';
import { ApiError } from '../client.js';
import { messageFor } from '../../errors.js';

export async function getProfile() {
  const { email, name, specialty } = activeAccount();
  return { email, name, specialty };
}
export async function updateProfile(body) {
  const account = activeAccount();
  const email = body?.email?.trim().toLowerCase();
  if (!body?.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email ?? '') || !body?.specialty) throw new ApiError('validation_error', messageFor('validation_error'), 422);
  const updated = { ...account, email, name: body.name.trim(), specialty: body.specialty };
  saveAccount(updated);
  return { email: updated.email, name: updated.name, specialty: updated.specialty };
}
