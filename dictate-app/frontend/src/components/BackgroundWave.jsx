export default function BackgroundWave() {
  return <div className="login-wave" aria-hidden="true">{Array.from({ length: 64 }, (_, index) => <span key={index} style={{ '--bar-height': `var(--wave-height-${(index * 11) % 28 + 1})`, '--bar-delay': `var(--wave-delay-${index % 28 + 1})` }} />)}</div>;
}
