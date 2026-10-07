import { useSyncExternalStore } from 'react';

// In-memory log of every request the app makes, shown in the debug console.
// A group is one thing the app wanted ("load r/all"), and its attempts are the
// individual requests made through each source and format.
const MAX_GROUPS = 200;

let groups = [];
let nextId = 1;
const listeners = new Set();

function commit(next) {
  groups = next;
  listeners.forEach((fn) => fn());
}

export function startGroup({ purpose, label, url }) {
  const group = { id: nextId++, purpose, label, url, startedAt: Date.now(), endedAt: null, status: 'pending', attempts: [] };
  commit([group, ...groups].slice(0, MAX_GROUPS));
  return group.id;
}

export function updateGroup(id, patch) {
  commit(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));
}

export function endGroup(id, patch) {
  updateGroup(id, { ...patch, endedAt: Date.now() });
}

export function addAttempt(groupId, attempt) {
  const entry = { id: nextId++, startedAt: Date.now(), status: 'pending', ...attempt };
  commit(groups.map((g) => (g.id === groupId ? { ...g, attempts: [...g.attempts, entry] } : g)));
  return entry.id;
}

export function updateAttempt(groupId, attemptId, patch) {
  commit(groups.map((g) => (g.id === groupId
    ? { ...g, attempts: g.attempts.map((a) => (a.id === attemptId ? { ...a, ...patch } : a)) }
    : g)));
}

export function clearLog() {
  commit(groups.filter((g) => g.status === 'pending'));
}

export const getLog = () => groups;

export function subscribeLog(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useLog() {
  return useSyncExternalStore(subscribeLog, getLog);
}

export function exportLog(extra = {}) {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    page: window.location.href,
    userAgent: navigator.userAgent,
    ...extra,
    groups,
  }, null, 2);
}
