const bars = Array.from({ length: 28 }, (_, index) => index + 1);

export default function Waveform({ state = 'idle', className = '' }) {
  const safeState = ['idle', 'active', 'paused'].includes(state) ? state : 'idle';
  const classes = ['waveform', `waveform--${safeState}`, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="img" aria-label={`Audio ${safeState}`}>
      {bars.map((bar) => (
        <span
          key={bar}
          className="waveform__bar"
          style={{
            '--bar-height': `var(--wave-height-${bar})`,
            '--bar-delay': `var(--wave-delay-${bar})`,
          }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
