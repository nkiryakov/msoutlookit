import { getSettings } from './settings.js';
import { addAttempt, updateAttempt } from './debugLog.js';
import { relayAvailable, relayFetch } from './relay.js';

// Transport layer: gets a URL's contents through one of several "sources"
// (direct, JSONP, CORS proxies), logging every attempt for the debug console.

const enc = encodeURIComponent;

export class NetError extends Error {
  constructor(type, message, extra = {}) {
    super(message);
    this.type = type;
    Object.assign(this, extra);
  }
}

function customUrl(url, template) {
  const t = (template || '').trim();
  if (!/^https?:\/\//i.test(t)) return null;
  if (t.includes('{url}')) return t.replace('{url}', enc(url));
  if (t.includes('{raw}')) return t.replace('{raw}', url);
  return t + enc(url);
}

export const STRATEGIES = [
  {
    id: 'relay',
    label: 'Reddit tab',
    detail: 'Asks a Reddit tab you connected with the bookmarklet (set up above). The tab fetches from reddit.com itself, with your login, so there is no CORS and no proxy. Needs the tab to stay open; RSS also needs it to be on www.reddit.com.',
    transport: 'relay',
    build: (url) => url,
  },
  {
    id: 'direct',
    label: 'Direct',
    detail: 'fetch() straight to www.reddit.com, without cookies.',
    transport: 'fetch',
    build: (url) => url,
  },
  {
    id: 'jsonp',
    label: 'JSONP',
    detail: 'Loads the JSON as a <script> with ?jsonp=. Not subject to CORS, but your Reddit login only goes along if its cookie is SameSite=None and the browser sends cross-site cookies (Chrome does, Safari and Firefox do not). Otherwise Reddit sees you logged out. JSON only.',
    transport: 'jsonp',
    jsonOnly: true,
    build: (url) => url,
  },
  {
    id: 'corsproxy',
    label: 'corsproxy.io',
    detail: 'Public CORS proxy.',
    transport: 'fetch',
    build: (url) => `https://corsproxy.io/?url=${enc(url)}`,
  },
  {
    id: 'allorigins',
    label: 'allorigins.win',
    detail: 'Public CORS proxy.',
    transport: 'fetch',
    build: (url) => `https://api.allorigins.win/raw?url=${enc(url)}`,
  },
  {
    id: 'codetabs',
    label: 'codetabs.com',
    detail: 'Public CORS proxy.',
    transport: 'fetch',
    build: (url) => `https://api.codetabs.com/v1/proxy/?quest=${enc(url)}`,
  },
  {
    id: 'custom',
    label: 'Custom proxy',
    detail: 'Your own proxy. {url} is replaced with the encoded Reddit URL, {raw} with the plain URL; with neither, the encoded URL is appended.',
    transport: 'fetch',
    build: (url, settings) => customUrl(url, settings.customProxy),
  },
  {
    id: 'old',
    label: 'old.reddit.com',
    detail: 'fetch() to old.reddit.com, without cookies.',
    transport: 'fetch',
    build: (url) => url.replace('https://www.reddit.com/', 'https://old.reddit.com/'),
  },
  {
    id: 'directCookies',
    label: 'Direct + cookies',
    detail: 'fetch() to www.reddit.com with your cookies (credentials: "include"). Works only if Reddit allows credentialed cross-site requests.',
    transport: 'fetch',
    credentials: 'include',
    build: (url) => url,
  },
];

export const STRATEGY = Object.fromEntries(STRATEGIES.map((s) => [s.id, s]));
export const strategyLabel = (id) => STRATEGY[id]?.label || id || '-';
export const FORMAT_LABELS = { json: 'JSON', plain: 'Plain JSON', rss: 'RSS' };

// ---- Source health -----------------------------------------------------------

// A source that timed out is benched for a few minutes, so one hanging proxy
// doesn't hold up every request. Benched sources are remembered across page
// loads, so reopening the app doesn't wait for them again.
const SLOW_PENALTY_MS = 3 * 60 * 1000;
const SLOW_KEY = 'msoutlookit:slow';

const stats = {};
export const getStats = () => stats;

// The Reddit tab is never benched: whether it answers is tracked by the connection itself (relay.js).
function recentlyTimedOut(id, now) {
  const s = stats[id];
  return id !== 'relay' && !!s && s.failType === 'timeout' && s.failAt > (s.okAt || 0) && now - s.failAt < SLOW_PENALTY_MS;
}

try {
  const saved = JSON.parse(localStorage.getItem(SLOW_KEY) || '{}') || {};
  Object.entries(saved).forEach(([id, at]) => {
    if (Date.now() - at < SLOW_PENALTY_MS) {
      stats[id] = { failAt: at, failType: 'timeout', last: 'timeout', lastError: 'Timed out on an earlier visit' };
    }
  });
} catch {
  /* storage unavailable */
}

function record(id, ok, ms, error) {
  const s = (stats[id] = stats[id] || {});
  if (ok) s.okAt = Date.now();
  else {
    s.failAt = Date.now();
    s.failType = error.type;
  }
  s.last = ok ? 'ok' : error.type;
  s.lastError = ok ? null : error.message;
  s.lastMs = ms;
  const now = Date.now();
  const slow = Object.fromEntries(Object.keys(stats).filter((k) => recentlyTimedOut(k, now)).map((k) => [k, stats[k].failAt]));
  try {
    localStorage.setItem(SLOW_KEY, JSON.stringify(slow));
  } catch {
    /* ignore */
  }
}

const LAST_GOOD_KEY = 'msoutlookit:lastGood';
let lastGood = {};
try {
  lastGood = JSON.parse(localStorage.getItem(LAST_GOOD_KEY) || '{}') || {};
} catch {
  lastGood = {};
}
export const getLastGood = () => lastGood;
const family = (format) => (format === 'rss' ? 'rss' : 'json');

function rememberGood(format, id) {
  if (lastGood[family(format)] === id) return;
  lastGood = { ...lastGood, [family(format)]: id };
  try {
    localStorage.setItem(LAST_GOOD_KEY, JSON.stringify(lastGood));
  } catch {
    /* ignore */
  }
}

export function isConfigured(id, settings = getSettings()) {
  if (id === 'relay') return relayAvailable();
  return id !== 'custom' || !!customUrl('https://www.reddit.com/', settings.customProxy);
}

export function supportsFormat(id, format) {
  return !(format === 'rss' && STRATEGY[id]?.jsonOnly);
}

// Sources to try for a format: the one that last worked first, then the
// configured order. Sources that timed out in the last few minutes are
// benched (left out) unless no other source is left.
export function strategyPlan(format, { skip } = {}) {
  const settings = getSettings();
  const now = Date.now();
  const usable = settings.order.filter((id) => STRATEGY[id]
    && settings.enabled[id]
    && supportsFormat(id, format)
    && isConfigured(id, settings)
    && !(skip && skip.has(id)));
  const benched = usable.filter((id) => recentlyTimedOut(id, now));
  let ids = usable.filter((id) => !recentlyTimedOut(id, now));
  if (!ids.length) return { ids: benched, benched: [] };
  const good = settings.rememberWorking && lastGood[family(format)];
  if (good && ids.includes(good)) ids = [good, ...ids.filter((id) => id !== good)];
  return { ids, benched };
}

export const strategyOrder = (format, options) => strategyPlan(format, options).ids;

// ---- Parsing ----------------------------------------------------------------------

export function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    throw new NetError('parse', /^\s*</.test(text)
      ? 'Got an HTML page instead of JSON (usually a block, login or "are you human" page)'
      : 'The response is not valid JSON', { snippet: text.slice(0, 400) });
  }
}

