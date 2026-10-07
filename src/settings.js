import { useSyncExternalStore } from 'react';

// How the app reaches Reddit. Edited in the debug console's Sources tab and
// kept in this browser only.
const KEY = 'msoutlookit:sources';

export const DEFAULT_SETTINGS = {
  // sequential: try sources one at a time, moving on when one fails.
  // staggered: start the next source if the current one is slow (staggerMs).
  // race: ask every source at once and use the first answer.
  mode: 'staggered',
  staggerMs: 1500,
  timeoutMs: 6000,
  // The Reddit tab comes first: when it is connected it is the only source that works reliably, and
  // when it isn't it is skipped.
  order: ['relay', 'direct', 'jsonp', 'corsproxy', 'allorigins', 'codetabs', 'custom', 'old', 'directCookies'],
  enabled: {
    relay: true,
    direct: true,
    jsonp: true,
    corsproxy: true,
    allorigins: true,
    codetabs: true,
    custom: false,
    old: false,
    directCookies: false,
  },
  customProxy: '',
  rememberWorking: true,
  // Data formats, tried in this order: JSON with raw_json=1, the plain JSON
  // feed, then the RSS feed.
  formats: { json: true, plain: true, rss: true },
  offline: false,
  postLimit: 25,
  commentLimit: 200,
  commentDepth: 8,
  commentSort: 'confidence',
};

// Keeps newly added sources in a saved order, placed before the next source that follows them by
// default (so a new first source starts first) rather than at the end.
function mergeOrder(savedOrder) {
  const order = (savedOrder || []).filter((id) => DEFAULT_SETTINGS.order.includes(id));
  DEFAULT_SETTINGS.order.forEach((id, i) => {
    if (order.includes(id)) return;
    const next = DEFAULT_SETTINGS.order.slice(i + 1).find((other) => order.includes(other));
    if (next) order.splice(order.indexOf(next), 0, id);
    else order.push(id);
  });
  return order;
}

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved) return DEFAULT_SETTINGS;
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      enabled: { ...DEFAULT_SETTINGS.enabled, ...saved.enabled },
      formats: { ...DEFAULT_SETTINGS.formats, ...saved.formats },
      order: mergeOrder(saved.order),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

let current = read();
const listeners = new Set();

function publish(next) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage unavailable: settings last for this visit only */
  }
  listeners.forEach((fn) => fn());
}

export const getSettings = () => current;

export function updateSettings(patch) {
  publish({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) });
}

export function resetSettings() {
  publish(DEFAULT_SETTINGS);
}

export function subscribeSettings(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useSettings() {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
