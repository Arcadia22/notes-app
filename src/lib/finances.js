import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ── Collections ──────────────────────────────────────────────────────
// financeTransactions: { uid, type: "income"|"expense", amount, category, note, date, createdAt }
// financeCategories:   { uid, name, color, type: "income"|"expense"|"both" }
// financeBudgets:      { uid, name, currency, note, createdAt }
// financeBudgetItems:  { uid, budgetId, name, category, amount, note }

// ── Transactions ─────────────────────────────────────────────────────
export function listenToTransactions(uid, callback) {
  const q = query(
    collection(db, "financeTransactions"),
    where("uid", "==", uid),
    orderBy("date", "desc"),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createTransaction(uid, { type, amount, category, note, date }) {
  return addDoc(collection(db, "financeTransactions"), {
    uid, type, amount: Number(amount), category: category || "", note: note || "", date, createdAt: serverTimestamp(),
  });
}

export async function updateTransaction(id, changes) {
  return updateDoc(doc(db, "financeTransactions", id), { ...changes, updatedAt: serverTimestamp() });
}

export async function deleteTransaction(id) {
  return deleteDoc(doc(db, "financeTransactions", id));
}

// ── Categories ────────────────────────────────────────────────────────
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Food & Drink", "Transport", "Housing", "Utilities", "Health", "Shopping",
  "Entertainment", "Travel", "Education", "Subscriptions", "Other",
];
export const DEFAULT_INCOME_CATEGORIES = [
  "Salary", "Freelance", "Investment", "Gift", "Refund", "Other",
];

export function listenToFinanceCategories(uid, callback) {
  const q = query(collection(db, "financeCategories"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createFinanceCategory(uid, { name, color, type }) {
  return addDoc(collection(db, "financeCategories"), { uid, name, color: color || "violet", type: type || "both", createdAt: serverTimestamp() });
}

export async function deleteFinanceCategory(id) {
  return deleteDoc(doc(db, "financeCategories", id));
}

// ── Budgets ───────────────────────────────────────────────────────────
export function listenToBudgets(uid, callback) {
  const q = query(collection(db, "financeBudgets"), where("uid", "==", uid), orderBy("createdAt", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createBudget(uid, { name, currency, note }) {
  return addDoc(collection(db, "financeBudgets"), { uid, name, currency: currency || "USD", note: note || "", createdAt: serverTimestamp() });
}

export async function updateBudget(id, changes) {
  return updateDoc(doc(db, "financeBudgets", id), changes);
}

export async function deleteBudget(id) {
  return deleteDoc(doc(db, "financeBudgets", id));
}

// ── Budget Items ──────────────────────────────────────────────────────
export function listenToBudgetItems(uid, budgetId, callback) {
  const q = query(
    collection(db, "financeBudgetItems"),
    where("uid", "==", uid),
    where("budgetId", "==", budgetId),
    orderBy("createdAt", "asc")
  );
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

export async function createBudgetItem(uid, budgetId, { name, category, amount, note }) {
  return addDoc(collection(db, "financeBudgetItems"), {
    uid, budgetId, name, category: category || "", amount: Number(amount) || 0, note: note || "", createdAt: serverTimestamp(),
  });
}

export async function updateBudgetItem(id, changes) {
  return updateDoc(doc(db, "financeBudgetItems", id), changes);
}

export async function deleteBudgetItem(id) {
  return deleteDoc(doc(db, "financeBudgetItems", id));
}

// ── Helpers ───────────────────────────────────────────────────────────
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

export function fmtCurrency(amount, currency = "USD") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(amount);
}

export function fmtDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export const CATEGORY_COLORS = {
  violet:  { badge: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300", dot: "bg-violet-500" },
  blue:    { badge: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
  emerald: { badge: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  amber:   { badge: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  red:     { badge: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300", dot: "bg-red-500" },
  pink:    { badge: "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300", dot: "bg-pink-500" },
  sky:     { badge: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300", dot: "bg-sky-500" },
  gray:    { badge: "bg-brand-100 dark:bg-brand-700 text-brand-600 dark:text-brand-300", dot: "bg-brand-400" },
};
