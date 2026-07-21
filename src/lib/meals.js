import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  query, where, orderBy, onSnapshot, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ── Meal Logs ──────────────────────────────────────────────────────────
// { uid, date, time, name, description, calories, createdAt }

export function listenToMealLogs(uid, callback) {
  const q = query(collection(db, "mealLogs"), where("uid", "==", uid), orderBy("date", "desc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function createMealLog(uid, { date, time, name, description, calories }) {
  return addDoc(collection(db, "mealLogs"), { uid, date, time, name, description: description || "", calories: calories || null, createdAt: serverTimestamp() });
}
export async function deleteMealLog(id) { return deleteDoc(doc(db, "mealLogs", id)); }

// ── Weekly Menu ────────────────────────────────────────────────────────
// One doc per uid+week. weekKey = "YYYY-Www" e.g. "2026-W27"
// { uid, weekKey, plan: { monday: { breakfast, lunch, dinner, snacks }, ... } }

export const WEEK_DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
export const MEAL_TIMES = ["Breakfast","Lunch","Dinner","Snacks"];

export function listenToWeeklyMenu(uid, weekKey, callback) {
  const q = query(collection(db, "weeklyMenus"), where("uid", "==", uid), where("weekKey", "==", weekKey));
  return onSnapshot(q, snap => {
    if (snap.empty) callback(null);
    else callback({ id: snap.docs[0].id, ...snap.docs[0].data() });
  });
}
export async function saveWeeklyMenu(uid, weekKey, plan) {
  const q = query(collection(db, "weeklyMenus"), where("uid", "==", uid), where("weekKey", "==", weekKey));
  const { getDocs, setDoc } = await import("firebase/firestore");
  const snap = await getDocs(q);
  if (snap.empty) {
    return addDoc(collection(db, "weeklyMenus"), { uid, weekKey, plan, updatedAt: serverTimestamp() });
  } else {
    return setDoc(doc(db, "weeklyMenus", snap.docs[0].id), { uid, weekKey, plan, updatedAt: serverTimestamp() });
  }
}

export function getWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ── Grocery List ───────────────────────────────────────────────────────
// { uid, name, category, checked, order, createdAt }

export function listenToGroceryItems(uid, callback) {
  const q = query(collection(db, "groceryItems"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function createGroceryItem(uid, { name, category, quantity, unit }) {
  return addDoc(collection(db, "groceryItems"), { uid, name, category: category || "", quantity: quantity || "", unit: unit || "units", checked: false, createdAt: serverTimestamp() });
}
export async function updateGroceryItem(id, changes) { return updateDoc(doc(db, "groceryItems", id), changes); }
export async function deleteGroceryItem(id) { return deleteDoc(doc(db, "groceryItems", id)); }

// ── Recipes ────────────────────────────────────────────────────────────
// { uid, name, category, ingredients (string), steps (string), notes, createdAt }

export function listenToRecipes(uid, callback) {
  const q = query(collection(db, "recipes"), where("uid", "==", uid), orderBy("createdAt", "asc"));
  return onSnapshot(q, snap => callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}
export async function createRecipe(uid, { name, category, ingredients, steps, notes }) {
  return addDoc(collection(db, "recipes"), { uid, name, category: category || "", ingredients: ingredients || "", steps: steps || "", notes: notes || "", createdAt: serverTimestamp() });
}
export async function updateRecipe(id, changes) { return updateDoc(doc(db, "recipes", id), changes); }
export async function deleteRecipe(id) { return deleteDoc(doc(db, "recipes", id)); }
