import { useState } from 'react';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import Chip from '../components/Chip.jsx';
import Tabs from '../components/Tabs.jsx';
import Waveform from '../components/Waveform.jsx';
import Banner from '../components/Banner.jsx';
import Modal from '../components/Modal.jsx';
import StatusLabel from '../components/StatusLabel.jsx';
import { messageFor } from '../shared/errors.js';

const states = ['default', 'hover', 'focus', 'disabled', 'error'];
const variants = ['primary', 'accent', 'outline'];
const statuses = ['DICTATING', 'PAUSED', 'WRITING NOTE', 'NOTE READY', 'SIGNED', 'FAILED', 'DONE'];
const tabItems = ['Live transcript', 'Clinical note'];

function Example({ state = 'default', children }) {
  return (
    <div className={`dev-page__item demo-force-${state}`}>
      <span className="dev-page__label">{state}</span>
      <div className="dev-page__example" inert={state === 'disabled' ? true : undefined}>{children}</div>
      {state === 'error' && <Banner tone="danger">{messageFor('validation_error')}</Banner>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="dev-page__section" aria-label={title}>
      <h2 className="dev-page__section-title">{title}</h2>
      <div className="dev-page__grid">{children}</div>
    </section>
  );
}

export default function DevComponents() {
  const [values, setValues] = useState({});
  const [selected, setSelected] = useState({});
  const [tabs, setTabs] = useState({});
  const [modalState, setModalState] = useState(null);
  const closeModal = () => setModalState(null);

  return (
    <main className="dev-page">
      <header className="dev-page__header">
        <h1 className="dev-page__title">Dictate</h1>
        <p>Component foundation</p>
      </header>
      <Section title="Buttons">
        {states.map((state) => (
          <Example key={state} state={state}>
            <div className="dev-page__stack">
              {variants.map((variant, index) => (
                <Button key={variant} variant={variant} size={['sm', 'md', 'lg'][index]} disabled={state === 'disabled'}>{variant}</Button>
              ))}
            </div>
          </Example>
        ))}
      </Section>
      <Section title="Inputs">
        {states.map((state) => (
          <Example key={state} state={state}>
            <Input label={`Email · ${state}`} type="email" placeholder="you@hospital.com" value={values[state] ?? ''}
              onChange={(event) => setValues((current) => ({ ...current, [state]: event.target.value }))}
              disabled={state === 'disabled'} error={state === 'error' ? messageFor('validation_error') : undefined} />
          </Example>
        ))}
      </Section>
      <Section title="Chips">
        {states.map((state) => (
          <Example key={state} state={state}>
            <Chip label="General Medicine" selected={selected[state] ?? state === 'default'} disabled={state === 'disabled'}
              onSelect={() => setSelected((current) => ({ ...current, [state]: !(current[state] ?? state === 'default') }))} />
          </Example>
        ))}
      </Section>
      <Section title="Tabs">
        {states.map((state) => (
          <Example key={state} state={state}>
            <Tabs id={`demo-${state}`} items={tabItems} active={tabs[state] ?? tabItems[0]}
              onChange={(active) => setTabs((current) => ({ ...current, [state]: active }))} />
            {tabItems.map(item => <div key={item} role="tabpanel" id={`demo-${state}-${encodeURIComponent(item)}-panel`}
              aria-labelledby={`demo-${state}-${encodeURIComponent(item)}-tab`} hidden={(tabs[state] ?? tabItems[0]) !== item}>{item}</div>)}
          </Example>
        ))}
      </Section>
      <Section title="Waveform">
        {states.map((state) => (
          <Example key={state} state={state}>
            {['idle', 'active', 'paused'].map((waveState) => (
              <div key={waveState} className="dev-page__wave-example">
                <span className="dev-page__label">{waveState}</span>
                <Waveform state={waveState} />
              </div>
            ))}
          </Example>
        ))}
      </Section>
      <Section title="Banners">
        {states.map((state) => (
          <Example key={state} state={state}>
            <div className="dev-page__section">
              <Banner tone="warn">{messageFor('connection_error')}</Banner>
              <Banner tone="danger">{messageFor('server_error')}</Banner>
              <Banner tone="info">{messageFor('unauthorized')}</Banner>
            </div>
          </Example>
        ))}
      </Section>
      <Section title="Modal">
        {states.map((state) => (
          <Example key={state} state={state}>
            <Button variant="outline" disabled={state === 'disabled'} onClick={() => setModalState(state)}>Open modal</Button>
          </Example>
        ))}
      </Section>
      <Section title="Status labels">
        {states.map((state) => (
          <Example key={state} state={state}>
            <div className="dev-page__stack">{statuses.map((status) => <StatusLabel key={status} status={status} />)}</div>
          </Example>
        ))}
      </Section>
      <Section title="Focus on paper">
        <div className="dev-page__item dev-page__item--paper paper-surface">
          <Input label="Full name" value={values.paper ?? ''} onChange={(event) => setValues((current) => ({ ...current, paper: event.target.value }))} />
          <Button variant="primary">Button</Button>
        </div>
      </Section>
      <Modal open={modalState !== null} onClose={closeModal} title="Modal">
        {modalState === 'error' && <Banner tone="danger">{messageFor('server_error')}</Banner>}
        <Button variant="accent" onClick={closeModal}>Close modal</Button>
      </Modal>
    </main>
  );
}
