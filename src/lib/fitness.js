import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ── Metric definitions ────────────────────────────────────────────────

export const ALL_METRICS = [
  { id: "sets",     label: "Sets",      unit: "",      type: "number",  placeholder: "3" },
  { id: "reps",     label: "Reps",      unit: "",      type: "number",  placeholder: "10" },
  { id: "weight",   label: "Weight",    unit: "kg",    type: "decimal", placeholder: "60" },
  { id: "time",     label: "Time",      unit: "min",   type: "decimal", placeholder: "30" },
  { id: "distance", label: "Distance",  unit: "km",    type: "decimal", placeholder: "5" },
  { id: "pace",     label: "Pace",      unit: "min/km",type: "text",    placeholder: "5:30" },
  { id: "calories", label: "Calories",  unit: "kcal",  type: "number",  placeholder: "300" },
];

export function getMetric(id) {
  return ALL_METRICS.find(m => m.id === id);
}

export const CATEGORY_COLORS = [
  { id: "violet", dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-900/20", border: "border-violet-300 dark:border-violet-700", text: "text-violet-700 dark:text-violet-300" },
  { id: "blue",   dot: "bg-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20",     border: "border-blue-300 dark:border-blue-700",     text: "text-blue-700 dark:text-blue-300" },
  { id: "emerald",dot: "bg-emerald-500",bg: "bg-emerald-50 dark:bg-emerald-900/20",border: "border-emerald-300 dark:border-emerald-700",text: "text-emerald-700 dark:text-emerald-300" },
  { id: "red",    dot: "bg-red-500",    bg: "bg-red-50 dark:bg-red-900/20",       border: "border-red-300 dark:border-red-700",       text: "text-red-700 dark:text-red-300" },
  { id: "amber",  dot: "bg-amber-500",  bg: "bg-amber-50 dark:bg-amber-900/20",   border: "border-amber-300 dark:border-amber-700",   text: "text-amber-700 dark:text-amber-300" },
  { id: "pink",   dot: "bg-pink-500",   bg: "bg-pink-50 dark:bg-pink-900/20",     border: "border-pink-300 dark:border-pink-700",     text: "text-pink-700 dark:text-pink-300" },
  { id: "cyan",   dot: "bg-cyan-500",   bg: "bg-cyan-50 dark:bg-cyan-900/20",     border: "border-cyan-300 dark:border-cyan-700",     text: "text-cyan-700 dark:text-cyan-300" },
];

export function getCategoryStyle(colorId) {
  return CATEGORY_COLORS.find(c => c.id === colorId) || CATEGORY_COLORS[0];
}

// ── Fitness Categories ────────────────────────────────────────────────
// Each category defines WHAT to track (metrics) and TARGETS per session

export function listenToFitnessCategories(uid, callback) {
  const q = query(collection(db, "fitnessCategories"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createFitnessCategory(uid, { name, color, metrics, targets }) {
  return addDoc(collection(db, "fitnessCategories"), {
    uid, name, color,
    metrics,  // ["sets","reps","weight",...] — which metrics to track
    targets,  // { sets: 3, reps: 10, weight: 60, ... } — default targets
    createdAt: serverTimestamp(),
  });
}

export async function updateFitnessCategory(id, changes) {
  return updateDoc(doc(db, "fitnessCategories", id), changes);
}

export async function deleteFitnessCategory(id) {
  return deleteDoc(doc(db, "fitnessCategories", id));
}

// ── Fitness Routines ──────────────────────────────────────────────────
// A routine is a named collection of exercises (category + targets)

export function listenToFitnessRoutines(uid, callback) {
  const q = query(collection(db, "fitnessRoutines"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createFitnessRoutine(uid, { name, exercises }) {
  // exercises: [{ categoryId, targets: { sets, reps, ... }, notes }]
  return addDoc(collection(db, "fitnessRoutines"), { uid, name, exercises, createdAt: serverTimestamp() });
}

export async function updateFitnessRoutine(id, changes) {
  return updateDoc(doc(db, "fitnessRoutines", id), changes);
}

export async function deleteFitnessRoutine(id) {
  return deleteDoc(doc(db, "fitnessRoutines", id));
}

// ── Fitness Logs ──────────────────────────────────────────────────────
// Each log is a workout session. It has one or more exercises logged.

export function listenToFitnessLogs(uid, callback) {
  const q = query(collection(db, "fitnessLogs"), where("uid", "==", uid), orderBy("date", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// exercises: [{ categoryId, actuals: { sets, reps, weight, ... }, notes }]
export async function createFitnessLog(uid, { date, routineId, exercises, notes }) {
  return addDoc(collection(db, "fitnessLogs"), {
    uid, date, routineId: routineId || null, exercises, notes: notes || "",
    createdAt: serverTimestamp(),
  });
}

export async function updateFitnessLog(id, changes) {
  return updateDoc(doc(db, "fitnessLogs", id), changes);
}

export async function deleteFitnessLog(id) {
  return deleteDoc(doc(db, "fitnessLogs", id));
}

// ── Streak calculation ────────────────────────────────────────────────
// Returns current streak (consecutive days with at least one log)

export function calculateWorkoutStreak(logs) {
  if (!logs.length) return 0;
  const dates = [...new Set(logs.map(l => l.date))].sort((a, b) => b.localeCompare(a));
  const today = new Date();
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const todayStr = fmt(today);
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  const yesterdayStr = fmt(yest);

  // Streak must include today or yesterday
  if (dates[0] !== todayStr && dates[0] !== yesterdayStr) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i-1] + "T00:00:00");
    const curr = new Date(dates[i] + "T00:00:00");
    const diff = Math.round((prev - curr) / 86400000);
    if (diff === 1) streak++;
    else break;
  }
  return streak;
}

// Category streak: consecutive days with a log for a specific category
export function calculateCategoryStreak(logs, categoryId) {
  const filtered = logs.filter(l => l.exercises?.some(e => e.categoryId === categoryId));
  return calculateWorkoutStreak(filtered);
}
