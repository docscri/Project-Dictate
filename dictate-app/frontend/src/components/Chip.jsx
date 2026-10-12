export default function Chip({ label, selected = false, onSelect = () => {}, disabled = false, className = '', ...props }) {
  const classes = ['chip', selected ? 'chip--selected' : '', className].filter(Boolean).join(' ');

  return (
    <button
      {...props}
      className={classes}
      type="button"
      disabled={disabled}
      aria-pressed={selected}
      onClick={() => onSelect(label)}
    >
      {selected && <span className="chip__mark" aria-hidden="true">✓</span>}
      {label}
    </button>
  );
}
