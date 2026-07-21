import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// Predefined trackable metrics
export const TRACK_METRICS = [
  { id: "episodes",   label: "Episodes" },
  { id: "chapters",   label: "Chapters" },
  { id: "pages",      label: "Pages" },
  { id: "volumes",    label: "Volumes" },
  { id: "seasons",    label: "Seasons" },
  { id: "parts",      label: "Parts" },
  { id: "books",      label: "Books" },
  { id: "hours",      label: "Hours" },
  { id: "quantity",   label: "Quantity" },
  { id: "percentage", label: "Percentage" },
  { id: "cost",       label: "Cost" },
];

export const CATEGORY_COLORS = [
  { id: "violet", dot: "bg-violet-500", bg: "bg-violet-50 dark:bg-violet-900/20", border: "border-violet-300 dark:border-violet-700", text: "text-violet-700 dark:text-violet-300", badge: "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300" },
  { id: "blue",   dot: "bg-blue-500",   bg: "bg-blue-50 dark:bg-blue-900/20",     border: "border-blue-300 dark:border-blue-700",     text: "text-blue-700 dark:text-blue-300",   badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" },
  { id: "emerald",dot: "bg-emerald-500",bg: "bg-emerald-50 dark:bg-emerald-900/20",border: "border-emerald-300 dark:border-emerald-700",text: "text-emerald-700 dark:text-emerald-300", badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" },
  { id: "red",    dot: "bg-red-500",    bg: "bg-red-50 dark:bg-red-900/20",       border: "border-red-300 dark:border-red-700",       text: "text-red-700 dark:text-red-300",     badge: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" },
  { id: "amber",  dot: "bg-amber-500",  bg: "bg-amber-50 dark:bg-amber-900/20",   border: "border-amber-300 dark:border-amber-700",   text: "text-amber-700 dark:text-amber-300", badge: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" },
  { id: "pink",   dot: "bg-pink-500",   bg: "bg-pink-50 dark:bg-pink-900/20",     border: "border-pink-300 dark:border-pink-700",     text: "text-pink-700 dark:text-pink-300",   badge: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300" },
  { id: "cyan",   dot: "bg-cyan-500",   bg: "bg-cyan-50 dark:bg-cyan-900/20",     border: "border-cyan-300 dark:border-cyan-700",     text: "text-cyan-700 dark:text-cyan-300",   badge: "bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300" },
  { id: "gray",   dot: "bg-brand-400",  bg: "bg-brand-50 dark:bg-brand-800",      border: "border-brand-200 dark:border-brand-600",   text: "text-brand-600 dark:text-brand-300", badge: "bg-brand-100 dark:bg-brand-700 text-brand-600 dark:text-brand-300" },
];

export function getCategoryStyle(colorId) {
  return CATEGORY_COLORS.find(c => c.id === colorId) || CATEGORY_COLORS[0];
}

// hobbyCategories: { uid, name, color, metrics: ["episodes","chapters",...] }
export function listenToHobbyCategories(uid, callback) {
  const q = query(collection(db, "hobbyCategories"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function createHobbyCategory(uid, { name, color, metrics }) {
  return addDoc(collection(db, "hobbyCategories"), { uid, name, color, metrics, createdAt: serverTimestamp() });
}
export async function updateHobbyCategory(id, changes) {
  return updateDoc(doc(db, "hobbyCategories", id), changes);
}
export async function deleteHobbyCategory(id) {
  return deleteDoc(doc(db, "hobbyCategories", id));
}

// hobbyEntries:
// status: "want" | "current" | "done"
// total:  { episodes: 24, chapters: null, ... }  — how many in total
// progress: { episodes: 12, ... } — how far I am
// rating: 1-10, review: string
export function listenToHobbyEntries(uid, callback) {
  const q = query(collection(db, "hobbyEntries"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function createHobbyEntry(uid, data) {
  return addDoc(collection(db, "hobbyEntries"), { uid, ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateHobbyEntry(id, changes) {
  return updateDoc(doc(db, "hobbyEntries", id), { ...changes, updatedAt: serverTimestamp() });
}
export async function deleteHobbyEntry(id) {
  return deleteDoc(doc(db, "hobbyEntries", id));
}

export const STATUS_LABELS = { want: "Want To", current: "Currently", waiting: "Waiting For More", done: "Done" };
export const STATUS_COLORS  = {
  want:    "bg-brand-100 dark:bg-brand-700 text-brand-600 dark:text-brand-300 border-brand-200 dark:border-brand-600",
  current: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700",
  waiting: "bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-700",
  done:    "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700",
};
