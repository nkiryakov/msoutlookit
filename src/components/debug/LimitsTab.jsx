import { useRef, useState } from 'react';
import { strategyLabel } from '../../net.js';
import { probeCommentLimits, probeDepth, probePageSizes } from '../../probes.js';
import { NumberField, fmtMs, parseNumberList } from './util.jsx';

const KNOWN = [
  ['Posts per request', 'Reddit\'s API docs: "limit" defaults to 25 and maxes out at 100.'],
  ['Listing depth', 'Most listings stop after about 1,000 posts (10 pages of 100), following "after" cursors.'],
  ['Replies per request', 'A thread request returns up to "limit" comments down to "depth" levels; the rest come back as "load more" placeholders. Logged-out requests have commonly been capped at 500.'],
  ['More replies', '/api/morechildren takes at most 100 comment ids per call, and Reddit asks for one call at a time.'],
  ['Rate limit', 'Logged-out access has been about 10 requests a minute per IP; approved OAuth apps get 100 a minute.'],
  ['RSS', 'Honors "limit" up to 100. Server IPs get 429 (rate limited) after 2 or 3 RSS requests.'],
  ['Access', 'Since late May 2026 Reddit answers logged-out .json requests with 403. Logged-in sessions and OAuth still work. RSS feeds still answer, but without a CORS header, so a browser needs a proxy to read them; corsproxy.io now requires an API key.'],
];

function useRunner() {
  const ctrl = useRef(null);
  const [running, setRunning] = useState(null);
  const [error, setError] = useState(null);
  const run = async (name, task) => {
    ctrl.current?.abort('cancelled');
    const c = new AbortController();
    ctrl.current = c;
    setRunning(name);
    setError(null);
    try {
      await task(c.signal);
    } catch (err) {
      if (err.type !== 'aborted') setError({ name, message: err.message });
    } finally {
      if (ctrl.current === c) setRunning(null);
    }
  };
  const stop = () => {
    ctrl.current?.abort('cancelled');
    setRunning(null);
  };
  return { running, error, run, stop };
}

function Via({ row }) {
  return row.error ? <span className="dbg-error">{row.error}</span> : <span className="dbg-dim">{strategyLabel(row.via)} · {fmtMs(row.ms)}</span>;
}

