import { useState, useEffect, useMemo } from "react";
import { auth } from "../firebase";
import {
  listenToAddictionTrackers, createAddictionTracker, updateAddictionTracker, deleteAddictionTracker,
  listenToTrackerPressesInMonth, listenToTrackerPressToday,
  incrementPress, decrementPress, localDateStr,
} from "../lib/addictionCounter";
import { awardXp, revokeXp, XP, xpId } from "../lib/xp";

const MAX_TRACKERS = 6;

// ── Month history calendar for a single tracker ─────────────────────

function MonthHistory({ uid, trackerId, onClose }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [presses, setPresses] = useState([]);

  useEffect(() => {
    return listenToTrackerPressesInMonth(uid, trackerId, year, month, setPresses);
  }, [uid, trackerId, year, month]);

  const pressByDate = useMemo(() => {
    const map = {};
    for (const p of presses) map[p.date] = p.count;
    return map;
  }, [presses]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const days = [];
  for (let i = 0; i < firstDow; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  const monthLabel = new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const todayStr = localDateStr();
  const maxCount = Math.max(1, ...Object.values(pressByDate));

  const prevMonth = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 11) { setYear(y => y+1); setMonth(0); } else setMonth(m => m+1); };

  const totalThisMonth = Object.values(pressByDate).reduce((a,b) => a+b, 0);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full sm:w-96 max-h-[85vh] overflow-y-auto bg-brand-900 border-2 border-accent-500 rounded-t-2xl sm:rounded-2xl shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-pixel text-accent-300">MONTHLY HISTORY</h3>
          <button onClick={onClose} className="text-brand-300 text-xl leading-none">&times;</button>
        </div>

        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="w-8 h-8 rounded-full flex items-center justify-center text-lg text-brand-300 hover:bg-brand-800">‹</button>
          <span className="text-sm font-pixel text-brand-100">{monthLabel.toUpperCase()}</span>
          <button onClick={nextMonth} className="w-8 h-8 rounded-full flex items-center justify-center text-lg text-brand-300 hover:bg-brand-800">›</button>
        </div>

        <p className="text-center text-xs text-brand-400 mb-4">
          Total this month: <span className="text-accent-300 font-bold">{totalThisMonth}</span>
        </p>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {["S","M","T","W","T","F","S"].map((d,i) => (
            <div key={i} className="text-center text-[9px] font-medium text-brand-500 py-1">{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((d, i) => {
            if (d === null) return <div key={i} />;
            const dateStr = `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const count = pressByDate[dateStr] || 0;
            const intensity = count === 0 ? 0 : Math.min(1, count / maxCount);
            const isToday = dateStr === todayStr;
            return (
              <div key={i}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center ${
                  isToday ? "ring-2 ring-accent-400" : ""
                }`}
                style={{
                  backgroundColor: count > 0
                    ? `rgba(196, 163, 232, ${0.15 + intensity * 0.6})`
                    : "rgba(255,255,255,0.04)",
                }}
              >
                <span className="text-[10px] text-brand-200 leading-none">{d}</span>
                {count > 0 && <span className="text-[9px] text-accent-300 font-bold leading-none mt-0.5">{count}</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Single tracker button ────────────────────────────────────────────

function TrackerButton({ uid, tracker, columns, onRename, onDelete }) {
  const [todayCount, setTodayCount] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    return listenToTrackerPressToday(uid, tracker.id, setTodayCount);
  }, [uid, tracker.id]);

  const handlePress = async () => {
    setPressing(true);
    const today = localDateStr(new Date());
    const newCount = (todayCount || 0) + 1;
    await incrementPress(uid, tracker.id);
    // Each new press adds a new XP penalty entry with count-specific ID
    awardXp(uid, "addiction", xpId.addiction(tracker.id, today, newCount), XP.ADDICTION_PRESS);
    setTimeout(() => setPressing(false), 150);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {showHistory && (
        <MonthHistory uid={uid} trackerId={tracker.id} onClose={() => setShowHistory(false)} />
      )}
      {/* Title row — name, history icon, and manage menu as flex siblings (never overlap) */}
      <div className="relative flex items-center gap-1.5">
        <p className="text-xs font-pixel text-brand-200 text-center truncate max-w-[110px]">{tracker.name}</p>
        <button onClick={() => setShowHistory(true)} title="View history"
          className="text-brand-400 hover:text-accent-300 transition flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </button>
        <button onClick={() => setShowMenu(s => !s)} title="Manage tracker"
          className="text-brand-400 hover:text-accent-300 transition flex-shrink-0 px-0.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
            <div className="absolute top-6 right-0 z-20 bg-brand-800 border border-brand-600 rounded-lg shadow-lg py-1 px-1 flex flex-col min-w-[110px]">
              <button onClick={() => { onRename(tracker); setShowMenu(false); }}
                className="text-[10px] text-brand-300 hover:text-accent-300 px-2 py-1.5 text-left whitespace-nowrap">
                Change name
              </button>
              <button onClick={() => { onDelete(tracker.id); setShowMenu(false); }}
                className="text-[10px] text-red-400 hover:text-red-300 px-2 py-1.5 text-left whitespace-nowrap">
                Delete tracker
              </button>
            </div>
          </>
        )}
      </div>

      {/* Big press button */}
      <button
        onClick={handlePress}
        className={`relative rounded-full flex items-center justify-center font-pixel transition-all select-none ${
          columns === 1 ? "w-44 h-44" : "w-32 h-32"
        } ${
          pressing ? "scale-95" : "scale-100"
        } bg-gradient-to-br from-accent-500 to-accent-700 border-4 border-accent-300 shadow-lg shadow-accent-900/50 active:shadow-md text-white`}
      >
        <span className={columns === 1 ? "text-5xl" : "text-3xl"}>{todayCount}</span>
        {/* Subtle pixel corner decorations */}
        <span className="absolute top-2 left-2 w-1.5 h-1.5 bg-white/30" />
        <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-white/30" />
        <span className="absolute bottom-2 left-2 w-1.5 h-1.5 bg-white/30" />
        <span className="absolute bottom-2 right-2 w-1.5 h-1.5 bg-white/30" />
      </button>

      {/* Undo last press — always reserves space so the button grid doesn't shift */}
      <button
        onClick={() => {
          if (todayCount > 0) {
            const today = localDateStr(new Date());
            decrementPress(uid, tracker.id);
            // Revert the most recent press XP entry
            revokeXp(uid, xpId.addiction(tracker.id, today, todayCount));
          }
        }}
        disabled={todayCount === 0}
        className={`text-[10px] transition ${
          todayCount > 0
            ? "text-brand-400 hover:text-brand-200 cursor-pointer"
            : "text-transparent cursor-default pointer-events-none"
        }`}
      >
        Undo last
      </button>
    </div>
  );
}

// ── Add tracker form ──────────────────────────────────────────────────

function AddTrackerForm({ uid, onDone, onCancel }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createAddictionTracker(uid, name.trim());
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border-2 border-accent-500 bg-brand-900 p-4 space-y-3 w-full max-w-xs">
      <p className="text-xs font-pixel text-accent-300">NEW TRACKER</p>
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handleSave()}
        placeholder="e.g. Smoking, Sugar, Nail biting"
        className="w-full rounded-lg border border-brand-600 bg-brand-800 text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="px-3 py-1.5 text-sm bg-accent-600 text-white rounded-lg hover:bg-accent-500 disabled:opacity-50">
          {saving ? "Creating…" : "Create"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-brand-400">Cancel</button>
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────

export default function AddictionCounterApp() {
  const uid = auth.currentUser?.uid;
  const [trackers, setTrackers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (!uid) return;
    return listenToAddictionTrackers(uid, setTrackers);
  }, [uid]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this tracker and all its history?")) return;
    await deleteAddictionTracker(id);
  };

  const handleRename = async () => {
    if (!renameValue.trim()) return;
    await updateAddictionTracker(renamingId, { name: renameValue.trim() });
    setRenamingId(null);
  };

  // Grid columns based on count — max 6
  const count = trackers.length;
  const columns = count <= 1 ? 1 : count <= 2 ? 2 : count <= 4 ? 2 : 3;

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-950 to-brand-900 flex flex-col items-center px-4 py-8">
      {/* Pixel arcade title */}
      <div className="text-center mb-2">
        <h1 className="text-lg font-pixel text-accent-300 tracking-wide">TRACK YOUR ADDICTION</h1>
        <div className="h-0.5 w-32 mx-auto mt-2 bg-gradient-to-r from-transparent via-accent-400 to-transparent" />
      </div>

      {/* Single tracker — show its name as a subtitle */}
      {count === 1 && (
        <p className="text-xs text-brand-400 mb-6 mt-1">Tap the button each time it happens</p>
      )}
      {count > 1 && (
        <p className="text-xs text-brand-400 mb-6 mt-1">Tap a button each time it happens</p>
      )}

      {/* Trackers grid */}
      {trackers.length === 0 && !showAdd && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-brand-400 italic">No trackers yet.</p>
          <button onClick={() => setShowAdd(true)}
            className="px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-500 text-white text-sm font-pixel transition">
            + Add tracker
          </button>
        </div>
      )}

      <div className={`grid gap-x-8 gap-y-10 w-full max-w-2xl place-items-center ${
        columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-2" : "grid-cols-3"
      }`}>
        {trackers.map(tracker => (
          <TrackerButton
            key={tracker.id}
            uid={uid}
            tracker={tracker}
            columns={columns}
            onRename={(t) => { setRenamingId(t.id); setRenameValue(t.name); }}
            onDelete={handleDelete}
          />
        ))}
      </div>

      {/* Rename modal */}
      {renamingId && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRenamingId(null)} />
          <div className="relative w-full max-w-xs rounded-2xl border-2 border-accent-500 bg-brand-900 p-4 space-y-3">
            <p className="text-xs font-pixel text-accent-300">RENAME TRACKER</p>
            <input
              autoFocus
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleRename()}
              className="w-full rounded-lg border border-brand-600 bg-brand-800 text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
            />
            <div className="flex gap-2">
              <button onClick={handleRename} disabled={!renameValue.trim()}
                className="px-3 py-1.5 text-sm bg-accent-600 text-white rounded-lg hover:bg-accent-500 disabled:opacity-50">
                Save
              </button>
              <button onClick={() => setRenamingId(null)} className="px-3 py-1.5 text-sm text-brand-400">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add tracker */}
      {showAdd ? (
        <div className="mt-8">
          <AddTrackerForm uid={uid} onDone={() => setShowAdd(false)} onCancel={() => setShowAdd(false)} />
        </div>
      ) : (
        trackers.length > 0 && trackers.length < MAX_TRACKERS && (
          <button onClick={() => setShowAdd(true)}
            className="mt-8 px-4 py-2 rounded-xl border-2 border-dashed border-brand-600 text-brand-400 hover:border-accent-400 hover:text-accent-300 text-xs font-pixel transition">
            + Add another tracker ({trackers.length}/{MAX_TRACKERS})
          </button>
        )
      )}
      {trackers.length >= MAX_TRACKERS && (
        <p className="mt-8 text-[10px] text-brand-500 italic">Maximum of {MAX_TRACKERS} trackers reached.</p>
      )}
    </div>
  );
}
