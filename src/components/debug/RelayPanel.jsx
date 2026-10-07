import { useEffect, useRef, useState } from 'react';
import { bookmarkletHref, openRedditTab, pingRelay, useRelay } from '../../relay.js';
import { Pill } from './util.jsx';

const STATUS = {
  connected: ['ok', 'Connected'],
  connecting: ['pending', 'Connecting'],
  lost: ['error', 'Not answering'],
  none: ['skipped', 'Not connected'],
};

// Sets up and shows the Reddit tab relay: a bookmarklet that turns a logged-in Reddit tab into the
// source that fetches for this page.
export default function RelayPanel({ onToast }) {
  const relay = useRelay();
  const linkRef = useRef(null);
  const [ping, setPing] = useState(null);

  // React refuses to render javascript: URLs, so the bookmark's address is set on the element itself.
  useEffect(() => {
    linkRef.current?.setAttribute('href', bookmarkletHref());
  }, []);

  const [tone, label] = STATUS[relay.status];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(bookmarkletHref());
      onToast('Bookmarklet copied. Make a new bookmark and paste it as the address.');
    } catch {
      onToast('Could not copy. Drag the link to your bookmarks bar instead.');
    }
  };

  const test = () => {
    setPing('…');
    pingRelay().then((ms) => setPing(`answered in ${ms} ms`), (err) => setPing(err.message));
  };

  const open = () => {
    if (!openRedditTab()) onToast('Allow pop-ups for this site to open Reddit from here.');
  };

  return (
    <section className="dbg-section">
      <h3>Reddit tab (bookmarklet)</h3>
      <p className="dbg-note">
        <Pill status={tone}>{label}</Pill>
        {relay.status === 'connected' && <span> to {relay.host}. </span>}
        {relay.status === 'connected' && <button type="button" className="link-btn" onClick={test}>Test</button>}
        {ping && <span className="dbg-dim"> {ping}</span>}
        {relay.status === 'none' && !relay.error && <span className="dbg-dim"> Nothing is fetching through a Reddit tab yet.</span>}
        {relay.error && relay.status !== 'connected' && <span className="dbg-error"> {relay.error}</span>}
      </p>
      <p className="dbg-dim">
        Reddit refuses requests from other sites, but not from a Reddit tab you're logged in to. The bookmarklet turns
        that tab into a relay: it asks Reddit from reddit.com itself, with your login, and passes the answer to this page.
      </p>
      <ol className="dbg-steps">
        <li>
          Drag{' '}
          <a
            ref={linkRef}
            className="dbg-bookmarklet"
            onClick={(e) => {
              e.preventDefault();
              onToast('Drag this to your bookmarks bar. It does nothing when clicked here.');
            }}
          >
            Outlook relay
          </a>{' '}
          to your bookmarks bar, or <button type="button" className="link-btn" onClick={copy}>copy it</button> and paste it as the address of a new bookmark.
        </li>
        <li>
          Open <strong>old.reddit.com</strong> in a tab where you're logged in. <button type="button" className="link-btn" onClick={open}>Open it from here</button>
        </li>
        <li>
          Click the bookmark in that tab. It opens this app in a new tab, connected to it. If you opened Reddit from the link above, it
          reconnects this tab instead.
        </li>
      </ol>
      <p className="dbg-dim">
        Keep the Reddit tab open; minimize it or move it to another window. Its title becomes "Calendar - Outlook". If it
        goes to another page the connection drops: click the bookmark again.
      </p>
    </section>
  );
}
