const messages = {
  invalid_credentials: 'Wrong email or password.',
  session_expired: 'Your session has ended. Please sign in again.',
  unauthorized: 'Please sign in to continue.',
  signup_failed: "We couldn't create your account. Check your details and try again.",
  validation_error: 'Please check the highlighted fields.',
  not_found: 'This item is no longer available.',
  stream_busy: 'Dictation is already open in another window.',
  connection_error: 'Connection lost. Reconnecting...',
  already_processing: 'This note is already being written.',
  invalid_state: "This action isn't available right now.",
  locked: "This note is signed and can't be changed.",
  note_failed: "We couldn't write your note. Try again, or write it manually.",
  note_failed_title: 'We could not write your note',
  note_failed_body: 'Your transcript is saved. Try again, or write the note manually.',
  server_error: 'Something went wrong. Please try again.',
  mic_off: 'Microphone access is off',
  mic_off_explanation: 'Allow microphone access in your browser, then tap Allow microphone.\nNothing is recorded until you start dictating.',
  reconnecting: 'Connection lost. Reconnecting... Your transcript so far is kept.',
};

export function messageFor(code) {
  return Object.hasOwn(messages, code) ? messages[code] : messages.server_error;
}

const apiCodes = new Set(['invalid_credentials', 'session_expired', 'unauthorized', 'signup_failed', 'validation_error', 'not_found', 'stream_busy', 'connection_error', 'already_processing', 'invalid_state', 'locked', 'note_failed', 'server_error']);
// Server messages and validation descriptions never become UI text.
export function mapError(status, body, { login = false, network = false, dictation = false } = {}) {
  let code = apiCodes.has(body?.code) ? body.code : 'server_error';
  if (network) code = dictation ? 'connection_error' : 'server_error';
  else if (status === 401 && login) code = 'invalid_credentials';
  else if (status === 404) code = 'not_found';
  else if (status === 422) code = 'validation_error';
  else if (status >= 500) code = 'server_error';
  const fields = code === 'validation_error' && Array.isArray(body?.fields)
    ? body.fields.filter(field => ['name', 'email', 'password', 'specialty', 'age', 'sex', 'subjective', 'objective', 'assessment', 'plan'].includes(field)) : [];
  return { code, message: messageFor(code), fields };
}
