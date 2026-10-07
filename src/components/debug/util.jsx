import { useEffect, useState } from 'react';

export function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '';
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function fmtBytes(n) {
  if (n == null) return '';
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export function fmtClock(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const PILL_TEXT = { ok: 'OK', error: 'Failed', pending: 'Running', cancelled: 'Cancelled', aborted: 'Stopped', skipped: 'Skipped' };

const ERROR_TEXT = { network: 'CORS / network', timeout: 'timeout', blocked: 'blocked', shape: 'wrong data', offline: 'offline' };

// A few words for an error type, e.g. "HTTP 403" or "CORS / network".
export function shortError(type, message = '') {
  if (type === 'http') return message.split(' (')[0].replace(/^(HTTP \d+).*/, '$1');
  if (type === 'parse') return message.includes('HTML page') ? 'HTML page' : 'unreadable';
  return ERROR_TEXT[type] || type;
}

export function Pill({ status, children }) {
  return <span className={`pill pill-${status}`}>{children || PILL_TEXT[status] || status}</span>;
}

// Number input that commits a clamped value on blur or Enter, so typing
// "1" on the way to "100" doesn't apply a value of 1.
export function NumberField({ value, min, max, onCommit, label, suffix }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n)) return setText(String(value));
    const clamped = Math.min(max, Math.max(min, n));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
    return undefined;
  };
  return (
    <label className="dbg-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
      {suffix && <span className="dbg-suffix">{suffix}</span>}
    </label>
  );
}

// Parses "25, 50, 100" into numbers within range.
export function parseNumberList(text, min, max) {
  return text.split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n >= min && n <= max);
}
