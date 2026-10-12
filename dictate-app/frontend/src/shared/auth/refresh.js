import { refresh } from '../api/endpoints.js';
import { ApiError } from '../api/client.js';
import { messageFor } from '../errors.js';
import { getAccessToken, getRefreshToken, getSessionRevision, captureSession, setTokens, expireSession } from './session.js';

let pending = null;

export function refreshSession(failedToken) {
  const currentToken = getAccessToken();
  // Another request may already have completed the refresh.
  if (currentToken && currentToken !== failedToken) return Promise.resolve();
  if (pending?.current()) return pending.promise;
  const current = captureSession();
  const refreshToken = getRefreshToken();
  const revision = getSessionRevision();
  if (!refreshToken) {
    expireSession();
    return Promise.reject(new ApiError('session_expired', messageFor('session_expired'), 401));
  }
  const job = { current };
  pending = job;
  job.promise = (async () => {
    try {
      const result = await refresh({ refresh_token: refreshToken });
      if (!current()) throw new ApiError('session_changed');
      if (getSessionRevision() !== revision || getRefreshToken() !== refreshToken) return;
      if (!result.access_token || !result.refresh_token) throw new ApiError('server_error');
      setTokens(result, { newSession: false });
    } catch (error) {
      // A late response must never restore or clear a newer login session.
      if (!current()) throw new ApiError('session_changed');
      if (error.status === 401 || ['session_expired', 'unauthorized'].includes(error.code)) {
        if (getSessionRevision() === revision) expireSession();
        throw new ApiError('session_expired', messageFor('session_expired'), 401);
      }
      throw error;
    } finally { if (pending === job) pending = null; }
  })();
  return job.promise;
}
