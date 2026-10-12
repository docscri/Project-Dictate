import { useId, useRef } from 'react';
import { nextEnabledTab } from '../shared/accessibility/tabs.js';

export default function Tabs({ items, active, onChange, className = '', id, label = 'Views' }) {
  const generated = useId();
  const prefix = id ?? generated;
  const buttons = useRef(new Map());
  const enabled = items.filter(item => typeof item === 'string' || !item.disabled);
  const first = typeof enabled[0] === 'string' ? enabled[0] : enabled[0]?.value;
  const tabStop = enabled.some(item => (typeof item === 'string' ? item : item.value) === active) ? active : first;
  return (
    <div className={['tabs', className].filter(Boolean).join(' ')} role="tablist" aria-label={label}>
      {items.map((item) => {
        const value = typeof item === 'string' ? item : item.value;
        const label = typeof item === 'string' ? item : item.label;
        const selected = active === value;
        const disabled = typeof item === 'object' && Boolean(item.disabled);
        return (
          <button
            key={value}
            ref={button => { if (button) buttons.current.set(value, button); else buttons.current.delete(value); }}
            id={`${prefix}-${encodeURIComponent(value)}-tab`}
            className="tabs__tab"
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${prefix}-${encodeURIComponent(value)}-panel`}
            disabled={disabled}
            tabIndex={!disabled && tabStop === value ? 0 : -1}
            onClick={() => onChange?.(value)}
            onKeyDown={event => {
              const next = nextEnabledTab(items, value, event.key);
              if (next === null) return;
              event.preventDefault(); buttons.current.get(next)?.focus(); onChange?.(next);
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
