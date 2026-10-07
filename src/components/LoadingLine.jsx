import { useLog } from '../debugLog.js';
import { FORMAT_LABELS, strategyLabel } from '../net.js';
import useNow from '../useNow.js';

// "Updating this folder…" with live detail: which sources are being tried,
// how long it has taken and how many attempts failed so far.
export default function LoadingLine({ purpose, text, onCancel, onDetails }) {
  const log = useLog();
  const group = log.find((g) => g.purpose === purpose && g.status === 'pending');
  const now = useNow(group ? 200 : null);
  const trying = group ? group.attempts.filter((a) => a.status === 'pending') : [];
  const failed = group ? group.attempts.filter((a) => a.status === 'error').length : 0;
  const names = trying.map((a) => `${strategyLabel(a.strategy)}${a.format === 'json' ? '' : ` (${FORMAT_LABELS[a.format]})`}`);

  return (
    <div className="loading-line" role="status">
      <span className="spinner" />
      <span className="loading-text">
        {text}
        {names.length > 0 && <span> · trying {names.join(', ')}</span>}
        {group && <span> · {Math.max(0, (now - group.startedAt) / 1000).toFixed(1)}s</span>}
        {failed > 0 && <span> · {failed} failed</span>}
      </span>
      {onCancel && <button type="button" className="link-btn" onClick={onCancel}>Cancel</button>}
      {onDetails && <button type="button" className="link-btn" onClick={onDetails}>Details</button>}
    </div>
  );
}
