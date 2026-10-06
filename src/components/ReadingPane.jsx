import { useState } from 'react';
import Icon from './Icons.jsx';
import { avatarColor, disguiseName, emailFor, formatDate, initials, sanitize } from '../reddit.js';

function Sender({ username, realNames, size = 36 }) {
  const name = disguiseName(username);
  return (
    <span className="avatar" style={{ background: avatarColor(username), width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
      <span className="sr-only">{realNames ? `u/${username}` : name}</span>
    </span>
  );
}

function Html({ html }) {
  // Reddit links should never navigate the disguised window away.
  const clean = sanitize(html).replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ');
  return <div className="rp-html" dangerouslySetInnerHTML={{ __html: clean }} />;
}

function Comment({ c, realNames, depth }) {
  const [collapsed, setCollapsed] = useState(depth >= 4);
  const name = realNames ? `u/${c.author}` : disguiseName(c.author);
  return (
    <div className={`reply depth-${Math.min(depth, 5)}`}>
      <div className="reply-head">
        <Sender username={c.author} realNames={realNames} size={28} />
        <div className="reply-meta">
          <div>
            <strong>{name}</strong>
            {c.isOp && <span className="tag">Sender</span>}
            {!realNames && <span className="reply-addr">&lt;{emailFor(c.author)}&gt;</span>}
          </div>
          <div className="reply-date">{formatDate(c.created, true)} · Importance: {c.score}</div>
        </div>
        <button type="button" className="reply-toggle" onClick={() => setCollapsed(!collapsed)} aria-expanded={!collapsed}>
          <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={12} />
          {collapsed ? `Show (${countReplies(c) + 1})` : 'Hide'}
        </button>
      </div>
      {!collapsed && (
        <>
          <Html html={c.bodyHtml} />
          {c.replies.length > 0 && (
            <div className="reply-children">
              {c.replies.map((r) => (
                <Comment key={r.id} c={r} realNames={realNames} depth={depth + 1} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function countReplies(c) {
  return c.replies.reduce((n, r) => n + 1 + countReplies(r), 0);
}

export default function ReadingPane({ post, comments, commentsLoading, realNames, showImages, onReply, onReplyAll, onForward, onBack }) {
  // Remounted per post (see `key` in App), so this resets on selection change.
  const [revealImage, setRevealImage] = useState(false);

  if (!post) {
    return (
      <section className="reading-pane empty" aria-label="Reading pane">
        <div className="rp-empty">
          <Icon name="mail" size={56} />
          <div>Select an item to read</div>
          <div className="rp-empty-sub">Click here to always preview messages</div>
        </div>
      </section>
    );
  }

  const name = realNames ? `u/${post.author}` : disguiseName(post.author);
  const imageVisible = post.isImage && (showImages || revealImage);

  return (
    <section className="reading-pane" aria-label="Reading pane">
      <div className="rp-scroll">
        <button type="button" className="rp-back" onClick={onBack}>
          <Icon name="reply" size={14} /> Back to messages
        </button>
        <h1 className="rp-subject">{post.title}</h1>
        <div className="rp-header">
          <Sender username={post.author} realNames={realNames} size={40} />
          <div className="rp-from">
            <div className="rp-from-name">
              {name}
              {!realNames && <span className="reply-addr">&lt;{emailFor(post.author)}&gt;</span>}
            </div>
            <div className="rp-to">To: r/{post.subreddit}-distribution@contoso.com</div>
            <div className="rp-date">{formatDate(post.created, true)}</div>
          </div>
          <div className="rp-actions">
            <button type="button" onClick={onReply} title="Reply"><Icon name="reply" /></button>
            <button type="button" onClick={onReplyAll} title="Reply All"><Icon name="replyAll" /></button>
            <button type="button" onClick={onForward} title="Forward"><Icon name="forward" /></button>
          </div>
        </div>

        {post.url && (
          <div className="attachments">
            {post.isImage ? (
              <button type="button" className="attachment" onClick={() => setRevealImage(!revealImage)}>
                <Icon name="image" size={20} />
                <span>
                  <span className="att-name">{post.domain || 'image'}.jpg</span>
                  <span className="att-size">{imageVisible ? 'Click to hide' : 'Click to preview'}</span>
                </span>
              </button>
            ) : (
              <a className="attachment" href={post.url} target="_blank" rel="noopener noreferrer">
                <Icon name="link" size={20} />
                <span>
                  <span className="att-name">{post.domain}</span>
                  <span className="att-size">Shared link · Open in new tab</span>
                </span>
              </a>
            )}
          </div>
        )}
        {imageVisible && <img className="rp-image" src={post.url} alt="" />}

        <div className="rp-body">
          {post.bodyHtml ? <Html html={post.bodyHtml} /> : !post.url && <p className="muted">(This message has no text.)</p>}
        </div>

        <div className="rp-footer">
          <a href={post.permalink} target="_blank" rel="noopener noreferrer">
            <Icon name="external" size={12} /> Open original
          </a>
          <span>Importance: {post.score}</span>
          <span>{post.numComments} replies</span>
        </div>

        <div className="conversation">
          <div className="conversation-title">Conversation ({post.numComments})</div>
          {commentsLoading && <div className="ml-loading"><span className="spinner" /> Downloading messages…</div>}
          {!commentsLoading && comments.length === 0 && <p className="muted">No replies yet.</p>}
          {comments.map((c) => (
            <Comment key={c.id} c={c} realNames={realNames} depth={0} />
          ))}
        </div>
      </div>
    </section>
  );
}
