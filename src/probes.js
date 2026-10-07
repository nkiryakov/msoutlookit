import { endGroup, startGroup } from './debugLog.js';
import { FORMAT_LABELS, NetError, STRATEGIES, isConfigured, parseJson, parseXml, requestThroughSources, supportsFormat } from './net.js';
import {
  commentsUrl, listingUrl, readCommentFeed, readFeed, readListing, readThread, rssUrl, treeStats,
  validateFeed, validateListing, validateThread,
} from './reddit.js';

// Experiments run from the debug console. Probes space their requests out,
// because logged-out Reddit access allows only about 10 requests a minute.
const GAP_MS = 1100;

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new NetError('aborted', 'Stopped'));
    }, { once: true });
  });
}

async function logged(label, url, options) {
  const groupId = startGroup({ purpose: options.purpose || 'probe', label, url });
  try {
    const res = await requestThroughSources(url, { ...options, groupId });
    endGroup(groupId, { status: 'ok', via: res.strategy, format: options.format });
    return res;
  } catch (err) {
    endGroup(groupId, { status: err.type === 'aborted' ? 'cancelled' : 'error', error: err.message });
    throw err;
  }
}

function listingRequest(sub, sort, format, { limit, after }) {
  return format === 'rss'
    ? { url: rssUrl(sub, sort, { limit, after }), parse: parseXml, validate: validateFeed, read: (d) => readFeed(d, limit) }
    : { url: listingUrl(sub, sort, { limit, after }), parse: parseJson, validate: validateListing, read: (d) => readListing(d, true) };
}

// Runs `task` over `items` with at most `size` running at once.
async function pool(items, size, task) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(size, queue.length) }, async () => {
    while (queue.length) await task(queue.shift());
  });
  await Promise.all(workers);
}

// Fetches a small page of the folder through every source in each format,
// ignoring the enabled/disabled settings. Calls onResult per source/format.
export async function testAllSources({ sub, sort, formats, signal, onResult }) {
  const jobs = [];
  for (const strategy of STRATEGIES) {
    for (const format of formats) {
      if (!supportsFormat(strategy.id, format)) onResult({ id: strategy.id, format, skipped: 'JSON only' });
      else if (!isConfigured(strategy.id)) onResult({ id: strategy.id, format, skipped: 'Not set up' });
      else jobs.push({ strategy, format });
    }
  }
  await pool(jobs, 3, async ({ strategy, format }) => {
    if (signal?.aborted) return;
    const req = listingRequest(sub, sort, format, { limit: 5 });
    try {
      const res = await logged(`Test · ${strategy.label} · ${FORMAT_LABELS[format]}`, req.url, {
        purpose: 'test', format, parse: req.parse, validate: req.validate, signal, ids: [strategy.id], force: true, remember: false,
      });
      onResult({ id: strategy.id, format, ok: true, ms: res.ms, items: req.read(res.data).posts.length });
    } catch (err) {
      // Report the source's own error rather than the "every source failed" summary.
      const cause = err.errors?.length === 1 ? err.errors[0] : err;
      onResult({ id: strategy.id, format, ok: false, type: cause.type, error: cause.message });
    }
  });
}

// Asks for different page sizes to find the most items one request returns.
export async function probePageSizes({ sub, sort, format, sizes, signal, onRow }) {
  for (const [i, size] of sizes.entries()) {
    if (i) await wait(GAP_MS, signal);
    const req = listingRequest(sub, sort, format, { limit: size });
    try {
      const res = await logged(`Probe · ${size} per page`, req.url, { format, parse: req.parse, validate: req.validate, signal });
      onRow({ size, received: req.read(res.data).posts.length, via: res.strategy, ms: res.ms });
    } catch (err) {
      if (err.type === 'aborted') throw err;
      onRow({ size, error: err.message });
    }
  }
}

// Follows "after" cursors to find how deep a listing goes.
export async function probeDepth({ sub, sort, format, pageSize, maxPages, signal, onPage }) {
  const seen = new Set();
  let after = null;
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await wait(GAP_MS, signal);
    const req = listingRequest(sub, sort, format, { limit: pageSize, after });
    const res = await logged(`Probe · page ${page}`, req.url, { format, parse: req.parse, validate: req.validate, signal });
    const data = req.read(res.data);
    const fresh = data.posts.filter((p) => !seen.has(p.id));
    fresh.forEach((p) => seen.add(p.id));
    onPage({ page, received: data.posts.length, fresh: fresh.length, total: seen.size, after: data.after, via: res.strategy, ms: res.ms });
    if (!data.after) return { total: seen.size, pages: page, reason: 'Reddit sent no "after" cursor, so the listing ended here.' };
    if (!fresh.length) return { total: seen.size, pages: page, reason: 'The page repeated earlier posts, so paging stopped working.' };
    after = data.after;
  }
  return { total: seen.size, pages: maxPages, reason: `Stopped at the probe's limit of ${maxPages} pages; the listing may go deeper.` };
}

// Asks for different comment limits on one thread.
export async function probeCommentLimits({ post, format, limits, depth, signal, onRow }) {
  for (const [i, limit] of limits.entries()) {
    if (i) await wait(GAP_MS, signal);
    const rss = format === 'rss';
    const url = commentsUrl(post, { limit, depth, sort: 'confidence', format: rss ? 'rss' : 'json' });
    try {
      const res = await logged(`Probe · ${limit} replies`, url, {
        format, parse: rss ? parseXml : parseJson, validate: rss ? validateFeed : validateThread, signal,
      });
      const thread = rss ? readCommentFeed(res.data) : readThread(res.data, true);
      onRow({ limit, ...treeStats(thread.nodes), via: res.strategy, ms: res.ms });
    } catch (err) {
      if (err.type === 'aborted') throw err;
      onRow({ limit, error: err.message });
    }
  }
}
