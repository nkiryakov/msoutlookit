import { useRef, useState } from 'react';
import Icon from './Icons.jsx';

// A floating, draggable "new message" window. Nothing is actually sent.
export default function ComposeWindow({ draft, index, onClose, onSend, onFocus, zIndex }) {
  // Cascade new windows, but keep them on screen (the CSS width is min(640px, 100vw - 32px)).
  const [pos, setPos] = useState(() => ({
    x: Math.max(8, Math.min(120 + index * 30, window.innerWidth - Math.min(640, window.innerWidth - 32) - 8)),
    y: Math.max(8, Math.min(90 + index * 30, window.innerHeight - Math.min(460, window.innerHeight - 32) - 8)),
  }));
  const [to, setTo] = useState(draft.to || '');
  const [subject, setSubject] = useState(draft.subject || '');
  const [body, setBody] = useState(draft.body || '');
  const drag = useRef(null);

  const onPointerDown = (e) => {
    if (e.target.closest('button')) return;
    onFocus();
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - 200, e.clientX - drag.current.dx)),
      y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy)),
    });
  };
  const onPointerUp = () => { drag.current = null; };

  return (
    <div className="compose" style={{ left: pos.x, top: pos.y, zIndex }} onMouseDown={onFocus} role="dialog" aria-label={subject || 'Untitled message'}>
      <div className="compose-title" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <span>{subject || 'Untitled'} - Message (HTML)</span>
        <button type="button" className="win-btn win-close" onClick={onClose} aria-label="Close"><Icon name="close" size={12} /></button>
      </div>
      <div className="compose-toolbar">
        <button type="button" className="send-btn" onClick={() => onSend({ to, subject })}>
          <Icon name="send" size={18} /> Send
        </button>
        <div className="compose-fields">
          <label><span>To…</span><input value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label><span>Cc…</span><input /></label>
          <label><span>Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        </div>
      </div>
      <textarea className="compose-body" value={body} onChange={(e) => setBody(e.target.value)} autoFocus />
    </div>
  );
}
