import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------------------------------------------------------------
// REMINDERS
// priority: 1 = High, 2 = Medium, 3 = Low
// dueDate:  null (no specific date) | "YYYY-MM-DD" (date-specific)
// completed: bool
// categoryId: null | string (only for date-based reminders)
// ---------------------------------------------------------------------

export function listenToReminders(uid, callback) {
  const q = query(
    collection(db, "reminders"),
    where("uid", "==", uid),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

export async function createReminder(uid, { text, dueDate = null, categoryId = null, priority = 2 }) {
  return addDoc(collection(db, "reminders"), {
    uid,
    text,
    dueDate,       // null or "YYYY-MM-DD"
    categoryId,    // null for undated, optional for dated
    priority,      // 1 | 2 | 3
    completed: false,
    createdAt: serverTimestamp(),
  });
}

export async function updateReminder(id, changes) {
  // Auto-stamp completedAt when marking complete, clear it when unchecking.
  // Use local date (not UTC) so timezone differences don't push the date
  // into the wrong week.
  if (changes.completed === true && !changes.completedAt) {
    const d = new Date();
    const localDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    changes.completedAt = localDate;
  }
  if (changes.completed === false) {
    changes.completedAt = null;
  }
  return updateDoc(doc(db, "reminders", id), changes);
}

// Current week boundaries: Sunday–Saturday (weeks start on Sunday)
// Returns "YYYY-MM-DD" strings using LOCAL date (not UTC).
export function currentWeekBounds() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

  const fmt = (d) =>
    `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

  // Sunday is the first day — go back dayOfWeek days to reach it
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dayOfWeek);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6); // Saturday

  return {
    mondayStr: fmt(weekStart), // actually Sunday — keeping name for backward compat
    sundayStr: fmt(weekEnd),   // actually Saturday — keeping name for backward compat
    todayStr: fmt(today),
  };
}

export async function deleteReminder(id) {
  return deleteDoc(doc(db, "reminders", id));
}

// Sort reminders: priority ascending (1 first), then uncompleted before
// completed, then by createdAt descending.
export function sortReminders(reminders) {
  return [...reminders].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const aTime = a.createdAt?.toMillis?.() ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });
}

// Returns reminders that should show in Today's quick view:
// - Uncompleted undated reminders (always visible)
// - Uncompleted dated reminders whose dueDate falls within the current week
// Completed reminders are always hidden from the quick view.
export function getTodaysReminders(reminders) {
  const { mondayStr, sundayStr } = currentWeekBounds();

  return reminders.filter((r) => {
    if (r.completed) return false; // hide completed from quick view
    if (!r.dueDate) return true;   // undated — always show
    return r.dueDate >= mondayStr && r.dueDate <= sundayStr;
  });
}
