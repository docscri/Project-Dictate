import { apiBaseUrl, requestTimeoutMs } from '../config.js';
import { getAccessToken, captureSession } from '../auth/session.js';
import { messageFor, mapError } from '../errors.js';
import { refreshSession } from '../auth/refresh.js';
import { expireSession } from '../auth/session.js';

export class ApiError extends Error {
  constructor(code, message, status = 0, fields = []) {
    super(messageFor(code));
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.fields = fields;
  }
}

export function onUnauthorized(token) { return refreshSession(token); }

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Request aborted', 'AbortError'));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function request(method, path, body, retried = false, options = {}) {
  const current = captureSession();
  const controller = new AbortController();
  const networkError = () => new ApiError(mapError(0, null, { network: true, dictation: globalThis.location?.pathname === '/dictation' }).code);
  const assertCurrent = () => {
    if (!current()) throw new ApiError('session_changed');
    if (options.signal?.aborted) throw new ApiError('request_cancelled');
    if (controller.signal.aborted) throw networkError();
  };
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timeout = setTimeout(cancel, options.timeoutMs ?? requestTimeoutMs);
  try {
    assertCurrent();
    const headers = { Accept: 'application/json' };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response;
    try {
      response = await abortable(fetch(`${apiBaseUrl}${path}`, {
        method,
        headers,
        signal: controller.signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      }), controller.signal);
    } catch {
      assertCurrent();
      const mapped = mapError(0, null, { network: true, dictation: globalThis.location?.pathname === '/dictation' });
      throw new ApiError(mapped.code);
    }

    assertCurrent();
    if (response.status === 401 && options.refresh !== false) {
      if (retried) {
        if (getAccessToken() === token) expireSession();
        throw new ApiError('session_expired', messageFor('session_expired'), 401);
      }
      try { await abortable(onUnauthorized(token), controller.signal); }
      catch (error) {
        // Preserve a refresh rejection's notice, but normalize timeout/cancellation.
        if (controller.signal.aborted) assertCurrent();
        throw error;
      }
      assertCurrent();
      return request(method, path, body, true, options);
    }
    if (!response.ok) {
      const payload = await abortable(response.json(), controller.signal).catch(() => ({}));
      assertCurrent();
      const mapped = mapError(response.status, payload, { login: options.login });
      throw new ApiError(mapped.code, mapped.message, response.status, mapped.fields);
    }
    if (response.status === 204) return undefined;
    try {
      const result = await abortable(response.json(), controller.signal);
      assertCurrent();
      return result;
    } catch {
      assertCurrent();
      throw new ApiError('server_error', messageFor('server_error'), response.status);
    }
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', cancel);
  }
}
