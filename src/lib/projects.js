import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// projects: { uid, name, emoji, createdAt, updatedAt }
export function listenToProjects(uid, callback) {
  const q = query(collection(db, "projects"), where("uid", "==", uid), orderBy("updatedAt", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function createProject(uid, { name, emoji = "📁" }) {
  return addDoc(collection(db, "projects"), { uid, name, emoji, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateProject(id, changes) {
  return updateDoc(doc(db, "projects", id), { ...changes, updatedAt: serverTimestamp() });
}
export async function deleteProject(id) {
  return deleteDoc(doc(db, "projects", id));
}

// projectDocuments: { uid, projectId, name, content (HTML), categoryId, createdAt, updatedAt }
export function listenToProjectDocuments(uid, projectId, callback) {
  const q = query(
    collection(db, "projectDocuments"),
    where("uid", "==", uid),
    where("projectId", "==", projectId),
    orderBy("updatedAt", "desc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function createProjectDocument(uid, projectId, { name, categoryId = "" }) {
  return addDoc(collection(db, "projectDocuments"), {
    uid, projectId, name, content: "", categoryId: categoryId || "",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

// projectDocCategories: { uid, projectId, name, color }
export function listenToProjectDocCategories(uid, projectId, callback) {
  const q = query(
    collection(db, "projectDocCategories"),
    where("uid", "==", uid),
    where("projectId", "==", projectId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function createProjectDocCategory(uid, projectId, { name, color }) {
  return addDoc(collection(db, "projectDocCategories"), {
    uid, projectId, name, color: color || "gray", createdAt: serverTimestamp(),
  });
}
export async function deleteProjectDocCategory(id) {
  return deleteDoc(doc(db, "projectDocCategories", id));
}
export async function updateProjectDocument(id, changes) {
  if (!id) return;
  return updateDoc(doc(db, "projectDocuments", id), { ...changes, updatedAt: serverTimestamp() });
}
export async function deleteProjectDocument(id) {
  return deleteDoc(doc(db, "projectDocuments", id));
}

// projectProgressEntries: manual progress notes per project
// { uid, projectId, note, date (YYYY-MM-DD), createdAt }
export function listenToProjectProgressEntries(uid, projectId, callback) {
  const q = query(
    collection(db, "projectProgressEntries"),
    where("uid", "==", uid),
    where("projectId", "==", projectId),
    orderBy("date", "desc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createProjectProgressEntry(uid, projectId, { note, date }) {
  return addDoc(collection(db, "projectProgressEntries"), {
    uid, projectId, note, date, createdAt: serverTimestamp(),
  });
}

export async function deleteProjectProgressEntry(id) {
  return deleteDoc(doc(db, "projectProgressEntries", id));
}

// Listen to all daily logs that reference a specific project
export function listenToProjectDailyLogs(uid, projectId, callback) {
  const q = query(
    collection(db, "dailyLogs"),
    where("uid", "==", uid)
  );
  return onSnapshot(q, snap => {
    const logs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(log => {
        const pp = log.projectProgress;
        if (!pp) return false;
        if (Array.isArray(pp)) return pp.some(e => e.projectId === projectId);
        return false;
      })
      .map(log => ({
        id: log.id,
        date: log.date,
        entries: Array.isArray(log.projectProgress)
          ? log.projectProgress.filter(e => e.projectId === projectId)
          : [],
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    callback(logs);
  });
}

// projectTodos: { uid, projectId, text, priority: "high"|"medium"|"low"|null, done, createdAt, order }
export const PRIORITY_LEVELS = [
  { id: "high",   label: "High",   color: "text-red-500 dark:text-red-400",    bg: "bg-red-50 dark:bg-red-900/20",    border: "border-red-200 dark:border-red-800",    dot: "bg-red-500" },
  { id: "medium", label: "Medium", color: "text-amber-500 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-900/20", border: "border-amber-200 dark:border-amber-800", dot: "bg-amber-500" },
  { id: "low",    label: "Low",    color: "text-brand-400 dark:text-brand-500", bg: "bg-brand-50 dark:bg-brand-800",   border: "border-brand-200 dark:border-brand-600", dot: "bg-brand-400" },
];

export function getPriorityStyle(priority) {
  return PRIORITY_LEVELS.find(p => p.id === priority) || null;
}

// Priority sort order: high → medium → low → none
function priorityOrder(p) {
  if (p === "high") return 0;
  if (p === "medium") return 1;
  if (p === "low") return 2;
  return 3;
}

export function sortTodos(todos) {
  return [...todos].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pd = priorityOrder(a.priority) - priorityOrder(b.priority);
    if (pd !== 0) return pd;
    return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
  });
}

export function listenToProjectTodos(uid, projectId, callback) {
  const q = query(
    collection(db, "projectTodos"),
    where("uid", "==", uid),
    where("projectId", "==", projectId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export function listenToAllProjectTodos(uid, callback) {
  const q = query(
    collection(db, "projectTodos"),
    where("uid", "==", uid),
    where("done", "==", false)
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createProjectTodo(uid, projectId, { text, priority = null }) {
  return addDoc(collection(db, "projectTodos"), {
    uid, projectId, text, priority, done: false, createdAt: serverTimestamp(),
  });
}

export async function updateProjectTodo(id, changes) {
  return updateDoc(doc(db, "projectTodos", id), changes);
}

export async function deleteProjectTodo(id) {
  return deleteDoc(doc(db, "projectTodos", id));
}
