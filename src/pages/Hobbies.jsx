import { useState, useEffect, useMemo } from "react";
import PageLayout from "../components/PageLayout";
import { auth } from "../firebase";
import {
  TRACK_METRICS, CATEGORY_COLORS, getCategoryStyle,
  listenToHobbyCategories, createHobbyCategory, updateHobbyCategory, deleteHobbyCategory,
  listenToHobbyEntries, createHobbyEntry, updateHobbyEntry, deleteHobbyEntry,
  STATUS_LABELS, STATUS_COLORS,
} from "../lib/hobbies";
import { awardXp, revokeXp, XP, xpId } from "../lib/xp";

const STATUSES = ["want", "current", "waiting", "done"];

// ── Tiny number input ─────────────────────────────────────────────────

function NumInput({ value, onChange, placeholder, className = "" }) {
  return (
    <input
      type="number" min="0" inputMode="numeric"
      value={value ?? ""}
      onChange={e => {
        const v = e.target.value;
        const n = Number(v);
        onChange(v === "" || isNaN(n) || n < 0 ? null : n);
      }}
      placeholder={placeholder}
      className={`rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-accent-400 ${className}`}
    />
  );
}

// ── Category form ─────────────────────────────────────────────────────

function CategoryForm({ uid, existing, onDone, onCancel }) {
  const [name, setName]     = useState(existing?.name || "");
  const [color, setColor]   = useState(existing?.color || "violet");
  const [metrics, setMetrics] = useState(existing?.metrics || ["episodes"]);
  const [saving, setSaving] = useState(false);

  const toggle = (id) => setMetrics(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id]);

  const handleSave = async () => {
    if (!name.trim() || metrics.length === 0) return;
    setSaving(true);
    try {
      if (existing) await updateHobbyCategory(existing.id, { name: name.trim(), color, metrics });
      else await createHobbyCategory(uid, { name: name.trim(), color, metrics });
      onDone();
    } finally { setSaving(false); }
  };

  const inp = "w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400";

  return (
    <div className="rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-4">
      <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">{existing ? "EDIT CATEGORY" : "NEW CATEGORY"}</p>

      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder="e.g. Anime, Manga, Books, Series"
        onKeyDown={e => e.key === "Escape" && onCancel()}
        className={inp} />

      {/* Color picker */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORY_COLORS.map(c => (
          <button key={c.id} type="button" onClick={() => setColor(c.id)}
            className={`w-6 h-6 rounded-full ${c.dot} transition ${color === c.id ? "ring-2 ring-offset-2 ring-brand-400 scale-110" : "opacity-60 hover:opacity-100"}`} />
        ))}
      </div>

      {/* Metric toggles */}
      <div>
        <label className="block text-xs font-medium text-brand-600 dark:text-brand-300 mb-2">What to track</label>
        <div className="flex flex-wrap gap-2">
          {TRACK_METRICS.map(m => (
            <button key={m.id} type="button" onClick={() => toggle(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border-2 transition ${
                metrics.includes(m.id)
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white dark:bg-brand-900 text-brand-500 dark:text-brand-300 border-brand-200 dark:border-brand-600 hover:border-brand-400"
              }`}>
              {m.label}
            </button>
          ))}
        </div>
        {metrics.length === 0 && <p className="text-xs text-red-500 mt-1">Pick at least one</p>}
      </div>

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={saving || !name.trim() || metrics.length === 0}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : existing ? "Save" : "Create"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
      </div>
    </div>
  );
}

// ── Entry form ────────────────────────────────────────────────────────

function EntryForm({ uid, categories, existing, defaultStatus, onDone, onCancel }) {
  const [name, setName]           = useState(existing?.name || "");
  const [categoryId, setCategoryId] = useState(existing?.categoryId || categories[0]?.id || "");
  const [status, setStatus]       = useState(existing?.status || defaultStatus || "want");
  const [total, setTotal]         = useState(existing?.total || {});
  const [progress, setProgress]   = useState(existing?.progress || {});
  const [rating, setRating]             = useState(existing?.rating ?? null);
  const [review, setReview]             = useState(existing?.review || "");
  const [waitingRating, setWaitingRating] = useState(existing?.waitingRating ?? null);
  const [waitingReview, setWaitingReview] = useState(existing?.waitingReview || "");
  const [waitingDate, setWaitingDate]   = useState(existing?.waitingDate || "");
  const [imageBase64, setImageBase64]   = useState(existing?.imageBase64 || null);
  const [saving, setSaving]             = useState(false);
  // Release schedule: { type: "weekly"|"monthly"|"custom", days: [], monthDay: null, note: "" }
  const [releaseSchedule, setReleaseSchedule] = useState(existing?.releaseSchedule || null);
  const [showRelease, setShowRelease]   = useState(!!(existing?.releaseSchedule));

  const cat = categories.find(c => c.id === categoryId);
  const metrics = cat ? TRACK_METRICS.filter(m => cat.metrics?.includes(m.id)) : [];

  // Per-season breakdown — works for any metric paired with seasons (episodes, chapters, pages, etc.)
  const [epsPerSeason, setEpsPerSeason] = useState(() => {
    if (existing?.epsPerSeason) return existing.epsPerSeason;
    return [];
  });

  const hasSeasons = metrics.some(m => m.id === "seasons");
  const hasBooks   = metrics.some(m => m.id === "books");
  // Find the companion metric (first non-seasons metric that makes sense per-season)
  const PER_SEASON_METRICS = ["episodes", "chapters", "pages", "volumes", "parts", "books", "quantity"];
  const companionMetric = metrics.find(m => PER_SEASON_METRICS.includes(m.id) && m.id !== "seasons" && m.id !== "books");

  // Per-season breakdown
  const updateEpsPerSeason = (idx, val) => {
    const arr = [...epsPerSeason];
    arr[idx] = val === "" ? "" : Number(val);
    setEpsPerSeason(arr);
    if (companionMetric) {
      const sum = arr.reduce((s, v) => s + (Number(v) || 0), 0);
      if (sum > 0) setTotal(t => ({ ...t, [companionMetric.id]: sum }));
    }
  };

  const syncSeasonRows = (numSeasons) => {
    const n = Number(numSeasons) || 0;
    setEpsPerSeason(prev => Array(n).fill("").map((_, i) => prev[i] ?? ""));
  };

  // Per-book breakdown: [{ name, pages, cost }]
  const [booksData, setBooksData] = useState(() => existing?.booksData || []);

  const syncBookRows = (numBooks) => {
    const n = Number(numBooks) || 0;
    setBooksData(prev => Array(n).fill(null).map((_, i) => prev[i] || { name: "", pages: "", cost: "" }));
  };

  const updateBook = (idx, field, val) => {
    setBooksData(prev => {
      const arr = [...prev];
      arr[idx] = { ...arr[idx], [field]: val };
      // Auto-update total pages
      if (field === "pages") {
        const totalPages = arr.reduce((s, b) => s + (Number(b.pages) || 0), 0);
        if (totalPages > 0) setTotal(t => ({ ...t, pages: totalPages }));
      }
      return arr;
    });
  };

  const handleImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Resize to max 400px wide (poster ratio) — keeps file well under 1MB
        const MAX_W = 400;
        const MAX_H = 600;
        let { width, height } = img;
        const ratio = Math.min(MAX_W / width, MAX_H / height, 1);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        // 0.75 quality JPEG — typically 20-80KB for a poster image
        setImageBase64(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  // helper for save when existing vs create
  const save = async () => {
    if (!name.trim() || !categoryId) return;
    setSaving(true);
    try {
      const data = { categoryId, name: name.trim(), status, total, progress, rating, review, waitingRating: waitingRating || null, waitingReview: waitingReview || "", waitingDate: waitingDate || null, imageBase64: imageBase64 || null, epsPerSeason: epsPerSeason.length ? epsPerSeason : null, booksData: booksData.length ? booksData : null, releaseSchedule: releaseSchedule || null };
      if (existing) await updateHobbyEntry(existing.id, data);
      else await createHobbyEntry(uid, data);
      onDone();
    } finally { setSaving(false); }
  };
  const inp = "rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 appearance-none";

  return (
    <div className="rounded-2xl border-2 shadow-sm border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 p-4 space-y-3">
      <p className="text-xs font-pixel text-brand-500 dark:text-brand-400">{existing ? "EDIT ENTRY" : "NEW ENTRY"}</p>

      <input autoFocus value={name} onChange={e => setName(e.target.value)}
        placeholder="Title / name" onKeyDown={e => e.key === "Enter" && save()}
        className={`w-full ${inp}`} />

      <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={`w-full ${inp}`}>
        {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {/* Status */}
      <div className="flex gap-1.5">
        {STATUSES.map(s => (
          <button key={s} type="button" onClick={() => setStatus(s)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border-2 transition ${
              status === s ? STATUS_COLORS[s] : "bg-brand-50 dark:bg-brand-900 text-brand-400 border-transparent"
            }`}>
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Metrics — total + progress side by side as X / Y */}
      {metrics.length > 0 && status !== "done" && (
        <div className="space-y-2">
          {/* Header */}
          <div className="flex items-center gap-2">
            <div className="flex-1" />
            <div className="w-20 text-center text-[10px] text-brand-400 dark:text-brand-500 font-medium">Total</div>
            {status === "current" && <div className="w-20 text-center text-[10px] text-brand-400 dark:text-brand-500 font-medium">Progress</div>}
          </div>
          {metrics.map(m => (
            <div key={m.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-brand-600 dark:text-brand-300">{m.label}</span>
              <NumInput value={total[m.id]}
                onChange={v => {
                  setTotal(t => ({ ...t, [m.id]: v }));
                  if (m.id === "seasons") syncSeasonRows(v);
                  if (m.id === "books") syncBookRows(v);
                }}
                placeholder="—" className="w-20" />
              {status === "current" && (
                <NumInput value={progress[m.id]} onChange={v => setProgress(p => ({ ...p, [m.id]: v }))}
                  placeholder="0" className="w-20" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Per-season breakdown — works for any metric paired with seasons */}
      {hasSeasons && companionMetric && epsPerSeason.length > 0 && status !== "done" && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 p-3 space-y-2">
          <p className="text-[10px] font-medium text-brand-500 dark:text-brand-400">{companionMetric.label.toUpperCase()} PER SEASON</p>
          {epsPerSeason.map((val, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-xs text-brand-500 dark:text-brand-400 w-16 flex-shrink-0">Season {idx + 1}</span>
              <input
                type="number" min="0"
                value={val}
                onChange={e => updateEpsPerSeason(idx, e.target.value)}
                placeholder="—"
                className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 appearance-none"
              />
              <span className="text-[10px] text-brand-400 dark:text-brand-500 flex-shrink-0">{companionMetric.label.toLowerCase()}</span>
            </div>
          ))}
          {epsPerSeason.some(v => Number(v) > 0) && (
            <div className="flex items-center justify-between pt-1 border-t border-brand-200 dark:border-brand-600">
              <span className="text-xs text-brand-500 dark:text-brand-400">Total {companionMetric.label.toLowerCase()} (all seasons)</span>
              <span className="text-sm font-semibold text-brand-700 dark:text-brand-200">
                {epsPerSeason.reduce((s, v) => s + (Number(v) || 0), 0)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Per-book breakdown — shows when books metric is tracked */}
      {hasBooks && booksData.length > 0 && status !== "done" && (
        <div className="rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 p-3 space-y-3">
          <p className="text-[10px] font-medium text-brand-500 dark:text-brand-400">BOOK DETAILS</p>
          {booksData.map((book, idx) => (
            <div key={idx} className="space-y-1.5 pb-2 border-b border-brand-200 dark:border-brand-600 last:border-0 last:pb-0">
              <p className="text-[10px] text-brand-400 dark:text-brand-500">Book {idx + 1}</p>
              <input
                type="text"
                value={book.name || ""}
                onChange={e => updateBook(idx, "name", e.target.value)}
                placeholder="Book name"
                className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400"
              />
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[10px] text-brand-400 dark:text-brand-500 mb-0.5">Pages</p>
                  <input
                    type="number" min="0"
                    value={book.pages || ""}
                    onChange={e => updateBook(idx, "pages", e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none appearance-none"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] text-brand-400 dark:text-brand-500 mb-0.5">Cost</p>
                  <input
                    type="number" min="0" step="0.01"
                    value={book.cost || ""}
                    onChange={e => updateBook(idx, "cost", e.target.value)}
                    placeholder="—"
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none appearance-none"
                  />
                </div>
              </div>
            </div>
          ))}
          {/* Totals */}
          {booksData.some(b => Number(b.pages) > 0) && (
            <div className="flex items-center justify-between pt-1 border-t border-brand-200 dark:border-brand-600 text-xs">
              <span className="text-brand-500 dark:text-brand-400">
                Total pages: <span className="font-semibold text-brand-700 dark:text-brand-200">{booksData.reduce((s, b) => s + (Number(b.pages) || 0), 0)}</span>
              </span>
              {booksData.some(b => Number(b.cost) > 0) && (
                <span className="text-brand-500 dark:text-brand-400">
                  Total cost: <span className="font-semibold text-brand-700 dark:text-brand-200">${booksData.reduce((s, b) => s + (Number(b.cost) || 0), 0).toFixed(2)}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Release schedule — only relevant when currently watching */}
      {status === "current" && (
        <div>
          {!showRelease ? (
            <button type="button" onClick={() => { setShowRelease(true); setReleaseSchedule({ type: "weekly", days: [], monthDay: null, note: "" }); }}
              className="text-xs text-accent-500 dark:text-accent-300 font-medium">
              + Add release schedule
            </button>
          ) : (
            <div className="rounded-xl border border-brand-200 dark:border-brand-600 bg-brand-50 dark:bg-brand-900 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-medium text-brand-500 dark:text-brand-400">📅 RELEASE SCHEDULE</p>
                <button type="button" onClick={() => { setShowRelease(false); setReleaseSchedule(null); }}
                  className="text-brand-300 hover:text-red-400 text-sm">×</button>
              </div>

              {/* Type selector */}
              <div className="flex gap-1.5">
                {[["weekly","Weekly"],["monthly","Monthly"],["custom","Custom"]].map(([val, label]) => (
                  <button key={val} type="button"
                    onClick={() => setReleaseSchedule(s => ({ ...s, type: val, days: [], monthDay: null }))}
                    className={`flex-1 py-1 rounded-lg text-xs border-2 transition ${
                      releaseSchedule?.type === val
                        ? "bg-accent-100 dark:bg-accent-900/30 border-accent-400 text-accent-700 dark:text-accent-300 font-medium"
                        : "bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-600 text-brand-500"
                    }`}>{label}</button>
                ))}
              </div>

              {/* Weekly: day picker */}
              {releaseSchedule?.type === "weekly" && (
                <div>
                  <p className="text-[10px] text-brand-400 dark:text-brand-500 mb-1.5">Which days?</p>
                  <div className="flex gap-1">
                    {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => (
                      <button key={d} type="button"
                        onClick={() => {
                          const days = releaseSchedule.days || [];
                          setReleaseSchedule(s => ({
                            ...s,
                            days: days.includes(i) ? days.filter(x => x !== i) : [...days, i]
                          }));
                        }}
                        className={`flex-1 py-1 rounded-lg text-[10px] border transition ${
                          releaseSchedule.days?.includes(i)
                            ? "bg-accent-500 border-accent-500 text-white font-medium"
                            : "bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-600 text-brand-500"
                        }`}>{d}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly: day of month */}
              {releaseSchedule?.type === "monthly" && (
                <div>
                  <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1">Day of month</label>
                  <input type="number" min="1" max="31"
                    value={releaseSchedule.monthDay || ""}
                    onChange={e => setReleaseSchedule(s => ({ ...s, monthDay: e.target.value ? Number(e.target.value) : null }))}
                    placeholder="e.g. 15"
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 appearance-none" />
                </div>
              )}

              {/* Custom: free text */}
              {releaseSchedule?.type === "custom" && (
                <div>
                  <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1">Schedule note</label>
                  <input type="text"
                    value={releaseSchedule.note || ""}
                    onChange={e => setReleaseSchedule(s => ({ ...s, note: e.target.value }))}
                    placeholder="e.g. Every 2 weeks on Friday"
                    className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {status === "waiting" && (
        <div>
          <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">Expected return date (optional)</label>
          <input type="date" value={waitingDate} onChange={e => setWaitingDate(e.target.value)}
            className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 pr-4 py-2 appearance-none text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
        </div>
      )}

      {/* Rating + review for waiting (interim review while waiting) */}
      {status === "waiting" && (
        <div className="space-y-2">
          <label className="block text-xs text-brand-500 dark:text-brand-400">Interim rating (while waiting)</label>
          <div className="flex gap-1 flex-wrap">
            {[1,2,3,4,5,6,7,8,9,10].map(n => (
              <button key={n} type="button" onClick={() => setWaitingRating(waitingRating === n ? null : n)}
                className={`w-7 h-7 rounded-lg text-xs font-medium border-2 transition ${
                  waitingRating === n ? "bg-accent-600 text-white border-2 border-accent-400"
                  : waitingRating && n <= waitingRating ? "bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-300 border-accent-300"
                  : "bg-white dark:bg-brand-900 text-brand-500 dark:text-brand-400 border-brand-200 dark:border-brand-600"
                }`}>{n}</button>
            ))}
          </div>
          <textarea value={waitingReview} onChange={e => setWaitingReview(e.target.value)} rows={2}
            placeholder="Thoughts so far... (while waiting for more)"
            className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 resize-none" />
        </div>
      )}

      {/* Rating + review for done */}
      {status === "done" && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">Rating (1–10)</label>
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" onClick={() => setRating(n)}
                  className={`w-8 h-8 rounded-lg text-xs font-pixel transition ${
                    rating === n ? "bg-accent-600 text-white border-2 border-accent-400"
                    : "bg-brand-100 dark:bg-brand-700 text-brand-600 dark:text-brand-300 hover:bg-brand-200"
                  }`}>{n}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">Review / thoughts</label>
            <textarea value={review} onChange={e => setReview(e.target.value)} rows={3}
              placeholder="What did you think?" className={`w-full ${inp} resize-none`} />
          </div>
        </div>
      )}

      {/* Cover image */}
      <div>
        <label className="block text-xs text-brand-500 dark:text-brand-400 mb-1">Cover image (optional)</label>
        <div className="flex items-center gap-3">
          {imageBase64 && (
            <div className="relative flex-shrink-0">
              <img src={imageBase64} alt="cover" className="w-14 h-20 object-cover rounded-lg border border-brand-200 dark:border-brand-600" />
              <button onClick={() => setImageBase64(null)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center leading-none">
                ×
              </button>
            </div>
          )}
          <label className="cursor-pointer flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-brand-200 dark:border-brand-600 text-xs text-brand-500 dark:text-brand-400 hover:border-accent-400 dark:hover:border-accent-500 hover:text-accent-500 transition">
            📷 {imageBase64 ? "Change image" : "Add image"}
            <input type="file" accept="image/*" onChange={handleImage} className="sr-only" />
          </label>
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving || !name.trim() || !categoryId}
          className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : existing ? "Save" : "Add"}
        </button>
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-brand-500 dark:text-brand-400">Cancel</button>
      </div>
    </div>
  );
}

// ── Entry card ────────────────────────────────────────────────────────

function EntryCard({ entry, category, onEdit, onDelete, onMoveStatus, onTap }) {
  const style = getCategoryStyle(category?.color);
  const metrics = category ? TRACK_METRICS.filter(m => category.metrics?.includes(m.id)) : [];
  const nextStatus = entry.status === "want" ? "current"
    : entry.status === "current" ? "waiting"
    : entry.status === "waiting" ? "done"
    : null;
  const prevStatus = entry.status === "done" ? "waiting"
    : entry.status === "waiting" ? "current"
    : entry.status === "current" ? "want"
    : null;

  // A metric is "set" only if its value is a positive number
  const isSet = (v) => v != null && v !== "" && Number(v) > 0;

  // Build progress lines — for "want" only show total, for "current"/"done" show both
  const progressLines = metrics.map(m => {
    const prog  = entry.status === "want" ? null : entry.progress?.[m.id];
    const total = entry.total?.[m.id];
    if (!isSet(prog) && !isSet(total)) return null;
    const display = isSet(prog) && isSet(total) ? `${prog} / ${total}`
      : isSet(prog) ? `${prog}` : `${total}`;
    return { metricId: m.id, label: m.label, prog, total };
  }).filter(Boolean);

  const increment = (metricId) => {
    const cur = entry.progress?.[metricId] ?? 0;
    // For seasons: cap at total seasons
    if (metricId === "seasons") {
      const max = entry.total?.seasons;
      if (max && cur >= Number(max)) return;
    }
    // For companion metric (episodes/chapters etc): cap at episodes in current season
    const PER_SEASON_METRICS = ["episodes", "chapters", "pages", "volumes", "parts", "books", "quantity"];
    if (PER_SEASON_METRICS.includes(metricId) && entry.epsPerSeason?.length > 0) {
      const currentSeason = Number(entry.progress?.seasons || 1);
      const maxInSeason = entry.epsPerSeason[currentSeason - 1];
      if (maxInSeason && cur >= Number(maxInSeason)) return;
    } else if (metricId === "pages" && entry.booksData?.length > 0) {
      // Cap pages at current book's page count — auto-advance to next book when complete
      const currentBookIdx = Number(entry.progress?.books || 1) - 1;
      const maxPages = Number(entry.booksData[currentBookIdx]?.pages || 0);
      if (maxPages && cur >= maxPages) {
        // Advance to next book automatically
        const nextBookIdx = currentBookIdx + 1;
        const totalBooks = entry.total?.books ?? entry.booksData.length;
        if (nextBookIdx < Number(totalBooks)) {
          updateHobbyEntry(entry.id, {
            progress: {
              ...(entry.progress || {}),
              pages: 0,
              books: nextBookIdx + 1,
            }
          });
        }
        return;
      }
    } else if (metricId === "books") {
      // Cap books at total books
      const max = entry.total?.books;
      if (max && cur >= Number(max)) return;
    } else {
      // No per-season data — cap at total if set
      const max = entry.total?.[metricId];
      if (max && cur >= Number(max)) return;
    }
    updateHobbyEntry(entry.id, { progress: { ...(entry.progress || {}), [metricId]: cur + 1 } });
  };

  const decrement = (metricId) => {
    const cur = entry.progress?.[metricId] ?? 0;
    if (cur <= 0) return;
    updateHobbyEntry(entry.id, { progress: { ...(entry.progress || {}), [metricId]: cur - 1 } });
  };

  return (
    <div className={`rounded-2xl border-2 shadow-sm ${style.border} ${style.bg} overflow-hidden flex cursor-pointer`}
      onClick={onTap}>
      {/* Cover image — vertical strip on the left */}
      {entry.imageBase64 && (
        <div className="flex-shrink-0 p-2" onClick={e => e.stopPropagation()}>
          <img src={entry.imageBase64} alt={entry.name}
            className="w-28 h-40 object-cover rounded-lg block cursor-pointer" onClick={onTap} />
        </div>
      )}

      <div className="p-3 space-y-2 flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-brand-800 dark:text-brand-100 flex-1 min-w-0 truncate">
            {entry.name}
          </p>
          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(entry)} className="text-[10px] text-accent-500 dark:text-accent-300 font-medium">Edit</button>
            <button onClick={() => onDelete(entry.id)} className="text-brand-300 hover:text-red-400 leading-none">×</button>
          </div>
        </div>

        {/* Progress display with +/- buttons for "currently" entries */}
        {progressLines.length > 0 && (
        <div className="flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
          {progressLines.map(({ metricId, label, prog, total }) => {
            const epsPerSeason = entry.epsPerSeason;
            const currentSeason = entry.progress?.seasons ?? (isSet(entry.total?.seasons) ? 1 : null);
            // Check if this metric has per-season data (it's the companion to seasons)
            const PER_SEASON_METRICS = ["episodes", "chapters", "pages", "volumes", "parts", "books", "quantity"];
            const hasPerSeason = epsPerSeason?.length > 0 && PER_SEASON_METRICS.includes(metricId) && entry.status === "current";
            // Per-book: pages metric shows the CURRENT book's pages up top (total lives in the bottom block)
            const hasPerBook = metricId === "pages" && entry.booksData?.length > 0 && entry.status === "current";
            const currentBookIdx = Number(entry.progress?.books || 1) - 1;
            const pagesInCurrentBook = hasPerBook ? Number(entry.booksData[currentBookIdx]?.pages || 0) : 0;

            let display;
            if (hasPerBook) {
              display = pagesInCurrentBook > 0
                ? `${isSet(prog) ? prog : 0} / ${pagesInCurrentBook}`
                : isSet(prog) ? `${prog}` : "0";
            } else if (hasPerSeason) {
              const seasonIdx = (Number(currentSeason) || 1) - 1;
              const inSeason = epsPerSeason[seasonIdx];
              display = isSet(inSeason)
                ? `${isSet(prog) ? prog : 0} / ${inSeason}`
                : isSet(prog) && isSet(total) ? `${prog} / ${total}` : isSet(prog) ? `${prog}` : `${total}`;
            } else {
              display = isSet(prog) && isSet(total) ? `${prog} / ${total}`
                : isSet(prog) ? `${prog}` : `${total}`;
            }

            // Metrics where typing a number directly is more practical than clicking +/-
            const DIRECT_INPUT_METRICS = ["pages", "chapters", "hours", "quantity", "percentage", "cost"];
            const useDirectInput = DIRECT_INPUT_METRICS.includes(metricId);

            return (
              <div key={metricId} className="flex items-center gap-2">
                <span className="text-xs text-brand-600 dark:text-brand-300 font-medium tabular-nums flex-1">
                  {display}{" "}
                  <span className="font-normal text-brand-400 dark:text-brand-500">
                    {hasPerBook ? `${label.toLowerCase()} this book` : hasPerSeason ? `${label.toLowerCase()} this season` : label.toLowerCase()}
                  </span>
                </span>
                {entry.status === "current" && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => {
                        const cur = entry.progress?.[metricId] ?? 0;
                        if (cur <= 0) return;
                        updateHobbyEntry(entry.id, { progress: { ...(entry.progress || {}), [metricId]: cur - 1 } });
                      }}
                      className="w-6 h-6 rounded-full bg-white/80 dark:bg-black/20 border border-brand-300 dark:border-brand-600 text-brand-500 dark:text-brand-400 text-sm font-bold hover:bg-white dark:hover:bg-black/30 hover:border-red-300 hover:text-red-500 transition flex items-center justify-center"
                      title={`Remove 1 ${label.toLowerCase()}`}
                    >−</button>

                    {useDirectInput ? (
                      <input
                        type="number" min="0"
                        value={entry.progress?.[metricId] ?? 0}
                        onChange={e => {
                          const val = Math.max(0, Number(e.target.value) || 0);
                          updateHobbyEntry(entry.id, { progress: { ...(entry.progress || {}), [metricId]: val } });
                        }}
                        className="w-14 text-center text-xs rounded-lg border border-brand-300 dark:border-brand-600 bg-white/80 dark:bg-black/20 text-brand-700 dark:text-brand-200 py-0.5 px-1 focus:outline-none focus:ring-1 focus:ring-accent-400 appearance-none"
                      />
                    ) : null}

                    <button
                      onClick={() => increment(metricId)}
                      disabled={(() => {
                        const cur = entry.progress?.[metricId] ?? 0;
                        const PER_SEASON_METRICS = ["episodes", "chapters", "pages", "volumes", "parts", "books", "quantity"];
                        if (metricId === "seasons") return !!(entry.total?.seasons && cur >= Number(entry.total.seasons));
                        if (PER_SEASON_METRICS.includes(metricId) && entry.epsPerSeason?.length > 0) {
                          const seasonIdx = Number(entry.progress?.seasons || 1) - 1;
                          const max = entry.epsPerSeason[seasonIdx];
                          return !!(max && cur >= Number(max));
                        }
                        if (metricId === "pages" && entry.booksData?.length > 0) {
                          const bookIdx = Number(entry.progress?.books || 1) - 1;
                          const max = Number(entry.booksData[bookIdx]?.pages || 0);
                          const totalBooks = entry.total?.books ?? entry.booksData.length;
                          const isLastBook = bookIdx >= Number(totalBooks) - 1;
                          // Only disable if at max pages of last book
                          return !!(max && (entry.progress?.[metricId] ?? 0) >= max && isLastBook);
                        }
                        return !!(entry.total?.[metricId] && cur >= Number(entry.total[metricId]));
                      })()}
                      className="w-6 h-6 rounded-full bg-white/80 dark:bg-black/20 border border-brand-300 dark:border-brand-600 text-brand-600 dark:text-brand-300 text-xs font-bold hover:bg-white dark:hover:bg-black/30 hover:border-accent-400 hover:text-accent-600 dark:hover:text-accent-300 transition flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/80 disabled:hover:border-brand-300"
                      title={`Add 1 ${label.toLowerCase()}`}
                    >+</button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Total across all seasons — shown for any companion metric with per-season data */}
          {entry.status === "current" && entry.epsPerSeason?.length > 0 && (() => {
            const PER_SEASON_METRICS = ["episodes", "chapters", "pages", "volumes", "parts", "books", "quantity"];
            // Find the companion metric label from progressLines
            const companionLine = progressLines.find(l => PER_SEASON_METRICS.includes(l.metricId));
            if (!companionLine) return null;
            const totalAll = entry.epsPerSeason.reduce((s, v) => s + (Number(v) || 0), 0);
            const currentSeason = Number(entry.progress?.seasons || 1);
            const completedEps = entry.epsPerSeason
              .slice(0, currentSeason - 1)
              .reduce((s, v) => s + (Number(v) || 0), 0);
            const watchedThis = Number(entry.progress?.[companionLine.metricId] || 0);
            const totalWatched = completedEps + watchedThis;
            if (totalAll <= 0) return null;
            return (
              <div className="flex items-center gap-2 pt-0.5 border-t border-black/10 dark:border-white/10">
                <span className="text-xs text-brand-500 dark:text-brand-400 tabular-nums flex-1">
                  <span className="font-medium">{totalWatched} / {totalAll}</span>
                  {" "}<span className="font-normal">total {companionLine.label.toLowerCase()}</span>
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {/* Books breakdown on card */}
      {entry.status === "current" && entry.booksData?.length > 0 && (() => {
        const booksData = entry.booksData;
        const totalPages = booksData.reduce((s, b) => s + (Number(b.pages) || 0), 0);
        const currentBookIdx = Number(entry.progress?.books || 1) - 1;
        const pagesInCurrentBook = Number(booksData[currentBookIdx]?.pages || 0);
        // Pages read = pages from completed books + progress.pages in current book
        const completedPages = booksData.slice(0, currentBookIdx).reduce((s, b) => s + (Number(b.pages) || 0), 0);
        const pagesThisBook = Number(entry.progress?.pages || 0);
        const totalRead = completedPages + pagesThisBook;
        const pct = totalPages > 0 ? Math.round((totalRead / totalPages) * 100) : 0;
        const currentBook = booksData[currentBookIdx];
        const totalCost = booksData.reduce((s, b) => s + (Number(b.cost) || 0), 0);
        return (
          <div className="space-y-1.5 pt-0.5 border-t border-black/10 dark:border-white/10">
            {currentBook?.name && (
              <p className="text-xs text-brand-600 dark:text-brand-300 font-medium">📖 {currentBook.name}</p>
            )}
            {totalPages > 0 && (
              <>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-brand-500 dark:text-brand-400">{totalRead} / {totalPages} total pages</span>
                  <span className="font-semibold text-accent-600 dark:text-accent-300">{pct}%</span>
                </div>
                <div className="w-full h-1.5 bg-brand-200 dark:bg-brand-700 rounded-full overflow-hidden">
                  <div className="h-full bg-accent-400 dark:bg-accent-300 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </>
            )}
            {totalCost > 0 && (
              <p className="text-[10px] text-brand-400 dark:text-brand-500">Total cost: ${totalCost.toFixed(2)}</p>
            )}
          </div>
        );
      })()}

      {/* Waiting: show expected return date + interim review */}
      {entry.status === "waiting" && (
        <>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-sky-500 dark:text-sky-400">⏳</span>
            <span className="text-xs text-sky-600 dark:text-sky-300">
              {entry.waitingDate
                ? `Returns ${new Date(entry.waitingDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
                : "TBD — Not Announced"}
            </span>
          </div>
          {entry.waitingRating && (
            <div className="flex items-center gap-1.5">
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className={`w-2 h-2 rounded-sm ${i < entry.waitingRating ? "bg-sky-400" : "bg-brand-200 dark:bg-brand-700"}`} />
                ))}
              </div>
              <span className="text-[10px] font-medium text-sky-500 dark:text-sky-300">{entry.waitingRating}/10 so far</span>
            </div>
          )}
          {entry.waitingReview && (
            <p className="text-xs text-brand-500 dark:text-brand-400 italic line-clamp-2">"{entry.waitingReview}"</p>
          )}
        </>
      )}

      {/* Currently: release schedule */}
      {entry.status === "current" && entry.releaseSchedule && (() => {
        const rs = entry.releaseSchedule;
        const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        let text = "";
        if (rs.type === "weekly" && rs.days?.length > 0) {
          text = rs.days.sort((a,b)=>a-b).map(d => DAY_NAMES[d]).join(", ");
        } else if (rs.type === "monthly" && rs.monthDay) {
          const suffix = rs.monthDay === 1 || rs.monthDay === 21 || rs.monthDay === 31 ? "st"
            : rs.monthDay === 2 || rs.monthDay === 22 ? "nd"
            : rs.monthDay === 3 || rs.monthDay === 23 ? "rd" : "th";
          text = `Day ${rs.monthDay}${suffix} of every month`;
        } else if (rs.type === "custom" && rs.note) {
          text = rs.note;
        }
        if (!text) return null;
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-brand-400 dark:text-brand-500">📅</span>
            <span className="text-xs text-brand-500 dark:text-brand-400">{text}</span>
          </div>
        );
      })()}

      {/* Done: rating + review */}
      {entry.status === "done" && (
        <div className="space-y-1.5 pt-0.5">
          {entry.rating && (
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {Array.from({ length: 10 }, (_, i) => (
                  <div key={i} className={`w-2.5 h-2.5 rounded-sm ${i < entry.rating ? "bg-accent-500 dark:bg-accent-400" : "bg-brand-200 dark:bg-brand-700"}`} />
                ))}
              </div>
              <span className="text-xs font-medium text-accent-600 dark:text-accent-300">{entry.rating}/10</span>
            </div>
          )}
          {entry.review && (
            <p className="text-xs text-brand-600 dark:text-brand-300 italic leading-relaxed line-clamp-2 overflow-hidden">"{entry.review}"</p>
          )}
        </div>
      )}

      {/* Move status */}
      <div className="flex gap-1.5 pt-0.5" onClick={e => e.stopPropagation()}>
        {prevStatus && (
          <button onClick={() => onMoveStatus(entry, prevStatus)}
            className="text-[10px] px-2 py-1 rounded-lg bg-white/70 dark:bg-black/20 text-brand-500 dark:text-brand-400 hover:bg-white dark:hover:bg-black/30 transition">
            ← {STATUS_LABELS[prevStatus]}
          </button>
        )}
        {nextStatus && (
          <button onClick={() => onMoveStatus(entry, nextStatus)}
            className="text-[10px] px-2 py-1 rounded-lg bg-white/70 dark:bg-black/20 text-brand-500 dark:text-brand-400 hover:bg-white dark:hover:bg-black/30 transition">
            → {STATUS_LABELS[nextStatus]}
          </button>
        )}
      </div>
      </div>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────
function DetailModal({ entry, category, onClose, onEdit, onMoveStatus }) {
  const style = category ? getCategoryStyle(category.color) : null;
  const DAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const TRACKABLE = ["episodes", "chapters", "pages", "volumes", "parts", "books", "quantity", "hours"];

  // Build a rich metrics section showing per-season and per-book breakdown
  const renderMetrics = () => {
    const sections = [];

    // Per-season breakdown
    if (entry.epsPerSeason?.length > 0) {
      const companionId = TRACKABLE.find(m => entry.epsPerSeason && (entry.total?.[m] != null || entry.progress?.[m] != null));
      const currentSeason = Number(entry.progress?.seasons || 1);
      sections.push(
        <div key="seasons" className="space-y-1.5">
          <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500">SEASONS</p>
          {entry.epsPerSeason.map((eps, i) => {
            const isCurrent = i + 1 === currentSeason && entry.status === "current";
            return (
              <div key={i} className={`flex items-center justify-between text-xs rounded-lg px-2 py-1 ${isCurrent ? "bg-accent-50 dark:bg-accent-900/20 border border-accent-200 dark:border-accent-700" : ""}`}>
                <span className={`${isCurrent ? "text-accent-600 dark:text-accent-300 font-medium" : "text-brand-600 dark:text-brand-300"}`}>
                  Season {i + 1} {isCurrent ? "← current" : ""}
                </span>
                <span className="text-brand-500 dark:text-brand-400">{eps} {companionId || "episodes"}</span>
              </div>
            );
          })}
          {/* Totals */}
          <div className="flex items-center justify-between text-xs font-medium pt-1 border-t border-brand-100 dark:border-brand-700">
            <span className="text-brand-600 dark:text-brand-300">Total</span>
            <span className="text-brand-700 dark:text-brand-200">
              {entry.progress?.episodes != null ? `${entry.progress.episodes} / ` : ""}{entry.epsPerSeason.reduce((s,v) => s + (Number(v)||0), 0)} {companionId || "episodes"}
            </span>
          </div>
        </div>
      );
    }

    // Per-book breakdown
    if (entry.booksData?.length > 0) {
      const totalPages = entry.booksData.reduce((s, b) => s + (Number(b.pages)||0), 0);
      const totalCost = entry.booksData.reduce((s, b) => s + (Number(b.cost)||0), 0);
      sections.push(
        <div key="books" className="space-y-1.5">
          <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500">BOOKS</p>
          {entry.booksData.map((b, i) => (
            <div key={i} className="flex items-start justify-between text-xs">
              <span className="text-brand-700 dark:text-brand-200 font-medium">{b.name || `Book ${i+1}`}</span>
              <span className="text-brand-500 dark:text-brand-400 text-right ml-2">
                {b.pages ? `${b.pages} pages` : ""}{b.pages && b.cost ? " · " : ""}{b.cost ? `$${Number(b.cost).toFixed(2)}` : ""}
              </span>
            </div>
          ))}
          <div className="flex justify-between text-xs font-medium pt-1 border-t border-brand-100 dark:border-brand-700">
            <span className="text-brand-600 dark:text-brand-300">Total</span>
            <span className="text-brand-700 dark:text-brand-200">
              {entry.progress?.pages != null ? `${entry.progress.pages} / ` : ""}{totalPages} pages{totalCost > 0 ? ` · $${totalCost.toFixed(2)}` : ""}
            </span>
          </div>
        </div>
      );
    }

    // Generic metrics (hours, episodes without per-season, etc.)
    if (sections.length === 0 && entry.total) {
      const metricLines = Object.entries(entry.total).filter(([,v]) => v);
      if (metricLines.length > 0) {
        sections.push(
          <div key="generic" className="space-y-1">
            {metricLines.map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs">
                <span className="text-brand-500 dark:text-brand-400 capitalize">{k}</span>
                <span className="font-medium text-brand-700 dark:text-brand-200">
                  {entry.progress?.[k] != null ? `${entry.progress[k]} / ${v}` : v}
                </span>
              </div>
            ))}
          </div>
        );
      }
    }

    return sections;
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top, 1rem))" }}>
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white dark:bg-brand-900 rounded-2xl shadow-2xl border-2 border-brand-200 dark:border-brand-700 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 rounded-t-2xl flex-shrink-0 ${style ? style.bg : ""}`}>
          <div className="flex items-center gap-2 min-w-0">
            {style && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />}
            <span className="text-sm font-semibold text-brand-800 dark:text-brand-100 truncate">{entry.name}</span>
            {category && <span className="text-[10px] text-brand-500 dark:text-brand-400 truncate">{category.name}</span>}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={() => { onClose(); onEdit(entry); }} className="text-xs text-accent-500 dark:text-accent-300 font-medium">Edit</button>
            <button onClick={onClose} className="text-brand-400 hover:text-brand-700 dark:hover:text-brand-200 text-xl leading-none">×</button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 space-y-4">
          {/* Image — full, not cropped */}
          {entry.imageBase64 && (
            <img src={entry.imageBase64} alt={entry.name}
              className="w-full rounded-xl object-contain max-h-64 bg-brand-50 dark:bg-brand-800" />
          )}

          {/* Rich metrics */}
          {renderMetrics()}

          {/* Waiting date */}
          {entry.status === "waiting" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-sky-500">⏳</span>
              <span className="text-xs text-sky-600 dark:text-sky-300">
                {entry.waitingDate ? `Returns ${new Date(entry.waitingDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}` : "TBD — Not Announced"}
              </span>
            </div>
          )}

          {/* Release schedule */}
          {entry.releaseSchedule && (() => {
            const rs = entry.releaseSchedule;
            let text = "";
            if (rs.type === "weekly" && rs.days?.length > 0) text = rs.days.sort((a,b)=>a-b).map(d => DAY_NAMES[d]).join(", ");
            else if (rs.type === "monthly" && rs.monthDay) text = `Day ${rs.monthDay} of every month`;
            else if (rs.type === "custom" && rs.note) text = rs.note;
            if (!text) return null;
            return <p className="text-xs text-brand-500 dark:text-brand-400">📅 {text}</p>;
          })()}

          {/* Waiting: interim rating/review */}
          {entry.status === "waiting" && (entry.waitingRating || entry.waitingReview) && (
            <div className="space-y-1.5 rounded-xl bg-sky-50 dark:bg-sky-900/20 p-3 border border-sky-200 dark:border-sky-800">
              <p className="text-[10px] font-pixel text-sky-500 dark:text-sky-400">INTERIM REVIEW</p>
              {entry.waitingRating && (
                <div className="flex gap-0.5 items-center">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} className={`flex-1 h-2.5 rounded-sm ${i < entry.waitingRating ? "bg-sky-400" : "bg-brand-200 dark:bg-brand-700"}`} />
                  ))}
                  <span className="text-[10px] text-sky-500 dark:text-sky-300 ml-1">{entry.waitingRating}/10</span>
                </div>
              )}
              {entry.waitingReview && <p className="text-xs text-brand-600 dark:text-brand-300 italic">"{entry.waitingReview}"</p>}
            </div>
          )}

          {/* Done: rating + review history */}
          {entry.status === "done" && (entry.rating || entry.review || entry.waitingRating || entry.waitingReview) && (
            <div className="space-y-3">
              {/* Final review */}
              {(entry.rating || entry.review) && (
                <div className="space-y-1.5">
                  <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500">FINAL REVIEW</p>
                  {entry.rating && (
                    <div className="space-y-0.5">
                      <div className="flex gap-0.5">
                        {Array.from({ length: 10 }, (_, i) => (
                          <div key={i} className={`flex-1 h-3 rounded-sm ${i < entry.rating ? "bg-accent-500 dark:bg-accent-400" : "bg-brand-200 dark:bg-brand-700"}`} />
                        ))}
                      </div>
                      <p className="text-xs font-medium text-accent-600 dark:text-accent-300">{entry.rating}/10</p>
                    </div>
                  )}
                  {entry.review && <p className="text-sm text-brand-600 dark:text-brand-300 italic leading-relaxed">"{entry.review}"</p>}
                </div>
              )}
              {/* Interim review (from when it was in waiting) */}
              {(entry.waitingRating || entry.waitingReview) && (
                <div className="space-y-1.5 rounded-xl bg-sky-50 dark:bg-sky-900/20 p-3 border border-sky-200 dark:border-sky-800">
                  <p className="text-[10px] font-pixel text-sky-500 dark:text-sky-400">INTERIM REVIEW (WHILE WAITING)</p>
                  {entry.waitingRating && (
                    <div className="flex gap-0.5 items-center">
                      {Array.from({ length: 10 }, (_, i) => (
                        <div key={i} className={`flex-1 h-2.5 rounded-sm ${i < entry.waitingRating ? "bg-sky-400" : "bg-brand-200 dark:bg-brand-700"}`} />
                      ))}
                      <span className="text-[10px] text-sky-500 dark:text-sky-300 ml-1">{entry.waitingRating}/10</span>
                    </div>
                  )}
                  {entry.waitingReview && <p className="text-xs text-brand-500 dark:text-brand-400 italic">"{entry.waitingReview}"</p>}
                </div>
              )}
            </div>
          )}

          {/* Review — full text (fallback for non-done/waiting) */}
          {entry.status !== "done" && entry.status !== "waiting" && entry.review && (
            <p className="text-sm text-brand-600 dark:text-brand-300 italic leading-relaxed">"{entry.review}"</p>
          )}

          {/* Move status */}
          <div className="flex gap-2 pt-1">
            {entry.status !== "want" && (
              <button onClick={() => { onMoveStatus(entry, entry.status === "current" ? "want" : entry.status === "waiting" ? "current" : "waiting"); onClose(); }}
                className="flex-1 text-xs py-2 rounded-xl bg-brand-100 dark:bg-brand-800 text-brand-500 dark:text-brand-400 font-medium">
                ← {STATUS_LABELS[entry.status === "current" ? "want" : entry.status === "waiting" ? "current" : "waiting"]}
              </button>
            )}
            {entry.status !== "done" && (
              <button onClick={() => { onMoveStatus(entry, entry.status === "want" ? "current" : entry.status === "current" ? "waiting" : "done"); onClose(); }}
                className="flex-1 text-xs py-2 rounded-xl bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-300 font-medium">
                → {STATUS_LABELS[entry.status === "want" ? "current" : entry.status === "current" ? "waiting" : "done"]}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



// ── Compact Card ──────────────────────────────────────────────────────
function CompactCard({ entry, category, onEdit, onMoveStatus, onTap }) {
  const style = category ? getCategoryStyle(category.color) : null;

  let detail = null;
  if (entry.status === "want") {
    // Show totals
    const tots = Object.entries(entry.total || {}).filter(([,v]) => v).map(([k,v]) => `${v} ${k}`);
    detail = tots.length > 0 ? tots.join(" · ") : null;
  } else if (entry.status === "current") {
    // Show progress with +/- for companion metric (episodes/chapters/hours etc.)
    const TRACKABLE = ["episodes", "chapters", "pages", "volumes", "parts", "books", "quantity", "hours"];
    const companion = TRACKABLE.find(m => entry.total?.[m] != null || entry.progress?.[m] != null);
    if (companion) {
      const prog = entry.progress?.[companion] ?? 0;
      const total = entry.total?.[companion];
      detail = (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-brand-600 dark:text-brand-300 tabular-nums">{prog}{total ? ` / ${total}` : ""} {companion}</span>
          <button onClick={e => { e.stopPropagation(); const cur = entry.progress?.[companion] ?? 0; if (cur > 0) updateHobbyEntry(entry.id, { progress: { ...(entry.progress||{}), [companion]: cur - 1 } }); }}
            className="w-5 h-5 rounded-full border border-brand-300 dark:border-brand-600 text-brand-500 text-xs flex items-center justify-center hover:border-red-300 hover:text-red-500 transition">−</button>
          <button onClick={e => { e.stopPropagation(); const cur = entry.progress?.[companion] ?? 0; updateHobbyEntry(entry.id, { progress: { ...(entry.progress||{}), [companion]: cur + 1 } }); }}
            className="w-5 h-5 rounded-full border border-brand-300 dark:border-brand-600 text-brand-500 text-xs flex items-center justify-center hover:border-accent-400 hover:text-accent-600 transition">+</button>
        </div>
      );
    }
  } else if (entry.status === "waiting") {
    detail = entry.waitingDate
      ? `⏳ ${new Date(entry.waitingDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`
      : "⏳ TBD";
  } else if (entry.status === "done") {
    const r = entry.rating;
    detail = r ? (
      <div className="flex gap-0.5 items-center">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className={`w-2 h-2 rounded-sm ${i < r ? "bg-accent-500 dark:bg-accent-400" : "bg-brand-200 dark:bg-brand-700"}`} />
        ))}
        <span className="text-[10px] text-accent-600 dark:text-accent-300 ml-1">{r}/10</span>
      </div>
    ) : null;
  }

  return (
    <div onClick={onTap}
      className={`flex items-center gap-2 rounded-xl border shadow-sm px-3 py-2 cursor-pointer hover:border-accent-300 dark:hover:border-accent-500 transition ${style ? `${style.border} ${style.bg}` : "border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800"}`}>
      {entry.imageBase64 && (
        <img src={entry.imageBase64} alt="" className="w-8 h-10 object-cover rounded flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-brand-800 dark:text-brand-100 truncate">{entry.name}</p>
        {typeof detail === "string" ? (
          <p className="text-[10px] text-brand-500 dark:text-brand-400 truncate mt-0.5">{detail}</p>
        ) : detail ? (
          <div className="mt-0.5">{detail}</div>
        ) : null}
      </div>
      <button onClick={e => { e.stopPropagation(); onEdit(entry); }}
        className="text-[10px] text-accent-500 dark:text-accent-300 flex-shrink-0">Edit</button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

function Hobbies() {
  const uid = auth.currentUser?.uid;
  const [categories, setCategories]     = useState([]);
  const [entries, setEntries]           = useState([]);
  const [tab, setTab]                   = useState("list");
  const [filterCat, setFilterCat]       = useState("");
  const [addingStatus, setAddingStatus] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [collapsed, setCollapsed]       = useState({ want: false, current: false, waiting: false, done: false });
  const [showCatForm, setShowCatForm]   = useState(false);
  const [editingCat, setEditingCat]     = useState(null);
  const [detailEntry, setDetailEntry]   = useState(null); // for full detail modal
  const [compactView, setCompactView]   = useState({ want: false, current: false, waiting: false, done: false });
  const [globalSort, setGlobalSort]     = useState("dateAdded_desc");
  const [globalCompact, setGlobalCompact] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const u1 = listenToHobbyCategories(uid, setCategories);
    const u2 = listenToHobbyEntries(uid, setEntries);
    return () => { u1(); u2(); };
  }, [uid]);

  const sortEntries = (list, sort) => {
    const sorted = [...list];
    const [key, dir] = sort.split("_");
    const asc = dir === "asc";
    sorted.sort((a, b) => {
      let av, bv;
      if (key === "dateAdded") {
        av = a.createdAt?.toMillis?.() ?? 0;
        bv = b.createdAt?.toMillis?.() ?? 0;
      } else if (key === "updated") {
        av = a.updatedAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
        bv = b.updatedAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
      } else if (key === "name") {
        av = (a.name || "").toLowerCase();
        bv = (b.name || "").toLowerCase();
        return asc ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return asc ? av - bv : bv - av;
    });
    return sorted;
  };

  const byStatus = useMemo(() => ({
    want:    entries.filter(e => e.status === "want"),
    current: entries.filter(e => e.status === "current"),
    waiting: entries.filter(e => e.status === "waiting"),
    done:    entries.filter(e => e.status === "done"),
  }), [entries]);

  const filterEntries = (list) => filterCat ? list.filter(e => e.categoryId === filterCat) : list;

  const handleDelete = async (id) => { if (confirm("Delete this entry?")) await deleteHobbyEntry(id); };
  const handleDeleteCat = async (cat) => {
    const n = entries.filter(e => e.categoryId === cat.id).length;
    if (!confirm(`Delete "${cat.name}"${n ? ` and its ${n} entr${n === 1?"y":"ies"}` : ""}?`)) return;
    await Promise.all(entries.filter(e => e.categoryId === cat.id).map(e => deleteHobbyEntry(e.id)));
    await deleteHobbyCategory(cat.id);
  };

  return (
    <PageLayout title="Binging">
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-10">

        <div className="flex items-center gap-2 mb-4">
          <div className="flex gap-1 p-1 rounded-xl bg-brand-100 dark:bg-brand-800">
            {[["list","📋 List"],["categories","🏷️ Categories"]].map(([id,label]) => (
              <button key={id} onClick={() => setTab(id)}
                className={`px-3 py-1.5 text-xs rounded-lg transition font-medium ${tab === id ? "bg-white dark:bg-brand-700 text-brand-700 dark:text-brand-100 shadow-sm" : "text-brand-400 dark:text-brand-500"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ── CATEGORIES ── */}
        {tab === "categories" && (
          <div className="space-y-4">
            {(showCatForm || editingCat) && (
              <CategoryForm uid={uid} existing={editingCat}
                onDone={() => { setShowCatForm(false); setEditingCat(null); }}
                onCancel={() => { setShowCatForm(false); setEditingCat(null); }} />
            )}
            {!showCatForm && !editingCat && (
              <button onClick={() => setShowCatForm(true)}
                className="w-full py-3 rounded-2xl border-2 shadow-sm border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
                + New category
              </button>
            )}
            {categories.length === 0 && !showCatForm && (
              <p className="text-center text-sm text-brand-300 dark:text-brand-500 italic py-8">No categories yet.</p>
            )}
            {categories.map(cat => {
              const style = getCategoryStyle(cat.color);
              const metrics = TRACK_METRICS.filter(m => cat.metrics?.includes(m.id));
              const count = entries.filter(e => e.categoryId === cat.id).length;
              return (
                <div key={cat.id} className={`rounded-2xl border-2 shadow-sm ${style.border} ${style.bg} p-4`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${style.dot}`} />
                      <p className={`text-sm font-semibold ${style.text}`}>{cat.name}</p>
                      <span className="text-[10px] text-brand-400">{count} entr{count !== 1 ? "ies" : "y"}</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingCat(cat)} className="text-xs text-accent-500 dark:text-accent-300">Edit</button>
                      <button onClick={() => handleDeleteCat(cat)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {metrics.map(m => (
                      <span key={m.id} className={`text-[10px] px-2 py-0.5 rounded-full ${style.badge}`}>{m.label}</span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── LIST ── */}
        {tab === "list" && (
          <div>
            {(addingStatus || editingEntry) && (
              <div className="mb-4">
                <EntryForm uid={uid} categories={categories}
                  existing={editingEntry} defaultStatus={addingStatus}
                  onDone={() => { setAddingStatus(null); setEditingEntry(null); }}
                  onCancel={() => { setAddingStatus(null); setEditingEntry(null); }} />
              </div>
            )}

            {categories.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-brand-300 dark:text-brand-500 italic mb-3">Create a category first.</p>
                <button onClick={() => setTab("categories")} className="text-xs text-accent-500 dark:text-accent-300 underline">Go to Categories</button>
              </div>
            ) : (
              <>
                {/* Global sort + view controls */}
                <div className="flex items-center gap-2 mb-3">
                  <select value={globalSort} onChange={e => { setGlobalSort(e.target.value); if (useGlobal) setSortBy({ want: e.target.value, current: e.target.value, waiting: e.target.value, done: e.target.value }); }}
                    className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-600 dark:text-brand-300 px-2 py-1.5 text-xs focus:outline-none appearance-none">
                    <option value="dateAdded_desc">Newest first</option>
                    <option value="dateAdded_asc">Oldest first</option>
                    <option value="updated_desc">Recently updated</option>
                    <option value="updated_asc">Least updated</option>
                    <option value="name_asc">Name A→Z</option>
                    <option value="name_desc">Name Z→A</option>
                  </select>
                  <button onClick={() => {
                    const next = !globalCompact;
                    setGlobalCompact(next);
                    setCompactView({ want: next, current: next, waiting: next, done: next });
                  }}
                    className={`px-3 py-1.5 rounded-lg border-2 text-xs font-medium transition flex-shrink-0 ${globalCompact ? "bg-brand-700 dark:bg-accent-600 border-brand-600 dark:border-accent-400 text-white" : "bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-600 text-brand-500 dark:text-brand-400"}`}
                    title={globalCompact ? "Default view" : "Compact view"}>
                    {globalCompact ? "⊞ Compact" : "☰ Default"}
                  </button>
                </div>

                {/* Category filter */}
                <div className="flex gap-2 flex-wrap mb-5">
                  <button onClick={() => setFilterCat("")}
                    className={`px-3 py-1 rounded-full text-xs font-medium border-2 transition ${!filterCat ? "bg-brand-700 dark:bg-accent-600 border-brand-600 dark:border-accent-400 text-white" : "bg-white dark:bg-brand-800 border-brand-200 dark:border-brand-600 text-brand-500 dark:text-brand-400"}`}>
                    All
                  </button>
                  {categories.map(cat => {
                    const style = getCategoryStyle(cat.color);
                    const active = filterCat === cat.id;
                    return (
                      <button key={cat.id} onClick={() => setFilterCat(cat.id)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border-2 transition ${active ? `${style.dot.replace("bg-","bg-")} border-transparent text-white ${style.dot}` : `bg-white dark:bg-brand-800 ${style.border} ${style.text}`}`}>
                        {cat.name}
                      </button>
                    );
                  })}
                </div>

        {/* Detail modal */}
        {detailEntry && (
          <DetailModal
            entry={detailEntry}
            category={categories.find(c => c.id === detailEntry.categoryId)}
            onClose={() => setDetailEntry(null)}
            onEdit={e => { setDetailEntry(null); setEditingEntry(e); setAddingStatus(null); }}
            onMoveStatus={(e, s) => {
              const uid = auth.currentUser?.uid;
              updateHobbyEntry(e.id, { status: s });
              if (uid) {
                const sid = xpId.hobbyDone(e.id);
                if (s === "done") awardXp(uid, "hobby", sid, XP.HOBBY_DONE);
                else if (e.status === "done") revokeXp(uid, sid);
              }
            }}
          />
        )}

        {/* Status columns */}
        <div className="flex flex-col gap-4 md:flex-row md:gap-4">
          {STATUSES.map(status => {
            const filtered = filterEntries(byStatus[status]);
            const activeSortKey = globalSort;
            const sorted = sortEntries(filtered, activeSortKey);
            const isCollapsed = collapsed[status];
            const isCompact = compactView[status];

            return (
              <div key={status} className="flex-1 min-w-0">
                {/* Section header */}
                <div className="flex items-center justify-between mb-2">
                  <button
                    onClick={() => setCollapsed(c => ({ ...c, [status]: !c[status] }))}
                    className="flex items-center gap-1.5 group"
                  >
                    <h3 className="text-xs font-pixel text-brand-700 dark:text-brand-200">{STATUS_LABELS[status].toUpperCase()}</h3>
                    <span className="text-[10px] text-brand-400">({filtered.length})</span>
                    <span className="text-[10px] text-brand-400 group-hover:text-brand-600 transition">{isCollapsed ? "▶" : "▼"}</span>
                  </button>
                  {!isCollapsed && (
                    <button onClick={() => { setAddingStatus(status); setEditingEntry(null); }}
                      className="text-xs text-accent-500 dark:text-accent-300 font-medium">+ Add</button>
                  )}
                </div>

                {!isCollapsed && (
                  <div className="space-y-2">
                    {sorted.map(entry => (
                      isCompact ? (
                        <CompactCard key={entry.id} entry={entry}
                          category={categories.find(c => c.id === entry.categoryId)}
                          onEdit={e => { setEditingEntry(e); setAddingStatus(null); }}
                          onTap={() => setDetailEntry(entry)}
                          onMoveStatus={(e, s) => {
                            const uid = auth.currentUser?.uid;
                            updateHobbyEntry(e.id, { status: s });
                            if (uid) {
                              const sid = xpId.hobbyDone(e.id);
                              if (s === "done") awardXp(uid, "hobby", sid, XP.HOBBY_DONE);
                              else if (e.status === "done") revokeXp(uid, sid);
                            }
                          }} />
                      ) : (
                        <EntryCard key={entry.id} entry={entry}
                          category={categories.find(c => c.id === entry.categoryId)}
                          onEdit={e => { setEditingEntry(e); setAddingStatus(null); }}
                          onDelete={handleDelete}
                          onTap={() => setDetailEntry(entry)}
                          onMoveStatus={(e, s) => {
                            const uid = auth.currentUser?.uid;
                            updateHobbyEntry(e.id, { status: s });
                            if (uid) {
                              const sid = xpId.hobbyDone(e.id);
                              if (s === "done") awardXp(uid, "hobby", sid, XP.HOBBY_DONE);
                              else if (e.status === "done") revokeXp(uid, sid);
                            }
                          }} />
                      )
                    ))}
                    {filtered.length === 0 && (
                      <div className="rounded-xl border-2 border-dashed border-brand-200 dark:border-brand-700 p-4 text-center">
                        <p className="text-xs text-brand-300 dark:text-brand-600 italic">Nothing here</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
              </>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default Hobbies;
