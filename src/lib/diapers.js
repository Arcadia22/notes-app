import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ── Thresholds ────────────────────────────────────────────────────────
// The week starts Sunday (Israeli work week). Diapers get used each day, so
// the minimum needed steps down through the week. We evaluate against the
// CURRENT weekday automatically.
//
// Regular diaper kids (wear diapers, come Fridays):
//   2 diapers per weekday +2 buffer (Sun–Thu), 1 for Friday.
//   Min by day — Sun 13, Mon 11, Tue 9, Wed 7, Thu 5, Fri 3
// Nap-only kids (don't wear diapers, use at nap time, none on Friday):
//   1 diaper per weekday (Sun–Thu), nothing Friday → Friday uses Thursday's rule.
//   Min by day — Sun 5, Mon 4, Tue 3, Wed 2, Thu 1, Fri 1
//
// Flag bands (both apply the same way):
//   red    — total < min
//   yellow — min <= total <= min + 2   (just enough, inclusive both ends)
//   ok     — total > min + 2            (default color)
//
// dayIndex: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat

export const REGULAR_MINS = { 0: 13, 1: 11, 2: 9, 3: 7, 4: 5, 5: 3, 6: 13 };
// Nap-only: Friday (5) mirrors Thursday (1); Saturday falls back to Sunday.
export const NAP_MINS     = { 0: 5,  1: 4,  2: 3, 3: 2, 4: 1, 5: 1, 6: 5 };

export const YELLOW_BAND = 2; // yellow spans min .. min + YELLOW_BAND (inclusive)

// Current weekday index (0=Sun ... 6=Sat).
export function todayIndex(date = new Date()) {
  return date.getDay();
}

// The minimum total diapers a child needs *for the given day*, based on their
// diaper situation.
// - Regular diaper wearers: regular min for that day
// - Non-wearers who use diapers at nap time: nap min for that day
// - Non-wearers who don't nap in diapers: no requirement (not tracked)
export function minForChild(child, dayIndex = todayIndex()) {
  if (child.usesDiapers) return REGULAR_MINS[dayIndex];
  if (child.napDiapers) return NAP_MINS[dayIndex];
  return null;
}

export function totalDiapers(child) {
  return (Number(child.mainDiapers) || 0) + (Number(child.spareDiapers) || 0);
}

// Flag status for a child on a given day:
//   "red"    — total is below the minimum (must inform parents)
//   "yellow" — total is just enough but close (min .. min+2)
//   "ok"     — comfortably above (default color)
//   null     — child has no diaper requirement (don't-wear, no nap diapers)
export function flagStatus(child, dayIndex = todayIndex()) {
  const min = minForChild(child, dayIndex);
  if (min == null) return null;
  const total = totalDiapers(child);
  if (total < min) {
    // Below minimum — but if the drawer holds spares, flag pink instead of red:
    // refill the blue box from the drawer before asking parents for more.
    if (drawerCount(child) > 0) return "pink";
    return "red";
  }
  if (total <= min + YELLOW_BAND) return "yellow";
  return "ok";
}

// Diapers in the secondary drawer (reference pile, not counted in total).
export function drawerCount(child) {
  return Number(child.spareDiapers2) || 0;
}

// True when the child is below minimum AND even pulling in the whole drawer
// still doesn't reach the day's minimum — so you must still ask for more.
export function needsMoreEvenWithDrawer(child, dayIndex = todayIndex()) {
  const min = minForChild(child, dayIndex);
  if (min == null) return false;
  const withDrawer = totalDiapers(child) + drawerCount(child);
  return withDrawer < min;
}

export function isFlagged(child, dayIndex = todayIndex()) {
  const s = flagStatus(child, dayIndex);
  return s === "red" || s === "yellow" || s === "pink";
}

