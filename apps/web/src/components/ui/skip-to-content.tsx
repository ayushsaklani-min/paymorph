/**
 * Each route's semantic <main> is the stable #main-content target. Keeping the
 * link declarative makes the keyboard path available before client hydration.
 */
export function SkipToContent() {
  return (
    <a
      className="sr-only fixed left-4 top-4 z-[100] rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-[var(--accent-ink)] shadow-xl focus:not-sr-only focus:outline-none focus:ring-2 focus:ring-white"
      href="#main-content"
    >
      Skip to main content
    </a>
  );
}
