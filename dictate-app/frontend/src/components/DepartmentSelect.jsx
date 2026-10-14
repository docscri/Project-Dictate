import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { departments } from '../shared/account.js';
import { ChevronDownIcon, ErrorIcon } from './AccountIcons.jsx';

export default function DepartmentSelect({ value, onChange, disabled = false, invalid = false, placeholder = '' }) {
  const [open, setOpen] = useState(false);
  const selectId = useId();
  const menuId = `${selectId}-options`;
  const fieldRef = useRef(null);
  const [menuLayout, setMenuLayout] = useState({ placement: 'below', maxHeight: 220 });

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!fieldRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  useLayoutEffect(() => {
    if (!open) return undefined;
    function positionMenu() {
      const field = fieldRef.current;
      if (!field) return;
      const boundary = field.closest('.signup-form-panel, .profile-panel')?.getBoundingClientRect()
        ?? { top: 0, bottom: window.innerHeight };
      const trigger = field.getBoundingClientRect();
      const gap = 8;
      const edgeClearance = 16;
      const below = Math.max(0, boundary.bottom - trigger.bottom - gap - edgeClearance);
      const above = Math.max(0, trigger.top - boundary.top - gap - edgeClearance);
      const placement = below < 160 && above > below ? 'above' : 'below';
      const available = placement === 'above' ? above : below;
      setMenuLayout({ placement, maxHeight: Math.max(72, Math.min(220, Math.floor(available))) });
    }
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);

  function choose(department) {
    onChange(department);
    setOpen(false);
  }

  return (
    <div ref={fieldRef} className="input-field account-select-field" role="group" aria-label="Department" aria-invalid={invalid}>
      <label id={`${selectId}-label`}>Department</label>
      <button
        id={selectId}
        className={`account-select-trigger${invalid ? ' account-select-trigger--invalid' : ''}`}
        type="button"
        disabled={disabled}
        aria-labelledby={`${selectId}-label ${selectId}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className={!value ? 'account-select-placeholder' : ''}>{value || placeholder}</span>
        <span className="account-select-indicators">{invalid && <ErrorIcon />}<ChevronDownIcon /></span>
      </button>
      {open && <div id={menuId} className={`account-select-menu account-select-menu--${menuLayout.placement}`} style={{ '--account-select-menu-max-height': `${menuLayout.maxHeight}px` }} role="listbox" aria-labelledby={`${selectId}-label`}>
        {departments.map((department) => <button key={department} type="button" role="option" aria-selected={value === department} onClick={() => choose(department)}>{department}</button>)}
      </div>}
    </div>
  );
}