export function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new NetError('parse', /<html/i.test(text)
      ? 'Got an HTML page instead of an RSS feed (usually a block or login page)'
      : 'The response is not valid XML', { snippet: text.slice(0, 400) });
  }
  return doc;
}

function preview(data) {
  try {
    if (typeof Document !== 'undefined' && data instanceof Document) return new XMLSerializer().serializeToString(data).slice(0, 400);
    return JSON.stringify(data).slice(0, 400);
  } catch {
    return '';
  }
}

const STATUS_HINTS = {
  401: 'the proxy wants an API key or login',
  403: 'blocked: Reddit refuses logged-out JSON requests since May 2026, or this IP is blocked',
  404: 'not found: private, banned or misspelled subreddit?',
  429: 'rate limited: too many requests, wait a minute',
};

// What a refusal means when it came back through the Reddit tab, which is logged in and same-origin.
const RELAY_HINTS = {
  401: 'Reddit wants a login: log in in the Reddit tab, reload it and click the bookmarklet again',
  403: 'Reddit refused even your own Reddit tab: log in there, reload it and click the bookmarklet again',
};

function statusMessage(res, strategyId) {
  const hint = (strategyId === 'relay' && RELAY_HINTS[res.status]) || STATUS_HINTS[res.status] || (res.status >= 500 ? 'server or proxy error' : '');
  return `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}${hint ? ` (${hint})` : ''}`;
}

