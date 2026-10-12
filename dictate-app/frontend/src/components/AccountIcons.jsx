export function MicrophoneIcon({ off = false } = {}) {
  return <svg className="account-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3" />{off && <path d="m3 3 18 18" />}</svg>;
}
export function EyeIcon({ hidden = false }) {
  return <svg className="account-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{hidden && <path d="m3 3 18 18" />}</svg>;
}
