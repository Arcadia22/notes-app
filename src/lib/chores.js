import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ── Categories ────────────────────────────────────────────────────────

export function listenToChoreCategories(uid, callback) {
  const q = query(collection(db, "choreCategories"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}
export async function createChoreCategory(uid, name, color = "purple", customHex = null) {
  return addDoc(collection(db, "choreCategories"), { uid, name, color, customHex: customHex || null, createdAt: serverTimestamp() });
}
export async function updateChoreCategory(id, changes) {
  return updateDoc(doc(db, "choreCategories", id), changes);
}
export async function deleteChoreCategory(id) {
  return deleteDoc(doc(db, "choreCategories", id));
}

// ── Chores ────────────────────────────────────────────────────────────
// frequency: "once" | "daily" | "weekly" | "biweekly" | "monthly" | "yearly"
// dayOfWeek: 0-6 (for weekly/biweekly — which day of the week)
// startDate: "YYYY-MM-DD" — anchor date for monthly/yearly/biweekly
// specificDate: "YYYY-MM-DD" — for once, optional due date
// completedAt: null | "YYYY-MM-DD"

export function listenToChores(uid, callback) {
  const q = query(collection(db, "chores"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function createChore(uid, categoryId, { name, details = "", frequency = "weekly", dayOfWeek = null, startDate = null, specificDate = null }) {
  return addDoc(collection(db, "chores"), {
    uid, categoryId, name, details, frequency,
    dayOfWeek,    // 0-6 for weekly/biweekly
    startDate,    // anchor for monthly/yearly/biweekly
    specificDate, // due date for once
    completedAt: null,
    createdAt: serverTimestamp(),
  });
}
export async function updateChore(id, changes) {
  return updateDoc(doc(db, "chores", id), changes);
}
export async function deleteChore(id) {
  return deleteDoc(doc(db, "chores", id));
}

export async function toggleChoreComplete(chore) {
  if (chore.completedAt) {
    return updateDoc(doc(db, "chores", chore.id), { completedAt: null });
  } else {
    const now = new Date();
    const dateStr = localDateStr(now);
    return updateDoc(doc(db, "chores", chore.id), { completedAt: dateStr });
  }
}

// ── Date helpers ──────────────────────────────────────────────────────

export function localDateStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfDay(d = new Date()) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

// Current week Sun–Sat
function weekBounds() {
  const today = startOfDay();
  const sun = new Date(today);
  sun.setDate(today.getDate() - today.getDay());
  const sat = new Date(sun);
  sat.setDate(sun.getDate() + 6);
  return { sun, sat, today };
}

// ── Core due-date logic ───────────────────────────────────────────────
// Returns the next occurrence date of a chore as a Date object,
// or null if it has no upcoming occurrence (once + completed).

export function nextOccurrence(chore) {
  const today = startOfDay();

  switch (chore.frequency) {
    case "once": {
      if (chore.completedAt) return null; // done forever
      if (chore.specificDate) return parseDate(chore.specificDate);
      return today; // no date = due now
    }

    case "daily": {
      const start = parseDate(chore.startDate) || today;
      if (today < start) return start;
      // If completed today, next is tomorrow
      if (chore.completedAt === localDateStr(today)) {
        const next = new Date(today);
        next.setDate(today.getDate() + 1);
        return next;
      }
      return today;
    }

    case "weekly": {
      const dow = chore.dayOfWeek ?? 0; // which day of week
      const start = parseDate(chore.startDate) || today;
      // Find next occurrence of that weekday >= start
      const next = new Date(start < today ? today : start);
      next.setHours(0, 0, 0, 0);
      while (next.getDay() !== dow) next.setDate(next.getDate() + 1);
      // If completed on or after that date, advance to the following week
      if (chore.completedAt) {
        const comp = parseDate(chore.completedAt);
        if (comp >= next) {
          next.setDate(next.getDate() + 7);
        }
      }
      return next;
    }

    case "biweekly": {
      const dow = chore.dayOfWeek ?? 0;
      const start = parseDate(chore.startDate) || today;
      // Find first occurrence >= start on the right weekday
      const anchor = new Date(start);
      anchor.setHours(0, 0, 0, 0);
      while (anchor.getDay() !== dow) anchor.setDate(anchor.getDate() + 1);
      // Advance by 14-day cycles until we reach or pass today
      const candidate = new Date(anchor);
      while (candidate < today) candidate.setDate(candidate.getDate() + 14);
      // If completed on or after candidate, advance one more cycle
      if (chore.completedAt) {
        const comp = parseDate(chore.completedAt);
        if (comp >= candidate) candidate.setDate(candidate.getDate() + 14);
      }
      return candidate;
    }

    case "monthly": {
      const start = parseDate(chore.startDate) || today;
      const dayOfMonth = start.getDate();
      // Find next occurrence >= today
      const candidate = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
      candidate.setHours(0, 0, 0, 0);
      if (candidate < today) candidate.setMonth(candidate.getMonth() + 1);
      // Clamp to valid day (e.g. Feb 30 → Feb 28)
      while (candidate.getDate() !== dayOfMonth) candidate.setDate(candidate.getDate() - 1);
      if (chore.completedAt) {
        const comp = parseDate(chore.completedAt);
        if (comp >= candidate) {
          candidate.setMonth(candidate.getMonth() + 1);
          // Re-clamp
          while (candidate.getDate() !== dayOfMonth && candidate.getDate() !== 1) candidate.setDate(candidate.getDate() - 1);
        }
      }
      return candidate;
    }

    case "yearly": {
      const start = parseDate(chore.startDate) || today;
      const candidate = new Date(today.getFullYear(), start.getMonth(), start.getDate());
      candidate.setHours(0, 0, 0, 0);
      if (candidate < today) candidate.setFullYear(candidate.getFullYear() + 1);
      if (chore.completedAt) {
        const comp = parseDate(chore.completedAt);
        if (comp >= candidate) candidate.setFullYear(candidate.getFullYear() + 1);
      }
      return candidate;
    }

    default: return today;
  }
}

// Is the chore currently due (next occurrence <= today)?
export function isChoreDue(chore) {
  const next = nextOccurrence(chore);
  if (!next) return false;
  return next <= startOfDay();
}

// Get all chores due this week (Sun–Sat), including overdue ones.
// Returns array of { chore, dueDate } sorted by dueDate.
export function getChoresForWeek(chores) {
  const { sun, sat, today } = weekBounds();
  const result = [];
  for (const chore of chores) {
    const next = nextOccurrence(chore);
    if (!next) continue;
    // Include if: due date is within this week OR overdue (before this week, uncompleted)
    if (next <= sat) {
      result.push({ chore, dueDate: next });
    }
  }
  result.sort((a, b) => a.dueDate - b.dueDate);
  return result;
}

export const FREQUENCY_LABELS = {
  once:      "One time",
  daily:     "Daily",
  weekly:    "Weekly",
  biweekly:  "Every 2 weeks",
  monthly:   "Monthly",
  yearly:    "Yearly",
};

export const CATEGORY_COLORS = [
  { id: "purple", label: "Purple", bg: "bg-violet-100 dark:bg-violet-900/30", border: "border-violet-300 dark:border-violet-700", dot: "bg-violet-400", hex: "#a78bfa" },
  { id: "blue",   label: "Blue",   bg: "bg-blue-100 dark:bg-blue-900/30",     border: "border-blue-300 dark:border-blue-700",   dot: "bg-blue-400",   hex: "#60a5fa" },
  { id: "green",  label: "Green",  bg: "bg-emerald-100 dark:bg-emerald-900/30", border: "border-emerald-300 dark:border-emerald-700", dot: "bg-emerald-400", hex: "#34d399" },
  { id: "red",    label: "Red",    bg: "bg-red-100 dark:bg-red-900/30",       border: "border-red-300 dark:border-red-700",     dot: "bg-red-400",    hex: "#f87171" },
  { id: "amber",  label: "Amber",  bg: "bg-amber-100 dark:bg-amber-900/30",   border: "border-amber-300 dark:border-amber-700", dot: "bg-amber-400",  hex: "#fbbf24" },
  { id: "pink",   label: "Pink",   bg: "bg-pink-100 dark:bg-pink-900/30",     border: "border-pink-300 dark:border-pink-700",   dot: "bg-pink-400",   hex: "#f472b6" },
  { id: "sky",    label: "Sky",    bg: "bg-sky-100 dark:bg-sky-900/30",       border: "border-sky-300 dark:border-sky-700",     dot: "bg-sky-400",    hex: "#38bdf8" },
  { id: "orange", label: "Orange", bg: "bg-orange-100 dark:bg-orange-900/30", border: "border-orange-300 dark:border-orange-700", dot: "bg-orange-400", hex: "#fb923c" },
  { id: "teal",   label: "Teal",   bg: "bg-teal-100 dark:bg-teal-900/30",     border: "border-teal-300 dark:border-teal-700",   dot: "bg-teal-400",   hex: "#2dd4bf" },
  { id: "gray",   label: "Gray",   bg: "bg-brand-100 dark:bg-brand-800",      border: "border-brand-300 dark:border-brand-600", dot: "bg-brand-400",  hex: "#a878d8" },
];

export function getCategoryStyle(colorId, customHex) {
  if (colorId === "custom" && customHex) {
    return {
      id: "custom", label: "Custom",
      bg: "", border: "", dot: "",
      hex: customHex,
      customStyle: {
        bg: { backgroundColor: customHex + "22" },
        border: { borderColor: customHex + "88" },
        dot: { backgroundColor: customHex },
      }
    };
  }
  return CATEGORY_COLORS.find((c) => c.id === colorId) || CATEGORY_COLORS[0];
}
