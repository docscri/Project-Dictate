export const states = Object.freeze({ ready: 'ready', listening: 'listening', recording: 'listening', paused: 'paused', reconnecting: 'reconnecting', micOff: 'micOff', confirmDelete: 'confirmDelete' });
export const buttonsByState = Object.freeze({
  ready: ['start'], listening: ['deleteAll', 'pause', 'stop'],
  paused: ['deleteAll', 'resume', 'stop'], confirmDelete: ['delete', 'keep'],
  reconnecting: ['deleteAll', 'pause', 'stop'], micOff: ['allowMicrophone'],
});
export function stateForStatus(status) {
  if (status === 'dictating') return states.paused;
  if (!status || status === 'ready') return states.ready;
  return states.paused;
}
