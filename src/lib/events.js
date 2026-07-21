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
// CATEGORIES
// ---------------------------------------------------------------------

export function listenToCategories(uid, callback) {
  const q = query(collection(db, "eventCategories"), where("uid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    const categories = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(categories);
  });
}

export async function createCategory(uid, name, color, customColor = null) {
  return addDoc(collection(db, "eventCategories"), { uid, name, color, customColor });
}

export async function updateCategory(categoryId, changes) {
  return updateDoc(doc(db, "eventCategories", categoryId), changes);
}

export async function deleteCategory(categoryId) {
  return deleteDoc(doc(db, "eventCategories", categoryId));
}

// ---------------------------------------------------------------------
// EVENTS
// ---------------------------------------------------------------------

export function listenToEvents(uid, callback) {
  const q = query(collection(db, "events"), where("uid", "==", uid));
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(events);
  });
}

// eventData: { title, details, categoryId, date, allDay, startTime, endTime, recurrence }
export async function createEvent(uid, eventData) {
  return addDoc(collection(db, "events"), {
    uid,
    recurrence: "none",
    recurrenceEndDate: null,
    allDay: false,
    startTime: null,
    endTime: null,
    details: "",
    categoryId: null,
    ...eventData,
  });
}

export async function updateEvent(eventId, changes) {
  return updateDoc(doc(db, "events", eventId), changes);
}

export async function deleteEvent(eventId) {
  return deleteDoc(doc(db, "events", eventId));
}

// Stops a recurring event from generating any future occurrences
// after (and not including) the given occurrence date.
export async function stopRecurrenceAfter(eventId, occurrenceDateStr) {
  return updateDoc(doc(db, "events", eventId), {
    recurrenceEndDate: occurrenceDateStr,
  });
}

// ---------------------------------------------------------------------
// RECURRENCE EXPANSION
//
// Given the raw `events` (one doc per recurring rule) and a date range,
// returns a flat list of "occurrences" — one entry per actual calendar
// appearance, each tagged with the date it falls on and a reference
// back to its parent event.
// ---------------------------------------------------------------------

function toDate(dateStr) {
  // dateStr is "YYYY-MM-DD" — parse as local date, not UTC, to avoid
  // off-by-one-day bugs near midnight in different timezones.
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addInterval(date, recurrence) {
  const next = new Date(date);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  else if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  else if (recurrence === "monthly") next.setMonth(next.getMonth() + 1);
  else if (recurrence === "yearly") next.setFullYear(next.getFullYear() + 1);
  return next;
}

// rangeStart / rangeEnd are JS Date objects (inclusive range to expand within)
export function expandEventsInRange(events, rangeStart, rangeEnd) {
  const occurrences = [];

  for (const event of events) {
    const firstDate = toDate(event.date);

    if (!event.recurrence || event.recurrence === "none") {
      if (firstDate >= rangeStart && firstDate <= rangeEnd) {
        occurrences.push({ ...event, occurrenceDate: event.date, isRecurring: false });
      }
      continue;
    }

    const recurrenceEnd = event.recurrenceEndDate ? toDate(event.recurrenceEndDate) : null;

    let cursor = firstDate;
    // Safety cap purely against a malformed/non-advancing recurrence rule
    // looping forever — NOT meant to limit how far into the future
    // legitimate recurring events expand. A daily event over 100 years is
    // ~36,500 occurrences, so this is set comfortably above that.
    let iterations = 0;
    const MAX_ITERATIONS = 100000;

    while (cursor <= rangeEnd && iterations < MAX_ITERATIONS) {
      iterations++;

      if (recurrenceEnd && cursor > recurrenceEnd) break;

      if (cursor >= rangeStart && cursor <= rangeEnd) {
        occurrences.push({
          ...event,
          occurrenceDate: toDateStr(cursor),
          isRecurring: true,
        });
      }

      cursor = addInterval(cursor, event.recurrence);
    }
  }

  return occurrences.sort((a, b) => {
    if (a.occurrenceDate !== b.occurrenceDate) {
      return a.occurrenceDate < b.occurrenceDate ? -1 : 1;
    }
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return (a.startTime || "").localeCompare(b.startTime || "");
  });
}

// Returns the next N upcoming occurrences starting today (inclusive),
// regardless of which month/week/day the user is currently viewing.
export function getUpcomingOccurrences(events, count = 8) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Expand a generous future window — far enough to almost always find
  // `count` results even with sparse events, capped to keep it fast.
  const farFuture = new Date(today);
  farFuture.setFullYear(farFuture.getFullYear() + 2);

  const occurrences = expandEventsInRange(events, today, farFuture);
  return occurrences.slice(0, count);
}

export { toDate, toDateStr };
