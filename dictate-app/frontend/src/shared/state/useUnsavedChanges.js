import { useEffect } from 'react';
import { getState } from './store.js';

export function hasUnsavedNotes(state = getState()) {
  return Boolean(state.user && Object.values(state.noteSessions).some(note => note.editVersion > note.savedVersion));
}
export function protectUnsavedNotes(event) {
  if (!hasUnsavedNotes()) return;
  event.preventDefault();
  event.returnValue = '';
}
export default function useUnsavedChanges() {
  useEffect(() => {
    window.addEventListener('beforeunload', protectUnsavedNotes);
    return () => window.removeEventListener('beforeunload', protectUnsavedNotes);
  }, []);
}
