import { useState, useEffect, useMemo } from "react";
import PageLayout from "../components/PageLayout";
import { auth } from "../firebase";
import {
  listenToChoreCategories, createChoreCategory, updateChoreCategory, deleteChoreCategory,
  listenToChores, createChore, updateChore, deleteChore, toggleChoreComplete,
  isChoreDue, nextOccurrence, localDateStr, FREQUENCY_LABELS, CATEGORY_COLORS, getCategoryStyle,
} from "../lib/chores";

import { awardXp, revokeXp, XP, xpId } from "../lib/xp";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function todayStr() { return localDateStr(new Date()); }

// ── Helpers ───────────────────────────────────────────────────────────

function formatCompletedDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.floor((today - d) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff/7)}w ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Day-of-week picker ────────────────────────────────────────────────

function DayOfWeekPicker({ value, onChange, label = "On which day?" }) {
  return (
    <div>
      <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">{label}</label>
      <div className="flex gap-1.5 flex-wrap">
        {DAY_NAMES.map((d, i) => (
          <button key={i} type="button" onClick={() => onChange(i)}
            className={`w-9 h-9 rounded-lg text-xs font-medium transition ${
              value === i
                ? "bg-brand-600 text-white"
                : "bg-white dark:bg-brand-800 text-brand-500 dark:text-brand-300 border border-brand-200 dark:border-brand-600"
            }`}>{d[0]}</button>
        ))}
      </div>
    </div>
  );
}

// ── Frequency extra fields ────────────────────────────────────────────

function FrequencyExtras({ frequency, dayOfWeek, onDayChange, startDate, onStartDateChange, specificDate, onSpecificDateChange }) {
  const dateField = "w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 pr-4 py-2 appearance-none text-sm focus:outline-none focus:ring-2 focus:ring-accent-400";
  return (
    <div className="space-y-2">
      {frequency === "once" && (
        <div>
          <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">Due date (optional)</label>
          <input type="date" value={specificDate} onChange={e => onSpecificDateChange(e.target.value)} className={dateField} />
        </div>
      )}
      {frequency === "daily" && (
        <div>
          <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">Start date</label>
          <input type="date" value={startDate} onChange={e => onStartDateChange(e.target.value)} className={dateField} />
        </div>
      )}
      {(frequency === "weekly") && (
        <DayOfWeekPicker value={dayOfWeek} onChange={onDayChange} label="Repeat every week on" />
      )}
      {frequency === "biweekly" && (
        <DayOfWeekPicker value={dayOfWeek} onChange={onDayChange} label="Repeat every 2 weeks on" />
      )}
      {(frequency === "weekly" || frequency === "biweekly") && (
        <div>
          <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">Starting from</label>
          <input type="date" value={startDate} onChange={e => onStartDateChange(e.target.value)} className={dateField} />
        </div>
      )}
      {(frequency === "monthly" || frequency === "yearly") && (
        <div>
          <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">
            {frequency === "monthly" ? "Start date (repeats same day monthly)" : "Start date (repeats yearly)"}
          </label>
          <input type="date" value={startDate} onChange={e => onStartDateChange(e.target.value)} className={dateField} />
        </div>
      )}
    </div>
  );
}

// ── Chore detail / edit modal ─────────────────────────────────────────

