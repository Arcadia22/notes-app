import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import PageLayout from "../components/PageLayout";
import BlockLibraryManager from "../components/BlockLibraryManager";
import RoutineWeekView from "../components/RoutineWeekView";
import DefaultWeekPreview from "../components/DefaultWeekPreview";
import FreeformBlockPalette from "../components/FreeformBlockPalette";
import { Sakura } from "../components/Decorations";
import { auth } from "../firebase";
import { listenToBlockDefinitions } from "../lib/routine";

function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addWeeks(date, weeks) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function formatWeekLabel(weekStart) {
  const weekEnd = addWeeks(weekStart, 0);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startLabel = weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endLabel = weekEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

function Routine() {
  const uid = auth.currentUser?.uid;
  const [showLibrary, setShowLibrary] = useState(false);
  const [blockDefs, setBlockDefs] = useState([]);
  const todayWeekStart = startOfWeek(new Date());
  // weekOffset: 0 = current week, -2..-1 = past, +1..+2 = future
  const [weekOffset, setWeekOffset] = useState(0);

  useEffect(() => {
    if (!uid) return;
    return listenToBlockDefinitions(uid, setBlockDefs);
  }, [uid]);

  const freeformDefs = blockDefs.filter((b) => b.type === "freeform");

  const viewedWeekStart = addWeeks(todayWeekStart, weekOffset);
  const isCurrentWeek = weekOffset === 0;

  const WeekNav = (
    <div className="flex items-center justify-between mb-3">
      <button
        onClick={() => setWeekOffset((o) => Math.max(o - 1, -2))}
        disabled={weekOffset <= -2}
        className="p-2 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800 rounded-lg disabled:opacity-30"
        aria-label="Previous week"
      >
        &#8249;
      </button>
      <div className="flex flex-col items-center">
        <span className="text-sm font-medium text-brand-800 dark:text-brand-100">
          {formatWeekLabel(viewedWeekStart)}
        </span>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekOffset(0)}
            className="text-[10px] text-accent-500 dark:text-accent-300 hover:underline"
          >
            Back to this week
          </button>
        )}
      </div>
      <button
        onClick={() => setWeekOffset((o) => Math.min(o + 1, 2))}
        disabled={weekOffset >= 2}
        className="p-2 text-brand-500 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800 rounded-lg disabled:opacity-30"
        aria-label="Next week"
      >
        &#8250;
      </button>
    </div>
  );

  return (
    <PageLayout title="Routine">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10 lg:max-w-none lg:px-12 lg:pt-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100 flex items-center gap-2">
            <Sakura className="w-4 h-4" />
            WEEKLY ROUTINE
          </h2>
        </div>

        {/* These links only matter on mobile/iPad-portrait, where the
            library and default week are separate click-to-open sections.
            On desktop/iPad-landscape they're always-visible panels instead. */}
        <div className="flex gap-3 mb-4 text-xs font-medium lg:hidden">
          <button
            onClick={() => setShowLibrary((s) => !s)}
            className="text-accent-500 dark:text-accent-300"
          >
            {showLibrary ? "Hide blocks" : "Manage blocks"}
          </button>
          <Link to="/default-week" className="text-accent-500 dark:text-accent-300">
            View default week
          </Link>
        </div>

        {showLibrary && (
          <div className="mb-6 lg:hidden">
            <BlockLibraryManager />
          </div>
        )}

        {/* ---------- MOBILE / iPAD PORTRAIT: stacked, scrollable grid ---------- */}
        <div className="lg:hidden">
          {WeekNav}
          <RoutineWeekView weekStartDate={viewedWeekStart} />
        </div>

        {/* ---------- DESKTOP / iPAD LANDSCAPE: two-column layout ---------- */}
        <div className="hidden lg:grid lg:grid-cols-2 lg:gap-8 lg:items-start">
          {/* Left: full week schedule on top, Default Week preview at the
              same size underneath it — the page scrolls to fit both. */}
          <div className="flex flex-col gap-6">
            <div>
              <h3 className="text-xs font-pixel text-brand-600 dark:text-brand-300 mb-2">
                DRAG TO PLACE
              </h3>
              <FreeformBlockPalette freeformBlocks={freeformDefs} />
            </div>

            <div className="flex flex-col" style={{ height: "calc(100vh - 280px)" }}>
              {WeekNav}
              <div className="flex-1 min-h-0">
                <RoutineWeekView weekStartDate={viewedWeekStart} fitToContainer />
              </div>
            </div>

            <div className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
              <h3 className="text-xs font-pixel text-brand-600 dark:text-brand-300 mb-2 flex-shrink-0">
                DEFAULT WEEK
              </h3>
              <div className="flex-1 min-h-0">
                <DefaultWeekPreview fitToContainer />
              </div>
            </div>
          </div>

          {/* Right: block library, matching the left column's full height
              so both sides feel balanced. */}
          <div className="flex flex-col" style={{ height: "calc(100vh - 220px)" }}>
            <h3 className="text-xs font-pixel text-brand-600 dark:text-brand-300 mb-2 flex-shrink-0">
              MANAGE BLOCKS
            </h3>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <BlockLibraryManager />
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default Routine;
