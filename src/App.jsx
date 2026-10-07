import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TitleBar from './components/TitleBar.jsx';
import Ribbon from './components/Ribbon.jsx';
import FolderPane from './components/FolderPane.jsx';
import MessageList from './components/MessageList.jsx';
import ReadingPane from './components/ReadingPane.jsx';
import ComposeWindow from './components/ComposeWindow.jsx';
import DebugConsole from './components/debug/DebugConsole.jsx';
import Icon from './components/Icons.jsx';
import {
  countComments, disguiseName, emailFor, fetchComments, fetchContinueThread, fetchMoreChildren, fetchPosts,
  folderLabel, patchNode, replaceNode,
} from './reddit.js';
import { FORMAT_LABELS, strategyLabel } from './net.js';
import { useRelay } from './relay.js';
import { getSettings, updateSettings, useSettings } from './settings.js';
import { bossEmails } from './sampleData.js';

const DEFAULT_FOLDERS = ['AskReddit', 'worldnews', 'todayilearned', 'programming', 'pics', 'gaming', 'funny'];
const NO_THREAD = { postId: null, status: 'idle', nodes: [], error: null, format: null, via: null, flat: false };

// Persisted per-browser preferences. Storage can be unavailable (private
// mode, blocked site data), so every access is guarded.
function usePersisted(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(`msoutlookit:${key}`);
      return raw === null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`msoutlookit:${key}`, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue];
}

function feedStatus(feed) {
  if (!feed.format) return 'All folders are up to date.';
  if (feed.format === 'sample') return 'Working offline: showing sample items';
  return `Connected via ${strategyLabel(feed.via)}${feed.format === 'json' ? '' : ` (${FORMAT_LABELS[feed.format]})`}`;
}

