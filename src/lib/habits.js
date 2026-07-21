import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------------------------------------------------------------
// HABIT DEFINITIONS
// trackDays: "daily" | array of day-of-week numbers (0=Sun..6=Sat)
//   e.g. "daily" for every day, or [1,3,5] for Mon/Wed/Fri only
// ---------------------------------------------------------------------

export function listenToHabits(uid, callback) {
  const q = query(collection(db, "habits"), where("uid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createHabit(uid, data) {
  return addDoc(collection(db, "habits"), {
    uid,
    name: "",
    color: "purple",
    trackDays: "daily", // or e.g. [1,3,5]
    createdAt: toLocalDateStr(new Date()),
    ...data,
  });
}

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function updateHabit(habitId, changes) {
  return updateDoc(doc(db, "habits", habitId), changes);
}

export async function deleteHabit(uid, habitId, entries) {
  // Deletes the habit and every completion entry that belongs to it,
  // so old data doesn't linger orphaned in the database.
  const { writeBatch } = await import("firebase/firestore");
  const batch = writeBatch(db);
  batch.delete(doc(db, "habits", habitId));
  for (const entry of entries) {
    if (entry.habitId === habitId) {
      batch.delete(doc(db, "habitEntries", entry.id));
    }
  }
  await batch.commit();
}

// ---------------------------------------------------------------------
// HABIT ENTRIES (one doc per habit per tracked day)
// Stored as individual docs keyed by habitId + date. `status` is either
// "done" or "failed" — a day with no entry at all means "not yet marked".
// ---------------------------------------------------------------------

export function listenToHabitEntries(uid, callback) {
  const q = query(collection(db, "habitEntries"), where("uid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// dateStr: "YYYY-MM-DD", status: "done" | "failed"
export async function setHabitEntryStatus(uid, habitId, dateStr, status) {
  return addDoc(collection(db, "habitEntries"), { uid, habitId, date: dateStr, status });
}

export async function clearHabitEntry(entryId) {
  return deleteDoc(doc(db, "habitEntries", entryId));
}

// ---------------------------------------------------------------------
// TIMED SESSIONS
// One doc per timed session. assignedDate is the date the session
// "belongs to" (set when started). When ended, we compare duration
// to targetSeconds to determine success or failure for that date.
// ---------------------------------------------------------------------

export function listenToTimedSessions(uid, habitId, callback) {
  const q = query(
    collection(db, "timedSessions"),
    where("uid", "==", uid),
    where("habitId", "==", habitId)
  );
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

export async function startTimedSession(uid, habitId, targetSeconds) {
  const now = new Date();
  return addDoc(collection(db, "timedSessions"), {
    uid,
    habitId,
    targetSeconds,
    startedAt: now.getTime(), // epoch ms — easier to do math with than Firestore Timestamps
    endedAt: null,
    assignedDate: toLocalDateStr(now),
    durationSeconds: null,
    succeeded: null,
  });
}

export async function endTimedSession(sessionId, session) {
  const now = Date.now();
  const durationSeconds = Math.floor((now - session.startedAt) / 1000);
  const succeeded = durationSeconds >= session.targetSeconds;
  await updateDoc(doc(db, "timedSessions", sessionId), {
    endedAt: now,
    durationSeconds,
    succeeded,
  });
  return { durationSeconds, succeeded };
}

export async function deleteTimedSession(sessionId) {
  return deleteDoc(doc(db, "timedSessions", sessionId));
}

// Log a session with manually specified start/end times
export async function logManualSession(uid, habitId, targetSeconds, startMs, endMs) {
  const durationSeconds = Math.floor((endMs - startMs) / 1000);
  const succeeded = durationSeconds >= targetSeconds;
  const assignedDate = toLocalDateStr(new Date(startMs));
  const ref = await addDoc(collection(db, "timedSessions"), {
    uid,
    habitId,
    targetSeconds,
    startedAt: startMs,
    endedAt: endMs,
    assignedDate,
    durationSeconds,
    succeeded,
  });
  return { id: ref.id, succeeded, assignedDate };
}

// Start a session backdated to a specific start time (for "Continue from" feature)
export async function startBackdatedSession(uid, habitId, targetSeconds, startMs) {
  const d = new Date(startMs);
  const assignedDate = toLocalDateStr(d);
  return addDoc(collection(db, "timedSessions"), {
    uid,
    habitId,
    targetSeconds,
    startedAt: startMs,
    endedAt: null,
    assignedDate,
    durationSeconds: null,
    succeeded: null,
  });
}
