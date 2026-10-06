# MSOutlookit

Browse Reddit at work, disguised as Microsoft Outlook. Subreddits show up as mail folders, posts as emails, and comment threads as the conversation under each message.

Inspired by Peter Cottle's original MSOutlookit and [Leigh Robert Abbott's modern remake](https://leighrobertabbott.github.io/MSOutlookit/).

## Features

- Outlook-style title bar, ribbon (File / Home / Send-Receive / View / Help), folder pane, message list and reading pane, in light and dark themes
- Subreddits as folders: add one with **New folder** (type `aww` or `r/aww`) and remove one with the × on hover. Folders are saved in your browser.
- Posts as emails. Each Reddit username maps to a stable, fake colleague name (`Michelle Miller <michelle.miller@contoso.com>`). Turn on **View → Show Usernames** to see real usernames.
- Links and images arrive as "attachments". Images stay hidden until you click them, or until you turn on **View → Show Images**.
- Comment threads display as nested replies that you can collapse
- Sort by Hot, Newest, Top (today) or Rising. Scroll down to load more. The search box filters the current folder.
- Unread tracking, Mark All Read, and Delete/Archive to hide a post
- Draggable Reply, Reply All, Forward and New Email windows. Nothing is actually sent.
- **Boss key:** press `Esc` to swap everything for a boring inbox of work emails, and press it again to come back
- Keyboard shortcuts: `j`/`k` or the arrow keys to move between messages, `r` to refresh, `Delete` to hide
- The Inbox is Reddit's homepage (`r/all`). Every folder loads `/r/{folder}/{sort}.json`. If that request fails, the app retries the plain JSON feed for the same folder and sort, e.g. `https://www.reddit.com/r/all/hot.json?limit=25` for the Inbox sorted by Hot, or `https://www.reddit.com/r/pics/new.json?limit=25` for Pics sorted by Newest. If that fails too, it shows bundled sample posts and the status bar reads "Working Offline".

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
```

Posts load from Reddit's public JSON endpoints (`/r/{sub}/{sort}.json`, `/r/{sub}/comments/{id}.json`). When the browser blocks a direct request with CORS, the app retries through a public CORS proxy (corsproxy.io, then allorigins.win). Post and comment HTML is sanitized with DOMPurify before it is rendered.

## Deploying

`.github/workflows/deploy.yml` builds the site and publishes it to GitHub Pages on every push to `main`. To turn it on once, go to the repo's **Settings → Pages** and set **Source** to **GitHub Actions**. The build uses relative paths, so it also works on any static host.
