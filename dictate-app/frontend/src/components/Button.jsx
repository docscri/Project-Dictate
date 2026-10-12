const variants = new Set(['primary', 'accent', 'outline']);
const sizes = new Set(['sm', 'md', 'lg']);

export default function Button({ variant = 'primary', size = 'md', disabled = false, className = '', type = 'button', children, ...props }) {
  const safeVariant = variants.has(variant) ? variant : 'primary';
  const safeSize = sizes.has(size) ? size : 'md';
  const classes = ['button', `button--${safeVariant}`, `button--${safeSize}`, className].filter(Boolean).join(' ');

  return (
    <button className={classes} type={type} disabled={disabled} {...props}>
      {children}
    </button>
  );
}
