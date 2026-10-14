import { useId } from 'react';
import { ErrorIcon } from './AccountIcons.jsx';

export default function Input({ label, type = 'text', value, onChange, error, invalid = false, showInvalidIcon = false, disabled = false, placeholder = '', className = '', autoFocus = false, action, ...props }) {
  const inputId = useId();
  const errorId = error ? `${inputId}-error` : undefined;
  const classes = ['input-field__control', error ? 'input-field__control--error' : '', className].filter(Boolean).join(' ');

  return (
    <div className="input-field">
      <label htmlFor={inputId}>{label}</label>
      <div className={["input-control-wrap", action ? "input-control-wrap--action" : "", showInvalidIcon && (error || invalid) ? "input-control-wrap--error-icon" : ""].filter(Boolean).join(' ')}>
      <input
        {...props}
        id={inputId}
        className={classes}
        type={type}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error || invalid)}
        aria-describedby={errorId}
      />
      {action && <span className="input-control-action">{action}</span>}
      {showInvalidIcon && (error || invalid) && <span className="input-control-error-icon"><ErrorIcon /></span>}
      </div>
      {error && <span id={errorId} className="input-field__error">{error}</span>}
    </div>
  );
}
