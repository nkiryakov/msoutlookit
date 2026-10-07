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
  order: ['direct', 'jsonp', 'corsproxy', 'allorigins', 'codetabs', 'custom', 'old', 'directCookies'],
  enabled: {
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

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!saved) return DEFAULT_SETTINGS;
    const order = (saved.order || []).filter((id) => DEFAULT_SETTINGS.order.includes(id));
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      enabled: { ...DEFAULT_SETTINGS.enabled, ...saved.enabled },
      formats: { ...DEFAULT_SETTINGS.formats, ...saved.formats },
      // Keep newly added sources in the list.
      order: [...order, ...DEFAULT_SETTINGS.order.filter((id) => !order.includes(id))],
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
