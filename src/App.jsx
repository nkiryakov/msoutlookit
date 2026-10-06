import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TitleBar from './components/TitleBar.jsx';
import Ribbon from './components/Ribbon.jsx';
import FolderPane from './components/FolderPane.jsx';
import MessageList from './components/MessageList.jsx';
import ReadingPane from './components/ReadingPane.jsx';
import ComposeWindow from './components/ComposeWindow.jsx';
import Icon from './components/Icons.jsx';
import { disguiseName, emailFor, fetchComments, fetchPosts, folderLabel } from './reddit.js';
import { bossEmails } from './sampleData.js';

const DEFAULT_FOLDERS = ['AskReddit', 'worldnews', 'todayilearned', 'programming', 'pics', 'gaming', 'funny'];

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

export default function App() {
  const [folders, setFolders] = usePersisted('folders', DEFAULT_FOLDERS);
  const [theme, setTheme] = usePersisted('theme', window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [realNames, setRealNames] = usePersisted('realNames', false);
  const [showImages, setShowImages] = usePersisted('showImages', false);
  const [readingPane, setReadingPane] = usePersisted('readingPane', true);
  const [readList, setReadList] = usePersisted('read', []);

  const [folder, setFolder] = useState(null);
  const [sort, setSort] = useState('hot');
  const [posts, setPosts] = useState([]);
  const [after, setAfter] = useState(null);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState('live');
  const [hidden, setHidden] = useState(() => new Set());
  const [selectedId, setSelectedId] = useState(null);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [boss, setBoss] = useState(false);
  const [composers, setComposers] = useState([]);
  const [toast, setToast] = useState(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const requestId = useRef(0);
  const toastTimer = useRef(null);
  const zCounter = useRef(0);

  const readIds = useMemo(() => new Set(readList), [readList]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const load = useCallback(async (sub, sortBy, cursor = null) => {
    const id = ++requestId.current;
    setLoading(true);
    const result = await fetchPosts(sub, sortBy, cursor);
    if (id !== requestId.current) return; // a newer request superseded this one
    if (!cursor || result.source !== 'offline') setSource(result.source);
    setPosts((prev) => (cursor ? [...prev, ...result.posts.filter((p) => !prev.some((q) => q.id === p.id))] : result.posts));
    setAfter(result.after);
    setLoading(false);
  }, []);

  useEffect(() => {
    setSelectedId(null);
    setPosts([]);
    load(folder, sort);
  }, [folder, sort, load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts.filter((p) => !hidden.has(p.id) && (!q || `${p.title} ${p.preview} ${p.author}`.toLowerCase().includes(q)));
  }, [posts, hidden, search]);

  const selected = visible.find((p) => p.id === selectedId) || null;

  useEffect(() => {
    if (!selected) {
      setComments([]);
      return;
    }
    let cancelled = false;
    setCommentsLoading(true);
    setComments([]);
    fetchComments(selected).then((list) => {
      if (cancelled) return;
      setComments(list);
      setCommentsLoading(false);
    });
    return () => { cancelled = true; };
    // Only refetch when a different post is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

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

  const showToast = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

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
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); move(1); }
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
        onRefresh={() => load(folder, sort)}
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
            />
            {readingPane && (
              <ReadingPane
                key={selected?.id || 'none'}
                post={selected}
                comments={comments}
                commentsLoading={commentsLoading}
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
          {boss || source === 'live'
            ? 'All folders are up to date.'
            : source === 'fallback'
              ? 'Folder unavailable, showing r/all'
              : 'Working Offline (showing cached items)'}
          <span className="status-sep" />
          Connected to: Microsoft Exchange
        </span>
      </footer>
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
