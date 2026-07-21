import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

// ---------------------------------------------------------------------
// BLOCK DEFINITIONS (the reusable library)
// type: "fixed" | "freeform"
// For "fixed" blocks, defaultDayOfWeek/defaultStartTime/defaultEndTime
// are set, since they usually happen at a predictable time.
// For "freeform" blocks, those default fields can be left blank — they
// only get a real day/time once actually placed onto a week.
// ---------------------------------------------------------------------

export function listenToBlockDefinitions(uid, callback) {
  const q = query(collection(db, "routineBlockDefinitions"), where("uid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

export async function createBlockDefinition(uid, data) {
  return addDoc(collection(db, "routineBlockDefinitions"), {
    uid,
    type: "fixed",
    name: "",
    color: "purple",
    defaultDaysOfWeek: [],
    defaultStartTime: null,
    defaultEndTime: null,
    durationMinutes: null, // used by freeform blocks instead of fixed times
    ...data,
  });
}

export async function updateBlockDefinition(blockDefId, changes) {
  return updateDoc(doc(db, "routineBlockDefinitions", blockDefId), changes);
}

export async function deleteBlockDefinition(blockDefId) {
  return deleteDoc(doc(db, "routineBlockDefinitions", blockDefId));
}

// ---------------------------------------------------------------------
// DEFAULT WEEK TEMPLATE (one per user — the baseline pattern)
// Stored as a single doc per user, ID = the user's uid, for simple
// get/set without needing a query.
// ---------------------------------------------------------------------

export async function getDefaultWeekTemplate(uid) {
  const ref = doc(db, "defaultWeekTemplates", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { blocks: [] };
  return snap.data();
}

export function listenToDefaultWeekTemplate(uid, callback) {
  const ref = doc(db, "defaultWeekTemplates", uid);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? snap.data() : { blocks: [] });
  });
}

// blocks: [{ id, blockDefId, dayOfWeek (0=Sun..6=Sat), startTime, endTime }]
export async function saveDefaultWeekTemplate(uid, blocks) {
  return setDoc(doc(db, "defaultWeekTemplates", uid), { uid, blocks });
}

// ---------------------------------------------------------------------
// ROUTINE WEEKS (one doc per actual calendar week, keyed by that week's
// Sunday date as the document ID, e.g. "2026-06-21")
// ---------------------------------------------------------------------

export function listenToRoutineWeek(uid, weekStartDateStr, callback) {
  const ref = doc(db, "routineWeeks", `${uid}_${weekStartDateStr}`);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? snap.data() : { weekStartDate: weekStartDateStr, placedBlocks: [] });
  });
}

export async function getRoutineWeek(uid, weekStartDateStr) {
  const ref = doc(db, "routineWeeks", `${uid}_${weekStartDateStr}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { weekStartDate: weekStartDateStr, placedBlocks: [] };
  return snap.data();
}

// placedBlocks: [{ id, blockDefId, dayOfWeek, startTime, endTime, isOneTimeOverride }]
export async function saveRoutineWeek(uid, weekStartDateStr, placedBlocks) {
  return setDoc(doc(db, "routineWeeks", `${uid}_${weekStartDateStr}`), {
    uid,
    weekStartDate: weekStartDateStr,
    placedBlocks,
    // Distinguishes "this week has been explicitly saved" (even if the
    // resulting placedBlocks is empty, e.g. the person removed every
    // fixed block on purpose) from "this week doc doesn't exist yet" —
    // the latter is when we auto-seed from the fixed block library.
    everSaved: true,
  });
}
