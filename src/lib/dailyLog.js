import {
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  query,
  collection,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// Daily logs are stored one-per-day using uid_date as the document ID,
// so reads and writes are always O(1) — no querying needed for a single day.
//
// Schema:
//   uid        string
//   date       "YYYY-MM-DD"
//   mood       1-5  (1=awful, 5=great)
//   energy     1-5  (1=drained, 5=high)
//   highlight  string — best part of the day
//   dislike    string — what you could have done without
//   remember   string — something to keep in mind
//   freeText   string — open journal entry
//   updatedAt  serverTimestamp

function docId(uid, date) {
  return `${uid}_${date}`;
}

// Listen to all logs for a given month (for calendar coloring).
export function listenToLogsInMonth(uid, year, month, callback) {
  // month is 0-indexed
  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-31`; // safe upper bound
  const q = query(
    collection(db, "dailyLogs"),
    where("uid", "==", uid),
    where("date", ">=", firstDay),
    where("date", "<=", lastDay)
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

// Listen to a single day's log (for the entry form).
export function listenToDayLog(uid, date, callback) {
  return onSnapshot(doc(db, "dailyLogs", docId(uid, date)), (snap) =>
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null)
  );
}

// Save (create or overwrite) a day's log.
export async function saveDayLog(uid, date, data) {
  return setDoc(
    doc(db, "dailyLogs", docId(uid, date)),
    { uid, date, ...data, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// Compute a "vibe score" 1-10 from mood and energy for calendar coloring.
// Weighted slightly toward mood since it's more expressive.
export function vibeScore(log) {
  if (!log) return null;
  const m = log.mood || 3;
  const e = log.energy || 3;
  return (m * 0.6 + e * 0.4) * 2; // 1-10 scale
}

// Returns a Tailwind bg class and a text description for the vibe score.
export function vibeStyle(score) {
  if (score === null) return null;
  if (score >= 8.5) return { bg: "bg-orange-300 dark:bg-orange-500", ring: "ring-orange-400", label: "Amazing" };
  if (score >= 7)   return { bg: "bg-lime-200 dark:bg-lime-700", ring: "ring-lime-400", label: "Good" };
  if (score >= 5.5) return { bg: "bg-emerald-100 dark:bg-emerald-800", ring: "ring-emerald-300", label: "Okay" };
  if (score >= 4)   return { bg: "bg-sky-100 dark:bg-sky-900", ring: "ring-sky-300", label: "Meh" };
  if (score >= 2.5) return { bg: "bg-indigo-100 dark:bg-indigo-900", ring: "ring-indigo-300", label: "Low" };
  return { bg: "bg-slate-200 dark:bg-slate-700", ring: "ring-slate-400", label: "Rough" };
}

// Delete a day's log entirely.
export async function deleteDayLog(uid, date) {
  return deleteDoc(doc(db, "dailyLogs", `${uid}_${date}`));
}
