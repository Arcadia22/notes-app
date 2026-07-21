import {
  doc, setDoc, getDoc,
  collection, query, where, onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";

// One doc per user per day: kanjiHistory/{uid}_{date}
// { uid, date, kanji, onyomi, kunyomi, meanings, description, viewedAt }

function localDateStr(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function docId(uid, date) {
  return `${uid}_${date}`;
}

// Mark today's kanji as viewed/saved to history (idempotent — safe to call
// every time the app opens since it's the same kanji for the whole day).
export async function recordKanjiViewed(uid, date, kanjiEntry) {
  return setDoc(doc(db, "kanjiHistory", docId(uid, date)), {
    uid,
    date,
    ...kanjiEntry,
    viewedAt: Date.now(),
  }, { merge: true });
}

export async function getKanjiHistoryForDate(uid, date) {
  const snap = await getDoc(doc(db, "kanjiHistory", docId(uid, date)));
  return snap.exists() ? snap.data() : null;
}

// Listen to all history entries for a given month (for the calendar view)
export function listenToKanjiHistoryInMonth(uid, year, month, callback) {
  const firstDay = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = `${year}-${String(month + 1).padStart(2, "0")}-31`;
  const q = query(
    collection(db, "kanjiHistory"),
    where("uid", "==", uid),
    where("date", ">=", firstDay),
    where("date", "<=", lastDay)
  );
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => d.data())));
}

// Listen to ALL history for this user (for a simple chronological list view)
export function listenToAllKanjiHistory(uid, callback) {
  const q = query(collection(db, "kanjiHistory"), where("uid", "==", uid));
  return onSnapshot(q, (snap) => {
    const all = snap.docs.map((d) => d.data());
    all.sort((a, b) => b.date.localeCompare(a.date));
    callback(all);
  });
}

export { localDateStr };
