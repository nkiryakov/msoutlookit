import { useState } from 'react';
import Icon from './Icons.jsx';

const TABS = ['File', 'Home', 'Send / Receive', 'View', 'Help'];
const SORTS = [
  { id: 'hot', label: 'Hot' },
  { id: 'new', label: 'Newest' },
  { id: 'top', label: 'Top (today)' },
  { id: 'rising', label: 'Rising' },
];

function Btn({ icon, label, onClick, disabled, active, big }) {
  return (
    <button
      type="button"
      className={`rb-btn${big ? ' rb-big' : ''}${active ? ' rb-active' : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active === undefined ? undefined : active}
    >
      <Icon name={icon} size={big ? 22 : 16} />
      <span>{label}</span>
    </button>
  );
}

function Group({ label, children }) {
  return (
    <div className="rb-group">
      <div className="rb-group-items">{children}</div>
      <div className="rb-group-label">{label}</div>
    </div>
  );
}

export default function Ribbon(props) {
  const {
    hasSelection, sort, onSort, onNewEmail, onReply, onReplyAll, onForward, onDelete, onRefresh, loading,
    readingPane, onToggleReadingPane, theme, onToggleTheme, realNames, onToggleRealNames, showImages,
    onToggleImages, onNewFolder, onBoss, onMarkAllRead,
  } = props;
  const [tab, setTab] = useState('Home');

  return (
    <div className="ribbon">
      <div className="ribbon-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`ribbon-tab${tab === t ? ' active' : ''}${t === 'File' ? ' file-tab' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="ribbon-body">
        {tab === 'File' && (
          <>
            <Group label="Account">
              <Btn big icon="user" label="Account Info" onClick={() => alert('Account: you@contoso.com\nMailbox size: 48.3 GB of 50 GB\nArchive: Off')} />
            </Group>
            <Group label="Privacy">
              <Btn big icon="eye" label="Hide Everything (Esc)" onClick={onBoss} />
            </Group>
          </>
        )}
        {tab === 'Home' && (
          <>
            <Group label="New">
              <Btn big icon="newMail" label="New Email" onClick={onNewEmail} />
            </Group>
            <Group label="Delete">
              <Btn icon="delete" label="Delete" onClick={onDelete} disabled={!hasSelection} />
              <Btn icon="archive" label="Archive" onClick={onDelete} disabled={!hasSelection} />
            </Group>
            <Group label="Respond">
              <Btn icon="reply" label="Reply" onClick={onReply} disabled={!hasSelection} />
              <Btn icon="replyAll" label="Reply All" onClick={onReplyAll} disabled={!hasSelection} />
              <Btn icon="forward" label="Forward" onClick={onForward} disabled={!hasSelection} />
            </Group>
            <Group label="Arrange">
              <label className="rb-select">
                <Icon name="sort" size={16} />
                <select value={sort} onChange={(e) => onSort(e.target.value)} aria-label="Sort by">
                  {SORTS.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <Btn icon="mail" label="Mark All Read" onClick={onMarkAllRead} />
            </Group>
            <Group label="Folders">
              <Btn icon="folderAdd" label="New Folder" onClick={onNewFolder} />
            </Group>
          </>
        )}
        {tab === 'Send / Receive' && (
          <Group label="Send & Receive">
            <Btn big icon="refresh" label={loading ? 'Receiving…' : 'Send/Receive All Folders'} onClick={onRefresh} disabled={loading} />
          </Group>
        )}
        {tab === 'View' && (
          <>
            <Group label="Layout">
              <Btn icon="pane" label="Reading Pane" active={readingPane} onClick={onToggleReadingPane} />
              <Btn icon={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'} onClick={onToggleTheme} />
            </Group>
            <Group label="Disguise">
              <Btn icon="user" label="Show Usernames" active={realNames} onClick={onToggleRealNames} />
              <Btn icon="image" label="Show Images" active={showImages} onClick={onToggleImages} />
            </Group>
          </>
        )}
        {tab === 'Help' && (
          <Group label="Keyboard">
            <div className="rb-help">
              <div><kbd>j</kbd>/<kbd>k</kbd> or <kbd>↓</kbd>/<kbd>↑</kbd> next / previous message</div>
              <div><kbd>Esc</kbd> boss mode: instantly show boring work email</div>
              <div><kbd>r</kbd> refresh &nbsp; <kbd>Delete</kbd> hide message</div>
            </div>
          </Group>
        )}
      </div>
    </div>
  );
}
