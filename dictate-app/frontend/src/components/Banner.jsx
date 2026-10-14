import { ErrorIcon } from './AccountIcons.jsx';

const tones = new Set(['warn', 'danger', 'info']);
const icons = { info: 'i' };

export default function Banner({ tone = 'info', children, className = '', ...props }) {
  const safeTone = tones.has(tone) ? tone : 'info';
  const classes = ['banner', `banner--${safeTone}`, className].filter(Boolean).join(' ');

  return (
    <div {...props} className={classes} role={props.role ?? (safeTone === 'danger' ? 'alert' : 'status')}>
      <span className="banner__icon" aria-hidden="true">{safeTone === 'warn' ? <svg viewBox="0 0 24 24"><path d="M12 3 2 21h20Z M12 9v5 M12 17v1" /></svg> : safeTone === 'danger' ? <ErrorIcon /> : icons.info}</span>
      <div>{children}</div>
    </div>
  );
}
