import { getState, setState } from './store.js';
import { updateConsultationSummaries } from './consultations.js';

export const sections = ['subjective', 'objective', 'assessment', 'plan'];
export const emptyNote = () => Object.fromEntries(sections.map(key => [key, '']));
export const stages = [
  ['finalizing_transcript', 'Finalizing transcript'], ['extracting_terms', 'Finding clinical terms'],
  ['structuring_note', 'Preparing note structure'], ['writing_note', 'Generating SOAP note'], ['saving_note', 'Saving note'],
];
export function noteSession(record) {
  return { draft: { ...emptyNote(), ...record?.note }, editVersion: 0, savedVersion: 0, manual: false,
    activeTab: ['processing', 'saved', 'failed', 'signed'].includes(record?.status) ? 'note' : 'live',
    lastStage: stages.some(([key]) => key === record?.processing_stage) ? record.processing_stage : null,
    errorCode: null, signing: false };
}
export function changeNote(id, changes) {
  setState(state => {
    if (!state.user) return {};
    const prior = state.noteSessions[id] ?? noteSession(state.selectedConsultation?.id === id ? state.selectedConsultation : null);
    return { noteSessions: { ...state.noteSessions, [id]: { ...prior, ...(typeof changes === 'function' ? changes(prior) : changes) } } };
  });
}
export function applyConsultation(record) {
  setState(state => ({
    consultations: updateConsultationSummaries(state.consultations, record),
    ...(state.selectedConsultation?.id === record.id ? { selectedConsultation: { ...state.selectedConsultation, ...record },
      selectedPatient: record.patient ?? state.selectedPatient } : {}),
  }));
}
export function currentNote(id) {
  const state = getState();
  return state.noteSessions[id] ?? noteSession(state.selectedConsultation);
}
