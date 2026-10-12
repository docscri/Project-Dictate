import { useMock } from '../config.js';
import { dictationStreamUrl } from '../api/endpoints.js';
import { getAccessToken } from '../auth/session.js';
import { createScriptedStream } from '../api/mock/dictation.js';
import { mapError } from '../errors.js';

const active = new Map();
const codes = new Set(['connection_error', 'stream_busy', 'not_found', 'locked', 'invalid_state', 'session_expired']);
const failure = (code) => Object.assign(new Error('Dictation stream failed'), { code });
export function openDictationSocket(id, { onEvent, onClose, onError, offset = 0 }) {
  if (active.has(id)) throw failure('stream_busy');
  let intentional = false, settled = false, terminal = false, socket, timeout;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  function report(code) {
    if (intentional || terminal) return;
    terminal = true;
    if (!settled) { settled = true; clearTimeout(timeout); rejectReady(failure(code)); }
    onError(code);
  }
  function receive(event) {
    if (intentional || terminal) return;
    if (event.type === 'error') {
      const code = event.code ?? (codes.has(event.message) ? event.message : undefined);
      report(mapError(409, { code }).code); return;
    }
    if (event.type === 'status' && event.status === 'dictating') {
      if (!settled) { settled = true; clearTimeout(timeout); resolveReady(); }
      onEvent(event);
    }
    if (event.type === 'transcript' && typeof event.text === 'string' && typeof event.final === 'boolean') onEvent(event);
  }
  const transport = {
    ready,
    sendAudio(frame) {
      if (!settled || intentional || terminal || !(frame instanceof ArrayBuffer)) return false;
      if (useMock) return true;
      if (socket.readyState !== WebSocket.OPEN) return false;
      if (socket.bufferedAmount > 512000) { report('connection_error'); socket.close(); return false; }
      socket.send(frame); return true;
    },
    close() {
      if (intentional) return;
      intentional = true; clearTimeout(timeout); if (active.get(id) === transport) active.delete(id);
      if (!settled) { settled = true; rejectReady(failure('connection_error')); }
      socket?.close();
    },
  };
  active.set(id, transport);
  timeout = setTimeout(() => { report('connection_error'); socket?.close(); }, 10000);
  try {
    if (useMock) {
      socket = createScriptedStream(id, { onEvent: receive, offset, onClose: () => { if (active.get(id) === transport) active.delete(id); if (!intentional && !terminal) onClose(); } });
    } else {
      const url = dictationStreamUrl(id, getAccessToken());
      socket = new WebSocket(url);
      socket.onmessage = ({ data }) => { try { receive(JSON.parse(data)); } catch { report('connection_error'); socket.close(); } };
      socket.onerror = () => report('connection_error');
      socket.onclose = ({ code }) => {
        if (active.get(id) === transport) active.delete(id);
        if (!intentional && !terminal) {
          if (!settled || code === 1008) report(code === 1008 ? 'session_expired' : 'connection_error');
          else onClose();
        }
      };
    }
  } catch { report('connection_error'); active.delete(id); }
  return transport;
}
