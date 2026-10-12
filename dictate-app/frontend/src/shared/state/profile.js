import { getProfile } from '../api/endpoints.js';
import { captureSession } from '../auth/session.js';
import { ApiError } from '../api/client.js';
import { getState, setState } from './store.js';

const pending = new WeakMap();
export function loadProfile() {
  const { user: owner, doctorProfile } = getState();
  const current = captureSession();
  if (!owner || !current()) return Promise.reject(new ApiError('session_changed'));
  if (doctorProfile) return Promise.resolve(doctorProfile);
  if (pending.has(owner)) return pending.get(owner);
  const job = getProfile().then(profile => {
    if (!current() || getState().user !== owner) throw new ApiError('session_changed');
    setState({ doctorProfile: profile }); return profile;
  }).finally(() => { if (pending.get(owner) === job) pending.delete(owner); });
  pending.set(owner, job); return job;
}
