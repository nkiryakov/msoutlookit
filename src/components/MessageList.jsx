import { useEffect, useRef } from 'react';
import Icon from './Icons.jsx';
import LoadingLine from './LoadingLine.jsx';
import { avatarColor, disguiseName, folderLabel, formatDate, initials } from '../reddit.js';

function groupLabel(utc) {
  const d = new Date(utc * 1000);
  const today = new Date();
  const yesterday = new Date(Date.now() - 864e5);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  if (today - d < 7 * 864e5) return 'Earlier this week';
  return 'Older';
}

export default function MessageList({
  posts, selectedId, onSelect, readIds, realNames, loading, hasMore, onLoadMore, folder, filterText,
  feed, moreError, stopped, onCancel, onRetry, onOpenDebug,
}) {
  const listRef = useRef(null);

  // Keep the selected message in view during keyboard navigation.
  useEffect(() => {
    const el = listRef.current?.querySelector('.msg.selected');
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const onScroll = (e) => {
    const el = e.currentTarget;
    if (hasMore && !loading && !moreError && el.scrollTop + el.clientHeight > el.scrollHeight - 200) onLoadMore();
  };

  const offline = feed?.format === 'sample';
  let lastGroup = null;
  return (
    <section className="message-list" aria-label="Messages">
      <div className="ml-header">
        <div className="ml-tabs">
          <span className="ml-tab active">Focused</span>
          <span className="ml-tab">Other</span>
        </div>
        <div className="ml-folder">{folderLabel(folder)}</div>
      </div>
      {offline && !loading && (
        <div className="infobar" role="status">
          <Icon name="help" size={14} />
          <span>Working offline: Reddit couldn't be reached, so these are sample items.</span>
          <button type="button" className="link-btn" onClick={onRetry}>Retry</button>
          <button type="button" className="link-btn" onClick={onOpenDebug}>Why?</button>
          <button type="button" className="link-btn" onClick={() => onOpenDebug('sources')}>Connect a Reddit tab</button>
        </div>
      )}
      <div className="ml-scroll" ref={listRef} onScroll={onScroll} role="listbox" aria-label="Message list">
        {posts.length === 0 && !loading && (
          <div className="ml-empty">
            {filterText ? 'We didn’t find anything to show here.' : stopped ? 'Stopped before anything arrived.' : 'This folder is empty.'}
            {stopped && !filterText && (
              <div><button type="button" className="link-btn" onClick={onRetry}>Try again</button></div>
            )}
          </div>
        )}
        {posts.map((p) => {
          const g = groupLabel(p.created);
          const header = g !== lastGroup ? <div className="ml-group" key={`g-${g}`}>{g}</div> : null;
          lastGroup = g;
          const name = realNames ? `u/${p.author}` : disguiseName(p.author);
          const unread = !readIds.has(p.id);
          return [
            header,
            <div
              key={p.id}
              role="option"
              aria-selected={selectedId === p.id}
              tabIndex={-1}
              className={`msg${selectedId === p.id ? ' selected' : ''}${unread ? ' unread' : ''}`}
              onClick={() => onSelect(p.id)}
            >
              <span className="avatar" style={{ background: avatarColor(p.author) }}>
                {initials(disguiseName(p.author))}
              </span>
              <div className="msg-body">
                <div className="msg-row">
                  <span className="msg-from">{name}</span>
                  <span className="msg-icons">
                    {p.url && <Icon name={p.isImage ? 'image' : 'attach'} size={12} />}
                    {p.stickied && <Icon name="flag" size={12} className="flagged" />}
                  </span>
                </div>
                <div className="msg-row">
                  <span className="msg-subject">{p.title}</span>
                  <span className="msg-time">{formatDate(p.created)}</span>
                </div>
                <div className="msg-preview">
                  {p.preview || '(No message text)'}
                </div>
              </div>
            </div>,
          ];
        })}
        {loading && (
          <LoadingLine purpose="posts" text={posts.length ? 'Loading more items' : 'Updating this folder'} onCancel={onCancel} onDetails={onOpenDebug} />
        )}
        {!loading && moreError && (
          <div className="ml-note error">
            Couldn't load more items: {moreError}
            <div>
              <button type="button" className="link-btn" onClick={onLoadMore}>Retry</button>
              <button type="button" className="link-btn" onClick={onOpenDebug}>Details</button>
            </div>
          </div>
        )}
        {!loading && !moreError && hasMore && posts.length > 0 && (
          <button type="button" className="ml-more" onClick={onLoadMore}>Load more items</button>
        )}
        {!loading && !moreError && !hasMore && posts.length > 0 && !offline && !filterText && (
          <div className="ml-note">
            End of this folder: {posts.length} items. Reddit stops listings at about 1,000 posts.
          </div>
        )}
      </div>
    </section>
  );
}
