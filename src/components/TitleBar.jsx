import Icon from './Icons.jsx';

export default function TitleBar({ search, onSearch, folderName }) {
  return (
    <header className="titlebar">
      <div className="titlebar-left">
        <span className="app-logo" aria-hidden>
          <span>O</span>
        </span>
        <span className="titlebar-title">{folderName} - Outlook</span>
      </div>
      <label className="titlebar-search">
        <Icon name="search" size={14} />
        <input
          type="search"
          placeholder="Search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search messages in this folder"
        />
      </label>
      <div className="titlebar-right" aria-hidden>
        <span className="me-avatar">ME</span>
        <span className="win-btn"><Icon name="minimize" size={12} /></span>
        <span className="win-btn"><Icon name="maximize" size={11} /></span>
        <span className="win-btn win-close"><Icon name="close" size={12} /></span>
      </div>
    </header>
  );
}
