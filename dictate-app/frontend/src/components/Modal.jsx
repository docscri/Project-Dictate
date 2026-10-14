import { useEffect, useRef } from 'react';
import Button from './Button.jsx';

export default function Modal({ open, onClose = () => {}, title = 'Dialog', header = true, className = '', backdropClassName = '', children }) {
  const dialog = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const controls = [...dialog.current.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')].filter((element) => element.getClientRects().length && !element.closest('[inert]'));
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={['modal-backdrop', backdropClassName].filter(Boolean).join(' ')}>
      <button type="button" className="modal-dismiss" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <section ref={dialog} className={['modal', className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        {header && <header className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <Button variant="outline" size="sm" onClick={onClose} aria-label="Close dialog">Close</Button>
        </header>}
        {children}
      </section>
    </div>
  );
}
