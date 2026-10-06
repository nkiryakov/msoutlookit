import { useState } from 'react';
import Icon from './Icons.jsx';
import { folderLabel } from '../reddit.js';

export default function FolderPane({ folders, current, onSelect, onAdd, onRemove, unreadCount, adding, setAdding }) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(true);

  const submit = (e) => {
    e.preventDefault();
    const name = draft.trim().replace(/^\/?r\//i, '').replace(/[^A-Za-z0-9_]/g, '');
    if (name) onAdd(name);
    setDraft('');
    setAdding(false);
  };

  const row = (sub, label, icon) => (
    <li key={sub || 'inbox'}>
      <button
        type="button"
        className={`folder${current === sub ? ' selected' : ''}`}
        onClick={() => onSelect(sub)}
        title={sub ? `r/${sub}` : 'r/all'}
      >
        <Icon name={icon} size={15} />
        <span className="folder-name">{label}</span>
        {current === sub && unreadCount > 0 && <span className="folder-count">{unreadCount}</span>}
      </button>
      {sub && (
        <button type="button" className="folder-remove" onClick={() => onRemove(sub)} aria-label={`Remove ${label}`}>
          <Icon name="close" size={10} />
        </button>
      )}
    </li>
  );

  return (
    <nav className="folder-pane" aria-label="Folders">
      <div className="nav-rail" aria-hidden>
        <span className="rail-item active"><Icon name="mail" size={18} /></span>
        <span className="rail-item"><Icon name="calendar" size={18} /></span>
        <span className="rail-item"><Icon name="people" size={18} /></span>
        <span className="rail-item"><Icon name="tasks" size={18} /></span>
      </div>
      <div className="folders">
        <div className="folder-section-title">Favorites</div>
        <ul>
          {row(null, 'Inbox', 'inbox')}
        </ul>
        <button type="button" className="folder-section-title toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={12} />
          you@contoso.com
        </button>
        {open && (
          <ul>
            {folders.map((f) => row(f, folderLabel(f), 'folder'))}
          </ul>
        )}
        {adding ? (
          <form className="folder-add-form" onSubmit={submit}>
            <input
              autoFocus
              placeholder="Subreddit name"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => !draft && setAdding(false)}
              aria-label="New folder (subreddit name)"
            />
          </form>
        ) : (
          <button type="button" className="folder-add" onClick={() => setAdding(true)}>
            <Icon name="folderAdd" size={14} /> New folder
          </button>
        )}
      </div>
    </nav>
  );
}