function readRateLimit(headers) {
  const rate = {
    remaining: headers.get('x-ratelimit-remaining'),
    used: headers.get('x-ratelimit-used'),
    reset: headers.get('x-ratelimit-reset'),
  };
  return rate.remaining || rate.used || rate.reset ? rate : null;
}

// ---- Transports ----------------------------------------------------------------

let jsonpSeq = 0;

function jsonp(url, signal) {
  return new Promise((resolve, reject) => {
    const callback = `__msoJsonp${Date.now().toString(36)}${jsonpSeq++}`;
    const script = document.createElement('script');
    let settled = false;
    const finish = () => {
      settled = true;
      // Leave a no-op behind in case the script still arrives after we gave up.
      window[callback] = () => {};
      script.remove();
      signal.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      finish();
      reject(signal.reason);
    };
    window[callback] = (data) => {
      if (settled) return;
      finish();
      resolve(data);
    };
    script.onerror = () => {
      if (settled) return;
      finish();
      reject(new NetError('blocked', 'The <script> request failed: Reddit refused it (e.g. 403) or the browser blocked it. JSONP cannot see status codes.'));
    };
    // The callback runs while the script executes, before onload fires.
    script.onload = () => {
      if (settled) return;
      finish();
      reject(new NetError('parse', 'The script loaded but never called back: Reddit ignored the jsonp parameter'));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
    script.src = `${url}${url.includes('?') ? '&' : '?'}jsonp=${callback}`;
    document.head.appendChild(script);
  });
}

function classify(err, signal, timeoutMs) {
  if (err instanceof NetError) return err;
  if (signal.aborted) {
    if (signal.reason === 'timeout') return new NetError('timeout', `No answer within ${timeoutMs / 1000}s`);
    if (signal.reason === 'lost-race') return new NetError('aborted', 'Stopped: another source answered first');
    if (signal.reason === 'superseded') return new NetError('aborted', 'Stopped: no longer needed');
    return new NetError('aborted', 'Cancelled');
  }
  if (err instanceof TypeError) {
    return new NetError('network', 'Network or CORS error: the browser could not connect, or hid the response because it had no CORS header. A Reddit 403 without CORS headers looks like this too; the browser console shows the exact reason.');
  }
  return new NetError('error', err?.message || String(err));
}

async function attempt(strategy, url, { format, parse, validate, groupId, signal, timeoutMs }) {
  const requestUrl = strategy.build(url, getSettings());
  const attemptId = addAttempt(groupId, { strategy: strategy.id, format, url, requestUrl });
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), timeoutMs);
  const onAbort = () => ctrl.abort(signal.reason ?? 'cancelled');
  if (signal.aborted) onAbort();
  else signal.addEventListener('abort', onAbort, { once: true });
  const info = { httpStatus: null, bytes: null, contentType: null, rate: null };
  try {
    if (!requestUrl) throw new NetError('skipped', 'Not configured: add a proxy URL in the Sources tab');
    let data;
    if (strategy.transport === 'jsonp') {
      data = await jsonp(requestUrl, ctrl.signal);
      info.bytes = JSON.stringify(data)?.length ?? null;
    } else if (strategy.transport === 'relay') {
      let res;
      try {
        res = await relayFetch(requestUrl, ctrl.signal);
      } catch (e) {
        // An abort carries its own reason; anything else is the relay saying why it can't help.
        throw ctrl.signal.aborted ? e : new NetError(e.relayType || 'relay', e.message);
      }
      info.httpStatus = res.status;
      info.contentType = res.contentType;
      info.rate = res.rate;
      info.bytes = res.text.length;
      if (!res.ok) throw new NetError('http', statusMessage(res, strategy.id), { snippet: res.text.slice(0, 400) });
      data = parse(res.text);
    } else {
      const res = await fetch(requestUrl, { signal: ctrl.signal, credentials: strategy.credentials || 'omit' });
      info.httpStatus = res.status;
      info.contentType = res.headers.get('content-type');
      info.rate = readRateLimit(res.headers);
      const text = await res.text();
      info.bytes = text.length;
      if (!res.ok) throw new NetError('http', statusMessage(res, strategy.id), { snippet: text.slice(0, 400) });
      data = parse(text);
    }
    const problem = validate(data);
    if (problem) throw new NetError('shape', problem, { snippet: preview(data) });
    const ms = Math.round(performance.now() - started);
    updateAttempt(groupId, attemptId, { status: 'ok', ms, ...info });
    record(strategy.id, true, ms);
    return { data, strategy: strategy.id, ms, rate: info.rate };
  } catch (raw) {
    const ms = Math.round(performance.now() - started);
    const err = classify(raw, ctrl.signal, timeoutMs);
    err.strategy = strategy.id;
    updateAttempt(groupId, attemptId, {
      status: err.type === 'aborted' ? 'aborted' : 'error',
      ms,
      ...info,
      errorType: err.type,
      error: err.message,
      snippet: err.snippet,
    });
    if (err.type !== 'aborted') record(strategy.id, false, ms, err);
    throw err;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
  }
}

