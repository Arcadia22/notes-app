import { useState, useEffect, useMemo } from "react";
import WeekTimelineGrid from "./WeekTimelineGrid";
import FreeformBlockPalette from "./FreeformBlockPalette";
import {
  listenToBlockDefinitions,
  listenToRoutineWeek,
  saveRoutineWeek,
} from "../lib/routine";
import { listenToEvents, expandEventsInRange, toDateStr, listenToCategories } from "../lib/events";
import { getCategoryColor } from "../lib/categoryColors";
import { auth } from "../firebase";

function minutesToTimeStr(mins) {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutesLocal(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

let tempIdCounter = 0;
function makeTempId() {
  tempIdCounter += 1;
  return `temp-${Date.now()}-${tempIdCounter}`;
}

// Sunday of the week containing `date`
function startOfWeek(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// weekStartDate: Date object (a Sunday)
// fitToContainer: if true, renders the grid to fill its parent's height
//   with no scrollbar (desktop "full schedule" layout) and omits the
//   freeform palette below it, since on desktop the palette lives in a
//   separate panel managed by the parent page instead.
function RoutineWeekView({ weekStartDate, fitToContainer = false, onResetRef }) {
  const uid = auth.currentUser?.uid;
  const weekStartStr = toDateStr(weekStartDate);

  const [blockDefs, setBlockDefs] = useState([]);
  const [savedWeek, setSavedWeek] = useState(null);
  const [placedBlocks, setPlacedBlocks] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsubDefs = listenToBlockDefinitions(uid, setBlockDefs);
    const unsubEvents = listenToEvents(uid, setCalendarEvents);
    const unsubCats = listenToCategories(uid, setCategories);
    return () => {
      unsubDefs();
      unsubEvents();
      unsubCats();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    setSavedWeek(null);
    return listenToRoutineWeek(uid, weekStartStr, (week) => {
      setSavedWeek(week);
    });
  }, [uid, weekStartStr]);

  // Once both the week doc and block defs are ready, decide the working
  // set of placed blocks: if this week has never been saved before
  // (placedBlocks is empty AND there's no save marker), auto-seed it
  // from the fixed blocks in the library. Otherwise use exactly what
  // was saved — including the case where the person deliberately
  // removed every fixed block, which must stay removed.
  useEffect(() => {
    if (!savedWeek) return;

    if (savedWeek.placedBlocks && savedWeek.placedBlocks.length > 0) {
      setPlacedBlocks(savedWeek.placedBlocks);
      return;
    }

    if (savedWeek.everSaved) {
      // Week was explicitly saved empty — respect that, don't re-seed.
      setPlacedBlocks([]);
      return;
    }

    // Brand new, never-touched week: seed from fixed blocks.
    const fixedDefs = blockDefs.filter((b) => b.type === "fixed");
    const seeded = [];
    for (const def of fixedDefs) {
      for (const day of def.defaultDaysOfWeek || []) {
        seeded.push({
          id: makeTempId(),
          blockDefId: def.id,
          dayOfWeek: day,
          startTime: def.defaultStartTime,
          endTime: def.defaultEndTime,
        });
      }
    }
    setPlacedBlocks(seeded);
  }, [savedWeek, blockDefs]);

  // When blockDefs gains a new fixed block, automatically add it to the
  // current week without waiting for "Reset fixed blocks".
  useEffect(() => {
    if (blockDefs.length === 0) return;
    setPlacedBlocks((prev) => {
      const fixedDefs = blockDefs.filter((b) => b.type === "fixed");
      const toAdd = [];
      for (const def of fixedDefs) {
        for (const day of def.defaultDaysOfWeek || []) {
          const alreadyPlaced = prev.some(
            (p) => p.blockDefId === def.id && p.dayOfWeek === day
          );
          if (!alreadyPlaced) {
            toAdd.push({
              id: makeTempId(),
              blockDefId: def.id,
              dayOfWeek: day,
              startTime: def.defaultStartTime,
              endTime: def.defaultEndTime,
            });
          }
        }
      }
      if (toAdd.length === 0) return prev;
      return [...prev, ...toAdd];
    });
  }, [blockDefs]);

  const freeformDefs = useMemo(() => blockDefs.filter((b) => b.type === "freeform"), [blockDefs]);

  // Routine blocks, resolved against their definitions
  const dayColumns = useMemo(() => {
    const columns = [[], [], [], [], [], [], []];
    for (const placed of placedBlocks) {
      const def = blockDefs.find((b) => b.id === placed.blockDefId);
      if (!def) continue;
      columns[placed.dayOfWeek].push({
        id: placed.id,
        blockDefId: placed.blockDefId,
        name: def.name,
        color: def.color,
        customColor: def.customColor,
        startTime: placed.startTime,
        endTime: placed.endTime,
        source: "routine",
      });
    }
    return columns;
  }, [placedBlocks, blockDefs]);

  // Calendar events for this specific week, overlaid as read-only blocks
  const weekEnd = addDays(weekStartDate, 6);
  const eventOccurrences = useMemo(
    () => expandEventsInRange(calendarEvents, weekStartDate, weekEnd),
    [calendarEvents, weekStartDate, weekEnd]
  );

  // Merge calendar events into the same dayColumns structure, tagged so
  // the grid (and our tap handler) can tell them apart from routine blocks.
  const mergedDayColumns = useMemo(() => {
    const merged = dayColumns.map((col) => [...col]);
    for (const occ of eventOccurrences) {
      if (occ.allDay || !occ.startTime) continue;
      const [y, m, d] = occ.occurrenceDate.split("-").map(Number);
      const dayIndex = new Date(y, m - 1, d).getDay();
      const matchedCategory = categories.find((c) => c.id === occ.categoryId);
      merged[dayIndex].push({
        id: `event-${occ.id}-${occ.occurrenceDate}`,
        name: occ.title,
        color: matchedCategory?.color ?? "blue",
        customColor: matchedCategory?.customColor ?? null,
        startTime: occ.startTime,
        endTime: occ.endTime,
        source: "calendar",
      });
    }
    return merged;
  }, [dayColumns, eventOccurrences]);

  const handleDropFreeform = (dayOfWeek, time, blockDefId) => {
    const def = blockDefs.find((b) => b.id === blockDefId);
    if (!def) return;
    const startMin = timeToMinutesLocal(time);
    const endMin = startMin + (def.durationMinutes || 30);

    const next = [
      ...placedBlocks,
      {
        id: makeTempId(),
        blockDefId,
        dayOfWeek,
        startTime: time,
        endTime: minutesToTimeStr(endMin),
      },
    ];
    setPlacedBlocks(next);
    persistWeek(next);
  };

  const handleTapBlock = (block) => {
    if (block.source === "calendar") return; // calendar events aren't editable here
    if (!confirm(`Remove "${block.name}" from this day? You can manage it from Manage blocks again later.`)) return;
    const next = placedBlocks.filter((b) => b.id !== block.id);
    setPlacedBlocks(next);
    persistWeek(next);
  };

  // Repositions an already-placed block to a new day/time, preserving its
  // original duration rather than resetting to the block definition's
  // default length.
  const handleMoveBlock = (block, newDayOfWeek, newStartTime) => {
    const original = placedBlocks.find((b) => b.id === block.id);
    if (!original) return;

    const originalDuration = timeToMinutesLocal(original.endTime) - timeToMinutesLocal(original.startTime);
    const newStartMin = timeToMinutesLocal(newStartTime);
    const newEndTime = minutesToTimeStr(newStartMin + Math.max(originalDuration, 15));

    const next = placedBlocks.map((b) =>
      b.id === block.id
        ? { ...b, dayOfWeek: newDayOfWeek, startTime: newStartTime, endTime: newEndTime }
        : b
    );
    setPlacedBlocks(next);
    persistWeek(next);
  };

  const persistWeek = async (blocksToSave) => {
    if (!uid) return;
    setSaving(true);
    try {
      const cleaned = blocksToSave.map(({ id, ...rest }) => ({ id: makeTempId(), ...rest }));
      await saveRoutineWeek(uid, weekStartStr, cleaned);
    } finally {
      setSaving(false);
    }
  };

  // Re-adds any fixed blocks that are missing from this week (e.g. were
  // accidentally deleted), based on each fixed block's saved days/times
  // in the library. Already-placed fixed blocks are left untouched (so a
  // fixed block you deliberately moved keeps its moved position), and
  // freeform blocks are never touched at all.
  const handleResetFixedBlocks = () => {
    const fixedDefs = blockDefs.filter((b) => b.type === "fixed");
    const existingFixedPairs = new Set(
      placedBlocks
        .filter((p) => fixedDefs.some((def) => def.id === p.blockDefId))
        .map((p) => `${p.blockDefId}_${p.dayOfWeek}`)
    );

    const toAdd = [];
    for (const def of fixedDefs) {
      for (const day of def.defaultDaysOfWeek || []) {
        const key = `${def.id}_${day}`;
        if (existingFixedPairs.has(key)) continue;
        toAdd.push({
          id: makeTempId(),
          blockDefId: def.id,
          dayOfWeek: day,
          startTime: def.defaultStartTime,
          endTime: def.defaultEndTime,
        });
      }
    }

    if (toAdd.length === 0) return;
    const next = [...placedBlocks, ...toAdd];
    setPlacedBlocks(next);
    persistWeek(next);
  };

  // Expose reset handler to parent via ref callback
  if (onResetRef) onResetRef.current = handleResetFixedBlocks;

  return (
    <div className={fitToContainer ? "h-full flex flex-col" : ""}>
      <div className={fitToContainer ? "flex-1 min-h-0" : ""}>
        <WeekTimelineGrid
          dayColumns={mergedDayColumns}
          onDropFreeform={handleDropFreeform}
          onMoveBlock={handleMoveBlock}
          onTapBlock={handleTapBlock}
          fitToContainer={fitToContainer}
        />
      </div>

      {!fitToContainer && (
        <>
          <h3 className="text-xs font-pixel text-brand-600 dark:text-brand-300 mt-4 mb-2">
            DRAG TO PLACE
          </h3>
          <FreeformBlockPalette freeformBlocks={freeformDefs} />
        </>
      )}

      {saving && (
        <p className="text-xs text-brand-400 dark:text-brand-500 mt-2 text-center flex-shrink-0">Saving...</p>
      )}
    </div>
  );
}

export default RoutineWeekView;
