import DOMPurify from 'dompurify';
import { samplePosts, sampleComments } from './sampleData.js';
import { getSettings } from './settings.js';
import { addAttempt, endGroup, startGroup } from './debugLog.js';
import { NetError, parseJson, parseXml, requestThroughSources, strategyLabel, strategyPlan } from './net.js';

export const REDDIT = 'https://www.reddit.com';

// The Inbox is Reddit's homepage, i.e. r/all.
const HOME = 'all';

// ---- URLs ------------------------------------------------------------------------

// JSON listing, e.g. https://www.reddit.com/r/all/hot.json?limit=25&raw_json=1.
// Without raw_json this is the plain feed, e.g. /r/all/hot.json?limit=25.
export function listingUrl(subreddit, sort, { after, limit, raw = true } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (raw) params.set('raw_json', '1');
  if (sort === 'top') params.set('t', 'day');
  if (after) params.set('after', after);
  return `${REDDIT}/r/${encodeURIComponent(subreddit || HOME)}/${sort}.json?${params}`;
}

// Atom feed for the same listing, e.g. https://www.reddit.com/r/all/hot/.rss?limit=25.
export function rssUrl(subreddit, sort, { after, limit } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (sort === 'top') params.set('t', 'day');
  if (after) params.set('after', after);
  return `${REDDIT}/r/${encodeURIComponent(subreddit || HOME)}/${sort}/.rss?${params}`;
}

export function commentsUrl(post, { limit, depth, sort, raw = true, format = 'json' }) {
  const base = `${REDDIT}/r/${post.subreddit}/comments/${post.id}`;
  const params = new URLSearchParams({ limit: String(limit), sort });
  if (format === 'rss') return `${base}/.rss?${params}`;
  params.set('depth', String(depth));
  if (raw) params.set('raw_json', '1');
  return `${base}.json?${params}`;
}

// ---- Validation --------------------------------------------------------------------

function redditError(d) {
  if (d && typeof d === 'object' && !Array.isArray(d) && (d.error || d.reason || d.message)) {
    return `Reddit says: ${[d.error, d.reason, d.message].filter(Boolean).join(' · ')}`;
  }
  return null;
}

export const validateListing = (d) => (Array.isArray(d?.data?.children) ? null : redditError(d) || 'The JSON is not a Reddit listing');
export const validateThread = (d) => (Array.isArray(d) && Array.isArray(d[1]?.data?.children) ? null : redditError(d) || 'The JSON is not a comment thread');
export const validateFeed = (doc) => (doc?.documentElement?.localName === 'feed' ? null : 'The XML is not an Atom feed');

function validateMore(d) {
  if (Array.isArray(d?.json?.data?.things)) return null;
  const errors = d?.json?.errors;
  if (errors?.length) return `Reddit says: ${errors.map((e) => [].concat(e).join(' ')).join('; ')}`;
  return redditError(d) || 'The JSON is not a morechildren response';
}

// ---- Plans: try each enabled data format through the sources ---------------------

async function runPlans(plans, { purpose, label, signal }) {
  const groupId = startGroup({ purpose, label, url: plans[0]?.url });
  // Sources that timed out on one format are skipped for the next formats of
  // the same request, since they'd most likely time out again.
  const skip = new Set();
  const noted = new Set();
  let lastError = new NetError('none', 'Every data format is turned off (debug console, Sources tab)');
  for (const plan of plans) {
    if (getSettings().offline) {
      lastError = new NetError('offline', 'Offline mode is on (debug console, Sources tab)');
      break;
    }
    const { ids, benched } = strategyPlan(plan.format, { skip });
    const newlyBenched = benched.filter((id) => !noted.has(id));
    if (newlyBenched.length) {
      newlyBenched.forEach((id) => noted.add(id));
      addAttempt(groupId, {
        strategy: null,
        format: plan.format,
        url: plan.url,
        status: 'skipped',
        error: `Skipped ${newlyBenched.map(strategyLabel).join(', ')}: timed out in the last 3 minutes`,
      });
    }
    if (!ids.length) {
      addAttempt(groupId, {
        strategy: null,
        format: plan.format,
        url: plan.url,
        status: 'skipped',
        error: skip.size ? 'Skipped: the remaining sources timed out a moment ago' : 'Skipped: no enabled source supports this format',
      });
      continue;
    }
    try {
      const res = await requestThroughSources(plan.url, { ...plan, groupId, signal, ids });
      const result = plan.read(res.data);
      endGroup(groupId, { status: 'ok', via: res.strategy, format: plan.format, items: result.count });
      return { ...result, via: res.strategy, format: plan.format };
    } catch (err) {
      if (err.type === 'aborted') {
        endGroup(groupId, { status: 'cancelled', error: err.message });
        throw err;
      }
      lastError = err instanceof NetError ? err : new NetError('error', `Could not read the response: ${err.message}`);
      (err.timedOut || []).forEach((id) => skip.add(id));
    }
  }
  endGroup(groupId, { status: 'error', error: lastError.message });
  throw lastError;
}

