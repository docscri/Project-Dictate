import { ApiError } from '../client.js';
import { messageFor } from '../../errors.js';
import { readMock } from './storage.js';
import { findConsultation, saveConsultation } from './consultations.js';
import { stages } from '../../state/notes.js';

export const sampleNote = {
  subjective: 'Patient reports intermittent chest tightness on exertion for two weeks, relieved by rest. Denies dyspnea at night. Taking lisinopril 10 mg daily.',
  objective: 'BP 138/84, heart rate 76, regular. Lungs clear bilaterally. No peripheral edema. ECG shows normal sinus rhythm.',
  assessment: 'Exertional chest pain, rule out stable angina. Hypertension, above target.',
  plan: 'Order stress echocardiogram. Increase lisinopril to 20 mg. Recheck blood pressure in four weeks.',
};
export const sampleTerms = ['intermittent chest tightness', 'dyspnea', 'lisinopril', '10 mg', 'heart rate 76, regular', 'peripheral edema', 'rule out stable angina', 'above target', 'stress echocardiogram', 'blood pressure'].map(text => ({ text, type: 'medical_condition' }));
export function startNoteProcessing(consultation) {
  consultation.status = 'processing'; consultation.processing_stage = stages[0][0]; consultation.processing_error = null;
  consultation.mockProcessingStarted = Date.now();
  // PNG/test-only scenario. Real requests never inspect this flag.
  consultation.mockProcessingFailure = readMock('noteFailure', false);
  saveConsultation(consultation);
}
export function advanceNoteProcessing(id) {
  const record = findConsultation(id);
  if (record.status !== 'processing' || !record.mockProcessingStarted) return;
  const step = Math.floor((Date.now() - record.mockProcessingStarted) / 1800);
  if (record.mockProcessingFailure && step >= 3) {
    record.status = 'failed'; record.processing_stage = 'failed'; record.processing_error = 'note_failed';
  } else if (step >= stages.length) {
    record.status = 'saved'; record.processing_stage = 'completed'; record.note = { ...sampleNote, highlights: [] }; record.terms = sampleTerms;
  } else record.processing_stage = stages[step][0];
  saveConsultation(record);
}

const format = { name: 'default', sections: ['subjective', 'objective', 'assessment', 'plan'] };

export async function listNoteFormats() { return [structuredClone(format)]; }
export async function getNoteFormat(name = 'default') {
  if (name !== 'default') throw new ApiError('not_found', messageFor('not_found'), 404);
  return structuredClone(format);
}
