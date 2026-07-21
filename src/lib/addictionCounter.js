import {
  collection, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ── Trackers ──────────────────────────────────────────────────────────
// addictionTrackers: { uid, name, order, createdAt }

export function listenToAddictionTrackers(uid, callback) {
  const q = query(collection(db, "addictionTrackers"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function createAddictionTracker(uid, name) {
  return addDoc(collection(db, "addictionTrackers"), { uid, name, createdAt: serverTimestamp() });
}

export async function updateAddictionTracker(id, changes) {
  return updateDoc(doc(db, "addictionTrackers", id), changes);
}

export async function deleteAddictionTracker(id) {
  return deleteDoc(doc(db, "addictionTrackers", id));
}

// ── Presses ───────────────────────────────────────────────────────────
// addictionPresses: one doc per tracker per day, id = `${trackerId}_${date}`
// { uid, trackerId, date: "YYYY-MM-DD", count }

export function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function pressDocId(trackerId, date) {
  return `${trackerId}_${date}`;
}

export function listenToTrackerPressesInMonth(uid, trackerId, year, month, callback) {
  // month is 0-indexed
  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-31`;
  const q = query(
    collection(db, "addictionPresses"),
    where("uid", "==", uid),
    where("trackerId", "==", trackerId),
    where("date", ">=", firstDay),
    where("date", "<=", lastDay)
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function listenToTrackerPressToday(uid, trackerId, callback) {
  const today = localDateStr();
  return onSnapshot(doc(db, "addictionPresses", pressDocId(trackerId, today)), (snap) =>
    callback(snap.exists() ? snap.data().count : 0)
  );
}

// Increment today's press count by 1 (creates the doc if it doesn't exist)
export async function incrementPress(uid, trackerId) {
  const today = localDateStr();
  const ref = doc(db, "addictionPresses", pressDocId(trackerId, today));
  const snap = await getDoc(ref);
  const currentCount = snap.exists() ? snap.data().count : 0;
  return setDoc(ref, {
    uid, trackerId, date: today, count: currentCount + 1,
  }, { merge: true });
}

// Decrement today's press count by 1 (for accidental taps), floor at 0
export async function decrementPress(uid, trackerId) {
  const today = localDateStr();
  const ref = doc(db, "addictionPresses", pressDocId(trackerId, today));
  const snap = await getDoc(ref);
  const currentCount = snap.exists() ? snap.data().count : 0;
  if (currentCount <= 0) return;
  return setDoc(ref, {
    uid, trackerId, date: today, count: currentCount - 1,
  }, { merge: true });
}