// ---- Posts ---------------------------------------------------------------------------

export function readListing(d, raw) {
  const posts = d.data.children.filter((c) => c.kind === 't3').map((c) => toEmail(raw ? c.data : unescapePost(c.data)));
  return { posts, after: d.data.after || null, count: posts.length };
}

// Returns { posts, after, format, via, error }. format is 'json', 'plain' or
// 'rss' for live data, or 'sample' when Reddit couldn't be reached and the
// bundled sample posts are shown instead. Loading a later page (`after`)
// throws instead of falling back, so the caller can offer a retry.
export async function fetchPosts(subreddit, sort = 'hot', after = null, { signal } = {}) {
  const s = getSettings();
  const limit = s.postLimit;
  const plans = [];
  if (s.formats.json) {
    plans.push({ format: 'json', url: listingUrl(subreddit, sort, { after, limit }), parse: parseJson, validate: validateListing, read: (d) => readListing(d, true) });
  }
  if (s.formats.plain) {
    plans.push({ format: 'plain', url: listingUrl(subreddit, sort, { after, limit, raw: false }), parse: parseJson, validate: validateListing, read: (d) => readListing(d, false) });
  }
  if (s.formats.rss) {
    plans.push({ format: 'rss', url: rssUrl(subreddit, sort, { after, limit }), parse: parseXml, validate: validateFeed, read: (doc) => readFeed(doc, limit) });
  }
  const where = `r/${subreddit || HOME} · ${sort}`;
  try {
    return await runPlans(plans, { purpose: 'posts', label: `${after ? 'More posts' : 'Posts'} · ${where}`, signal });
  } catch (err) {
    if (after || err.type === 'aborted') throw err;
    const matching = samplePosts.filter((p) => !subreddit || p.subreddit.toLowerCase() === subreddit.toLowerCase());
    const posts = (matching.length ? matching : samplePosts).map(toEmail);
    return { posts, after: null, format: 'sample', via: null, error: err.message, count: posts.length };
  }
}

// ---- Comments --------------------------------------------------------------------------

export function readThread(d, raw) {
  const nodes = d[1].data.children.map((c) => toNode(c, raw)).filter(Boolean);
  return { nodes, count: countComments(nodes) };
}

// Returns { nodes, format, via, flat }. Nodes are comments with nested
// replies, plus "more" placeholders for replies Reddit left out.
export async function fetchComments(post, { signal, sort } = {}) {
  if (post.offline) {
    const nodes = (sampleComments[post.id] || []).map((c) => toNode(c, true)).filter(Boolean);
    return { nodes, count: countComments(nodes), format: 'sample', via: null };
  }
  const s = getSettings();
  const opts = { limit: s.commentLimit, depth: s.commentDepth, sort: sort || s.commentSort };
  const plans = [];
  if (s.formats.json) {
    plans.push({ format: 'json', url: commentsUrl(post, opts), parse: parseJson, validate: validateThread, read: (d) => readThread(d, true) });
  }
  if (s.formats.plain) {
    plans.push({ format: 'plain', url: commentsUrl(post, { ...opts, raw: false }), parse: parseJson, validate: validateThread, read: (d) => readThread(d, false) });
  }
  if (s.formats.rss) {
    plans.push({ format: 'rss', url: commentsUrl(post, { ...opts, format: 'rss' }), parse: parseXml, validate: validateFeed, read: readCommentFeed });
  }
  return runPlans(plans, { purpose: 'comments', label: `Replies · ${post.title.slice(0, 60)}`, signal });
}

function jsonPlans(urlFor, validate, read) {
  const s = getSettings();
  const plans = [];
  if (s.formats.json) plans.push({ format: 'json', url: urlFor(true), parse: parseJson, validate, read: (d) => read(d, true) });
  if (s.formats.plain) plans.push({ format: 'plain', url: urlFor(false), parse: parseJson, validate, read: (d) => read(d, false) });
  if (!plans.length) throw new NetError('none', 'Loading more replies needs a JSON format; turn one on in the Sources tab');
  return plans;
}

// Reddit allows one morechildren request at a time, so calls are queued.
let moreQueue = Promise.resolve();
function queued(task) {
  const run = moreQueue.then(task, task);
  moreQueue = run.catch(() => {});
  return run;
}

