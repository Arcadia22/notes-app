import { useState, useEffect, useMemo } from "react";
import { auth } from "../firebase";
import {
  listenToDiaperKids, createDiaperKid, updateDiaperKid, deleteDiaperKid,
  totalDiapers, flagStatus, minForChild, allGroups, sortChildren,
  todayIndex, REGULAR_MINS, NAP_MINS, DAY_LABELS,
  drawerCount, needsMoreEvenWithDrawer,
  listenToShabbatEntries, createShabbatEntry, updateShabbatEntry, deleteShabbatEntry,
  fridayPool, lastShabbatByKid, shabbatColor, shabbatPriorityList, suggestShabbatPair,
} from "../lib/diapers";

// ── Small UI helpers ──────────────────────────────────────────────────

// Color classes for a child's name based on their flag status.
function nameColorClass(status) {
  if (status === "red") return "text-red-500 dark:text-red-400 font-semibold";
  if (status === "pink") return "text-pink-400 font-semibold";
  if (status === "yellow") return "text-amber-500 dark:text-amber-400 font-semibold";
  return "text-brand-100";
}

// Color for the total number cell based on flag status.
function totalColorClass(status) {
  if (status === "red") return "text-red-400 font-bold";
  if (status === "pink") return "text-pink-400 font-bold";
  if (status === "yellow") return "text-amber-400 font-bold";
  return "text-brand-200";
}

function Toggle({ label, checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full py-1.5"
    >
      <span className="text-sm text-brand-200">{label}</span>
      <span className={`relative w-10 h-6 rounded-full transition ${checked ? "bg-accent-500" : "bg-brand-600"}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : ""}`} />
      </span>
    </button>
  );
}

// Editable number cell: click the number to type a value, or use +/- buttons.
// onSet receives the new numeric value; caller decides how to persist.
function NumStepper({ value, onSet, min = 0, max = Infinity }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? 0));

  const commit = () => {
    let n = Math.round(Number(draft));
    if (isNaN(n)) n = value ?? 0;
    n = Math.max(min, Math.min(max, n));
    onSet(n);
    setEditing(false);
  };

  const dec = () => onSet(Math.max(min, (value ?? 0) - 1));
  const inc = () => onSet(Math.min(max, (value ?? 0) + 1));

  return (
    <div className="inline-flex items-center gap-0.5">
      <button onClick={dec} disabled={(value ?? 0) <= min}
        className="w-4 h-4 rounded-full bg-brand-700 text-brand-200 text-[10px] font-bold flex items-center justify-center hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed">−</button>
      {editing ? (
        <input
          autoFocus
          type="number"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="w-8 text-center text-xs rounded border border-brand-600 bg-brand-800 text-brand-100 py-0.5 focus:outline-none focus:ring-1 focus:ring-accent-400 appearance-none"
        />
      ) : (
        <button onClick={() => { setDraft(String(value ?? 0)); setEditing(true); }}
          className="min-w-[16px] text-center text-xs tabular-nums text-brand-200 hover:text-accent-300">
          {value ?? 0}
        </button>
      )}
      <button onClick={inc} disabled={(value ?? 0) >= max}
        className="w-4 h-4 rounded-full bg-brand-700 text-brand-200 text-[10px] font-bold flex items-center justify-center hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed">+</button>
    </div>
  );
}

// ── Add / Edit form (modal) ───────────────────────────────────────────