export default function App() {
  const [folders, setFolders] = usePersisted('folders', DEFAULT_FOLDERS);
  const [theme, setTheme] = usePersisted('theme', window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [realNames, setRealNames] = usePersisted('realNames', false);
  const [showImages, setShowImages] = usePersisted('showImages', false);
  const [readingPane, setReadingPane] = usePersisted('readingPane', true);
  const [readList, setReadList] = usePersisted('read', []);
  const settings = useSettings();
  const relay = useRelay();

  const [folder, setFolder] = useState(null);
  const [sort, setSort] = useState('hot');
  const [posts, setPosts] = useState([]);
  const [after, setAfter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState({ format: null, via: null, error: null });
  const [moreError, setMoreError] = useState(null);
  const [stopped, setStopped] = useState(false);
  const [hidden, setHidden] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [thread, setThread] = useState(NO_THREAD);
  const [threadNonce, setThreadNonce] = useState(0);
  const [search, setSearch] = useState('');
  const [boss, setBoss] = useState(false);
  const [debugOpen, setDebugOpen] = useState(() => new URLSearchParams(window.location.search).has('debug'));
  const [tabRequest, setTabRequest] = useState(null);
  const [composers, setComposers] = useState([]);
  const [toast, setToast] = useState(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const postsCtrl = useRef(null);
  const postsRef = useRef(posts);
  postsRef.current = posts;
  const toastTimer = useRef(null);
  const zCounter = useRef(0);

  const readIds = useMemo(() => new Set(readList), [readList]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const load = useCallback(async (sub, sortBy, cursor = null) => {
    postsCtrl.current?.abort('superseded');
    const ctrl = new AbortController();
    postsCtrl.current = ctrl;
    setLoading(true);
    setMoreError(null);
    setStopped(false);
    try {
      const result = await fetchPosts(sub, sortBy, cursor, { signal: ctrl.signal });
      if (postsCtrl.current !== ctrl) return;
      setFeed({ format: result.format, via: result.via, error: result.error || null });
      if (cursor) {
        const known = new Set(postsRef.current.map((p) => p.id));
        const fresh = result.posts.filter((p) => !known.has(p.id));
        setPosts((prev) => [...prev, ...fresh.filter((p) => !prev.some((q) => q.id === p.id))]);
        // A page with nothing new means paging stopped working, so stop asking.
        setAfter(fresh.length ? result.after : null);
      } else {
        setPosts(result.posts);
        setAfter(result.after);
      }
    } catch (err) {
      if (postsCtrl.current !== ctrl) return;
      if (err.type === 'aborted') setStopped(true);
      else setMoreError(err.message);
    } finally {
      if (postsCtrl.current === ctrl) {
        postsCtrl.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setPosts([]);
    setAfter(null);
    load(folder, sort);
  }, [folder, sort, load]);

  const cancelLoad = () => postsCtrl.current?.abort('cancelled');
  const reload = () => load(folder, sort);

  // A Reddit tab that connects after the folder fell back to sample items: load it again now,
  // rather than waiting for a click on Retry.
  useEffect(() => {
    if (relay.status === 'connected' && feed.format === 'sample') load(folder, sort);
  }, [relay.connectedAt]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => !hidden.has(p.id) && (!q || `${p.title} ${p.preview} ${p.author}`.toLowerCase().includes(q)));
  }, [posts, hidden, search]);

  const selected = visible.find((p) => p.id === selectedId) || null;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    const post = selectedRef.current;
    if (!post) {
      setThread(NO_THREAD);
      return undefined;
    }
    const ctrl = new AbortController();
    setThread({ ...NO_THREAD, postId: post.id, status: 'loading' });
    // Wait a moment so skimming with j/k doesn't send a request per post.
    const timer = setTimeout(() => {
      fetchComments(post, { signal: ctrl.signal, sort: getSettings().commentSort })
        .then((r) => {
          if (!ctrl.signal.aborted) setThread({ postId: post.id, status: 'ok', nodes: r.nodes, error: null, format: r.format, via: r.via, flat: !!r.flat });
        })
        .catch((err) => {
          if (!ctrl.signal.aborted) setThread({ ...NO_THREAD, postId: post.id, status: 'error', error: err.message });
        });
    }, post.offline ? 0 : 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort('superseded');
    };
  }, [selected?.id, settings.commentSort, settings.commentLimit, settings.commentDepth, threadNonce]);

  const loadMoreReplies = useCallback(async (node) => {
    const post = selectedRef.current;
    if (!post) return;
    const update = (fn) => setThread((t) => (t.postId === post.id ? { ...t, nodes: fn(t.nodes) } : t));
    update((nodes) => patchNode(nodes, node.key, { loading: true, error: null }));
    try {
      const opts = { sort: getSettings().commentSort };
      const replacement = node.isContinue ? await fetchContinueThread(post, node, opts) : await fetchMoreChildren(post, node, opts);
      update((nodes) => replaceNode(nodes, node.key, replacement));
    } catch (err) {
      update((nodes) => patchNode(nodes, node.key, { loading: false, error: err.message }));
    }
  }, []);

  const select = useCallback((id) => {
    setSelectedId(id);
    if (id) setReadList((list) => (list.includes(id) ? list : [...list.slice(-999), id]));
  }, [setReadList]);

  const move = useCallback((delta) => {
    if (!visible.length) return;
    const i = visible.findIndex((p) => p.id === selectedId);
    const next = visible[Math.max(0, Math.min(visible.length - 1, i === -1 ? 0 : i + delta))];
    select(next.id);
  }, [visible, selectedId, select]);

  const deleteSelected = useCallback(() => {
    if (!selected) return;
    const i = visible.indexOf(selected);
    const next = visible[i + 1] || visible[i - 1];
    setHidden((h) => new Set(h).add(selected.id));
    select(next ? next.id : null);
  }, [selected, visible, select]);

  const showToast = useCallback((text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const openCompose = useCallback((kind) => {
    let draft = {};
    if (selected && kind !== 'new') {
      const from = disguiseName(selected.author);
      const quoted = `\n\n\n________________________________\nFrom: ${from} <${emailFor(selected.author)}>\nSent: ${new Date(selected.created * 1000).toLocaleString()}\nSubject: ${selected.title}\n\n${selected.preview}`;
      draft = {
        to: kind === 'forward' ? '' : `${from}${kind === 'replyAll' ? `; r/${selected.subreddit}-distribution` : ''}`,
        subject: `${kind === 'forward' ? 'FW' : 'RE'}: ${selected.title}`,
        body: quoted,
      };
    }
    setComposers((list) => [...list, { key: Date.now(), draft, z: ++zCounter.current }]);
  }, [selected]);

  // Global keyboard shortcuts.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setBoss((b) => !b);
        return;
      }
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.metaKey || e.ctrlKey || e.altKey || boss) return;
      if (e.key === '`') setDebugOpen((open) => !open);
      else if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Delete') deleteSelected();
      else if (e.key === 'r') load(folder, sort);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move, deleteSelected, load, folder, sort, boss]);

  const addFolder = (name) => {
    if (!folders.some((f) => f.toLowerCase() === name.toLowerCase())) setFolders([...folders, name]);
    setFolder(folders.find((f) => f.toLowerCase() === name.toLowerCase()) || name);
  };
  const removeFolder = (name) => {
    setFolders(folders.filter((f) => f !== name));
    if (folder === name) setFolder(null);
  };

  const unread = visible.filter((p) => !readIds.has(p.id)).length;
  // Also used as a click handler, so only a string means "open this tab".
  const openDebug = (tab) => {
    if (typeof tab === 'string') setTabRequest({ tab, n: Date.now() });
    setDebugOpen(true);
  };
  const probePost = selected && !selected.offline ? selected : posts.find((p) => !p.offline) || null;
  const debugSummary = [
    ['Folder', `r/${folder || 'all'} · ${sort}`],
    ['Posts', `${posts.length} loaded, ${after ? `next page after ${after}` : 'no further pages'}`],
    ['Source', feed.format === 'sample' ? `sample data, because: ${feed.error}` : feed.via ? `${strategyLabel(feed.via)} · ${FORMAT_LABELS[feed.format]}` : loading ? 'loading…' : '-'],
    ['Open post', selected
      ? `${selected.id} · replies ${thread.status}${thread.status === 'ok' ? `: ${countComments(thread.nodes)} via ${strategyLabel(thread.via)} · ${FORMAT_LABELS[thread.format] || thread.format}` : ''}`
      : 'none'],
    ['Settings', `${settings.mode}, ${settings.timeoutMs / 1000}s timeout, formats ${['json', 'plain', 'rss'].filter((f) => settings.formats[f]).join('/') || 'none'}, ${settings.postLimit} posts per page`],
    ['Reddit tab', {
      connected: `connected to ${relay.host}`,
      connecting: 'connecting…',
      lost: `not answering: ${relay.error}`,
      none: relay.error ? `not connected: ${relay.error}` : 'not connected',
    }[relay.status]],
  ];

  return (
    <div className="app">
      <TitleBar search={search} onSearch={setSearch} folderName={boss ? 'Inbox' : folderLabel(folder)} />
      <Ribbon
        hasSelection={!!selected && !boss}
        sort={sort}
        onSort={setSort}
        onNewEmail={() => openCompose('new')}
        onReply={() => openCompose('reply')}
        onReplyAll={() => openCompose('replyAll')}
        onForward={() => openCompose('forward')}
        onDelete={deleteSelected}
        onRefresh={reload}
        loading={loading}
        readingPane={readingPane}
        onToggleReadingPane={() => setReadingPane(!readingPane)}
        theme={theme}
        onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        realNames={realNames}
        onToggleRealNames={() => setRealNames(!realNames)}
        showImages={showImages}
        onToggleImages={() => setShowImages(!showImages)}
        onNewFolder={() => setAddingFolder(true)}
        onBoss={() => setBoss(true)}
        onMarkAllRead={() => setReadList((list) => [...new Set([...list, ...visible.map((p) => p.id)])].slice(-1000))}
        onOpenDebug={openDebug}
      />
      <main className={`workspace${readingPane ? '' : ' no-reading-pane'}${selected && !boss ? ' has-selection' : ''}`}>
        <FolderPane
          folders={folders}
          current={boss ? null : folder}
          onSelect={(f) => { setBoss(false); setFolder(f); }}
          onAdd={addFolder}
          onRemove={removeFolder}
          unreadCount={unread}
          adding={addingFolder}
          setAdding={setAddingFolder}
        />
        {boss ? (
          <BossView />
        ) : (
          <>
            <MessageList
              posts={visible}
              selectedId={selectedId}
              onSelect={select}
              readIds={readIds}
              realNames={realNames}
              loading={loading}
              hasMore={!!after}
              onLoadMore={() => after && load(folder, sort, after)}
              folder={folder}
              filterText={search}
              feed={feed}
              moreError={moreError}
              stopped={stopped}
              onCancel={cancelLoad}
              onRetry={reload}
              onOpenDebug={openDebug}
            />
            {readingPane && (
              <ReadingPane
                key={selected?.id || 'none'}
                post={selected}
                thread={thread}
                commentSort={settings.commentSort}
                onSortChange={(commentSort) => updateSettings({ commentSort })}
                onLoadMore={loadMoreReplies}
                onRetryComments={() => setThreadNonce((n) => n + 1)}
                onOpenDebug={openDebug}
                realNames={realNames}
                showImages={showImages}
                onReply={() => openCompose('reply')}
                onReplyAll={() => openCompose('replyAll')}
                onForward={() => openCompose('forward')}
                onBack={() => setSelectedId(null)}
              />
            )}
          </>
        )}
      </main>
      <footer className="statusbar">
        <span>Items: {boss ? bossEmails.length : visible.length}</span>
        <span>Unread: {boss ? 2 : unread}</span>
        <span className="status-right">
          {boss ? 'All folders are up to date.' : (
            <button type="button" className="status-link" onClick={openDebug} title="Open the debug console">
              {loading && !posts.length ? 'Updating this folder…' : feedStatus(feed)}
            </button>
          )}
          <span className="status-sep" />
          Connected to: Microsoft Exchange
        </span>
      </footer>
      {debugOpen && !boss && (
        <DebugConsole
          onClose={() => setDebugOpen(false)}
          onToast={showToast}
          folder={folder}
          sort={sort}
          post={probePost}
          summary={debugSummary}
          tabRequest={tabRequest}
        />
      )}
      {composers.map((c, i) => (
        <ComposeWindow
          key={c.key}
          draft={c.draft}
          index={i}
          zIndex={1000 + c.z}
          onFocus={() => setComposers((list) => list.map((x) => (x.key === c.key ? { ...x, z: ++zCounter.current } : x)))}
          onClose={() => setComposers((list) => list.filter((x) => x.key !== c.key))}
          onSend={() => {
            setComposers((list) => list.filter((x) => x.key !== c.key));
            showToast('Message moved to Outbox.');
          }}
        />
      ))}
      {toast && <div className="toast" role="status"><Icon name="send" size={14} /> {toast}</div>}
    </div>
  );
}

