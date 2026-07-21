import { useState } from "react";
import PageLayout from "../components/PageLayout";
import AddictionCounterApp from "../components/AddictionCounterApp";
import KanjiOfTheDayApp from "../components/KanjiOfTheDayApp";

// Registry of mini-apps available in the Others page.
// Add new mini-components here as they're built.
const MINI_APPS = [
  {
    id: "addiction-counter",
    name: "Addiction Counter",
    icon: "🎯",
    description: "Track how many times something happens each day",
    component: AddictionCounterApp,
  },
  {
    id: "kanji-of-the-day",
    name: "Kanji of the Day",
    icon: "🈷️",
    description: "Learn one kanji a day with readings and meanings",
    component: KanjiOfTheDayApp,
  },
];

function MiniAppTile({ app, onOpen }) {
  return (
    <button
      onClick={() => onOpen(app)}
      className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 hover:border-accent-400 dark:hover:border-accent-300 hover:bg-brand-50 dark:hover:bg-brand-700 transition aspect-square text-center"
    >
      <span className="text-3xl">{app.icon}</span>
      <span className="text-[11px] font-pixel text-brand-700 dark:text-brand-200 leading-tight">{app.name}</span>
    </button>
  );
}

function Others() {
  const [openApp, setOpenApp] = useState(null);

  // Full-screen mini-app overlay
  if (openApp) {
    const Component = openApp.component;
    return (
      <div className="fixed inset-0 z-[60] overflow-y-auto">
        {/* Close bar */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 bg-brand-900 border-b border-brand-700"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0.75rem))", paddingBottom: "0.75rem" }}>
          <span className="text-xs font-pixel text-brand-300">{openApp.name.toUpperCase()}</span>
          <button onClick={() => setOpenApp(null)} className="text-brand-300 hover:text-white text-2xl leading-none">
            &times;
          </button>
        </div>
        <Component />
      </div>
    );
  }

  return (
    <PageLayout title="Others">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100 mb-1">MINI APPS</h2>
        <p className="text-xs text-brand-400 dark:text-brand-500 mb-4">
          Small standalone tools and trackers.
        </p>

        <div className="grid grid-cols-3 gap-3">
          {MINI_APPS.map((app) => (
            <MiniAppTile key={app.id} app={app} onOpen={setOpenApp} />
          ))}
        </div>

        {MINI_APPS.length === 0 && (
          <p className="text-sm text-brand-300 dark:text-brand-500 italic text-center py-12">
            No mini apps yet.
          </p>
        )}
      </div>
    </PageLayout>
  );
}

export default Others;
