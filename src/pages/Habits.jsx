import { useState, useEffect, useRef } from "react";
import PageLayout from "../components/PageLayout";
import HabitCard from "../components/HabitCard";
import HabitForm from "../components/HabitForm";
import { PixelLantern } from "../components/Decorations";
import { auth } from "../firebase";
import { listenToHabits, listenToHabitEntries, deleteHabit, updateHabit } from "../lib/habits";
import { isDueOnDay, toDateStr } from "../lib/habitStats";

function Tracker() {
  const uid = auth.currentUser?.uid;
  const [habits, setHabits] = useState([]);
  const [orderedHabits, setOrderedHabits] = useState([]);
  const [entries, setEntries] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [insertionIndex, setInsertionIndex] = useState(null);
  const dragIndexRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    if (!uid) return;
    const unsubHabits = listenToHabits(uid, setHabits);
    const unsubEntries = listenToHabitEntries(uid, setEntries);
    return () => { unsubHabits(); unsubEntries(); };
  }, [uid]);

  // Sync ordered list whenever Firestore habits change (but not during drag)
  useEffect(() => {
    if (dragIndexRef.current !== null) return;
    setOrderedHabits([...habits].sort((a, b) => (a.order ?? 9999) - (b.order ?? 9999)));
  }, [habits]);

  const handleDelete = async (habit) => {
    if (!confirm(`Delete "${habit.name}" and all of its tracked history?`)) return;
    await deleteHabit(uid, habit.id, entries);
  };

  // Drag handlers — called from the drag handle inside HabitCard
  const handleDragStart = (index) => {
    dragIndexRef.current = index;
    setDragOverIndex(index);
    setInsertionIndex(index);
  };

  const handleDragOver = (index) => {
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;
    const from = dragIndexRef.current;
    // Insertion line shows above the target when moving up, below when moving down
    setInsertionIndex(index);
    setOrderedHabits(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(index, 0, moved);
      return next;
    });
    dragIndexRef.current = index;
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    setDragOverIndex(null);
    setInsertionIndex(null);
    dragIndexRef.current = null;
    setOrderedHabits(prev => {
      prev.forEach((habit, i) => {
        if (habit.order !== i) updateHabit(habit.id, { order: i });
      });
      return prev;
    });
  };

  const today = new Date();
  const todayDayOfWeek = today.getDay();
  const todayStr = toDateStr(today);
  const dueToday = orderedHabits.filter((h) => h.trackType !== "monthly" && isDueOnDay(h, todayDayOfWeek));
  const doneTodayCount = dueToday.filter((h) =>
    entries.some((e) => e.habitId === h.id && e.date === todayStr && (e.status || "done") === "done")
  ).length;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthlyWarnings = orderedHabits.filter(h => {
    if (h.trackType !== "monthly") return false;
    if (dayOfMonth < daysInMonth - 3) return false;
    const doneThisMonth = entries.filter(e =>
      e.habitId === h.id && e.date.startsWith(monthStr) && (e.status || "done") === "done"
    ).length;
    return doneThisMonth < (h.timesPerMonth || 1);
  }).length;

  return (
    <PageLayout title="Tracker">
      <div className="max-w-md mx-auto px-4 pt-4 pb-10">

        <div className="flex justify-end mb-4">
          {!showForm && !editingHabit && (
            <button onClick={() => setShowForm(true)}
              className="text-xs text-accent-500 dark:text-accent-300 font-medium">
              + New tracker
            </button>
          )}
        </div>

        {(dueToday.length > 0 || monthlyWarnings > 0) && (
          <div className="rounded-2xl bg-white dark:bg-brand-800 border-2 border-brand-200 dark:border-brand-600 p-3 mb-4 text-center">
            {dueToday.length > 0 && (
              <p className="text-sm font-semibold text-brand-700 dark:text-brand-200">
                {doneTodayCount} of {dueToday.length} done today
              </p>
            )}
            {monthlyWarnings > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                ⚠️ {monthlyWarnings} monthly tracker{monthlyWarnings > 1 ? "s" : ""} at risk
              </p>
            )}
          </div>
        )}

        {showForm && (
          <div className="mb-4">
            <HabitForm uid={uid} onDone={() => setShowForm(false)} onCancel={() => setShowForm(false)} />
          </div>
        )}

        {editingHabit && (
          <div className="mb-4">
            <HabitForm uid={uid} existingHabit={editingHabit}
              onDone={() => setEditingHabit(null)} onCancel={() => setEditingHabit(null)} />
          </div>
        )}

        {orderedHabits.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <PixelLantern className="w-6 h-8 opacity-60" />
            <p className="text-sm text-brand-300 dark:text-brand-500 italic">
              No trackers yet — add your first one above.
            </p>
          </div>
        ) : (
          <div ref={listRef} className="space-y-3">
            {orderedHabits.map((habit, index) => (
              <div key={habit.id} className="relative">
                {/* Blue insertion line above this card */}
                {insertionIndex === index && dragIndexRef.current !== null && (
                  <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-accent-400 dark:bg-accent-300 rounded-full z-10" />
                )}
                <HabitCard
                  habit={habit}
                  entries={entries.filter((e) => e.habitId === habit.id)}
                  uid={uid}
                  onEdit={setEditingHabit}
                  onDelete={handleDelete}
                  dragIndex={index}
                  isDragOver={dragOverIndex === index}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragEnd={handleDragEnd}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

export default Tracker;
