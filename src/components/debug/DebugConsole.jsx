import { useEffect, useRef, useState } from 'react';
import Icon from '../Icons.jsx';
import LimitsTab from './LimitsTab.jsx';
import RequestsTab from './RequestsTab.jsx';
import SourcesTab from './SourcesTab.jsx';

const TABS = [
  ['requests', 'Requests'],
  ['sources', 'Sources'],
  ['limits', 'Limits'],
];
const TAB_KEY = 'msoutlookit:debugTab';

function initialTab() {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.some(([id]) => id === saved) ? saved : 'requests';
  } catch {
    return 'requests';
  }
}

// Floating, draggable and resizable window with the request log, source
// settings and limit probes. `tabRequest` ({ tab, n }) switches to a tab, e.g.
// from a link elsewhere in the app, even while the console is already open.
export default function DebugConsole({ onClose, onToast, folder, sort, post, summary, tabRequest }) {
  const [tab, setTab] = useState(() => (TABS.some(([id]) => id === tabRequest?.tab) ? tabRequest.tab : initialTab()));
  useEffect(() => {
    if (TABS.some(([id]) => id === tabRequest?.tab)) setTab(tabRequest.tab);
  }, [tabRequest]);
  // Open over the reading pane, leaving the folders and message list visible.
  const [size] = useState(() => ({
    w: Math.max(420, Math.min(860, window.innerWidth - 680, window.innerWidth - 32)),
    h: Math.min(600, window.innerHeight - 80),
  }));
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, window.innerWidth - size.w - 16),
    y: Math.max(16, window.innerHeight - size.h - 40),
  }));
  const drag = useRef(null);

  const pick = (id) => {
    setTab(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* ignore */
    }
  };

  const onPointerDown = (e) => {
    if (e.target.closest('button') || window.innerWidth < 700) return;
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 120, e.clientX - drag.current.dx)),
      y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.current.dy)),
    });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div className="debug" role="dialog" aria-label="Debug console" style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}>
      <div className="debug-title" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <Icon name="bug" size={14} />
        <span>Debug console</span>
        <span className="debug-hint">` to toggle</span>
        <button type="button" className="win-btn win-close" onClick={onClose} aria-label="Close debug console">
          <Icon name="close" size={12} />
        </button>
      </div>
      <div className="debug-tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`debug-tab${tab === id ? ' active' : ''}`} onClick={() => pick(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="debug-body">
        {tab === 'requests' && <RequestsTab summary={summary} onToast={onToast} />}
        {tab === 'sources' && <SourcesTab folder={folder} sort={sort} onToast={onToast} />}
        {tab === 'limits' && <LimitsTab folder={folder} sort={sort} post={post} />}
      </div>
    </div>
  );
}