function BossView() {
  const [sel, setSel] = useState(0);
  const m = bossEmails[sel];
  return (
    <>
      <section className="message-list" aria-label="Messages">
        <div className="ml-header">
          <div className="ml-tabs"><span className="ml-tab active">Focused</span><span className="ml-tab">Other</span></div>
          <div className="ml-folder">Inbox</div>
        </div>
        <div className="ml-scroll">
          {bossEmails.map((e, i) => (
            <div key={e.subject} className={`msg${i === sel ? ' selected' : ''}${i < 2 ? ' unread' : ''}`} onClick={() => setSel(i)}>
              <span className="avatar" style={{ background: '#5c6b7a' }}>{e.from.split(' ').map((s) => s[0]).join('').slice(0, 2)}</span>
              <div className="msg-body">
                <div className="msg-row"><span className="msg-from">{e.from}</span></div>
                <div className="msg-row"><span className="msg-subject">{e.subject}</span><span className="msg-time">{e.time}</span></div>
                <div className="msg-preview">{e.preview}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="reading-pane" aria-label="Reading pane">
        <div className="rp-scroll">
          <h1 className="rp-subject">{m.subject}</h1>
          <div className="rp-header">
            <span className="avatar" style={{ background: '#5c6b7a', width: 40, height: 40 }}>{m.from.split(' ').map((s) => s[0]).join('').slice(0, 2)}</span>
            <div className="rp-from">
              <div className="rp-from-name">{m.from}</div>
              <div className="rp-to">To: you@contoso.com</div>
              <div className="rp-date">{m.time}</div>
            </div>
          </div>
          <div className="rp-body">
            <p>Hi all,</p>
            <p>{m.preview}</p>
            <p>Please let me know if you have any questions.</p>
            <p>Best regards,<br />{m.from}</p>
          </div>
        </div>
      </section>
    </>
  );
}
