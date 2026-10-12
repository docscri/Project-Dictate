import { activeAccount, saveAccount } from './auth.js';
import { ApiError } from '../client.js';
import { messageFor } from '../../errors.js';

export async function getProfile() {
  const { name, specialty } = activeAccount();
  return { name, specialty };
}
export async function updateProfile(body) {
  const account = activeAccount();
  if (!body?.name?.trim() || !body?.specialty) throw new ApiError('validation_error', messageFor('validation_error'), 422);
  const updated = { ...account, name: body.name.trim(), specialty: body.specialty };
  saveAccount(updated);
  return [{ name: updated.name, specialty: updated.specialty }];
}
