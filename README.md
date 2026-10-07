# MSOutlookit

Browse Reddit at work, disguised as Microsoft Outlook. Subreddits show up as mail folders, posts as emails, and comment threads as the conversation under each message.

Inspired by Peter Cottle's original MSOutlookit and [Leigh Robert Abbott's modern remake](https://leighrobertabbott.github.io/MSOutlookit/).

## Features

- Outlook-style title bar, ribbon (File / Home / Send-Receive / View / Help), folder pane, message list and reading pane, in light and dark themes
- Subreddits as folders: add one with **New folder** (type `aww` or `r/aww`) and remove one with the × on hover. Folders are saved in your browser. The Inbox is Reddit's homepage (`r/all`).
- Posts as emails. Each Reddit username maps to a stable, fake colleague name (`Michelle Miller <michelle.miller@contoso.com>`). Turn on **View → Show Usernames** to see real usernames.
- Links and images arrive as "attachments". Images stay hidden until you click them, or until you turn on **View → Show Images**.
- Comment threads display as nested replies that you can collapse and re-sort (Best, Top, New, Controversial, Old, Q&A). **Load N more replies** and **Continue this thread** fetch the replies Reddit leaves out.
- Sort by Hot, Newest, Top (today) or Rising. Scroll down, or click **Load more items**, to load the next page; a failed page can be retried. The search box filters the current folder.
- Unread tracking, Mark All Read, and Delete/Archive to hide a post
- Draggable Reply, Reply All, Forward and New Email windows. Nothing is actually sent.
- **Boss key:** press `Esc` to swap everything for a boring inbox of work emails, and press it again to come back
- Keyboard shortcuts: `j`/`k` or the arrow keys to move between messages, `r` to refresh, `Delete` to hide, `` ` `` for the debug console

## How data is loaded

Every request tries up to three **formats**, in this order, each through the enabled **sources**:

1. JSON with `raw_json=1`, e.g. `https://www.reddit.com/r/all/hot.json?limit=25&raw_json=1`
2. The plain JSON feed for the same folder and sort, e.g. `https://www.reddit.com/r/all/hot.json?limit=25` or `https://www.reddit.com/r/pics/new.json?limit=25`
3. The RSS feed, e.g. `https://www.reddit.com/r/all/hot/.rss?limit=25`. RSS has titles, authors, text and links, but no scores, and replies come as a flat list.

Sources:

| Source | How |
|---|---|
| Reddit tab | A bookmarklet turns a logged-in Reddit tab into a relay that fetches for the app, from reddit.com itself and with your login. See [Connecting a Reddit tab](#connecting-a-reddit-tab). Tried first when connected, skipped when not. |
| Direct | `fetch()` to www.reddit.com without cookies |
| JSONP | A `<script>` tag with `?jsonp=`. Not subject to CORS, but your Reddit login only goes along if its cookie is `SameSite=None` and the browser sends cross-site cookies (Chrome does; Safari and Firefox don't). Otherwise Reddit sees you logged out. JSON only. |
| corsproxy.io, allorigins.win, codetabs.com | Public CORS proxies |
| Custom proxy | Your own proxy, e.g. `https://your-worker.example.workers.dev/?url={url}` |
| old.reddit.com, Direct + cookies | Off by default; for experiments |

By default sources are **staggered**: the next one starts if the current one hasn't answered within 1.5 s, and the first answer wins. A source that doesn't answer within 6 s is benched for 3 minutes, even across page reloads, and the source that last worked is tried first. If everything fails, the app shows bundled sample posts with a "Working offline" bar. All of this can be changed in the debug console.

Post and comment HTML is sanitized with DOMPurify before it is rendered.

## Connecting a Reddit tab

Reddit refuses requests that come from other websites, so a page on GitHub Pages can't fetch Reddit's JSON itself, and being logged in to Reddit in another tab doesn't change that: the browser won't let one site use your login on another. A Reddit tab you're logged in to can fetch it, though, and can hand the answer to the app. A bookmarklet turns that tab into a relay:

1. Open the debug console (`` ` ``, or **Help → Debug Console**), go to **Sources**, and drag **Outlook relay** to your bookmarks bar. Or **copy it** and paste it as the address of a new bookmark.
2. Open **old.reddit.com** in a tab where you're logged in.
3. Click the bookmark in that tab. It opens the app in a new tab, connected to the Reddit tab. To connect an app tab that is already open, use **Open it from here** in the Sources tab to open Reddit, then click the bookmark in that tab.

Keep the Reddit tab open; it can be minimized or in another window. Its title becomes "Calendar - Outlook" and its icon changes, so it doesn't stand out. If it goes to another page the connection drops (the Sources tab shows "Not answering"); click the bookmark again, and the app reconnects and reloads the folder. After restarting the browser, do step 3 again.

How it works: the bookmarklet runs inside the Reddit tab and listens for `postMessage`s from the app. For each request it fetches the URL from the tab's own site, so there is no CORS and the login cookie goes along, and posts the response text back. `www.reddit.com` URLs are fetched from whichever Reddit address the tab is on. While it is connected the app asks it first, so nothing goes through a public proxy.

Good to know:

- The bookmark answers only pages from the app's site (its origin, e.g. `https://nkiryakov.github.io`), and only fetches `/r/...` listing and thread URLs and `/api/morechildren.json`. Account pages, the inbox and settings are refused.
- JSON works from `old.reddit.com` and `www.reddit.com`. RSS needs a `www.reddit.com` tab, because old.reddit.com redirects feeds to www.
- Pop-ups must be allowed for reddit.com, since the bookmark opens the app in a new tab.
- The link between the tabs is `window.opener`. If a Reddit page ever sends `Cross-Origin-Opener-Policy: same-origin`, browsers cut that link, and the bookmark says so in an alert.
- The bookmark contains the app's address, so make it again from the Sources tab if the app moves.

## Debugging

Open the debug console with **Help → Debug Console**, the `` ` `` key, a click on the status bar text, or by adding `?debug` to the URL. It has three tabs:

- **Requests:** every request the app made, grouped by what it was for. Expand one to see each source and format that was tried: HTTP status, time, size, rate-limit headers, the error explained in plain words, and the start of the response. **Copy log** or **Download** exports everything as JSON.
- **Sources:** set up and check the Reddit tab relay, turn sources and formats on or off, reorder them, set the mode (one at a time, staggered, all at once), timeouts and request sizes, and add a custom proxy. **Test every source** loads a small page through each source as JSON and as RSS; **Use what worked** puts the working sources first.
- **Limits:** the known limits, plus probes that measure them from your browser: the most posts one request returns, how deep a listing goes by following `after` cursors, and how many replies a thread returns for different limits.

While a folder loads, the message list shows which sources are being tried and for how long, with **Cancel** and **Details**.

The **Reddit access probe** workflow (Actions tab → Reddit access probe → Run workflow) tests every format through every source from a GitHub server and prints a table in the run summary, plus RSS page-size, paging and comment-count measurements.

## Reddit limits

| Limit | Value |
|---|---|
| Posts per request | `limit` defaults to 25, maximum 100 |
| Listing depth | about 1,000 posts (10 pages of 100) via `after` cursors |
| Replies per thread request | up to `limit` comments and `depth` levels; the rest become "load more" placeholders |
| More replies | `/api/morechildren` takes at most 100 comment ids per call, one call at a time |
| Rate limit | about 10 requests a minute when logged out; 100 a minute for approved OAuth apps |
| RSS | honors `limit` up to 100 (measured); server IPs get `429` after 2 or 3 requests |

**Access in 2026:** since late May 2026 Reddit answers logged-out `.json` requests with `403 Forbidden`. The probe (October 2026) found that from a server, JSON and JSONP get 403 while RSS still works, but RSS has no CORS header, so a browser can only read it through a proxy, and server IPs are rate limited after a couple of RSS requests. corsproxy.io now requires an API key, and allorigins.win and codetabs.com mostly time out. In practice that leaves the [Reddit tab](#connecting-a-reddit-tab) relay, which reads Reddit as you, a small proxy running on your own home connection set up as the Custom proxy (a cloud-hosted proxy would hit the same server rate limit), or JSONP in browsers that send your login cookie cross-site.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
```

## Deploying

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to `main`. To turn it on once, go to the repo's **Settings → Pages** and set **Source** to **GitHub Actions**. The build uses relative paths, so it also works on any static host.
