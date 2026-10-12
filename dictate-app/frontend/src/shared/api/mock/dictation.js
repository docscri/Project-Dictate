import { findConsultation, saveConsultation } from './consultations.js';
import { ApiError } from '../client.js';
import { messageFor } from '../../errors.js';
import { readMock, writeMock } from './storage.js';
import { startNoteProcessing } from './note.js';

const phrases = [
  'patient reports intermittent chest tightness', 'on exertion for two weeks relieved by rest',
  'denies dyspnea at night taking lisinopril ten milligrams daily',
  'blood pressure one thirty eight over eighty four heart rate seventy six regular',
  'lungs clear bilaterally no peripheral edema ecg shows normal sinus rhythm',
  'assessment exertional chest pain rule out stable angina hypertension above target',
  'plan order stress echocardiogram increase lisinopril to twenty milligrams', 'recheck blood pressure in four weeks',
];
export function createScriptedStream(id, { onEvent, onClose, offset = 0 }) {
  const timers = []; let closed = false;
  const emit = (event) => {
    if (closed) return;
    if (event.type === 'transcript' && event.final) {
      const record = findConsultation(id); record.transcript = [record.transcript, event.text].filter(Boolean).join(' '); saveConsultation(record);
    }
    onEvent(event);
  };
  const schedule = (event, delay) => timers.push(setTimeout(() => emit(event), delay));
  schedule({ type: 'status', status: 'dictating' }, 0);
  phrases.slice(offset).forEach((text, index) => {
    const words = text.split(' ');
    schedule({ type: 'transcript', text: words.slice(0, Math.ceil(words.length / 2)).join(' '), final: false }, index * 4000 + 400);
    schedule({ type: 'transcript', text, final: false }, index * 4000 + 1800);
    schedule({ type: 'transcript', text, final: true }, index * 4000 + 3000);
  });
  const stream = { close() { if (closed) return; closed = true; timers.forEach(clearTimeout); onClose?.(); } };
  // Development scenarios exercise the boards without opening a microphone.
  const scenario = readMock('streamScenario', 'normal');
  writeMock('streamScenario', 'normal');
  if (scenario === 'connection_error') schedule({ type: 'error', message: 'connection_error' }, 5500);
  if (scenario === 'connection_closed') timers.push(setTimeout(() => stream.close(), 5500));
  if (scenario === 'stream_busy') schedule({ type: 'error', code: 'stream_busy', message: 'Private provider text' }, 0);
  return stream;
}

// UI-only simulation: no microphone, stream, transcript or processing job.
export async function previewDictation(id, action) {
  if (action === 'start' && readMock('streamScenario', 'normal') === 'mic_off') {
    writeMock('streamScenario', 'normal');
    throw new ApiError('mic_off', messageFor('mic_off'));
  }
  const consultation = findConsultation(id);
  if (consultation.status === 'signed') throw new ApiError('locked', messageFor('locked'), 409);
  const allowed = action === 'start' ? ['ready', 'paused', 'dictating'] : ['dictating', 'paused'];
  if (!['start', 'stop'].includes(action) || !allowed.includes(consultation.status)) throw new ApiError('invalid_state', messageFor('invalid_state'), 409);
  consultation.status = action === 'start' ? 'dictating' : 'ready';
  saveConsultation(consultation);
  return structuredClone(consultation);
}

export async function finishDictation(body) {
  const consultation = findConsultation(body.consultation_id);
  const fail = (code) => { throw new ApiError(code, messageFor(code), 409); };
  if (consultation.status === 'signed') fail('locked');
  if (consultation.status === 'processing') fail('already_processing');
  if (!['dictating', 'paused', 'failed'].includes(consultation.status)) fail('invalid_state');
  startNoteProcessing(consultation);
  return { consultation_id: consultation.id, status: 'processing', processing_stage: 'finalizing_transcript' };
}