export const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Groups ────────────────────────────────────────────────────────────
// Groups are stored as free-text on each child, but we expose helpers to
// build a sorted, de-duplicated list for filtering/sorting.
export function allGroups(children) {
  const set = new Set();
  for (const c of children) {
    if (c.group && c.group.trim()) set.add(c.group.trim());
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// ── Sorting ───────────────────────────────────────────────────────────
export function sortChildren(children, sortBy) {
  const arr = [...children];
  if (sortBy === "group") {
    arr.sort((a, b) => {
      const g = (a.group || "").localeCompare(b.group || "");
      if (g !== 0) return g;
      return (a.name || "").localeCompare(b.name || "");
    });
  } else {
    // default: by name
    arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }
  return arr;
}

// ── Firestore CRUD ────────────────────────────────────────────────────
// diaperKids document shape:
// {
//   uid,
//   name: string,
//   group: string,
//   gender: "male" | "female" | "",
//   mainDiapers: number,
//   spareDiapers: number,    // primary spare pile — counts toward total
//   spareDiapers2: number,   // secondary spare (other storage) — reference only, not counted
//   usesDiapers: boolean,   // wears diapers normally
//   comesFridays: boolean,  // attends on Fridays
//   napDiapers: boolean,    // only meaningful when usesDiapers === false
//   createdAt, updatedAt
// }

export function listenToDiaperKids(uid, callback) {
  const q = query(collection(db, "diaperKids"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createDiaperKid(uid, data) {
  return addDoc(collection(db, "diaperKids"), {
    uid,
    name: data.name || "",
    group: data.group || "",
    gender: data.gender || "",
    mainDiapers: Number(data.mainDiapers) || 0,
    spareDiapers: Number(data.spareDiapers) || 0,
    spareDiapers2: Number(data.spareDiapers2) || 0,
    usesDiapers: data.usesDiapers ?? true,
    comesFridays: data.comesFridays ?? true,
    napDiapers: data.napDiapers ?? false,
    nextPileReady: data.nextPileReady ?? false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateDiaperKid(id, changes) {
  return updateDoc(doc(db, "diaperKids", id), { ...changes, updatedAt: serverTimestamp() });
}

export async function deleteDiaperKid(id) {
  return deleteDoc(doc(db, "diaperKids", id));
}

// ── Friday Shabbat ────────────────────────────────────────────────────
// shabbatEntries document shape:
// {
//   uid,
//   date: "YYYY-MM-DD",   // the Friday
//   kid1Id: string, kid2Id: string,   // references into diaperKids
//   createdAt
// }

export function listenToShabbatEntries(uid, callback) {
  const q = query(collection(db, "shabbatEntries"), where("uid", "==", uid), orderBy("date", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createShabbatEntry(uid, data) {
  return addDoc(collection(db, "shabbatEntries"), {
    uid,
    date: data.date || "",
    kid1Id: data.kid1Id || "",
    kid2Id: data.kid2Id || "",
    createdAt: serverTimestamp(),
  });
}

export async function updateShabbatEntry(id, changes) {
  return updateDoc(doc(db, "shabbatEntries", id), changes);
}

export async function deleteShabbatEntry(id) {
  return deleteDoc(doc(db, "shabbatEntries", id));
}

// The pool of kids eligible for Friday Shabbat = everyone who comes Fridays.
export function fridayPool(kids) {
  return kids.filter(k => k.comesFridays);
}

// Build a map of kidId -> most recent Shabbat date ("YYYY-MM-DD") or null if never.
export function lastShabbatByKid(entries) {
  const map = {};
  // entries assumed newest-first, but we compute max defensively
  for (const e of entries) {
    for (const kidId of [e.kid1Id, e.kid2Id]) {
      if (!kidId) continue;
      if (!map[kidId] || (e.date && e.date > map[kidId])) map[kidId] = e.date || map[kidId];
    }
  }
  return map;
}

// Coloring for a kid, given the last-Shabbat map, across the eligible pool:
//   "none"   — never been (default color)
//   "red"    — has been, but some pool kids have NEVER been
//   "yellow" — has been, and everyone who's been went at least as recently
//              (i.e. others were before them / longer ago exist)
// We compute relative to the whole eligible pool.
export function shabbatColor(kidId, lastMap, pool) {
  const mine = lastMap[kidId];
  if (!mine) return "none"; // never been → default
  // Someone in the pool has never been?
  const anyNever = pool.some(k => !lastMap[k.id]);
  if (anyNever) return "red";
  // Everyone has been at least once. If anyone went longer ago than me, I'm lower
  // priority → yellow. (If I'm the oldest, I'd be default/none-like, but since
  // I've been, we still mark yellow to show I'm not a fresh pick.)
  return "yellow";
}

// Suggestions: rank the eligible pool by priority.
// Priority: never-been first; then longest-time-since-last (oldest date first).
// Soft preferences applied when picking a *pair*: prefer different groups and
// mixed gender, but never hard-exclude.
export function shabbatPriorityList(kids, entries) {
  const pool = fridayPool(kids);
  const lastMap = lastShabbatByKid(entries);
  return [...pool].sort((a, b) => {
    const la = lastMap[a.id], lb = lastMap[b.id];
    if (!la && !lb) return (a.name || "").localeCompare(b.name || "");
    if (!la) return -1; // a never been → higher priority
    if (!lb) return 1;
    if (la !== lb) return la < lb ? -1 : 1; // older date = higher priority
    return (a.name || "").localeCompare(b.name || "");
  });
}

// Suggest a best pair from the priority list, applying soft preferences.
export function suggestShabbatPair(kids, entries) {
  const ranked = shabbatPriorityList(kids, entries);
  if (ranked.length < 2) return ranked.slice(0, ranked.length);
  const first = ranked[0];
  // Find the best partner: highest priority that differs in group AND gender if
  // possible; fall back to different group; fall back to next in line.
  const rest = ranked.slice(1);
  const diffBoth = rest.find(k => k.group !== first.group && k.gender && first.gender && k.gender !== first.gender);
  const diffGroup = rest.find(k => k.group !== first.group);
  const diffGender = rest.find(k => k.gender && first.gender && k.gender !== first.gender);
  const partner = diffBoth || diffGroup || diffGender || rest[0];
  return [first, partner];
}
