import DOMPurify from 'dompurify';
import { samplePosts, sampleComments } from './sampleData.js';

const REDDIT = 'https://www.reddit.com';

// Reddit's JSON endpoints often refuse cross-origin requests, so we try a
// direct fetch first and then fall back to public CORS proxies.
const PROXIES = [
  (url) => url,
  (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
];

const TIMEOUT_MS = 7000;

async function fetchJson(url) {
  let lastError;
  for (const wrap of PROXIES) {
    try {
      const res = await fetch(wrap(url), { credentials: 'omit', signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

function listingUrl(subreddit, sort, after) {
  const path = subreddit ? `/r/${encodeURIComponent(subreddit)}/${sort}.json` : `/${sort}.json`;
  const params = new URLSearchParams({ limit: '30', raw_json: '1' });
  if (sort === 'top') params.set('t', 'day');
  if (after) params.set('after', after);
  return `${REDDIT}${path}?${params}`;
}

// Returns { posts, after, offline }. Falls back to bundled sample data when
// Reddit can't be reached so the UI is never empty.
export async function fetchPosts(subreddit, sort = 'hot', after = null) {
  try {
    const data = await fetchJson(listingUrl(subreddit, sort, after));
    return {
      posts: data.data.children.filter((c) => c.kind === 't3').map((c) => toEmail(c.data)),
      after: data.data.after,
      offline: false,
    };
  } catch (err) {
    console.warn('Falling back to sample data:', err);
    if (after) return { posts: [], after: null, offline: true };
    const posts = samplePosts
      .filter((p) => !subreddit || p.subreddit.toLowerCase() === subreddit.toLowerCase())
      .map(toEmail);
    return { posts: posts.length ? posts : samplePosts.map(toEmail), after: null, offline: true };
  }
}

export async function fetchComments(post) {
  if (post.offline) return (sampleComments[post.id] || []).map(toComment).filter(Boolean);
  try {
    const url = `${REDDIT}/r/${post.subreddit}/comments/${post.id}.json?raw_json=1&limit=100&depth=6`;
    const data = await fetchJson(url);
    return data[1].data.children.map(toComment).filter(Boolean);
  } catch (err) {
    console.warn('Could not load comments:', err);
    return (sampleComments[post.id] || []).map(toComment).filter(Boolean);
  }
}

export function sanitize(html) {
  return DOMPurify.sanitize(html || '', { ADD_ATTR: ['target'] });
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = sanitize(html);
  return (div.textContent || '').replace(/\s+/g, ' ').trim();
}

const IMAGE_RE = /\.(jpe?g|png|gif|webp)(\?.*)?$/i;

function toEmail(p) {
  const isImage = IMAGE_RE.test(p.url || '') || p.post_hint === 'image';
  const isSelf = p.is_self || !p.url;
  return {
    id: p.id,
    subreddit: p.subreddit,
    author: p.author || '[deleted]',
    title: p.title,
    bodyHtml: p.selftext_html || '',
    preview: p.selftext ? stripHtml(p.selftext_html || p.selftext) : p.domain || p.url || '',
    url: isSelf ? null : p.url,
    domain: p.domain,
    isImage,
    score: p.score ?? 0,
    numComments: p.num_comments ?? 0,
    created: p.created_utc,
    nsfw: !!p.over_18,
    stickied: !!p.stickied,
    permalink: `${REDDIT}${p.permalink || ''}`,
    offline: !!p.offline,
  };
}

function toComment(c) {
  if (!c || c.kind !== 't1') return null;
  const d = c.data;
  const replies = d.replies && d.replies.data ? d.replies.data.children.map(toComment).filter(Boolean) : [];
  return {
    id: d.id,
    author: d.author || '[deleted]',
    bodyHtml: d.body_html || `<p>${d.body || '[deleted]'}</p>`,
    score: d.score ?? 0,
    created: d.created_utc,
    isOp: !!d.is_submitter,
    replies,
  };
}

// --- Disguise helpers -------------------------------------------------------

const FIRST = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth',
  'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Chris', 'Karen', 'Daniel',
  'Nancy', 'Matthew', 'Lisa', 'Anthony', 'Priya', 'Mark', 'Sandra', 'Steven', 'Ashley', 'Andrew', 'Emily', 'Kevin',
  'Michelle', 'Brian', 'Amanda', 'Wei', 'Olga', 'Tomás', 'Aisha'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez',
  'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'Patel', 'Nguyen',
  'Kowalski', 'Okafor', 'Schmidt', 'Rossi'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Maps a Reddit username to a stable, boring-looking colleague name.
export function disguiseName(username) {
  if (!username || username === '[deleted]') return 'Undeliverable Mail';
  const h = hash(username);
  return `${FIRST[h % FIRST.length]} ${LAST[(h >>> 8) % LAST.length]}`;
}

export function emailFor(username) {
  const [first, last] = disguiseName(username).toLowerCase().split(' ');
  return `${first}.${last}@contoso.com`;
}

export function initials(name) {
  return name.split(' ').map((s) => s[0]).join('').slice(0, 2).toUpperCase();
}

export function avatarColor(username) {
  const colors = ['#0078d4', '#8764b8', '#038387', '#ca5010', '#498205', '#c239b3', '#986f0b', '#4f6bed', '#e3008c'];
  return colors[hash(username || '') % colors.length];
}

export function formatDate(utc, long = false) {
  if (!utc) return '';
  const d = new Date(utc * 1000);
  const now = new Date();
  if (long) {
    return d.toLocaleString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (now - d < 6 * 864e5) return d.toLocaleDateString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString();
}

// "Folder" name shown in the sidebar for a subreddit.
export function folderLabel(sub) {
  if (!sub) return 'Inbox';
  return sub.charAt(0).toUpperCase() + sub.slice(1);
}
