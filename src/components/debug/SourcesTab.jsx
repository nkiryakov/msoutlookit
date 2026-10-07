import { useRef, useState } from 'react';
import { useLog } from '../../debugLog.js';
import { STRATEGIES, STRATEGY, getLastGood, getStats } from '../../net.js';
import { testAllSources } from '../../probes.js';
import { resetSettings, updateSettings, useSettings } from '../../settings.js';
import { NumberField, Pill, fmtMs, shortError } from './util.jsx';

const MODES = [
  { id: 'sequential', label: 'One at a time', help: 'Try the next source only after the current one fails. Fewest requests, slowest when sources hang.' },
  { id: 'staggered', label: 'Staggered', help: 'Also start the next source when the current one is slow. Good balance; the default.' },
  { id: 'race', label: 'All at once', help: 'Ask every source together and use the first answer. Fastest, but uses the most requests.' },
];

const COMMENT_SORTS = [
  ['confidence', 'Best'], ['top', 'Top'], ['new', 'New'], ['controversial', 'Controversial'], ['old', 'Old'], ['qa', 'Q&A'],
];

function Health({ id }) {
  const s = getStats()[id];
  if (!s) return <span className="dbg-dim">not tried yet</span>;
  if (s.last === 'ok') return <Pill status="ok">{`OK ${fmtMs(s.lastMs)}`}</Pill>;
  return <span title={s.lastError}><Pill status="error">{shortError(s.last, s.lastError)}</Pill></span>;
}

function TestCell({ result }) {
  if (!result) return <span className="dbg-dim">…</span>;
  if (result.skipped) return <span className="dbg-dim">{result.skipped}</span>;
  if (result.ok) return <Pill status="ok">{`${result.items} posts · ${fmtMs(result.ms)}`}</Pill>;
  return <span title={result.error}><Pill status="error">{shortError(result.type, result.error)}</Pill></span>;
}