// Expands a "load more replies" placeholder via /api/morechildren, which
// takes at most 100 comment ids per call. Returns the nodes that replace it.
export function fetchMoreChildren(post, more, { signal, sort } = {}) {
  return queued(async () => {
    const s = getSettings();
    const ids = more.children.slice(0, 100);
    const rest = more.children.slice(100);
    const urlFor = (raw) => {
      const params = new URLSearchParams({
        api_type: 'json',
        link_id: `t3_${post.id}`,
        children: ids.join(','),
        sort: sort || s.commentSort,
        depth: String(s.commentDepth),
        limit_children: 'false',
      });
      if (raw) params.set('raw_json', '1');
      return `${REDDIT}/api/morechildren.json?${params}`;
    };
    const read = (d, raw) => {
      const nodes = buildFromFlat(d.json.data.things, more.parentName, raw);
      return { nodes, count: countComments(nodes) };
    };
    const result = await runPlans(jsonPlans(urlFor, validateMore, read), { purpose: 'more', label: `${ids.length} more replies`, signal });
    const nodes = [...result.nodes];
    if (rest.length) nodes.push(makeMore({ parentName: more.parentName, children: rest, key: `${more.key}:rest${rest.length}` }));
    return nodes;
  });
}

// Expands a "continue this thread" placeholder by loading the parent
// comment's own page, which starts a fresh depth budget.
export async function fetchContinueThread(post, more, { signal, sort } = {}) {
  const s = getSettings();
  const commentId = more.parentName.replace(/^t1_/, '');
  const urlFor = (raw) => {
    const params = new URLSearchParams({ limit: String(s.commentLimit), depth: String(s.commentDepth), sort: sort || s.commentSort });
    if (raw) params.set('raw_json', '1');
    return `${REDDIT}/r/${post.subreddit}/comments/${post.id}/_/${commentId}.json?${params}`;
  };
  const read = (d, raw) => {
    const root = toNode(d[1].data.children[0], raw);
    const nodes = root?.type === 'comment' ? root.replies : [];
    return { nodes, count: countComments(nodes) };
  };
  const result = await runPlans(jsonPlans(urlFor, validateThread, read), { purpose: 'more', label: 'Continue this thread', signal });
  return result.nodes;
}

// ---- Comment tree -----------------------------------------------------------------------

export function makeMore({ parentName, children = [], count, isContinue = false, key }) {
  return {
    type: 'more',
    key: key || `more:${parentName}:${children[0] || '_'}`,
    parentName,
    children,
    count: count || children.length,
    isContinue,
  };
}

function toNode(thing, raw) {
  if (!thing) return null;
  if (thing.kind === 'more') {
    const d = thing.data;
    const children = d.children || [];
    return makeMore({
      parentName: d.parent_id,
      children,
      count: d.count,
      // "Continue this thread" placeholders have no ids, just the parent.
      isContinue: d.id === '_' || children.length === 0,
      key: `more:${d.parent_id}:${d.id}`,
    });
  }
  if (thing.kind !== 't1') return null;
  const d = raw ? thing.data : { ...thing.data, body: decodeEntities(thing.data.body), body_html: decodeEntities(thing.data.body_html) };
  const replies = d.replies && d.replies.data ? d.replies.data.children.map((c) => toNode(c, raw)).filter(Boolean) : [];
  const name = d.name || `t1_${d.id}`;
  return {
    type: 'comment',
    key: name,
    id: d.id,
    name,
    author: d.author || '[deleted]',
    bodyHtml: d.body_html || `<p>${escapeHtml(d.body || '[deleted]')}</p>`,
    score: d.score ?? null,
    created: d.created_utc,
    isOp: !!d.is_submitter,
    replies,
  };
}

// morechildren returns a flat list; rebuild the nesting from parent_id.
function buildFromFlat(things, parentName, raw) {
  const top = [];
  const byName = new Map();
  for (const thing of things) {
    const node = toNode(thing.kind === 't1' ? { ...thing, data: { ...thing.data, replies: '' } } : thing, raw);
    if (!node) continue;
    const holder = thing.data.parent_id !== parentName && byName.get(thing.data.parent_id);
    if (holder) holder.replies.push(node);
    else top.push(node);
    if (node.type === 'comment') byName.set(node.name, node);
  }
  return top;
}

export function replaceNode(nodes, key, replacement) {
  return nodes.flatMap((n) => {
    if (n.key === key) return replacement;
    if (n.type === 'comment' && n.replies.length) return [{ ...n, replies: replaceNode(n.replies, key, replacement) }];
    return [n];
  });
}

export function patchNode(nodes, key, patch) {
  return nodes.map((n) => {
    if (n.key === key) return { ...n, ...patch };
    if (n.type === 'comment' && n.replies.length) return { ...n, replies: patchNode(n.replies, key, patch) };
    return n;
  });
}

