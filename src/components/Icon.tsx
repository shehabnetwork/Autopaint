import type { JSX } from 'react';

export type IconName =
  | 'cursor'
  | 'pen'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'eraser'
  | 'undo'
  | 'redo'
  | 'trash'
  | 'save'
  | 'folder'
  | 'plus'
  | 'help'
  | 'download'
  | 'refresh'
  | 'bolt'
  | 'check'
  | 'image'
  | 'fill'
  | 'toFront'
  | 'toBack'
  | 'up'
  | 'down'
  | 'eye'
  | 'eyeOff';

const PATHS: Record<IconName, JSX.Element> = {
  cursor: <path d="M5 3l13.5 7.5-5.8 1.2-2.6 5.9z" />,
  pen: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  line: <path d="M5 19L19 5" />,
  rect: <rect x="4" y="5" width="16" height="14" rx="2" />,
  ellipse: <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />,
  eraser: (
    <>
      <path d="M7 21h13" />
      <path d="M4.5 15.5l6-6 8 8-3 3H9z" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </>
  ),
  redo: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  save: (
    <>
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h8V3" />
      <path d="M8 14h8v7H8z" />
    </>
  ),
  folder: (
    <>
      <path d="M3 6h6l2 2h10v11H3z" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9" />
      <path d="M12 17h.01" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="M7 11l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 6" />
      <path d="M20 5v6h-6" />
    </>
  ),
  bolt: <path d="M13 2L4 14h6l-1 8 9-12h-6z" />,
  check: <path d="M4 12.5l5 5L20 6.5" />,
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M21 16l-5-5-6 6" />
    </>
  ),
  fill: (
    <>
      <path d="M4 12l7-7 7 7-7 7z" />
      <path d="M19 15c1.6 2 2 3 2 3.8a2 2 0 1 1-4 0c0-.8.4-1.8 2-3.8z" />
    </>
  ),
  toFront: (
    <>
      <rect x="5" y="9" width="14" height="11" rx="2" />
      <path d="M12 7V3" />
      <path d="M9 5l3-3 3 3" />
    </>
  ),
  toBack: (
    <>
      <rect x="5" y="4" width="14" height="11" rx="2" />
      <path d="M12 17v4" />
      <path d="M9 19l3 3 3-3" />
    </>
  ),
  up: (
    <>
      <path d="M12 20V5" />
      <path d="M6 11l6-6 6 6" />
    </>
  ),
  down: (
    <>
      <path d="M12 4v15" />
      <path d="M6 13l6 6 6-6" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A11 11 0 0 1 12 5c6.4 0 10 7 10 7a17.9 17.9 0 0 1-3.2 4.2" />
      <path d="M6.2 6.3A17.7 17.7 0 0 0 2 12s3.6 7 10 7a11 11 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