export default function SourcesTab({ folder, sort }) {
  const settings = useSettings();
  useLog(); // re-render as requests finish, so the health column stays current
  const lastGood = getLastGood();
  const [tests, setTests] = useState(null);
  const testCtrl = useRef(null);

  const set = (patch) => updateSettings(patch);

  const move = (id, delta) => {
    const order = [...settings.order];
    const i = order.indexOf(id);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    set({ order });
  };

  const runTests = async () => {
    testCtrl.current?.abort('cancelled');
    const ctrl = new AbortController();
    testCtrl.current = ctrl;
    setTests({ running: true, results: {} });
    await testAllSources({
      sub: folder,
      sort,
      formats: ['json', 'rss'],
      signal: ctrl.signal,
      onResult: (r) => setTests((t) => ({ ...t, results: { ...t.results, [`${r.id}:${r.format}`]: r } })),
    });
    if (testCtrl.current === ctrl) setTests((t) => ({ ...t, running: false }));
  };

  const stopTests = () => {
    testCtrl.current?.abort('cancelled');
    setTests((t) => ({ ...t, running: false }));
  };

  // Puts the sources that worked first (fastest first) and turns off data
  // formats that failed through every source.
  const applyResults = () => {
    const results = Object.values(tests.results);
    const best = {};
    results.forEach((r) => {
      if (r.ok) best[r.id] = Math.min(best[r.id] ?? Infinity, r.ms);
    });
    const working = Object.keys(best).sort((a, b) => best[a] - best[b]);
    const enabled = { ...settings.enabled };
    working.forEach((id) => { enabled[id] = true; });
    const jsonOk = results.some((r) => r.ok && r.format === 'json');
    const rssOk = results.some((r) => r.ok && r.format === 'rss');
    set({
      order: [...working, ...settings.order.filter((id) => !working.includes(id))],
      enabled,
      formats: jsonOk || rssOk ? { json: jsonOk, plain: jsonOk, rss: rssOk } : settings.formats,
    });
  };

  const results = tests ? Object.values(tests.results) : [];
  const anyOk = results.some((r) => r.ok);

  return (
    <div className="dbg-tab">
      <section className="dbg-section">
        <h3>How sources are tried</h3>
        <div className="dbg-radios">
          {MODES.map((m) => (
            <label key={m.id} className="dbg-radio">
              <input type="radio" name="mode" checked={settings.mode === m.id} onChange={() => set({ mode: m.id })} />
              <span><strong>{m.label}</strong> <span className="dbg-dim">{m.help}</span></span>
            </label>
          ))}
        </div>
        <div className="dbg-inline">
          {settings.mode === 'staggered' && (
            <NumberField label="Start the next source after" suffix="ms" min={0} max={30000} value={settings.staggerMs} onCommit={(v) => set({ staggerMs: v })} />
          )}
          <NumberField label="Give up on a source after" suffix="ms" min={1000} max={60000} value={settings.timeoutMs} onCommit={(v) => set({ timeoutMs: v })} />
        </div>
        <label className="dbg-check">
          <input type="checkbox" checked={settings.rememberWorking} onChange={(e) => set({ rememberWorking: e.target.checked })} />
          Try the source that last worked first
        </label>
        <label className="dbg-check">
          <input type="checkbox" checked={settings.offline} onChange={(e) => set({ offline: e.target.checked })} />
          Offline mode: don't contact Reddit, show sample items
        </label>
      </section>

      <section className="dbg-section">
        <h3>Sources</h3>
        <table className="dbg-table">
          <thead>
            <tr><th>On</th><th>Source</th><th>Last result</th><th>Order</th></tr>
          </thead>
          <tbody>
            {settings.order.map((id, i) => (
              <tr key={id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Use ${STRATEGY[id].label}`}
                    checked={!!settings.enabled[id]}
                    onChange={(e) => set({ enabled: { ...settings.enabled, [id]: e.target.checked } })}
                  />
                </td>
                <td>
                  <strong>{STRATEGY[id].label}</strong>
                  {(lastGood.json === id || lastGood.rss === id) && <span className="tag">last worked</span>}
                  <div className="dbg-dim">{STRATEGY[id].detail}</div>
                  {id === 'custom' && (
                    <input
                      className="dbg-text"
                      placeholder="https://your-proxy.example.workers.dev/?url={url}"
                      value={settings.customProxy}
                      onChange={(e) => set({
                        customProxy: e.target.value,
                        enabled: { ...settings.enabled, custom: e.target.value.trim() !== '' },
                      })}
                    />
                  )}
                </td>
                <td><Health id={id} /></td>
                <td className="dbg-order">
                  <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${STRATEGY[id].label} up`}>▲</button>
                  <button type="button" onClick={() => move(id, 1)} disabled={i === settings.order.length - 1} aria-label={`Move ${STRATEGY[id].label} down`}>▼</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="dbg-section">
        <h3>Data formats</h3>
        <p className="dbg-dim">Tried in this order for each request, each through the sources above.</p>
        {[
          ['json', 'JSON with raw_json=1', 'Full data: scores, reply counts, threads.'],
          ['plain', 'Plain JSON feed', 'Same data without raw_json, e.g. /r/all/hot.json?limit=25.'],
          ['rss', 'RSS feed', 'Titles, authors, text and links; no scores, and replies come as a flat list.'],
        ].map(([key, label, help]) => (
          <label key={key} className="dbg-check">
            <input type="checkbox" checked={settings.formats[key]} onChange={(e) => set({ formats: { ...settings.formats, [key]: e.target.checked } })} />
            <span><strong>{label}</strong> <span className="dbg-dim">{help}</span></span>
          </label>
        ))}
      </section>

      <section className="dbg-section">
        <h3>Request sizes</h3>
        <div className="dbg-inline">
          <NumberField label="Posts per page" min={1} max={100} value={settings.postLimit} onCommit={(v) => set({ postLimit: v })} />
          <NumberField label="Replies per thread" min={1} max={500} value={settings.commentLimit} onCommit={(v) => set({ commentLimit: v })} />
          <NumberField label="Reply depth" min={1} max={10} value={settings.commentDepth} onCommit={(v) => set({ commentDepth: v })} />
          <label className="dbg-field">
            <span>Reply order</span>
            <select value={settings.commentSort} onChange={(e) => set({ commentSort: e.target.value })}>
              {COMMENT_SORTS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <p className="dbg-dim">
          Post changes apply from the next page or refresh; reply changes reload the open thread. Reddit caps these;
          the Limits tab measures the real maximums.
        </p>
      </section>

      <section className="dbg-section">
        <h3>Test every source</h3>
        <p className="dbg-dim">
          Loads 5 posts from r/{folder || 'all'} through each source as JSON and as RSS, ignoring the settings above.
          Runs 3 requests at a time.
        </p>
        <div className="dbg-toolbar">
          {tests?.running
            ? <button type="button" className="dbg-btn" onClick={stopTests}>Stop</button>
            : <button type="button" className="dbg-btn primary" onClick={runTests}>Test every source</button>}
          {tests && !tests.running && anyOk && (
            <button type="button" className="dbg-btn" onClick={applyResults}>Use what worked</button>
          )}
          <span className="dbg-spacer" />
          <button type="button" className="dbg-btn" onClick={resetSettings}>Reset all settings</button>
        </div>
        {tests && (
          <table className="dbg-table">
            <thead><tr><th>Source</th><th>JSON</th><th>RSS</th></tr></thead>
            <tbody>
              {STRATEGIES.map((s) => (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td><TestCell result={tests.results[`${s.id}:json`]} /></td>
                  <td><TestCell result={tests.results[`${s.id}:rss`]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tests && !tests.running && (
          <p className="dbg-note">
            {anyOk
              ? '"Use what worked" puts the working sources first, fastest first, and turns off any format that failed everywhere.'
              : 'Nothing worked from this browser. Logging in to reddit.com in this browser may let JSONP work; otherwise a proxy you run yourself is the remaining option.'}
          </p>
        )}
      </section>
    </div>
  );
}