export function countComments(nodes) {
  return nodes.reduce((sum, n) => sum + (n.type === 'comment' ? 1 + countComments(n.replies) : 0), 0);
}

// Totals for the limits probe: loaded comments, placeholders and depth.
export function treeStats(nodes, depth = 1) {
  const stats = { comments: 0, more: 0, hidden: 0, continues: 0, maxDepth: 0 };
  for (const n of nodes) {
    if (n.type === 'more') {
      if (n.isContinue) stats.continues += 1;
      else {
        stats.more += 1;
        stats.hidden += n.count;
      }
      continue;
    }
    stats.comments += 1;
    stats.maxDepth = Math.max(stats.maxDepth, depth);
    const sub = treeStats(n.replies, depth + 1);
    stats.comments += sub.comments;
    stats.more += sub.more;
    stats.hidden += sub.hidden;
    stats.continues += sub.continues;
    stats.maxDepth = Math.max(stats.maxDepth, sub.maxDepth);
  }
  return stats;
}

// ---- RSS (Atom) ------------------------------------------------------------------------

function textOf(el, tag) {
  const node = el?.getElementsByTagName(tag)[0];
  return node ? node.textContent.trim() : '';
}

function entryContent(entry) {
  return new DOMParser().parseFromString(textOf(entry, 'content'), 'text/html');
}

function entryAuthor(entry) {
  return textOf(entry.getElementsByTagName('author')[0], 'name').replace(/^\/?u\//, '') || '[deleted]';
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// RSS has titles, authors, bodies and links, but no scores or reply counts.
export function readFeed(doc, limit) {
  const posts = [];
  for (const entry of doc.getElementsByTagName('entry')) {
    const name = textOf(entry, 'id');
    if (!name.startsWith('t3_')) continue;
    const id = name.slice(3);
    const content = entryContent(entry);
    const md = content.querySelector('.md');
    const link = [...content.querySelectorAll('a')].find((a) => a.textContent.trim() === '[link]')?.getAttribute('href') || '';
    const external = !!link && !link.includes(`/comments/${id}`);
    const permalink = entry.getElementsByTagName('link')[0]?.getAttribute('href') || '';
    posts.push(toEmail({
      id,
      subreddit: entry.getElementsByTagName('category')[0]?.getAttribute('term') || '',
      author: entryAuthor(entry),
      title: textOf(entry, 'title'),
      selftext_html: md ? md.outerHTML : '',
      selftext: md ? md.textContent : '',
      url: external ? link : undefined,
      is_self: !external,
      domain: external ? hostOf(link) : '',
      created_utc: Date.parse(textOf(entry, 'published') || textOf(entry, 'updated')) / 1000,
      permalink: permalink.replace(REDDIT, ''),
    }));
  }
  const last = posts[posts.length - 1];
  // Feeds have no "after" cursor; the last post's id works as one.
  return { posts, after: last && posts.length >= limit ? `t3_${last.id}` : null, count: posts.length };
}

// The comments feed is a flat list, without the reply structure.
export function readCommentFeed(doc) {
  const nodes = [];
  for (const entry of doc.getElementsByTagName('entry')) {
    const name = textOf(entry, 'id');
    if (!name.startsWith('t1_')) continue;
    const md = entryContent(entry).querySelector('.md');
    nodes.push({
      type: 'comment',
      key: name,
      id: name.slice(3),
      name,
      author: entryAuthor(entry),
      bodyHtml: md ? md.outerHTML : `<p>${escapeHtml(textOf(entry, 'title'))}</p>`,
      score: null,
      created: Date.parse(textOf(entry, 'updated')) / 1000,
      isOp: false,
      replies: [],
    });
  }
  return { nodes, count: nodes.length, flat: true };
}

// ---- Shared helpers --------------------------------------------------------------------

// Without raw_json, Reddit HTML-escapes titles and bodies, and *_html fields
// are escaped twice. Decoding once restores what raw_json would return.
function decodeEntities(text) {
  if (!text || !text.includes('&')) return text;
  const el = document.createElement('textarea');
  el.innerHTML = text;
  return el.value;
}

function unescapePost(p) {
  return {
    ...p,
    title: decodeEntities(p.title),
    selftext: decodeEntities(p.selftext),
    selftext_html: decodeEntities(p.selftext_html),
    url: decodeEntities(p.url),
  };
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
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
    score: p.score ?? null,
    numComments: p.num_comments ?? null,
    created: p.created_utc,
    nsfw: !!p.over_18,
    stickied: !!p.stickied,
    permalink: `${REDDIT}${p.permalink || ''}`,
    offline: !!p.offline,
  };
}

// ---- Disguise helpers --------------------------------------------------------------------

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
