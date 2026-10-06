// Minimal line icons in the spirit of Fluent UI, drawn on a 20x20 grid.
const paths = {
  mail: 'M3 5h14v10H3z M3 5l7 6 7-6',
  newMail: 'M3 6h10v9H3z M3 6l5 4 5-4 M15 2v6 M12 5h6',
  delete: 'M5 6h10l-1 11H6z M3 6h14 M8 6V3h4v3',
  archive: 'M3 4h14v4H3z M4 8h12v9H4z M8 11h4',
  reply: 'M8 5L3 10l5 5 M3 10h9a5 5 0 015 5',
  replyAll: 'M10 5l-5 5 5 5 M6 5l-5 5 5 5 M5 10h7a5 5 0 015 5',
  forward: 'M12 5l5 5-5 5 M17 10H8a5 5 0 00-5 5',
  refresh: 'M16 10a6 6 0 11-2-4.5 M16 3v4h-4',
  folder: 'M2 5h6l2 2h8v9H2z',
  folderAdd: 'M2 5h6l2 2h8v9H2z M10 10v4 M8 12h4',
  inbox: 'M2 11l2-7h12l2 7v5H2z M2 11h5l1 2h4l1-2h5',
  calendar: 'M3 4h14v13H3z M3 8h14 M7 2v4 M13 2v4',
  people: 'M7 9a3 3 0 100-6 3 3 0 000 6z M1 17c0-3 3-5 6-5s6 2 6 5 M14 9a2.5 2.5 0 100-5 M15 12c2 0 4 2 4 4',
  tasks: 'M3 5l2 2 3-3 M10 6h7 M3 12l2 2 3-3 M10 13h7',
  search: 'M8.5 14a5.5 5.5 0 100-11 5.5 5.5 0 000 11z M13 13l5 5',
  attach: 'M13 6l-6 6a2 2 0 003 3l7-7a4 4 0 00-6-6l-7 7a6 6 0 008 8l5-5',
  flag: 'M4 18V3 M4 3h11l-2 4 2 4H4',
  chevronDown: 'M5 8l5 5 5-5',
  chevronRight: 'M8 5l5 5-5 5',
  close: 'M5 5l10 10 M15 5L5 15',
  minimize: 'M5 10h10',
  maximize: 'M5 5h10v10H5z',
  sort: 'M6 3v14 M3 14l3 3 3-3 M14 17V3 M11 6l3-3 3 3',
  eye: 'M1 10s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z M10 13a3 3 0 100-6 3 3 0 000 6z',
  sun: 'M10 14a4 4 0 100-8 4 4 0 000 8z M10 1v2 M10 17v2 M1 10h2 M17 10h2 M3.5 3.5l1.5 1.5 M15 15l1.5 1.5 M3.5 16.5L5 15 M15 5l1.5-1.5',
  moon: 'M16 12A7 7 0 018 4a7 7 0 108 8z',
  image: 'M2 4h16v12H2z M2 13l4-4 4 4 3-3 5 5 M13 8a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  link: 'M8 12l4-4 M9 5l1-1a3.5 3.5 0 015 5l-1 1 M11 15l-1 1a3.5 3.5 0 01-5-5l1-1',
  pane: 'M2 4h16v12H2z M9 4v12',
  send: 'M2 10l16-7-5 16-3-7z M10 12l8-9',
  user: 'M10 10a4 4 0 100-8 4 4 0 000 8z M3 18c0-4 3-6 7-6s7 2 7 6',
  help: 'M10 18a8 8 0 100-16 8 8 0 000 16z M7.5 7.5a2.5 2.5 0 114 2c-1 .6-1.5 1-1.5 2.5 M10 14.5v.5',
  external: 'M11 3h6v6 M17 3l-8 8 M14 12v5H3V6h5',
  more: 'M4 10h.01 M10 10h.01 M16 10h.01',
};

export default function Icon({ name, size = 16, className = '', title }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={paths[name]} />
    </svg>
  );
}
