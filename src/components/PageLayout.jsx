import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PixelPips } from "./Decorations";

const NAV_PAGES = [
  { name: "Today",          path: "/" },
  { name: "Binging",        path: "/hobbies" },
  { name: "Brain Dump",     path: "/brain-dump" },
  { name: "Calendar",       path: "/calendar" },
  { name: "Chores",         path: "/chores" },
  { name: "Clock",          path: "/timer" },
  { name: "Daily Log",      path: "/daily-log" },
  { name: "Finances",       path: "/finances" },
  { name: "Fitness",        path: "/fitness" },
  { name: "Mini Game",      path: "/mini-game" },
  { name: "Projects",       path: "/goals" },
  { name: "Reminders",      path: "/reminders" },
  { name: "Shopping Lists", path: "/shopping-lists" },
  { name: "Tracker",        path: "/habits" },
  { name: "Others",         path: "/others" },
  { name: "Settings",       path: "/settings" },
];

function PageLayout({ title, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-brand-50 dark:bg-brand-950 transition-colors flex flex-col" style={{ minHeight: "100dvh" }}>
      <header className="sticky-header flex-shrink-0 bg-brand-600 dark:bg-brand-700 text-white px-4 pb-3 flex items-center gap-3 shadow-md transition-colors relative overflow-hidden">
        <PixelPips color="bg-white/40" />
        <button
          onClick={() => setMenuOpen(true)}
          className="p-1 -ml-1 rounded hover:bg-brand-500 dark:hover:bg-brand-600 relative z-10"
          aria-label="Open menu"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <h1 className="text-xs font-pixel tracking-wide relative z-10">{title?.toUpperCase()}</h1>
      </header>

      {menuOpen && (
        <div className="fixed inset-0 z-[70] flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div className="relative w-64 max-w-[75%] bg-white dark:bg-brand-800 h-full shadow-xl overflow-y-auto transition-colors"
            style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))", paddingLeft: "1rem", paddingRight: "1rem", paddingBottom: "1rem" }}>
            <PixelPips />
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-pixel text-brand-700 dark:text-brand-100">CHAOS MANAGER</span>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-brand-400 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-100 text-xl leading-none"
                aria-label="Close menu"
              >&times;</button>
            </div>
            <nav className="flex flex-col gap-1 mt-2">
              {NAV_PAGES.map(page => {
                const active = page.path === "/" ? pathname === "/" : pathname.startsWith(page.path);
                return (
                  <Link
                    key={page.path}
                    to={page.path}
                    onClick={() => setMenuOpen(false)}
                    className={`px-3 py-2.5 rounded-lg font-pixel transition ${
                      active
                        ? "text-[11px] text-accent-600 dark:text-accent-300 bg-accent-50 dark:bg-accent-900/30"
                        : "text-[10px] text-brand-500 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-700 hover:text-brand-700 dark:hover:text-brand-100"
                    }`}
                  >
                    {page.name.toUpperCase()}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <main className="flex-1 text-brand-900 dark:text-brand-50">{children}</main>
    </div>
  );
}

export default PageLayout;
