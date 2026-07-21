// Reusable decorative SVG pieces — Japanese / game inspired,
// purely visual, no logic. Built as React components so they can be
// dropped into any page. Sized and colored to actually read as
// decoration, not just barely-visible texture.

export function Sakura({ className = "w-5 h-5 text-brand-400 dark:text-brand-300" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="2.6" ry="3.6" />
      <ellipse cx="12" cy="12" rx="2.6" ry="3.6" transform="rotate(72 12 12)" opacity="0.85" />
      <ellipse cx="12" cy="12" rx="2.6" ry="3.6" transform="rotate(144 12 12)" />
      <ellipse cx="12" cy="12" rx="2.6" ry="3.6" transform="rotate(216 12 12)" opacity="0.85" />
      <ellipse cx="12" cy="12" rx="2.6" ry="3.6" transform="rotate(288 12 12)" />
      <circle cx="12" cy="12" r="1.6" className="text-accent-400" fill="currentColor" />
    </svg>
  );
}

export function ToriiDivider() {
  return (
    <div className="flex items-center justify-center gap-3 py-3" aria-hidden="true">
      <span className="h-0.5 flex-1 bg-brand-300 dark:bg-brand-600 rounded-full" />
      <svg viewBox="0 0 40 28" className="w-9 h-7 text-brand-500 dark:text-brand-300" fill="currentColor">
        <rect x="2" y="10" width="3.5" height="16" />
        <rect x="34.5" y="10" width="3.5" height="16" />
        <rect x="0" y="6" width="40" height="3" rx="1" />
        <rect x="4" y="11" width="32" height="2.5" rx="1" />
      </svg>
      <span className="h-0.5 flex-1 bg-brand-300 dark:bg-brand-600 rounded-full" />
    </div>
  );
}

// Pixel-art-style cloud, used as a soft background motif
export function PixelCloud({ className = "w-14 h-9 text-brand-200 dark:text-brand-700" }) {
  return (
    <svg viewBox="0 0 48 32" className={className} fill="currentColor" aria-hidden="true">
      <rect x="8" y="16" width="32" height="8" />
      <rect x="4" y="20" width="40" height="4" />
      <rect x="12" y="8" width="12" height="8" />
      <rect x="24" y="12" width="12" height="4" />
    </svg>
  );
}

// Small four-pointed sparkle, classic game-UI accent — blue, used sparingly
export function Sparkle({ className = "w-3.5 h-3.5 text-accent-400 dark:text-accent-300" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 1c0.8 5 2.9 7.1 8 8-5.1 0.9-7.2 3-8 8-0.8-5-2.9-7.1-8-8 5.1-0.9 7.2-3 8-8z" />
    </svg>
  );
}

// Pixel-style star, bigger and bolder than Sparkle — for emphasis spots
// like empty states or section accents
export function PixelStar({ className = "w-5 h-5 text-brand-400 dark:text-brand-300" }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden="true">
      <rect x="7" y="0" width="2" height="2" />
      <rect x="7" y="2" width="2" height="2" />
      <rect x="5" y="4" width="2" height="2" />
      <rect x="9" y="4" width="2" height="2" />
      <rect x="0" y="7" width="2" height="2" />
      <rect x="2" y="7" width="2" height="2" />
      <rect x="4" y="7" width="2" height="2" />
      <rect x="10" y="7" width="2" height="2" />
      <rect x="12" y="7" width="2" height="2" />
      <rect x="14" y="7" width="2" height="2" />
      <rect x="5" y="10" width="2" height="2" />
      <rect x="9" y="10" width="2" height="2" />
      <rect x="4" y="12" width="2" height="2" />
      <rect x="10" y="12" width="2" height="2" />
      <rect x="3" y="14" width="2" height="2" />
      <rect x="11" y="14" width="2" height="2" />
    </svg>
  );
}

// Small lantern motif, Japanese-festival inspired, for empty states
// and decorative corners
export function PixelLantern({ className = "w-6 h-8 text-brand-400 dark:text-brand-300" }) {
  return (
    <svg viewBox="0 0 16 20" className={className} fill="currentColor" aria-hidden="true">
      <rect x="6" y="0" width="4" height="2" />
      <rect x="4" y="2" width="8" height="2" className="text-accent-400" fill="currentColor" />
      <rect x="2" y="4" width="12" height="10" />
      <rect x="4" y="6" width="2" height="2" fill="white" className="dark:fill-brand-900" />
      <rect x="10" y="6" width="2" height="2" fill="white" className="dark:fill-brand-900" />
      <rect x="4" y="14" width="8" height="2" className="text-accent-400" fill="currentColor" />
      <rect x="6" y="16" width="4" height="2" />
      <rect x="7" y="18" width="2" height="2" />
    </svg>
  );
}

// Pixel-pip corner accents — small dots placed in the corners of a
// card/panel for a retro game-UI frame feel. Pass a containing element
// with `relative` positioning.
export function PixelPips({ color = "bg-brand-300 dark:bg-brand-500" }) {
  return (
    <>
      <span className={`absolute top-1.5 left-1.5 w-1.5 h-1.5 z-0 pointer-events-none ${color}`} aria-hidden="true" />
      <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 z-0 pointer-events-none ${color}`} aria-hidden="true" />
      <span className={`absolute bottom-1.5 left-1.5 w-1.5 h-1.5 z-0 pointer-events-none ${color}`} aria-hidden="true" />
      <span className={`absolute bottom-1.5 right-1.5 w-1.5 h-1.5 z-0 pointer-events-none ${color}`} aria-hidden="true" />
    </>
  );
}
