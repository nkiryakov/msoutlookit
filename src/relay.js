import { useSyncExternalStore } from 'react';

// The "Reddit tab" source. A bookmarklet clicked on a logged-in Reddit tab turns that tab into a
// relay: it fetches Reddit's URLs from its own site, so there is no CORS and your login cookie
// goes along, and hands the text back to this page with postMessage. This file holds both ends:
// the page side (below) and the code the bookmarklet runs inside the Reddit tab (relayMain).
//
// Messages are { mso: 1, type, ... }.
//   page -> tab: hello, ping, fetch { id, url }, cancel { id }
//   tab -> page: ready { host }, pong { id }, result { id, ok, status, statusText, contentType, rate, text } or { id, error }

const PROTOCOL = 1;
// The bookmarklet opens (or finds) the app window under this name, so a Reddit tab opened from
// this page can find it again.
const WINDOW_NAME = 'msoutlookit';
const REDDIT_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*reddit\.com$/;
const HELLO_ORIGINS = ['https://old.reddit.com', 'https://www.reddit.com', 'https://reddit.com', 'https://new.reddit.com'];
const HELLO_EVERY_MS = 400;
const HELLO_FOR_MS = 2400;
const PING_WAIT_MS = 800;

// ---- State, for the Sources tab and for choosing sources -----------------------------------------------------

// status: 'none' (nothing connected), 'connecting' (asked the tab that opened this page),
// 'connected', 'lost' (was connected, then stopped answering).
let state = { status: 'none', host: null, connectedAt: 0, error: null };
let tab = null; // the Reddit window and its origin, while connected
const listeners = new Set();
const pending = new Map();
const pongs = new Map();
let seq = 0;
let helloTimer = null;

function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

const getRelay = () => state;
const subscribeRelay = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const useRelay = () => useSyncExternalStore(subscribeRelay, getRelay);

// Worth trying: connected, or still waiting for the tab that opened this page to answer.
export const relayAvailable = () => state.status === 'connected' || state.status === 'connecting';

const hasOpener = () => {
  try {
    return !!window.opener && !window.opener.closed;
  } catch {
    return false;
  }
};

function relayError(message, type = 'relay') {
  return Object.assign(new Error(message), { relayType: type });
}

// ---- Page side -----------------------------------------------------------------------------------------------

function sayHello() {
  if (!hasOpener()) return;
  HELLO_ORIGINS.forEach((origin) => {
    try {
      window.opener.postMessage({ mso: PROTOCOL, type: 'hello' }, origin);
    } catch {
      /* not that origin */
    }
  });
}

function connect(source, origin, host) {
  clearInterval(helloTimer);
  tab = { source, origin };
  setState({ status: 'connected', host, connectedAt: Date.now(), error: null });
}

function lose(error) {
  if (state.status !== 'connected') return;
  tab = null;
  setState({ status: 'lost', error });
}

function onMessage(e) {
  const m = e.data;
  if (!m || m.mso !== PROTOCOL || !e.source || !REDDIT_ORIGIN.test(e.origin)) return;
  if (m.type === 'ready') {
    connect(e.source, e.origin, typeof m.host === 'string' ? m.host : new URL(e.origin).host);
  } else if (tab && e.source === tab.source && m.type === 'pong') {
    pongs.get(m.id)?.();
  } else if (tab && e.source === tab.source && m.type === 'result') {
    const job = pending.get(m.id);
    if (!job) return;
    pending.delete(m.id);
    if (m.error) job.reject(relayError(m.error));
    else job.resolve(m);
  }
}

// Starts listening, and asks the tab that opened this page (if there is one) whether it is a relay.
let listening = false;
export function initRelay() {
  if (listening) return;
  listening = true;
  window.name = WINDOW_NAME;
  window.addEventListener('message', onMessage);
  if (!hasOpener()) return;
  setState({ status: 'connecting' });
  const askedAt = Date.now();
  sayHello();
  helloTimer = setInterval(() => {
    if (state.status !== 'connecting') clearInterval(helloTimer);
    else if (Date.now() - askedAt > HELLO_FOR_MS || !hasOpener()) {
      clearInterval(helloTimer);
      setState({ status: 'none', error: 'The tab that opened this page is not a Reddit relay. Click the bookmarklet in a Reddit tab.' });
    } else sayHello();
  }, HELLO_EVERY_MS);
}

