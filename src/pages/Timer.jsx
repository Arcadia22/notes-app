import { useState, useEffect, useRef, useCallback } from "react";
import PageLayout from "../components/PageLayout";
import { sendNotification, requestNotificationPermission, getNotificationPermission, scheduleNotification, cancelScheduledNotification } from "../lib/notifications";
import { collection, addDoc, updateDoc, deleteDoc, doc, query, where, onSnapshot, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";

// ── Helpers ───────────────────────────────────────────────────────────

function pad(n) { return String(Math.floor(n)).padStart(2, "0"); }

function formatMs(ms, showMs = true) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const centis = Math.floor((ms % 1000) / 10);
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  if (showMs) return `${pad(m)}:${pad(s)}.${pad(centis)}`;
  return `${pad(m)}:${pad(s)}`;
}

// Big pixel-style display digits
function BigDisplay({ text, color }) {
  return (
    <div className={`text-3xl font-pixel tracking-wider tabular-nums ${color || "text-brand-800 dark:text-brand-100"}`}>
      {text}
    </div>
  );
}

// Round control button
function CtrlBtn({ onClick, label, variant = "default", disabled = false }) {
  const base = "w-20 h-20 rounded-full font-pixel text-[10px] tracking-wide flex items-center justify-center transition select-none";
  const styles = {
    default: "bg-brand-100 dark:bg-brand-700 border-2 border-brand-300 dark:border-brand-500 text-brand-700 dark:text-brand-200 hover:bg-brand-200 dark:hover:bg-brand-600 active:scale-95",
    primary: "bg-accent-600 border-2 border-accent-400 text-white hover:bg-accent-500 active:scale-95",
    danger: "bg-red-600 border-2 border-red-400 text-white hover:bg-red-500 active:scale-95",
    success: "bg-emerald-600 border-2 border-emerald-400 text-white hover:bg-emerald-500 active:scale-95",
    ghost: "bg-transparent border-2 border-brand-300 dark:border-brand-600 text-brand-600 dark:text-brand-300 hover:border-brand-500 dark:hover:border-brand-400 active:scale-95",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`${base} ${styles[variant]} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}>
      {label}
    </button>
  );
}

// ── Clock tab ─────────────────────────────────────────────────────────

function ClockTab() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = pad(now.getHours());
  const m = pad(now.getMinutes());
  const s = pad(now.getSeconds());
  const dateLabel = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  // Analog clock
  const sec = now.getSeconds() + now.getMilliseconds() / 1000;
  const min = now.getMinutes() + sec / 60;
  const hr  = (now.getHours() % 12) + min / 60;
  const secDeg = sec * 6;
  const minDeg = min * 6;
  const hrDeg  = hr * 30;

  return (
    <div className="flex flex-col items-center gap-8 py-6">
      {/* Analog clock */}
      <div className="relative w-48 h-48">
        <svg viewBox="0 0 200 200" className="w-full h-full">
          {/* Face */}
          <circle cx="100" cy="100" r="95" className="fill-brand-800 dark:fill-brand-900" stroke="currentColor" strokeWidth="3" strokeOpacity="0.3" />
          {/* Hour ticks */}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i * 30 - 90) * Math.PI / 180;
            const x1 = 100 + 80 * Math.cos(a), y1 = 100 + 80 * Math.sin(a);
            const x2 = 100 + 90 * Math.cos(a), y2 = 100 + 90 * Math.sin(a);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#a78bfa" strokeWidth="3" strokeLinecap="round" />;
          })}
          {/* Hour hand */}
          {(() => { const a = (hrDeg - 90) * Math.PI / 180;
            return <line x1="100" y1="100" x2={100 + 52 * Math.cos(a)} y2={100 + 52 * Math.sin(a)} stroke="#e2d9f3" strokeWidth="5" strokeLinecap="round" />; })()}
          {/* Minute hand */}
          {(() => { const a = (minDeg - 90) * Math.PI / 180;
            return <line x1="100" y1="100" x2={100 + 68 * Math.cos(a)} y2={100 + 68 * Math.sin(a)} stroke="#c4b5fd" strokeWidth="3.5" strokeLinecap="round" />; })()}
          {/* Second hand */}
          {(() => { const a = (secDeg - 90) * Math.PI / 180;
            return <line x1="100" y1="100" x2={100 + 75 * Math.cos(a)} y2={100 + 75 * Math.sin(a)} stroke="#f87171" strokeWidth="2" strokeLinecap="round" />; })()}
          {/* Center dot */}
          <circle cx="100" cy="100" r="4" fill="#f87171" />
        </svg>
      </div>

      {/* Digital time */}
      <div className="text-center">
        <BigDisplay text={`${h}:${m}:${s}`} />
        <p className="text-xs text-brand-400 dark:text-brand-500 mt-2">{dateLabel}</p>
      </div>
    </div>
  );
}

// ── Stopwatch tab ─────────────────────────────────────────────────────

function StopwatchTab() {
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState([]);
  const startRef = useRef(null);
  const baseRef = useRef(0);
  const rafRef = useRef(null);

  const tick = useCallback(() => {
    setElapsed(baseRef.current + (Date.now() - startRef.current));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const start = () => {
    startRef.current = Date.now();
    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
  };

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    baseRef.current = baseRef.current + (Date.now() - startRef.current);
    setRunning(false);
  };

  const reset = () => {
    cancelAnimationFrame(rafRef.current);
    setElapsed(0); setRunning(false); setLaps([]);
    baseRef.current = 0; startRef.current = null;
  };

  const lap = () => {
    setLaps(prev => [...prev, elapsed]);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const lapSplits = laps.map((t, i) => t - (laps[i - 1] ?? 0));
  const bestSplit = lapSplits.length ? Math.min(...lapSplits) : null;
  const worstSplit = lapSplits.length > 1 ? Math.max(...lapSplits) : null;

  return (
    <div className="flex flex-col items-center gap-8 py-6">
      <BigDisplay text={formatMs(elapsed)} />

      <div className="flex gap-6">
        {!running && elapsed === 0 && (
          <CtrlBtn onClick={start} label="START" variant="success" />
        )}
        {running && (
          <>
            <CtrlBtn onClick={lap} label="LAP" variant="ghost" />
            <CtrlBtn onClick={stop} label="STOP" variant="danger" />
          </>
        )}
        {!running && elapsed > 0 && (
          <>
            <CtrlBtn onClick={reset} label="RESET" variant="ghost" />
            <CtrlBtn onClick={start} label="RESUME" variant="success" />
          </>
        )}
      </div>

      {laps.length > 0 && (
        <div className="w-full max-w-xs space-y-1 max-h-48 overflow-y-auto">
          {[...laps].reverse().map((t, i) => {
            const realIdx = laps.length - 1 - i;
            const split = lapSplits[realIdx];
            const isBest = split === bestSplit && lapSplits.length > 1;
            const isWorst = split === worstSplit && lapSplits.length > 1;
            return (
              <div key={realIdx} className="flex justify-between items-center px-3 py-1.5 rounded-lg bg-brand-800/50 text-xs">
                <span className="text-brand-400">Lap {realIdx + 1}</span>
                <span className={`font-pixel ${isBest ? "text-emerald-400" : isWorst ? "text-red-400" : "text-brand-700 dark:text-brand-200"}`}>
                  {formatMs(split)}
                </span>
                <span className="text-brand-500">{formatMs(t)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Countdown tab — multiple persistent countdowns with date targets ───

const COUNTDOWN_COLORS = [
  { label: "Purple", ring: "#a78bfa", text: "text-accent-600 dark:text-accent-200" },
  { label: "Blue",   ring: "#60a5fa", text: "text-blue-500 dark:text-blue-300" },
  { label: "Green",  ring: "#34d399", text: "text-emerald-500 dark:text-emerald-300" },
  { label: "Pink",   ring: "#f472b6", text: "text-pink-500 dark:text-pink-300" },
  { label: "Orange", ring: "#fb923c", text: "text-orange-500 dark:text-orange-300" },
  { label: "Red",    ring: "#f87171", text: "text-red-500 dark:text-red-400" },
  { label: "Gold",   ring: "#fbbf24", text: "text-amber-500 dark:text-amber-300" },
  { label: "White",  ring: "#e2e8f0", text: "text-slate-300 dark:text-slate-200" },
];

function formatCountdownRemaining(targetDateMs) {
  const diff = targetDateMs - Date.now();
  if (diff <= 0) return { expired: true, display: "00d 00h 00m 00s" };
  const totalS = Math.floor(diff / 1000);
  const d = Math.floor(totalS / 86400);
  const h = Math.floor((totalS % 86400) / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  return {
    expired: false,
    days: d, hours: h, minutes: m, seconds: s,
    display: `${String(d).padStart(2,"0")}d ${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`
  };
}

function CountdownCard({ cd, onDelete }) {
  const [remaining, setRemaining] = useState(() => formatCountdownRemaining(cd.targetMs));

  useEffect(() => {
    if (remaining.expired) return;
    const interval = setInterval(() => {
      const r = formatCountdownRemaining(cd.targetMs);
      setRemaining(r);
      // Fire notification when it hits zero
      if (r.expired) {
        sendNotification(`⏳ ${cd.name || "Countdown"}`, `Your countdown "${cd.name || ""}" has reached its date!`);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [cd.targetMs]);

  const color = COUNTDOWN_COLORS[cd.colorIdx || 0];
  const targetDate = new Date(cd.targetMs);
  const dateLabel = targetDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const timeLabel = targetDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="rounded-2xl border-2 border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 shadow-sm overflow-hidden">
      {/* Image banner */}
      {cd.imageBase64 && (
        <div className="w-full h-28 overflow-hidden">
          <img src={cd.imageBase64} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <p className="text-sm font-semibold text-brand-800 dark:text-brand-100">{cd.name || "Countdown"}</p>
            <p className="text-[10px] text-brand-400 dark:text-brand-500 mt-0.5">{dateLabel} · {timeLabel}</p>
          </div>
          <button onClick={() => onDelete(cd.id)} className="text-brand-300 hover:text-red-400 text-lg leading-none flex-shrink-0">×</button>
        </div>

        {remaining.expired ? (
          <p className="text-center font-pixel text-sm text-red-500 dark:text-red-400 py-2">TIME'S UP!</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 text-center">
            {[["DAYS", remaining.days], ["HRS", remaining.hours], ["MIN", remaining.minutes], ["SEC", remaining.seconds]].map(([unit, val]) => (
              <div key={unit} className="rounded-xl py-2 px-1" style={{ backgroundColor: color.ring + "22" }}>
                <p className="text-xl font-pixel font-bold" style={{ color: color.ring }}>
                  {String(val).padStart(2, "0")}
                </p>
                <p className="text-[8px] font-pixel text-brand-400 dark:text-brand-500 mt-0.5">{unit}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AddCountdownForm({ uid, onDone }) {
  const [name, setName] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [targetTime, setTargetTime] = useState("00:00");
  const [colorIdx, setColorIdx] = useState(0);
  const [imageBase64, setImageBase64] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef(null);

  const handleImagePick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImageBase64(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const save = async () => {
    if (!targetDate) return;
    setSaving(true);
    try {
      const dt = new Date(`${targetDate}T${targetTime || "00:00"}`);
      await addDoc(collection(db, "countdowns"), {
        uid, name: name.trim() || "Countdown",
        targetMs: dt.getTime(),
        colorIdx, imageBase64: imageBase64 || null,
        createdAt: serverTimestamp(),
      });
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-2xl border-2 border-accent-300 dark:border-accent-600 bg-white dark:bg-brand-800 shadow-sm p-4 space-y-3">
      <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500">NEW COUNTDOWN</p>

      <input value={name} onChange={e => setName(e.target.value)} placeholder="Name (e.g. Birthday, Trip)"
        className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1">Date</label>
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)}
            className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
        </div>
        <div className="w-28">
          <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1">Time</label>
          <input type="time" value={targetTime} onChange={e => setTargetTime(e.target.value)}
            className="w-full rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-900 text-brand-800 dark:text-brand-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
        </div>
      </div>

      {/* Color */}
      <div>
        <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1.5">Color</label>
        <div className="flex flex-wrap gap-2">
          {COUNTDOWN_COLORS.map((c, i) => (
            <button key={c.label} onClick={() => setColorIdx(i)}
              className={`w-7 h-7 rounded-full border-2 transition ${colorIdx === i ? "border-white scale-110 shadow-lg" : "border-transparent"}`}
              style={{ backgroundColor: c.ring }} title={c.label} />
          ))}
        </div>
      </div>

      {/* Image */}
      <div>
        <label className="block text-[10px] text-brand-400 dark:text-brand-500 mb-1.5">Image (optional)</label>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
        {imageBase64 ? (
          <div className="relative w-full h-24 rounded-xl overflow-hidden border-2 border-brand-200 dark:border-brand-600">
            <img src={imageBase64} alt="" className="w-full h-full object-cover" />
            <button onClick={() => setImageBase64(null)}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 text-white text-sm flex items-center justify-center">×</button>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()}
            className="w-full py-2.5 rounded-xl border-2 border-dashed border-brand-300 dark:border-brand-600 text-brand-400 dark:text-brand-500 text-sm hover:border-accent-400 transition">
            + Add image
          </button>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={saving || !targetDate}
          className="flex-1 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50">
          {saving ? "Saving…" : "Create"}
        </button>
        <button onClick={onDone} className="px-4 py-2 text-sm text-brand-400">Cancel</button>
      </div>
    </div>
  );
}

function CountdownTab() {
  const uid = auth.currentUser?.uid;
  const [countdowns, setCountdowns] = useState([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, "countdowns"), where("uid", "==", uid));
    return onSnapshot(q, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => (a.targetMs || 0) - (b.targetMs || 0));
      setCountdowns(items);
    });
  }, [uid]);

  const deleteCountdown = async (id) => {
    if (!confirm("Delete this countdown?")) return;
    await deleteDoc(doc(db, "countdowns", id));
  };

  return (
    <div className="space-y-4 py-4">
      {!adding && (
        <button onClick={() => setAdding(true)}
          className="w-full py-3 rounded-2xl border-2 border-dashed border-accent-300 dark:border-accent-600 text-accent-600 dark:text-accent-300 text-sm font-medium hover:bg-accent-50 dark:hover:bg-accent-900/20 transition">
          + New countdown
        </button>
      )}

      {adding && (
        <AddCountdownForm uid={uid} onDone={() => setAdding(false)} />
      )}

      {countdowns.length === 0 && !adding && (
        <p className="text-center text-sm text-brand-300 dark:text-brand-500 italic py-8">
          No countdowns yet. Add one to track an upcoming date!
        </p>
      )}

      {countdowns.map(cd => (
        <CountdownCard key={cd.id} cd={cd} onDelete={deleteCountdown} />
      ))}
    </div>
  );
}


// ── Timer tab (preset + custom + saved) ───────────────────────────────

const PRESETS = [
  { label: "1 min", s: 60 },
  { label: "3 min", s: 180 },
  { label: "5 min", s: 300 },
];

function TimerTab() {
  const [targetMs, setTargetMs] = useState(300000);
  const [remaining, setRemaining] = useState(300000);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customH, setCustomH] = useState("0");
  const [customM, setCustomM] = useState("5");
  const [customS, setCustomS] = useState("0");
  const [savedTimers, setSavedTimers] = useState([]);
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const endRef = useRef(null);
  const rafRef = useRef(null);

  // Load saved timers from localStorage (simple, no Firestore needed)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("saved-timers");
      if (raw) setSavedTimers(JSON.parse(raw));
    } catch {}
  }, []);

  const persistTimers = (timers) => {
    setSavedTimers(timers);
    localStorage.setItem("saved-timers", JSON.stringify(timers));
  };

  const saveTimer = () => {
    if (!saveName.trim()) return;
    const entry = { id: Date.now(), name: saveName.trim(), ms: targetMs };
    persistTimers([...savedTimers, entry]);
    setSaveName(""); setShowSave(false);
  };

  const deleteSaved = (id) => persistTimers(savedTimers.filter(t => t.id !== id));

  const tick = useCallback(() => {
    const left = endRef.current - Date.now();
    if (left <= 0) {
      setRemaining(0); setRunning(false); setFinished(true);
      return;
    }
    setRemaining(left);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const pickPreset = (ms) => {
    cancelAnimationFrame(rafRef.current);
    setTargetMs(ms); setRemaining(ms);
    setRunning(false); setFinished(false); setShowCustom(false);
  };

  const applyCustom = () => {
    const ms = (Number(customH) * 3600 + Number(customM) * 60 + Number(customS)) * 1000;
    if (ms <= 0) return;
    cancelAnimationFrame(rafRef.current);
    setTargetMs(ms); setRemaining(ms);
    setRunning(false); setFinished(false); setShowCustom(false);
  };

  const start = () => {
    endRef.current = Date.now() + remaining;
    scheduleNotification("timer", "⏰ Timer done!", "Your timer has finished.", endRef.current);
    setRunning(true); setFinished(false);
    rafRef.current = requestAnimationFrame(tick);
  };

  const pause = () => {
    cancelAnimationFrame(rafRef.current);
    cancelScheduledNotification("timer");
    setRunning(false);
  };

  const reset = () => {
    cancelAnimationFrame(rafRef.current);
    cancelScheduledNotification("timer");
    setRemaining(targetMs); setRunning(false); setFinished(false);
  };

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const isCustomSelected = !PRESETS.some(p => p.s * 1000 === targetMs);

  const numField = (val, set, max) => (
    <div className="flex flex-col items-center">
      <button onClick={() => set(v => String(Math.min(max, Number(v) + 1)))} className="text-brand-400 hover:text-accent-500 text-xl px-3 py-1">▲</button>
      <input type="number" value={val} min="0" max={max}
        onChange={e => set(String(Math.max(0, Math.min(max, Number(e.target.value)))))}
        className="w-14 text-center text-2xl font-pixel bg-transparent text-brand-800 dark:text-brand-100 border-b-2 border-brand-300 dark:border-brand-600 focus:outline-none focus:border-accent-500" />
      <button onClick={() => set(v => String(Math.max(0, Number(v) - 1)))} className="text-brand-400 hover:text-accent-500 text-xl px-3 py-1">▼</button>
    </div>
  );

  const formatSavedMs = (ms) => {
    const totalS = Math.floor(ms / 1000);
    const h = Math.floor(totalS / 3600);
    const m = Math.floor((totalS % 3600) / 60);
    const s = totalS % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0 && s > 0) return `${m}m ${s}s`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  };

  return (
    <div className="flex flex-col items-center gap-6 py-6 w-full max-w-sm mx-auto">
      {/* Presets + custom */}
      <div className="flex flex-wrap justify-center gap-2">
        {PRESETS.map(p => (
          <button key={p.s} onClick={() => pickPreset(p.s * 1000)}
            className={`px-4 py-2 rounded-xl text-xs font-pixel border-2 transition ${
              targetMs === p.s * 1000 && !showCustom
                ? "bg-brand-700 dark:bg-accent-600 border-brand-600 dark:border-accent-400 text-white"
                : "bg-white dark:bg-brand-800 border-brand-300 dark:border-brand-600 text-brand-600 dark:text-brand-300 hover:border-accent-400"
            }`}>
            {p.label}
          </button>
        ))}
        <button onClick={() => setShowCustom(s => !s)}
          className={`px-4 py-2 rounded-xl text-xs font-pixel border-2 transition ${
            showCustom || isCustomSelected
              ? "bg-brand-700 dark:bg-accent-600 border-brand-600 dark:border-accent-400 text-white"
              : "bg-white dark:bg-brand-800 border-brand-300 dark:border-brand-600 text-brand-600 dark:text-brand-300 hover:border-accent-400"
          }`}>
          Custom
        </button>
      </div>

      {/* Custom picker */}
      {showCustom && (
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            {numField(customH, setCustomH, 99)}
            <span className="text-2xl font-pixel text-brand-400 pb-1">:</span>
            {numField(customM, setCustomM, 59)}
            <span className="text-2xl font-pixel text-brand-400 pb-1">:</span>
            {numField(customS, setCustomS, 59)}
          </div>
          <div className="flex gap-8 text-[10px] text-brand-400 dark:text-brand-500 font-pixel">
            <span>HR</span><span>MIN</span><span>SEC</span>
          </div>
          <button onClick={applyCustom}
            className="px-4 py-1.5 rounded-lg bg-accent-600 border-2 border-accent-400 text-white text-xs font-pixel hover:bg-accent-500 transition">
            Set
          </button>
        </div>
      )}

      {/* Timer display */}
      <div className="py-4 text-center">
        <BigDisplay
          text={formatMs(remaining, false)}
          color={finished ? "text-red-500 dark:text-red-400" : "text-accent-600 dark:text-accent-200"}
        />
        {finished && <p className="text-xs text-red-500 dark:text-red-400 font-pixel mt-2">TIME'S UP</p>}
      </div>

      {/* Controls */}
      <div className="flex gap-4 items-center">
        <CtrlBtn onClick={reset} label="RESET" variant="ghost" />
        {!finished && (running
          ? <CtrlBtn onClick={pause} label="PAUSE" variant="danger" />
          : <CtrlBtn onClick={start} label="START" variant="success" />
        )}
        {/* Save button */}
        <button onClick={() => setShowSave(s => !s)}
          className="text-xs font-pixel text-accent-500 dark:text-accent-300 hover:underline">
          💾 Save
        </button>
      </div>

      {/* Save form */}
      {showSave && (
        <div className="flex gap-2 w-full">
          <input value={saveName} onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveTimer()}
            placeholder="Timer name"
            className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400" />
          <button onClick={saveTimer} disabled={!saveName.trim()}
            className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg disabled:opacity-50">Save</button>
          <button onClick={() => setShowSave(false)} className="text-brand-400 text-sm px-1">✕</button>
        </div>
      )}

      {/* Saved timers */}
      {savedTimers.length > 0 && (
        <div className="w-full space-y-2 pt-2 border-t border-brand-100 dark:border-brand-700">
          <p className="text-[10px] font-pixel text-brand-400 dark:text-brand-500">SAVED TIMERS</p>
          {savedTimers.map(t => (
            <div key={t.id} className="flex items-center gap-2 rounded-xl border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 px-3 py-2">
              <button onClick={() => pickPreset(t.ms)} className="flex-1 text-left">
                <p className="text-sm font-medium text-brand-800 dark:text-brand-100">{t.name}</p>
                <p className="text-[10px] text-brand-400 dark:text-brand-500">{formatSavedMs(t.ms)}</p>
              </button>
              <button onClick={() => deleteSaved(t.id)} className="text-brand-300 hover:text-red-400 text-lg leading-none">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────

const TABS = [
  { id: "clock",     label: "🕐 Clock" },
  { id: "stopwatch", label: "⏱ Stopwatch" },
  { id: "countdown", label: "⏳ Countdown" },
  { id: "timer",     label: "⏰ Timer" },
];

function Clock() {
  const [tab, setTab] = useState("clock");
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermission());

  const askPermission = async () => {
    const result = await requestNotificationPermission();
    setNotifPermission(result);
  };

  return (
    <PageLayout title="Clock">
      <div className="max-w-sm mx-auto px-4 pt-4 pb-10">

        {/* Notification permission banner */}
        {notifPermission !== "granted" && notifPermission !== "unsupported" && (
          <div className="mb-4 rounded-xl border overflow-hidden">
            {notifPermission === "denied" ? (
              <div className="px-3 py-2.5 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                <p className="text-xs text-red-700 dark:text-red-300 font-medium mb-0.5">Notifications blocked</p>
                <p className="text-xs text-red-600 dark:text-red-400">Go to iPhone Settings → {'"'}Chaos Manager{"'"} → Notifications → Allow.</p>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2.5 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700">
                <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">
                  Enable notifications to get alerted when your timer ends.
                </p>
                <button onClick={askPermission}
                  className="flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition">
                  Enable
                </button>
              </div>
            )}
          </div>
        )}
        {/* Test button — only show when granted so you can verify it's working */}
        {notifPermission === "granted" && (
          <div className="mb-4 flex items-center justify-between px-3 py-2 rounded-xl bg-brand-50 dark:bg-brand-800 border border-brand-200 dark:border-brand-700">
            <p className="text-xs text-brand-500 dark:text-brand-400">Notifications on ✓</p>
            <button
              onClick={() => sendNotification("🔔 Test", "Notifications are working!", "test")}
              className="text-xs px-2.5 py-1 rounded-lg bg-brand-200 dark:bg-brand-700 text-brand-700 dark:text-brand-200 hover:bg-brand-300 dark:hover:bg-brand-600 transition">
              Send test
            </button>
          </div>
        )}
        {/* Tab switcher */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-brand-100 dark:bg-brand-800 mb-6">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`text-[10px] py-1.5 rounded-lg transition font-medium leading-tight text-center ${
                tab === t.id
                  ? "bg-white dark:bg-brand-700 text-brand-700 dark:text-brand-100 shadow-sm"
                  : "text-brand-400 dark:text-brand-500"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "clock"     && <ClockTab />}
        {tab === "stopwatch" && <StopwatchTab />}
        {tab === "countdown" && <CountdownTab />}
        {tab === "timer"     && <TimerTab />}
      </div>
    </PageLayout>
  );
}

export default Clock;