function summarize(errors) {
  const parts = errors.map((e) => `${strategyLabel(e.strategy)}: ${e.type === 'http' ? e.message.split(' (')[0] : e.type}`);
  return new NetError('failed', `Every source failed (${parts.join(', ')})`, {
    errors,
    timedOut: errors.filter((e) => e.type === 'timeout').map((e) => e.strategy),
  });
}

// Runs attempts across sources. `gap` is how long to wait for one source
// before also starting the next: Infinity is sequential, 0 is a race.
function runChain(ids, run, { mode, staggerMs, signal }) {
  const gap = mode === 'race' ? 0 : mode === 'sequential' ? Infinity : Math.max(0, staggerMs);
  return new Promise((resolve, reject) => {
    const errors = [];
    const controllers = [];
    let next = 0;
    let running = 0;
    let done = false;
    let timer = null;
    const finish = (settle, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      settle(value);
    };
    const onAbort = () => {
      controllers.forEach((c) => c.abort(signal.reason ?? 'cancelled'));
      finish(reject, new NetError('aborted', signal.reason === 'superseded' ? 'Stopped: no longer needed' : 'Cancelled'));
    };
    const launch = () => {
      clearTimeout(timer);
      if (done || next >= ids.length) return;
      const ctrl = new AbortController();
      controllers.push(ctrl);
      running++;
      run(ids[next++], ctrl.signal).then(
        (result) => {
          running--;
          controllers.forEach((c) => c !== ctrl && c.abort('lost-race'));
          finish(resolve, result);
        },
        (err) => {
          running--;
          errors.push(err);
          if (done) return;
          if (next < ids.length) launch();
          else if (running === 0) finish(reject, summarize(errors));
        },
      );
      if (next < ids.length && Number.isFinite(gap)) timer = setTimeout(launch, gap);
    };
    if (!ids.length) {
      reject(new NetError('none', 'No enabled source can fetch this'));
      return;
    }
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    launch();
  });
}

// Fetches `url` through the enabled sources (or exactly `ids`), logging each
// attempt under `groupId`. `parse` turns text into data and `validate`
// returns an error message when the data isn't what we asked for.
export async function requestThroughSources(url, { format, parse, validate, groupId, signal, ids, force = false, remember = true }) {
  const settings = getSettings();
  if (settings.offline && !force) throw new NetError('offline', 'Offline mode is on (debug console, Sources tab)');
  const order = ids || strategyOrder(format);
  const result = await runChain(
    order,
    (id, sig) => attempt(STRATEGY[id], url, { format, parse, validate, groupId, signal: sig, timeoutMs: settings.timeoutMs }),
    { mode: settings.mode, staggerMs: settings.staggerMs, signal },
  );
  if (remember && settings.rememberWorking) rememberGood(format, result.strategy);
  return result;
}
