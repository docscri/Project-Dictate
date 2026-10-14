import Button from '../../components/Button.jsx';
import Waveform from '../../components/Waveform.jsx';
import StatusLabel from '../../components/StatusLabel.jsx';
import { MicrophoneIcon } from '../../components/AccountIcons.jsx';
import { buttonsByState, states } from './dictationStates.js';

function ControlIcon({ kind }) {
  return <svg viewBox="0 0 32 32" className={`dictation-control-icon dictation-control-icon--${kind}`} aria-hidden="true">
    {kind === 'trash' && <><path d="M7 9h18M12 9V5h8v4M10 9l1 18h10l1-18M14 13v10M18 13v10" /></>}
    {kind === 'pause' && <><rect x="9" y="7" width="5" height="18" rx="1" /><rect x="18" y="7" width="5" height="18" rx="1" /></>}
    {kind === 'play' && <path d="m10 6 17 10-17 10Z" />}
    {kind === 'stop' && <rect x="7" y="7" width="18" height="18" rx="3" />}
  </svg>;
}
export default function DictationControls({ control, onStart = control.start, startLabel = 'Start dictation' }) {
  const { mode, underlying, pending } = control;
  const buttons = buttonsByState[mode];
  return <aside className={`dictation-controls dictation-controls--${mode}`} aria-busy={pending}>
    <div className="dictation-controls__top">{mode !== states.connecting && <span className="dictation-timer">{control.timer}</span>}<StatusLabel status={control.status} label={control.status === 'dictating' ? 'LISTENING' : undefined} className="dictation-controls__status" /></div>
    <Waveform state={underlying === states.recording ? 'active' : [states.paused, states.reconnecting, states.connecting].includes(underlying) ? 'paused' : 'idle'} className="dictation-controls__wave" />
    {buttons.includes('start') && <Button variant="accent" className="dictation-start" aria-label={startLabel} disabled={pending || control.startDisabled} onClick={onStart}><MicrophoneIcon /><span className="sr-only">{startLabel}</span></Button>}
    {buttons.includes('allowMicrophone') && <Button variant="accent" className="dictation-start" disabled={pending} onClick={control.allowMicrophone}><MicrophoneIcon />Allow microphone</Button>}
    {mode === states.confirmDelete ? <div className="dictation-delete-confirm">
      <p>Delete this consultation?</p>
      <Button size="sm" variant="outline" className="dictation-delete-confirm__delete" disabled={pending || control.deleteDisabled} onClick={control.remove}>Delete</Button>
      <Button size="sm" variant="outline" disabled={pending} onClick={control.keep}>Keep</Button>
    </div> : ![states.ready, states.connecting, states.finishing, states.micOff].includes(mode) && <div className="dictation-action-row">
      <div className="dictation-action dictation-action--delete"><Button variant="outline" className="dictation-round dictation-round--small" aria-label="Delete all" disabled={pending || control.deleteDisabled} onClick={control.deleteAll}><ControlIcon kind="trash" /></Button><span>Delete all</span></div>
      <div className="dictation-action"><Button variant={mode === states.paused ? 'accent' : 'outline'} className={`dictation-round dictation-round--main${[states.recording, states.reconnecting].includes(mode) ? ' dictation-round--pause' : ''}`} aria-label={mode === states.paused ? 'Resume' : 'Pause'} disabled={pending || (mode === states.paused ? control.resumeDisabled : control.pauseDisabled)} onClick={mode === states.paused ? control.resume : control.pause}><ControlIcon kind={mode === states.paused ? 'play' : 'pause'} /></Button><span>{mode === states.paused ? 'Resume' : 'Pause'}</span></div>
      <div className="dictation-action dictation-action--stop"><Button className="dictation-round dictation-round--small dictation-round--stop" aria-label="Stop dictation" disabled={pending || control.stopDisabled} onClick={control.stop}><ControlIcon kind="stop" /></Button><span>Stop dictation</span></div>
    </div>}
  </aside>;
}