export default function LimitsTab({ folder, sort, post }) {
  const { running, error, run, stop } = useRunner();
  const [format, setFormat] = useState('json');
  const [sizesText, setSizesText] = useState('25, 50, 100, 101, 250, 1000');
  const [sizeRows, setSizeRows] = useState([]);
  const [pageSize, setPageSize] = useState(100);
  const [maxPages, setMaxPages] = useState(12);
  const [pages, setPages] = useState([]);
  const [depthResult, setDepthResult] = useState(null);
  const [limitsText, setLimitsText] = useState('50, 100, 200, 500, 1000');
  const [depth, setDepth] = useState(10);
  const [commentRows, setCommentRows] = useState([]);

  const where = `r/${folder || 'all'} · ${sort}`;
  const busy = (name) => running === name;
  const controls = (name, start) => (busy(name)
    ? <button type="button" className="dbg-btn" onClick={stop}>Stop</button>
    : <button type="button" className="dbg-btn primary" disabled={!!running} onClick={start}>Run</button>);
  const errorFor = (name) => error?.name === name && <p className="dbg-error">{error.message}</p>;

  const runSizes = () => run('sizes', async (signal) => {
    setSizeRows([]);
    await probePageSizes({
      sub: folder, sort, format, sizes: parseNumberList(sizesText, 1, 5000), signal,
      onRow: (row) => setSizeRows((rows) => [...rows, row]),
    });
  });

  const runDepth = () => run('depth', async (signal) => {
    setPages([]);
    setDepthResult(null);
    const result = await probeDepth({
      sub: folder, sort, format, pageSize, maxPages, signal,
      onPage: (row) => setPages((rows) => [...rows, row]),
    });
    setDepthResult(result);
  });

  const runComments = () => run('comments', async (signal) => {
    setCommentRows([]);
    await probeCommentLimits({
      post, format, limits: parseNumberList(limitsText, 1, 10000), depth, signal,
      onRow: (row) => setCommentRows((rows) => [...rows, row]),
    });
  });

  return (
    <div className="dbg-tab">
      <section className="dbg-section">
        <h3>Known limits</h3>
        <dl className="dbg-known">
          {KNOWN.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        <p className="dbg-dim">
          The probes below measure what Reddit actually returns from this browser. They wait about a second between
          requests to stay under the rate limit, and every request also shows up in the Requests tab.
        </p>
        <label className="dbg-field">
          <span>Probe using</span>
          <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={!!running}>
            <option value="json">JSON</option>
            <option value="rss">RSS</option>
          </select>
        </label>
      </section>

      <section className="dbg-section">
        <h3>Posts per request</h3>
        <p className="dbg-dim">Asks {where} for each page size and counts the posts that come back.</p>
        <div className="dbg-toolbar">
          <label className="dbg-field grow">
            <span>Page sizes</span>
            <input className="dbg-text" value={sizesText} onChange={(e) => setSizesText(e.target.value)} />
          </label>
          {controls('sizes', runSizes)}
        </div>
        {errorFor('sizes')}
        {sizeRows.length > 0 && (
          <table className="dbg-table">
            <thead><tr><th>Asked for</th><th>Got</th><th>Via</th></tr></thead>
            <tbody>
              {sizeRows.map((r, i) => (
                <tr key={i}><td>{r.size}</td><td>{r.error ? '-' : r.received}</td><td><Via row={r} /></td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="dbg-section">
        <h3>How deep a listing goes</h3>
        <p className="dbg-dim">Follows the "after" cursor through {where} until Reddit stops or the page limit is hit.</p>
        <div className="dbg-toolbar">
          <NumberField label="Page size" min={1} max={100} value={pageSize} onCommit={setPageSize} />
          <NumberField label="Max pages" min={1} max={30} value={maxPages} onCommit={setMaxPages} />
          {controls('depth', runDepth)}
        </div>
        {errorFor('depth')}
        {pages.length > 0 && (
          <table className="dbg-table">
            <thead><tr><th>Page</th><th>Got</th><th>New</th><th>Total</th><th>Next cursor</th><th>Via</th></tr></thead>
            <tbody>
              {pages.map((r) => (
                <tr key={r.page}>
                  <td>{r.page}</td><td>{r.received}</td><td>{r.fresh}</td><td>{r.total}</td>
                  <td className="dbg-mono">{r.after || 'none'}</td><td><Via row={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {depthResult && <p className="dbg-note"><strong>{depthResult.total} posts in {depthResult.pages} pages.</strong> {depthResult.reason}</p>}
      </section>

      <section className="dbg-section">
        <h3>Replies per thread</h3>
        {post ? (
          <p className="dbg-dim">Loads "{post.title.slice(0, 80)}" with each limit and counts the replies, placeholders and depth.</p>
        ) : (
          <p className="dbg-dim">Open a post from Reddit first (sample posts can't be probed).</p>
        )}
        <div className="dbg-toolbar">
          <label className="dbg-field grow">
            <span>Limits</span>
            <input className="dbg-text" value={limitsText} onChange={(e) => setLimitsText(e.target.value)} />
          </label>
          <NumberField label="Depth" min={1} max={20} value={depth} onCommit={setDepth} />
          {post ? controls('comments', runComments) : <button type="button" className="dbg-btn" disabled>Run</button>}
        </div>
        {errorFor('comments')}
        {commentRows.length > 0 && (
          <table className="dbg-table">
            <thead>
              <tr><th>Asked for</th><th>Replies</th><th>"Load more" stubs</th><th>Hidden behind them</th><th>"Continue" links</th><th>Deepest level</th><th>Via</th></tr>
            </thead>
            <tbody>
              {commentRows.map((r, i) => (
                <tr key={i}>
                  <td>{r.limit}</td>
                  <td>{r.error ? '-' : r.comments}</td>
                  <td>{r.error ? '-' : r.more}</td>
                  <td>{r.error ? '-' : r.hidden}</td>
                  <td>{r.error ? '-' : r.continues}</td>
                  <td>{r.error ? '-' : r.maxDepth}</td>
                  <td><Via row={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