// Resolves with the round trip in ms, or rejects if the Reddit tab doesn't answer.
export function pingRelay() {
  return new Promise((resolve, reject) => {
    if (!tab) {
      reject(relayError('No Reddit tab is connected'));
      return;
    }
    const id = ++seq;
    const started = performance.now();
    const timer = setTimeout(() => {
      pongs.delete(id);
      reject(relayError('The Reddit tab did not answer'));
    }, PING_WAIT_MS);
    pongs.set(id, () => {
      clearTimeout(timer);
      pongs.delete(id);
      resolve(Math.round(performance.now() - started));
    });
    try {
      tab.source.postMessage({ mso: PROTOCOL, type: 'ping', id }, tab.origin);
    } catch (err) {
      clearTimeout(timer);
      pongs.delete(id);
      reject(relayError(err.message));
    }
  });
}

// Waits for the opener's answer to the first hello, so a load that starts with the page doesn't skip the relay.
function whenConnected(signal) {
  if (state.status !== 'connecting' || signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      unsubscribe();
      signal.removeEventListener('abort', done);
      resolve();
    };
    const unsubscribe = subscribeRelay(() => {
      if (state.status !== 'connecting') done();
    });
    signal.addEventListener('abort', done, { once: true });
  });
}

// Asks the connected Reddit tab to GET `url`. Rejects with the signal's reason when aborted.
export async function relayFetch(url, signal) {
  await whenConnected(signal);
  if (signal.aborted) throw signal.reason;
  if (!tab || state.status !== 'connected') {
    throw relayError(state.status === 'lost'
      ? 'The Reddit tab stopped answering. Click the bookmarklet in it again.'
      : 'No Reddit tab is connected. Click the bookmarklet in a logged-in Reddit tab.');
  }
  if (tab.source.closed) {
    lose('The Reddit tab was closed.');
    throw relayError('The Reddit tab was closed. Open Reddit again and click the bookmarklet.');
  }
  const { source, origin } = tab;
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const onAbort = () => {
      pending.delete(id);
      try {
        source.postMessage({ mso: PROTOCOL, type: 'cancel', id }, origin);
      } catch {
        /* tab gone */
      }
      // A timeout may mean the tab went away (navigated off Reddit), or only that Reddit was slow.
      if (signal.reason === 'timeout') pingRelay().catch(() => lose('The Reddit tab stopped answering: it may have been closed or moved to another page.'));
      reject(signal.reason);
    };
    pending.set(id, {
      resolve: (m) => {
        signal.removeEventListener('abort', onAbort);
        const rate = m.rate && (m.rate.remaining || m.rate.used || m.rate.reset) ? m.rate : null;
        resolve({ ok: !!m.ok, status: m.status, statusText: m.statusText || '', contentType: m.contentType || null, rate, text: m.text || '' });
      },
      reject: (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      },
    });
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      source.postMessage({ mso: PROTOCOL, type: 'fetch', id, url }, origin);
    } catch (err) {
      pending.delete(id);
      signal.removeEventListener('abort', onAbort);
      reject(relayError(err.message));
    }
  });
}

// Opens Reddit from this page, so that the bookmarklet clicked there can find this window.
export function openRedditTab() {
  return window.open('https://old.reddit.com/', 'msoutlookit-reddit');
}

// ---- The bookmarklet -------------------------------------------------------------------------------------------

