import {
  collection, deleteDoc, doc, query,
  where, onSnapshot, getDocs, serverTimestamp, setDoc,
} from "firebase/firestore";
import { db } from "../firebase";

// ── XP values ─────────────────────────────────────────────────────────
export const XP = {
  REMINDER_DONE:    +50,
  CHORE_DONE:       +40,
  PROJECT_TODO:     +30,
  DAILY_LOG:        +25,
  HABIT_DONE:       +20,
  HOBBY_DONE:       +15,
  HABIT_FAILED:     -10,
  REMINDER_OVERDUE: -20,
  EVENT_CANCELLED:  -15,
  ADDICTION_PRESS:  -25,
};

// ── Ledger CRUD ───────────────────────────────────────────────────────
// xpLedger: { uid, source, sourceId, amount, createdAt }
// We use the sourceId as the Firestore document ID — this makes writes
// fully idempotent (setDoc with merge:false just overwrites the same doc).

function ledgerDocId(uid, sourceId) {
  // Firestore doc IDs can't contain slashes — replace with dashes
  return `${uid}_${sourceId}`.replace(/\//g, "-");
}

export async function awardXp(uid, source, sourceId, amount) {
  const id = ledgerDocId(uid, sourceId);
  return setDoc(doc(db, "xpLedger", id), {
    uid, source, sourceId, amount, createdAt: serverTimestamp(),
  });
}

export async function revokeXp(uid, sourceId) {
  const id = ledgerDocId(uid, sourceId);
  try { await deleteDoc(doc(db, "xpLedger", id)); } catch {}
}

export function listenToXpLedger(uid, callback) {
  const q = query(collection(db, "xpLedger"), where("uid", "==", uid));
  return onSnapshot(q, snap => {
    const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const total = entries.reduce((sum, e) => sum + (e.amount || 0), 0);
    callback({ total, entries });
  });
}

// ── Source ID builders ────────────────────────────────────────────────
export const xpId = {
  reminder:    (id)                   => `reminder-done-${id}`,
  chore:       (id, date)             => `chore-done-${id}-${date}`,
  projectTodo: (id)                   => `project-todo-${id}`,
  dailyLog:    (date)                 => `daily-log-${date}`,
  habitDone:   (habitId, date)        => `habit-done-${habitId}-${date}`,
  habitFailed: (habitId, date)        => `habit-failed-${habitId}-${date}`,
  hobbyDone:   (hobbyId)              => `hobby-done-${hobbyId}`,
  addiction:   (trackerId, date, n)   => `addiction-${trackerId}-${date}-${n}`,
};