function ChoreModal({ chore, onClose, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(chore.name);
  const [details, setDetails] = useState(chore.details || "");
  const [frequency, setFrequency] = useState(chore.frequency || "weekly");
  const [dayOfWeek, setDayOfWeek] = useState(chore.dayOfWeek ?? new Date().getDay());
  const [startDate, setStartDate] = useState(chore.startDate || todayStr());
  const [specificDate, setSpecificDate] = useState(chore.specificDate || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave(chore.id, { name: name.trim(), details, frequency, dayOfWeek, startDate, specificDate });
      setEditing(false);
    } finally { setSaving(false); }
  };

  const resetEdit = () => {
    setEditing(false);
    setName(chore.name); setDetails(chore.details || "");
    setFrequency(chore.frequency || "weekly");
    setDayOfWeek(chore.dayOfWeek ?? new Date().getDay());
    setStartDate(chore.startDate || todayStr());
    setSpecificDate(chore.specificDate || "");
  };

  const style = "w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full sm:w-96 max-h-[85vh] overflow-y-auto bg-white dark:bg-brand-800 rounded-t-2xl sm:rounded-2xl border-2 border-brand-200 dark:border-brand-600 shadow-xl p-5">
        <div className="flex items-start justify-between mb-4 gap-2">
          {editing
            ? <input value={name} onChange={e => setName(e.target.value)} className={`flex-1 ${style}`} placeholder="Chore name" />
            : <h2 className="text-base font-semibold text-brand-800 dark:text-brand-100 flex-1">{chore.name}</h2>
          }
          <button onClick={onClose} className="text-brand-400 text-xl leading-none flex-shrink-0">&times;</button>
        </div>

        {!editing && (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-[10px] font-medium bg-brand-100 dark:bg-brand-700 text-brand-500 dark:text-brand-300 px-2 py-0.5 rounded-full">
              {FREQUENCY_LABELS[chore.frequency] || chore.frequency}
            </span>
            {chore.completedAt && (
              <span className="text-[10px] text-brand-400 dark:text-brand-500">Last done: {formatCompletedDate(chore.completedAt)}</span>
            )}
            {(() => { const next = nextOccurrence(chore); return next ? (
              <span className="text-[10px] text-brand-400 dark:text-brand-500">
                Next: {next.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </span>
            ) : null; })()}
          </div>
        )}

        {editing && (
          <div className="mb-3 space-y-2">
            <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">Repeats</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value)} className={`${style} appearance-none`}>
              {Object.entries(FREQUENCY_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
            <FrequencyExtras frequency={frequency} dayOfWeek={dayOfWeek} onDayChange={setDayOfWeek}
              startDate={startDate} onStartDateChange={setStartDate}
              specificDate={specificDate} onSpecificDateChange={setSpecificDate} />
          </div>
        )}

        <div className="mb-4">
          {editing ? (
            <>
              <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">Details</label>
              <textarea value={details} onChange={e => setDetails(e.target.value)}
                placeholder="Add any notes or instructions…" rows={4} className={`${style} resize-none`} />
            </>
          ) : (
            chore.details
              ? <p className="text-sm text-brand-600 dark:text-brand-300 whitespace-pre-wrap">{chore.details}</p>
              : <p className="text-sm text-brand-300 dark:text-brand-600 italic">No details added.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          {editing ? (
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving || !name.trim()}
                className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {saving ? "Saving…" : "Save"}
              </button>
              <button onClick={resetEdit} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-sm text-accent-500 dark:text-accent-300 font-medium">Edit</button>
          )}
          <button onClick={() => { if (confirm(`Delete "${chore.name}"?`)) { onDelete(chore.id); onClose(); } }}
            className="text-xs text-red-400 hover:text-red-600 dark:hover:text-red-300">Delete chore</button>
        </div>
      </div>
    </div>
  );
}

// ── Add chore form ────────────────────────────────────────────────────

function AddChoreForm({ uid, categoryId, onDone, onCancel }) {
  const [name, setName] = useState("");
  const [details, setDetails] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [dayOfWeek, setDayOfWeek] = useState(new Date().getDay());
  const [startDate, setStartDate] = useState(todayStr());
  const [specificDate, setSpecificDate] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createChore(uid, categoryId, { name: name.trim(), details, frequency, dayOfWeek, startDate, specificDate });
      onDone();
    } finally { setSaving(false); }
  };

  const field = "w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400";

  return (
    <div className="mt-2 p-3 rounded-xl bg-brand-50 dark:bg-brand-900 border border-brand-200 dark:border-brand-600 space-y-2">
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Chore name" className={field}
        onKeyDown={e => e.key === "Enter" && handleSave()} autoFocus />
      <select value={frequency} onChange={e => setFrequency(e.target.value)} className={`${field} appearance-none`}>
        {Object.entries(FREQUENCY_LABELS).map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
      <FrequencyExtras frequency={frequency} dayOfWeek={dayOfWeek} onDayChange={setDayOfWeek}
        startDate={startDate} onStartDateChange={setStartDate}
        specificDate={specificDate} onSpecificDateChange={setSpecificDate} />
      <textarea value={details} onChange={e => setDetails(e.target.value)}
        placeholder="Details (optional)" rows={2} className={`${field} resize-none`} />
      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Adding…" : "Add chore"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-xs text-brand-500 dark:text-brand-400">Cancel</button>
      </div>
    </div>
  );
}

// ── Category card ─────────────────────────────────────────────────────

function CategoryCard({ category, chores, uid, onDeleteCategory }) {
  const [addingChore, setAddingChore] = useState(false);
  const [selectedChore, setSelectedChore] = useState(null);
  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState(category.name);
  const [collapsed, setCollapsed] = useState(false);

  const style = getCategoryStyle(category.color, category.customHex);
  const isCustom = category.color === "custom" && category.customHex;

  const categoryChores = useMemo(() => chores.filter(c => c.categoryId === category.id), [chores, category.id]);
  const dueCount = categoryChores.filter(isChoreDue).length;

  const headerBg   = isCustom ? style.customStyle.bg     : {};
  const borderStyle = isCustom ? style.customStyle.border : {};
  const dotStyle   = isCustom ? style.customStyle.dot    : {};

  const containerClass = isCustom
    ? `rounded-2xl border-2 shadow-sm overflow-hidden`
    : `rounded-2xl border-2 shadow-sm ${style.border} ${style.bg} overflow-hidden`;

  return (
    <div className={containerClass} style={isCustom ? { ...headerBg, ...borderStyle } : {}}>
      {selectedChore && (
        <ChoreModal chore={selectedChore} onClose={() => setSelectedChore(null)}
          onSave={async (id, data) => { await updateChore(id, data); setSelectedChore(c => ({ ...c, ...data })); }}
          onDelete={deleteChore} />
      )}

      {/* Header row — always visible, tap to collapse/expand */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Collapse toggle */}
          <button onClick={() => setCollapsed(c => !c)} className="flex-shrink-0">
            <span className={`w-2.5 h-2.5 rounded-full block ${isCustom ? "" : style.dot}`}
              style={isCustom ? dotStyle : {}} />
          </button>
          {editingName ? (
            <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)}
              onBlur={async () => { if (nameVal.trim()) await updateChoreCategory(category.id, { name: nameVal.trim() }); setEditingName(false); }}
              onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setNameVal(category.name); setEditingName(false); } }}
              className="flex-1 text-sm font-semibold bg-transparent border-b border-brand-400 dark:border-brand-500 text-brand-800 dark:text-brand-100 focus:outline-none" />
          ) : (
            <button onClick={() => setCollapsed(c => !c)}
              className="flex-1 flex items-center gap-2 text-left min-w-0">
              <span className="text-sm font-semibold text-brand-800 dark:text-brand-100 truncate">{category.name}</span>
              {dueCount > 0 && (
                <span className="flex-shrink-0 text-[9px] font-medium bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                  {dueCount} due
                </span>
              )}
              <span className="text-[10px] text-brand-400 dark:text-brand-500 ml-auto flex-shrink-0">{collapsed ? "▶" : "▼"}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {!collapsed && <button onClick={() => setAddingChore(a => !a)} className="text-xs text-accent-500 dark:text-accent-300 font-medium">+ Add</button>}
          <button onClick={() => setEditingName(true)} className="text-xs text-brand-400 dark:text-brand-500 hover:text-accent-500">✎</button>
          <button onClick={() => { if (confirm(`Delete "${category.name}" and all its chores?`)) onDeleteCategory(category.id, categoryChores); }}
            className="text-brand-300 hover:text-red-400 text-sm leading-none">&times;</button>
        </div>
      </div>

      {/* Collapsible body */}
      {!collapsed && (
        <>
          {categoryChores.length === 0 && !addingChore ? (
            <p className="text-xs text-brand-400 dark:text-brand-500 italic px-4 py-3">No chores yet — add one above.</p>
          ) : (
            <ul className="divide-y divide-black/5 dark:divide-white/5">
              {categoryChores.map(chore => {
                const due = isChoreDue(chore);
                const completed = !!chore.completedAt && !due;
                const next = nextOccurrence(chore);
                return (
                  <li key={chore.id} className="flex items-center gap-3 px-4 py-2.5">
                    <button onClick={() => {
                      const uid = auth.currentUser?.uid;
                      const wasCompleted = !!chore.completedAt && !due;
                      toggleChoreComplete(chore);
                      if (uid) {
                        const today = localDateStr(new Date());
                        const sid = xpId.chore(chore.id, today);
                        if (wasCompleted) revokeXp(uid, sid);
                        else awardXp(uid, "chore", sid, XP.CHORE_DONE);
                      }
                    }}
                      className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition ${
                        completed
                          ? isCustom ? "border-transparent" : `${style.dot} border-transparent`
                          : due ? "border-brand-400 dark:border-brand-500 hover:border-brand-600"
                          : "border-brand-300 dark:border-brand-600"
                      }`}
                      style={completed && isCustom ? dotStyle : {}}>
                      {completed && (
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </button>
                    <button onClick={() => setSelectedChore(chore)}
                      className={`flex-1 text-left text-sm truncate ${completed ? "line-through text-brand-400 dark:text-brand-500" : "text-brand-700 dark:text-brand-200"}`}>
                      {chore.name}
                      {chore.details && <span className="ml-1 text-brand-300 dark:text-brand-600 text-[10px]">···</span>}
                    </button>
                    {chore.completedAt && (
                      <span className={`flex-shrink-0 text-[10px] ${due ? "text-red-400 dark:text-red-500" : "text-brand-400 dark:text-brand-500"}`}>
                        {formatCompletedDate(chore.completedAt)}
                      </span>
                    )}
                    {!chore.completedAt && next && (
                      <span className="flex-shrink-0 text-[9px] text-brand-400 dark:text-brand-500">
                        {next <= new Date() ? "Due" : next.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {addingChore && (
            <div className="px-4 pb-3">
              <AddChoreForm uid={uid} categoryId={category.id} onDone={() => setAddingChore(false)} onCancel={() => setAddingChore(false)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Add category form ─────────────────────────────────────────────────

function AddCategoryForm({ uid, onDone, onCancel }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("purple");
  const [customHex, setCustomHex] = useState("#8a52c4");
  const [saving, setSaving] = useState(false);

  const isCustom = color === "custom";

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createChoreCategory(uid, name.trim(), color, isCustom ? customHex : null);
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-3">
      <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">NEW COLLECTION</p>
      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handleSave()}
        placeholder="e.g. Kitchen, Bathroom, Garden"
        className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />

      {/* Color swatches */}
      <div className="flex flex-wrap gap-2 items-center">
        {CATEGORY_COLORS.map(c => (
          <button key={c.id} onClick={() => setColor(c.id)}
            className={`w-7 h-7 rounded-full transition ${color === c.id ? "ring-2 ring-offset-2 ring-brand-400 scale-110" : "opacity-70 hover:opacity-100"}`}
            style={{ backgroundColor: c.hex }} title={c.label} />
        ))}
        {/* Custom color swatch */}
        <button onClick={() => setColor("custom")}
          className={`w-7 h-7 rounded-full border-2 border-dashed border-brand-300 dark:border-brand-500 flex items-center justify-center text-[10px] transition ${color === "custom" ? "ring-2 ring-offset-2 ring-brand-400 scale-110" : "opacity-70 hover:opacity-100"}`}
          title="Custom color">
          <span className="text-brand-400">+</span>
        </button>
      </div>

      {/* Custom hex picker */}
      {isCustom && (
        <div className="flex items-center gap-3">
          <input type="color" value={customHex} onChange={e => setCustomHex(e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer border border-brand-200 dark:border-brand-600 p-0.5" />
          <input type="text" value={customHex} onChange={e => setCustomHex(e.target.value)}
            className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 font-mono" />
          <span className="text-xs text-brand-400">preview</span>
          <div className="w-6 h-6 rounded-full" style={{ backgroundColor: customHex }} />
        </div>
      )}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !name.trim()}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Creating…" : "Create"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

function Chores() {
  const uid = auth.currentUser?.uid;
  const [categories, setCategories] = useState([]);
  const [chores, setChores] = useState([]);
  const [addingCategory, setAddingCategory] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsubCats = listenToChoreCategories(uid, setCategories);
    const unsubChores = listenToChores(uid, setChores);
    return () => { unsubCats(); unsubChores(); };
  }, [uid]);

  const handleDeleteCategory = async (categoryId, categoryChores) => {
    await Promise.all(categoryChores.map(c => deleteChore(c.id)));
    await deleteChoreCategory(categoryId);
  };

  const totalDue = chores.filter(isChoreDue).length;

  return (
    <PageLayout title="Chores">
      <div className="max-w-lg mx-auto px-4 pt-4 pb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100">CHORES</h2>
            {totalDue > 0 && <p className="text-[10px] text-red-500 dark:text-red-400 mt-0.5">{totalDue} chore{totalDue !== 1 ? "s" : ""} due</p>}
          </div>
          {!addingCategory && (
            <button onClick={() => setAddingCategory(true)} className="text-xs text-accent-500 dark:text-accent-300 font-medium">+ New collection</button>
          )}
        </div>

        {addingCategory && (
          <div className="mb-4">
            <AddCategoryForm uid={uid} onDone={() => setAddingCategory(false)} onCancel={() => setAddingCategory(false)} />
          </div>
        )}

        {categories.length === 0 && !addingCategory && (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="text-sm text-brand-300 dark:text-brand-500 italic">No chore collections yet.</p>
            <button onClick={() => setAddingCategory(true)} className="text-xs text-accent-500 dark:text-accent-300 font-medium underline">
              Create your first collection
            </button>
          </div>
        )}

        <div className="space-y-4">
          {categories.map(category => (
            <CategoryCard key={category.id} category={category} chores={chores} uid={uid}
              onDeleteCategory={handleDeleteCategory} />
          ))}
        </div>
      </div>
    </PageLayout>
  );
}

export default Chores;
