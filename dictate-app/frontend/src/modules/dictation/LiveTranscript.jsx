import { useEffect, useRef } from 'react';
import Banner from '../../components/Banner.jsx';
import Button from '../../components/Button.jsx';
import { MicrophoneIcon } from '../../components/AccountIcons.jsx';
import { messageFor } from '../../shared/errors.js';
import { states } from './dictationStates.js';

export default function LiveTranscript({ control }) {
  const viewport = useRef(null);
  const { session, underlying, errorCode } = control;
  useEffect(() => { const node = viewport.current; if (node) node.scrollTop = node.scrollHeight; }, [session.finalText, session.interimText]);
  return <>
    {underlying === states.reconnecting && <Banner tone="warn" role="alert" className="live-reconnecting"><span>{messageFor('reconnecting')}</span><Button onClick={control.retry} disabled={control.pending} size="sm">Retry now</Button></Banner>}
    {errorCode && <Banner tone="danger" className="live-error">{messageFor(errorCode)}</Banner>}
    {underlying === states.micOff ? <div className="live-mic-off"><span className="live-mic-off__icon"><MicrophoneIcon off /></span><h2>{messageFor('mic_off')}</h2><p>{messageFor('mic_off_explanation')}</p></div>
      : underlying === states.ready && !session.finalText ? <p className="dictation-placeholder">Tap the mic to start dictating.</p>
      : <div className="live-transcript" ref={viewport} tabIndex="0" aria-label="Live transcript" aria-live="polite"><p><span>{session.finalText}</span>{session.interimText && <><span> </span><span className="live-transcript__interim">{session.interimText}</span></>}{underlying === states.listening && <span className="live-transcript__cursor" aria-hidden="true" />}</p></div>}
  </>;
}
