import { useState } from 'react';
import { clearLog, exportLog, useLog } from '../../debugLog.js';
import { FORMAT_LABELS, strategyLabel } from '../../net.js';
import useNow from '../../useNow.js';
import { Pill, fmtBytes, fmtClock, fmtMs } from './util.jsx';

const FILTERS = {
  all: 'Everything',
  posts: 'Posts',
  comments: 'Replies',
  more: 'More replies',
  test: 'Source tests',
  probe: 'Limit probes',
};

function latestRateLimit(log) {
  for (const group of log) {
    for (let i = group.attempts.length - 1; i >= 0; i--) {
      if (group.attempts[i].rate) return group.attempts[i].rate;
    }
  }
  return null;
}

function Attempts({ group, now }) {
  if (!group.attempts.length) return <p className="dbg-note">No requests were made{group.error ? `: ${group.error}` : '.'}</p>;
  return (
    <div className="dbg-attempts">
      {group.error && <p className="dbg-error">{group.error}</p>}
      {group.attempts.map((a, i) => (
        <div key={a.id} className="dbg-attempt">
          <div className="dbg-attempt-head">
            <span className="dbg-num">{i + 1}</span>
            <strong>{a.strategy ? strategyLabel(a.strategy) : 'Skipped'}</strong>
            <span className="dbg-chip">{FORMAT_LABELS[a.format] || a.format}</span>
            <Pill status={a.status} />
            {a.httpStatus != null && <span className="dbg-chip">HTTP {a.httpStatus}</span>}
            <span className="dbg-dim">{fmtMs(a.status === 'pending' ? now - a.startedAt : a.ms)}</span>
            {a.bytes != null && <span className="dbg-dim">{fmtBytes(a.bytes)}</span>}
            {a.contentType && <span className="dbg-dim">{a.contentType.split(';')[0]}</span>}
            {a.rate && <span className="dbg-dim">rate limit: {a.rate.remaining ?? '?'} left</span>}
          </div>
          {a.error && <div className="dbg-error">{a.error}</div>}
          {a.snippet && <pre className="dbg-snippet">{a.snippet}</pre>}
          {a.requestUrl && (
            <a className="dbg-url" href={a.requestUrl} target="_blank" rel="noopener noreferrer">{a.requestUrl}</a>
          )}
        </div>
      ))}
    </div>
  );
}

export default function RequestsTab({ summary, onToast }) {
  const log = useLog();
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(() => new Set());
  const now = useNow(log.some((g) => g.status === 'pending') ? 250 : null);
  const rows = log.filter((g) => filter === 'all' || g.purpose === filter);
  const rate = latestRateLimit(log);

  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportLog({ summary }));
      onToast('Debug log copied to the clipboard.');
    } catch {
      download();
    }
  };

  const download = () => {
    const blob = new Blob([exportLog({ summary })], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `msoutlookit-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="dbg-tab">
      <dl className="dbg-summary">
        {summary.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
        {rate && (
          <div><dt>Reddit rate limit</dt><dd>{rate.remaining ?? '?'} left, {rate.used ?? '?'} used, resets in {rate.reset ?? '?'}s</dd></div>
        )}
      </dl>

      <div className="dbg-toolbar">
        <label className="dbg-field">
          <span>Show</span>
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {Object.entries(FILTERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <span className="dbg-spacer" />
        <button type="button" className="dbg-btn" onClick={copy}>Copy log</button>
        <button type="button" className="dbg-btn" onClick={download}>Download</button>
        <button type="button" className="dbg-btn" onClick={clearLog}>Clear</button>
      </div>

      {rows.length === 0 && <p className="dbg-note">No requests yet.</p>}
      <div className="dbg-groups">
        {rows.map((g) => (
          <div key={g.id} className={`dbg-group${open.has(g.id) ? ' open' : ''}`}>
            <button type="button" className="dbg-group-head" onClick={() => toggle(g.id)} aria-expanded={open.has(g.id)}>
              <span className="dbg-dim">{fmtClock(g.startedAt)}</span>
              <span className="dbg-label">{g.label}</span>
              <Pill status={g.status} />
              <span className="dbg-via">
                {g.via ? `${strategyLabel(g.via)} · ${FORMAT_LABELS[g.format] || g.format}` : ''}
                {g.items != null ? ` · ${g.items} items` : ''}
              </span>
              <span className="dbg-dim">{g.attempts.length} req · {fmtMs((g.endedAt || now) - g.startedAt)}</span>
            </button>
            {open.has(g.id) && <Attempts group={g} now={now} />}
          </div>
        ))}
      </div>
    </div>
  );
}