function ChildForm({ existing, dayIndex, existingGroups = [], onSave, onCancel }) {
  const [name, setName] = useState(existing?.name || "");
  const [group, setGroup] = useState(existing?.group || "");
  const [gender, setGender] = useState(existing?.gender || "");
  const [groupMode, setGroupMode] = useState(
    existing?.group && existingGroups.includes(existing.group) ? "pick"
      : existingGroups.length > 0 && !existing?.group ? "pick"
      : "new"
  );
  const [mainDiapers, setMainDiapers] = useState(existing?.mainDiapers ?? 0);
  const [spareDiapers, setSpareDiapers] = useState(existing?.spareDiapers ?? 0);
  const [spareDiapers2, setSpareDiapers2] = useState(existing?.spareDiapers2 ?? 0);
  const [usesDiapers, setUsesDiapers] = useState(existing?.usesDiapers ?? true);
  const [comesFridays, setComesFridays] = useState(existing?.comesFridays ?? true);
  const [napDiapers, setNapDiapers] = useState(existing?.napDiapers ?? false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        group: group.trim(),
        gender,
        mainDiapers: Number(mainDiapers) || 0,
        spareDiapers: Number(spareDiapers) || 0,
        spareDiapers2: Number(spareDiapers2) || 0,
        usesDiapers,
        comesFridays,
        napDiapers: usesDiapers ? false : napDiapers,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full rounded-lg border border-brand-600 bg-brand-800 text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400";

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full sm:w-96 max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border-2 border-accent-500 bg-brand-900 p-5 space-y-3">
        <p className="text-xs font-pixel text-accent-300">{existing ? "EDIT CHILD" : "NEW CHILD"}</p>

        <div>
          <label className="text-[10px] text-brand-400 uppercase">Name</label>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Child's name" className={inputCls} />
        </div>

        <div>
          <label className="text-[10px] text-brand-400 uppercase">Group (Gan)</label>
          {existingGroups.length > 0 && (
            <div className="flex gap-1 mb-1.5">
              <button type="button" onClick={() => setGroupMode("pick")}
                className={`text-[10px] px-2 py-1 rounded-lg ${groupMode === "pick" ? "bg-accent-600 text-white" : "bg-brand-800 text-brand-300"}`}>
                Choose existing
              </button>
              <button type="button" onClick={() => { setGroupMode("new"); setGroup(""); }}
                className={`text-[10px] px-2 py-1 rounded-lg ${groupMode === "new" ? "bg-accent-600 text-white" : "bg-brand-800 text-brand-300"}`}>
                + New group
              </button>
            </div>
          )}
          {groupMode === "pick" && existingGroups.length > 0 ? (
            <select value={group} onChange={e => setGroup(e.target.value)} className={inputCls}>
              <option value="">— select a group —</option>
              {existingGroups.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          ) : (
            <input value={group} onChange={e => setGroup(e.target.value)} placeholder="e.g. Red, Sunflowers" className={inputCls} />
          )}
        </div>

        <div>
          <label className="text-[10px] text-brand-400 uppercase">Gender</label>
          <div className="flex gap-1.5 mt-0.5">
            {[["male","Boy"],["female","Girl"],["","—"]].map(([val,label]) => (
              <button key={val} type="button" onClick={() => setGender(val)}
                className={`text-xs px-3 py-1.5 rounded-lg flex-1 ${gender === val ? "bg-accent-600 text-white" : "bg-brand-800 text-brand-300"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-[10px] text-emerald-400 uppercase">Green box</label>
            <input type="number" min="0" value={mainDiapers} onChange={e => setMainDiapers(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-sky-400 uppercase">Blue box</label>
            <input type="number" min="0" value={spareDiapers} onChange={e => setSpareDiapers(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-[10px] text-amber-400 uppercase">Drawer</label>
            <input type="number" min="0" value={spareDiapers2} onChange={e => setSpareDiapers2(e.target.value)} className={inputCls} />
          </div>
        </div>
        <p className="text-[9px] text-brand-500 -mt-1">Total counts Green + Blue. Drawer is a reserve pile (reference only).</p>

        <div className="pt-1 border-t border-brand-700">
          <Toggle label="Wears diapers" checked={usesDiapers} onChange={setUsesDiapers} />
          <Toggle label="Comes on Fridays" checked={comesFridays} onChange={setComesFridays} />
          {!usesDiapers && (
            <Toggle label="Uses diapers at nap time" checked={napDiapers} onChange={setNapDiapers} />
          )}
        </div>

        {(() => {
          const min = minForChild({ usesDiapers, napDiapers }, dayIndex);
          const total = (Number(mainDiapers) || 0) + (Number(spareDiapers) || 0);
          if (min == null) {
            return <p className="text-[10px] text-brand-500 italic">No diaper requirement — not tracked for flags.</p>;
          }
          return (
            <p className="text-[10px] text-brand-400">
              For {DAY_LABELS[dayIndex]}: needs at least <span className="text-accent-300 font-bold">{min}</span> total.
              Currently <span className={total < min ? "text-red-400 font-bold" : "text-emerald-300 font-bold"}>{total}</span>.
            </p>
          );
        })()}

        <div className="flex gap-2 pt-1">
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-accent-600 text-white rounded-lg hover:bg-accent-500 disabled:opacity-50">
            {saving ? "Saving…" : existing ? "Save changes" : "Add child"}
          </button>
          <button onClick={onCancel} className="px-4 py-2 text-sm text-brand-400">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Reusable table ────────────────────────────────────────────────────

function ChildrenTable({ rows, dayIndex, onEdit, onDelete, onAdjust, showNextPile = false }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-brand-700">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-brand-800/80 text-[9px] uppercase text-brand-400">
            <th className="py-1.5 px-1 font-medium w-4">#</th>
            <th className="py-1.5 px-1 font-medium">Name</th>
            <th className="py-1.5 px-0.5 font-medium text-center text-emerald-400">Grn</th>
            <th className="py-1.5 px-0.5 font-medium text-center text-sky-400">Blu</th>
            <th className="py-1.5 px-0.5 font-medium text-center">Tot</th>
            <th className="py-1.5 px-0.5 font-medium text-center text-amber-400">Drw</th>
            <th className="py-1.5 px-0.5 font-medium text-center">Min</th>
            <th className="py-1.5 px-0.5 font-medium text-center">Fri</th>
            {showNextPile && <th className="py-1.5 px-0.5 font-medium text-center">Next</th>}
            <th className="py-1.5 px-0.5 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((child, i) => {
            const status = flagStatus(child, dayIndex);
            const total = totalDiapers(child);
            const min = minForChild(child, dayIndex);
            const stillShort = needsMoreEvenWithDrawer(child, dayIndex);
            return (
              <tr key={child.id} className="border-t border-brand-700/60 hover:bg-brand-800/40">
                <td className="py-1.5 px-1 text-[9px] text-brand-500 tabular-nums">{i + 1}</td>
                <td className="py-1.5 px-1">
                  <span className={`text-xs ${nameColorClass(status)}`}>{child.name}</span>
                  {stillShort && (
                    <span className="ml-0.5 text-pink-400 font-bold" title="Even with the drawer this isn't enough — still ask parents for more">*</span>
                  )}
                  {!child.usesDiapers && child.napDiapers && (
                    <span className="ml-1 text-[8px] text-violet-400 align-middle">nap</span>
                  )}
                </td>
                <td className="py-1.5 px-0.5 text-center">
                  <NumStepper value={child.mainDiapers} min={0}
                    max={(Number(child.mainDiapers) || 0) + (Number(child.spareDiapers) || 0)}
                    onSet={v => onAdjust(child, "mainDiapers", v)} />
                </td>
                <td className="py-1.5 px-0.5 text-center">
                  <NumStepper value={child.spareDiapers} min={0}
                    onSet={v => onAdjust(child, "spareDiapers", v)} />
                </td>
                <td className={`py-1.5 px-0.5 text-center text-xs tabular-nums ${totalColorClass(status)}`}>{total}</td>
                <td className="py-1.5 px-0.5 text-center">
                  <NumStepper value={child.spareDiapers2} min={0}
                    onSet={v => onAdjust(child, "spareDiapers2", v)} />
                </td>
                <td className="py-1.5 px-0.5 text-center text-[10px] text-brand-400 tabular-nums">{min ?? "—"}</td>
                <td className="py-1.5 px-0.5 text-center text-[10px]">
                  {child.comesFridays ? <span className="text-emerald-400">✓</span> : <span className="text-sky-400">✕</span>}
                </td>
                {showNextPile && (
                  <td className="py-1.5 px-0.5 text-center">
                    <button
                      onClick={() => onAdjust(child, "nextPileReady", !child.nextPileReady)}
                      title={child.nextPileReady ? "Next-day pile is ready" : "No pile for next day — ask at the door"}
                      className={`w-5 h-5 rounded border text-[11px] flex items-center justify-center mx-auto ${
                        child.nextPileReady
                          ? "bg-emerald-500/30 border-emerald-500 text-emerald-300"
                          : "bg-brand-800 border-brand-600 text-brand-500 hover:border-accent-400"
                      }`}
                    >
                      {child.nextPileReady ? "✓" : ""}
                    </button>
                  </td>
                )}
                <td className="py-1.5 px-0.5 whitespace-nowrap text-right">
                  <button onClick={() => onEdit(child)} className="text-[9px] text-accent-300 hover:text-accent-200 mr-1">Edit</button>
                  <button onClick={() => onDelete(child.id)} className="text-brand-500 hover:text-red-400 text-sm leading-none">×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── A collapsible titled section with a count ─────────────────────────

function TableSection({ title, subtitle, count, accent = "accent", defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const accentText = accent === "red" ? "text-red-300" : accent === "sky" ? "text-sky-300" : accent === "violet" ? "text-violet-300" : "text-accent-300";
  return (
    <div className="mb-5">
      <button onClick={() => setOpen(o => !o)} className="flex items-center justify-between w-full mb-2">
        <div className="text-left">
          <h3 className={`text-xs font-pixel ${accentText}`}>{title} <span className="text-brand-500">({count})</span></h3>
          {subtitle && <p className="text-[10px] text-brand-500 mt-0.5">{subtitle}</p>}
        </div>
        <span className="text-brand-500 text-sm">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        count === 0
          ? <p className="text-[11px] text-brand-600 italic py-2 px-3">None.</p>
          : children
      )}
    </div>
  );
}

// ── Report modal ──────────────────────────────────────────────────────
// Builds a copy-pasteable text list of kids needing more diapers, filtered
// by flag color (red / pink / yellow — multi-select).

function ReportModal({ kids, dayIndex, onClose }) {
  const [colors, setColors] = useState(["red", "pink"]); // default: the urgent ones
  const [copied, setCopied] = useState(false);

  const rows = kids
    .filter(k => colors.includes(flagStatus(k, dayIndex)))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const reportText = useMemo(() => {
    if (rows.length === 0) return "No children match the selected filters.";
    const lines = rows.map(k => {
      const noPile = k.nextPileReady ? "" : " — no pile";
      return `• ${k.name} — has ${totalDiapers(k)} diapers${noPile}`;
    });
    return `Diapers needed (${DAY_LABELS[dayIndex]}):\n${lines.join("\n")}`;
  }, [rows, dayIndex]);

  const toggle = (c) => setColors(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard may be blocked; the textarea below is selectable as a fallback
    }
  };

  const chip = (id, label, activeCls) => {
    const active = colors.includes(id);
    return (
      <button onClick={() => toggle(id)}
        className={`text-[10px] px-2 py-1 rounded-full border transition ${active ? activeCls : "bg-brand-800 text-brand-300 border-brand-600 hover:border-accent-400"}`}>
        {label}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:w-96 max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border-2 border-accent-500 bg-brand-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-pixel text-accent-300">REPORT</p>
          <button onClick={onClose} className="text-brand-300 text-xl leading-none">&times;</button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-brand-500">Include:</span>
          {chip("red", "Red", "bg-red-600 text-white border-red-500")}
          {chip("pink", "Pink", "bg-pink-600 text-white border-pink-500")}
          {chip("yellow", "Yellow", "bg-amber-600 text-white border-amber-500")}
        </div>

        <textarea
          readOnly
          value={reportText}
          onFocus={e => e.target.select()}
          rows={Math.min(14, Math.max(4, rows.length + 2))}
          className="w-full rounded-lg border border-brand-600 bg-brand-800 text-brand-100 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none"
        />

        <div className="flex items-center gap-2">
          <button onClick={copy} disabled={rows.length === 0}
            className="px-4 py-2 text-sm bg-accent-600 text-white rounded-lg hover:bg-accent-500 disabled:opacity-50">
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
          <span className="text-[10px] text-brand-500">{rows.length} {rows.length === 1 ? "child" : "children"}</span>
        </div>
      </div>
    </div>
  );
}

// ── Main app ──────────────────────────────────────────────────────────

function DiaperTab() {
  const uid = auth.currentUser?.uid;
  const [kids, setKids] = useState([]);
  const [typeFilter, setTypeFilter] = useState([]); // ["wearer","nap","none"]
  const sortBy = "name";
  const [showForm, setShowForm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [editing, setEditing] = useState(null);

  const dayIndex = todayIndex();

  useEffect(() => {
    if (!uid) return;
    return listenToDiaperKids(uid, setKids);
  }, [uid]);

  const groups = useMemo(() => allGroups(kids), [kids]);

  const visible = useMemo(() => {
    let filtered = kids;
    if (typeFilter.length > 0) {
      filtered = filtered.filter(k => {
        const type = k.usesDiapers ? "wearer" : k.napDiapers ? "nap" : "none";
        return typeFilter.includes(type);
      });
    }
    return sortChildren(filtered, sortBy);
  }, [kids, typeFilter, sortBy]);

  const diaperWearers = useMemo(() => sortChildren(kids.filter(k => k.usesDiapers), sortBy), [kids, sortBy]);
  const napOnlyKids = useMemo(() => sortChildren(kids.filter(k => !k.usesDiapers && k.napDiapers), sortBy), [kids, sortBy]);
  const noDiaperKids = useMemo(() => sortChildren(kids.filter(k => !k.usesDiapers && !k.napDiapers), sortBy), [kids, sortBy]);
  const fridayExceptions = useMemo(() => sortChildren(kids.filter(k => !k.comesFridays), sortBy), [kids, sortBy]);
  const flaggedKids = useMemo(() => {
    const order = { red: 0, pink: 1, yellow: 2 };
    const flagged = kids.filter(k => {
      const s = flagStatus(k, dayIndex);
      return s === "red" || s === "pink" || s === "yellow";
    });
    const sorted = sortChildren(flagged, sortBy);
    return sorted.sort((a, b) => (order[flagStatus(a, dayIndex)] ?? 9) - (order[flagStatus(b, dayIndex)] ?? 9));
  }, [kids, sortBy, dayIndex]);

  const redCount = flaggedKids.filter(k => flagStatus(k, dayIndex) === "red").length;

  // Adjust a single diaper count. Special rule for the green box: when it
  // INCREASES, the difference is pulled out of the blue box (moving spares into
  // the main pile). Decreasing green just removes used diapers (blue untouched).
  const handleAdjust = async (child, field, newValue) => {
    if (field === "mainDiapers") {
      const oldMain = Number(child.mainDiapers) || 0;
      const blue = Number(child.spareDiapers) || 0;
      const diff = newValue - oldMain;
      if (diff > 0) {
        // moving `diff` from blue into green; clamp so blue can't go negative
        const moved = Math.min(diff, blue);
        await updateDiaperKid(child.id, {
          mainDiapers: oldMain + moved,
          spareDiapers: blue - moved,
        });
      } else {
        // decrease = used diapers, blue stays put
        await updateDiaperKid(child.id, { mainDiapers: newValue });
      }
      return;
    }
    await updateDiaperKid(child.id, { [field]: newValue });
  };

  const handleSave = async (data) => {
    if (editing) {
      await updateDiaperKid(editing.id, data);
    } else {
      await createDiaperKid(uid, data);
    }
    setShowForm(false);
    setEditing(null);
  };

  const handleDelete = async (id) => {
    if (!confirm("Remove this child from the list?")) return;
    await deleteDiaperKid(id);
  };

  const openEdit = (child) => { setEditing(child); setShowForm(true); };
  const openAdd = () => { setEditing(null); setShowForm(true); };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-950 to-brand-900 px-2 sm:px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-4">
          <h1 className="text-lg font-pixel text-accent-300 tracking-wide">DIAPER TRACKER</h1>
          <div className="h-0.5 w-32 mx-auto mt-2 bg-gradient-to-r from-transparent via-accent-400 to-transparent" />
          <p className="text-[10px] text-brand-500 mt-2">
            Checking for <span className="text-accent-300 font-medium">{DAY_LABELS[dayIndex]}</span> · regular min {REGULAR_MINS[dayIndex]} · nap min {NAP_MINS[dayIndex]}
          </p>
        </div>

        {redCount > 0 && (
          <div className="mb-4 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-center">
            <p className="text-xs text-red-300 font-medium">
              ⚠️ {redCount} {redCount === 1 ? "child is" : "children are"} below minimum — inform parents to bring more.
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button onClick={() => setShowReport(true)}
            className="px-3 py-1.5 rounded-lg border border-accent-500 text-accent-300 hover:bg-accent-600 hover:text-white text-[11px] font-pixel">
            📋 Report
          </button>
          <button onClick={openAdd}
            className="ml-auto px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-[11px] font-pixel">
            + Add child
          </button>
        </div>

        {/* All children */}
        <TableSection
          title="ALL CHILDREN"
          subtitle="Everyone in the gan"
          count={visible.length}
        >
          {/* Diaper-type multi-filter */}
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[10px] text-brand-500">Show:</span>
            {[
              { id: "wearer", label: "Diaper wearers" },
              { id: "nap", label: "Nap only" },
              { id: "none", label: "No diapers" },
            ].map(opt => {
              const active = typeFilter.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => setTypeFilter(prev =>
                    prev.includes(opt.id) ? prev.filter(t => t !== opt.id) : [...prev, opt.id]
                  )}
                  className={`text-[10px] px-2 py-1 rounded-full border transition ${
                    active
                      ? "bg-accent-600 text-white border-accent-500"
                      : "bg-brand-800 text-brand-300 border-brand-600 hover:border-accent-400"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {typeFilter.length > 0 && (
              <button onClick={() => setTypeFilter([])}
                className="text-[10px] px-2 py-1 rounded-full text-brand-400 hover:text-brand-200">
                Clear
              </button>
            )}
          </div>
          <ChildrenTable rows={visible} dayIndex={dayIndex} onEdit={openEdit} onDelete={handleDelete} onAdjust={handleAdjust} />
        </TableSection>

        {/* Flagged */}
        <TableSection
          title="⚠️ FLAGGED — RUNNING LOW"
          subtitle="Red = below min · Pink = refill blue from drawer · * = still not enough, ask for more"
          count={flaggedKids.length}
          accent="red"
        >
          <ChildrenTable rows={flaggedKids} dayIndex={dayIndex} onEdit={openEdit} onDelete={handleDelete} onAdjust={handleAdjust} showNextPile />
        </TableSection>

        {/* Diaper wearers */}
        <TableSection
          title="DIAPER WEARERS"
          subtitle="Children who wear diapers"
          count={diaperWearers.length}
          accent="accent"
        >
          <ChildrenTable rows={diaperWearers} dayIndex={dayIndex} onEdit={openEdit} onDelete={handleDelete} onAdjust={handleAdjust} />
        </TableSection>

        {/* Nap diapers only */}
        <TableSection
          title="NAP DIAPERS ONLY"
          subtitle="Don't wear diapers, but use them at nap time"
          count={napOnlyKids.length}
          accent="violet"
        >
          <ChildrenTable rows={napOnlyKids} dayIndex={dayIndex} onEdit={openEdit} onDelete={handleDelete} onAdjust={handleAdjust} />
        </TableSection>

        {/* No diapers at all */}
        <TableSection
          title="NO DIAPERS"
          subtitle="No diapers at all (not even at nap time)"
          count={noDiaperKids.length}
          accent="violet"
        >
          <ChildrenTable rows={noDiaperKids} dayIndex={dayIndex} onEdit={openEdit} onDelete={handleDelete} onAdjust={handleAdjust} />
        </TableSection>

        {/* Friday exceptions */}
        <TableSection
          title="FRIDAY EXCEPTIONS"
          subtitle="Children who don't come on Fridays"
          count={fridayExceptions.length}
          accent="sky"
        >
          <ChildrenTable rows={fridayExceptions} dayIndex={dayIndex} onEdit={openEdit} onDelete={handleDelete} onAdjust={handleAdjust} />
        </TableSection>

        {kids.length === 0 && (
          <p className="text-center text-sm text-brand-500 italic py-8">
            No children yet. Tap “Add child” to start.
          </p>
        )}
      </div>

      {showReport && (
        <ReportModal kids={kids} dayIndex={dayIndex} onClose={() => setShowReport(false)} />
      )}

      {showForm && (
        <ChildForm
          existing={editing}
          dayIndex={dayIndex}
          existingGroups={groups}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ── Friday Shabbat tab ────────────────────────────────────────────────

// Helper: format a date string nicely, and get the most recent Friday.
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nextOrThisFriday() {
  const d = new Date();
  const day = d.getDay(); // 5 = Friday
  const diff = (5 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  return isoDate(d);
}

// Colored dropdown option label helper — since <option> can't be styled
// reliably across browsers, we show a colored dot prefix in the label.
function colorDot(color) {
  if (color === "red") return "🔴 ";
  if (color === "yellow") return "🟡 ";
  return ""; // none → default, no dot
}

// Kid picker dropdown for a Shabbat slot.
function KidSelect({ value, onChange, pool, lastMap, poolForColor }) {
  return (
    <select value={value || ""} onChange={e => onChange(e.target.value)}
      className="w-full rounded-lg border border-brand-600 bg-brand-800 text-brand-100 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400">
      <option value="">— select child —</option>
      {pool.map(k => {
        const color = shabbatColor(k.id, lastMap, poolForColor);
        return <option key={k.id} value={k.id}>{colorDot(color)}{k.name}{k.group ? ` (${k.group})` : ""}</option>;
      })}
    </select>
  );
}

// Shabbat report modal — builds the WhatsApp template.
function ShabbatReportModal({ kid1, kid2, onClose }) {
  const [role1, setRole1] = useState("imma"); // imma | abba
  const [role2, setRole2] = useState("abba");
  const [copied, setCopied] = useState(false);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const roleWord = (r) => (r === "imma" ? "imma" : "abba");

  const text = `Hey everyone! ${greeting}, hope everyone had a great week! Tomorrow ${kid1?.name || "___"} will be ${roleWord(role1)} of Shabbat and ${kid2?.name || "___"} will be ${roleWord(role2)} 😁 Have a great day!`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* fallback: textarea is selectable */ }
  };

  const roleToggle = (role, setRole) => (
    <div className="flex gap-1">
      {[["imma","Imma"],["abba","Abba"]].map(([val,label]) => (
        <button key={val} onClick={() => setRole(val)}
          className={`text-[10px] px-2 py-1 rounded-lg ${role === val ? "bg-accent-600 text-white" : "bg-brand-800 text-brand-300"}`}>
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center px-3">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:w-96 max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border-2 border-accent-500 bg-brand-900 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-pixel text-accent-300">SHABBAT REPORT</p>
          <button onClick={onClose} className="text-brand-300 text-xl leading-none">&times;</button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-brand-200 flex-1 truncate">{kid1?.name || "Kid 1"}</span>
          {roleToggle(role1, setRole1)}
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-brand-200 flex-1 truncate">{kid2?.name || "Kid 2"}</span>
          {roleToggle(role2, setRole2)}
        </div>

        <textarea readOnly value={text} onFocus={e => e.target.select()} rows={5}
          className="w-full rounded-lg border border-brand-600 bg-brand-800 text-brand-100 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none" />

        <button onClick={copy}
          className="px-4 py-2 text-sm bg-accent-600 text-white rounded-lg hover:bg-accent-500">
          {copied ? "Copied!" : "Copy to clipboard"}
        </button>
      </div>
    </div>
  );
}

function ShabbatTab({ kids }) {
  const uid = auth.currentUser?.uid;
  const [entries, setEntries] = useState([]);
  const [date, setDate] = useState(nextOrThisFriday());
  const [kid1Id, setKid1Id] = useState("");
  const [kid2Id, setKid2Id] = useState("");
  const [reportPair, setReportPair] = useState(null);
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    if (!uid) return;
    return listenToShabbatEntries(uid, setEntries);
  }, [uid]);

  const pool = useMemo(() => fridayPool(kids), [kids]);
  const lastMap = useMemo(() => lastShabbatByKid(entries), [entries]);
  const kidById = useMemo(() => Object.fromEntries(kids.map(k => [k.id, k])), [kids]);

  const addEntry = async () => {
    if (!date || !kid1Id || !kid2Id) return;
    await createShabbatEntry(uid, { date, kid1Id, kid2Id });
    setKid1Id(""); setKid2Id("");
  };

  const doSuggest = () => {
    const pair = suggestShabbatPair(kids, entries);
    setSuggestion(pair);
    if (pair[0]) setKid1Id(pair[0].id);
    if (pair[1]) setKid2Id(pair[1].id);
  };

  const priorityList = useMemo(() => shabbatPriorityList(kids, entries), [kids, entries]);

  const fmtLast = (kidId) => {
    const d = lastMap[kidId];
    return d ? d : "never";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-950 to-brand-900 px-2 sm:px-4 py-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-4">
          <h1 className="text-lg font-pixel text-accent-300 tracking-wide">FRIDAY SHABBAT</h1>
          <div className="h-0.5 w-32 mx-auto mt-2 bg-gradient-to-r from-transparent via-accent-400 to-transparent" />
          <p className="text-[10px] text-brand-500 mt-2">Pick the pair doing Shabbat this Friday</p>
        </div>

        {/* New entry */}
        <div className="rounded-2xl border border-brand-700 bg-brand-800/40 p-3 mb-5 space-y-2">
          <p className="text-[10px] font-pixel text-accent-300">NEW FRIDAY PAIR</p>
          <div>
            <label className="text-[10px] text-brand-400 uppercase">Friday date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-brand-600 bg-brand-800 text-brand-100 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-brand-400 uppercase">Kid 1</label>
              <KidSelect value={kid1Id} onChange={setKid1Id} pool={pool.filter(k => k.id !== kid2Id)} lastMap={lastMap} poolForColor={pool} />
            </div>
            <div>
              <label className="text-[10px] text-brand-400 uppercase">Kid 2</label>
              <KidSelect value={kid2Id} onChange={setKid2Id} pool={pool.filter(k => k.id !== kid1Id)} lastMap={lastMap} poolForColor={pool} />
            </div>
          </div>
          <p className="text-[9px] text-brand-500">🔴 been before but others never have · 🟡 been, others waited longer · no dot = never been</p>

          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={doSuggest}
              className="px-3 py-1.5 rounded-lg border border-accent-500 text-accent-300 hover:bg-accent-600 hover:text-white text-[11px] font-pixel">
              💡 Suggest pair
            </button>
            <button onClick={addEntry} disabled={!date || !kid1Id || !kid2Id}
              className="px-3 py-1.5 rounded-lg bg-accent-600 hover:bg-accent-500 text-white text-[11px] font-pixel disabled:opacity-50">
              Add pair
            </button>
            <button onClick={() => { if (kid1Id && kid2Id) setReportPair([kidById[kid1Id], kidById[kid2Id]]); }}
              disabled={!kid1Id || !kid2Id}
              className="px-3 py-1.5 rounded-lg border border-accent-500 text-accent-300 hover:bg-accent-600 hover:text-white text-[11px] font-pixel disabled:opacity-50">
              📋 Report
            </button>
          </div>

          {suggestion && (
            <p className="text-[10px] text-emerald-300 pt-1">
              Suggested: {suggestion[0]?.name || "—"} + {suggestion[1]?.name || "—"}
            </p>
          )}
        </div>

        {/* Priority list */}
        <TableSection title="PRIORITY — WHO'S DUE" subtitle="Longest since last Shabbat first; never-been on top" count={priorityList.length} accent="accent" defaultOpen={false}>
          <div className="overflow-x-auto rounded-xl border border-brand-700">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-800/80 text-[9px] uppercase text-brand-400">
                  <th className="py-1.5 px-2 font-medium w-4">#</th>
                  <th className="py-1.5 px-2 font-medium">Name</th>
                  <th className="py-1.5 px-2 font-medium">Group</th>
                  <th className="py-1.5 px-2 font-medium">Last Shabbat</th>
                </tr>
              </thead>
              <tbody>
                {priorityList.map((k, i) => (
                  <tr key={k.id} className="border-t border-brand-700/60">
                    <td className="py-1.5 px-2 text-[10px] text-brand-500 tabular-nums">{i + 1}</td>
                    <td className="py-1.5 px-2 text-xs text-brand-100">
                      {k.name}
                      {k.gender === "male" && <span className="ml-1 text-[9px] text-sky-400">♂</span>}
                      {k.gender === "female" && <span className="ml-1 text-[9px] text-pink-400">♀</span>}
                    </td>
                    <td className="py-1.5 px-2 text-xs text-brand-300">{k.group || "—"}</td>
                    <td className={`py-1.5 px-2 text-xs tabular-nums ${lastMap[k.id] ? "text-brand-300" : "text-emerald-300 font-semibold"}`}>{fmtLast(k.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableSection>

        {/* Past entries */}
        <TableSection title="PAST FRIDAYS" subtitle="Most recent first" count={entries.length} accent="sky">
          <div className="overflow-x-auto rounded-xl border border-brand-700">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-brand-800/80 text-[9px] uppercase text-brand-400">
                  <th className="py-1.5 px-2 font-medium">Date</th>
                  <th className="py-1.5 px-2 font-medium">Pair</th>
                  <th className="py-1.5 px-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.id} className="border-t border-brand-700/60">
                    <td className="py-1.5 px-2 text-xs text-brand-300 tabular-nums">{e.date}</td>
                    <td className="py-1.5 px-2 text-xs text-brand-100">
                      {(kidById[e.kid1Id]?.name || "—")} + {(kidById[e.kid2Id]?.name || "—")}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <button onClick={() => { if (confirm("Delete this Friday entry?")) deleteShabbatEntry(e.id); }}
                        className="text-brand-500 hover:text-red-400 text-sm leading-none">×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TableSection>
      </div>

      {reportPair && (
        <ShabbatReportModal kid1={reportPair[0]} kid2={reportPair[1]} onClose={() => setReportPair(null)} />
      )}
    </div>
  );
}

// ── Top-level tabbed app ──────────────────────────────────────────────

export default function DiaperTrackerApp() {
  const uid = auth.currentUser?.uid;
  const [tab, setTab] = useState("diaper");
  const [kids, setKids] = useState([]);

  // Shared kids listener so the Shabbat tab has the pool too.
  useEffect(() => {
    if (!uid) return;
    return listenToDiaperKids(uid, setKids);
  }, [uid]);

  return (
    <div className="bg-gradient-to-b from-brand-950 to-brand-900">
      {/* Tab bar */}
      <div className="sticky top-0 z-40 flex items-center justify-center gap-2 px-4 py-2 bg-brand-900/95 backdrop-blur border-b border-brand-700">
        <button onClick={() => setTab("diaper")}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-pixel transition ${tab === "diaper" ? "bg-accent-600 text-white" : "bg-brand-800 text-brand-300"}`}>
          Diaper Tracker
        </button>
        <button onClick={() => setTab("shabbat")}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-pixel transition ${tab === "shabbat" ? "bg-accent-600 text-white" : "bg-brand-800 text-brand-300"}`}>
          Friday Shabbat
        </button>
      </div>

      {tab === "diaper" ? <DiaperTab /> : <ShabbatTab kids={kids} />}
    </div>
  );
}
