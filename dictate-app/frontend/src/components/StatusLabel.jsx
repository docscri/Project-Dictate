const statuses = {
  ready: { label: 'READY', tone: 'idle' },
  micoff: { label: 'MIC OFF', tone: 'failed' },
  reconnecting: { label: 'RECONNECTING', tone: 'paused' },
  dictating: { label: 'DICTATING', tone: 'dictating' },
  paused: { label: 'PAUSED', tone: 'paused' },
  processing: { label: 'WRITING NOTE', tone: 'processing' },
  saved: { label: 'NOTE READY', tone: 'ready' },
  signed: { label: 'SIGNED', tone: 'signed' },
  failed: { label: 'FAILED', tone: 'failed' },
  done: { label: 'DONE', tone: 'done' },
  'writing note': { label: 'WRITING NOTE', tone: 'processing' },
  'note ready': { label: 'NOTE READY', tone: 'ready' },
};

export default function StatusLabel({ status, label, className = '' }) {
  const normalized = String(status ?? '').toLowerCase();
  const result = statuses[normalized] ?? { label: normalized.replaceAll('_', ' ').toUpperCase(), tone: 'paused' };

  return (
    <span aria-live="polite" className={['status-label', `status-label--${result.tone}`, className].filter(Boolean).join(' ')}>
      {label ?? result.label}
    </span>
  );
}