// Runs inside the Reddit tab. It is serialized with toString(), so it must stay self-contained: no imports,
// no outside variables, explicit semicolons and no // comments (the bookmark may end up on one line).
function relayMain(cfg) {
  var ORIGIN = new URL(cfg.app).origin;
  var jobs = {};
  var isReddit = function (host) { return /(^|\.)reddit\.com$/.test(host); };
  if (!isReddit(location.hostname)) {
    alert('Open old.reddit.com in this tab and log in, then click this bookmark again.');
    return;
  }
  var reply = function (to, msg) {
    msg.mso = 1;
    try { to.postMessage(msg, ORIGIN); } catch (err) { /* the window is gone */ }
  };
  var handler = function (e) {
    var m = e.data;
    if (e.origin !== ORIGIN || !e.source || !m || m.mso !== 1) return;
    var src = e.source;
    if (m.type === 'hello') {
      reply(src, { type: 'ready', host: location.host });
    } else if (m.type === 'ping') {
      reply(src, { type: 'pong', id: m.id });
    } else if (m.type === 'cancel') {
      if (jobs[m.id]) jobs[m.id].abort();
    } else if (m.type === 'fetch') {
      var id = m.id;
      var u = null;
      try { u = new URL(m.url); } catch (err) { u = null; }
      /* Only public listing and thread URLs: never account pages, inboxes or settings. */
      if (!u || u.protocol !== 'https:' || !isReddit(u.hostname) || (u.pathname.indexOf('/r/') !== 0 && u.pathname !== '/api/morechildren.json')) {
        reply(src, { type: 'result', id: id, error: 'The relay only fetches Reddit listing and thread URLs.' });
        return;
      }
      var ctrl = new AbortController();
      jobs[id] = ctrl;
      fetch(location.origin + u.pathname + u.search, { credentials: 'same-origin', signal: ctrl.signal })
        .then(function (r) {
          return r.text().then(function (text) {
            reply(src, {
              type: 'result', id: id, ok: r.ok, status: r.status, statusText: r.statusText, contentType: r.headers.get('content-type'),
              rate: { remaining: r.headers.get('x-ratelimit-remaining'), used: r.headers.get('x-ratelimit-used'), reset: r.headers.get('x-ratelimit-reset') },
              text: text
            });
          });
        })
        .catch(function (err) {
          reply(src, { type: 'result', id: id, error: ctrl.signal.aborted ? 'cancelled' : 'The Reddit tab could not fetch it (' + err.message + '). RSS needs a www.reddit.com tab.' });
        })
        .then(function () { delete jobs[id]; });
    }
  };
  if (window.__msoRelay) window.removeEventListener('message', window.__msoRelay);
  window.__msoRelay = handler;
  window.addEventListener('message', handler);
  try {
    document.title = cfg.title;
    document.querySelectorAll('link[rel~=icon]').forEach(function (l) { l.remove(); });
    var icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = cfg.icon;
    document.head.appendChild(icon);
  } catch (err) { /* cosmetic only */ }
  var w = window.open('', cfg.name);
  if (!w) {
    alert('Allow pop-ups for this site, then click this bookmark again.');
    return;
  }
  try { if (w.location.href === 'about:blank') w.location.href = cfg.app; } catch (err) { /* already the app */ }
  reply(w, { type: 'ready', host: location.host });
  try { w.focus(); } catch (err) { /* cosmetic only */ }
  /* A page that sends Cross-Origin-Opener-Policy: same-origin cuts the link to windows it opens, and
     the window then reads as closed. Say so, instead of leaving a relay that never connects. */
  var polls = 0;
  var watch = setInterval(function () {
    polls += 1;
    if (w.closed) {
      clearInterval(watch);
      alert('The app window lost its link to this Reddit page, so it cannot relay for it. If you did not just close the app tab, this page blocks it (Cross-Origin-Opener-Policy).');
    } else if (polls >= 20) {
      clearInterval(watch);
    }
  }, 500);
}

const TAB_TITLE = 'Calendar - Outlook';
const TAB_ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="10" y="4" width="20" height="24" rx="2" fill="#28a8ea"/><rect x="2" y="8" width="16" height="16" rx="2" fill="#0078d4"/></svg>')}`;

// The address this page is served from, without ?debug or #hash. It goes into the bookmark.
const appAddress = () => `${window.location.origin}${window.location.pathname}`;

function bookmarkletCode(app) {
  const cfg = { app, name: WINDOW_NAME, title: TAB_TITLE, icon: TAB_ICON };
  return `(${relayMain.toString()})(${JSON.stringify(cfg)})`;
}

export const bookmarkletHref = (app = appAddress()) => `javascript:${encodeURIComponent(bookmarkletCode(app))}`;
