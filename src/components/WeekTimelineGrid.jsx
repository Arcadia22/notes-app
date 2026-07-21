import { useRef, useState } from "react";
import { CATEGORY_COLORS, getCategoryColor } from "../lib/categoryColors";
import { timeToMinutes } from "../lib/dayTimeline";

const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const START_HOUR = 4; // the grid's visible day runs 4am -> 4am next day
const START_MINUTES = START_HOUR * 60;
const TOTAL_SLOTS = 48; // 30-minute slots across 24 hours

function minutesToTimeStr(mins) {
  const wrapped = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Converts a clock time (in minutes since midnight) into its offset from
// the grid's visual start (START_HOUR), wrapping anything earlier than
// START_HOUR to the bottom of the day, where it chronologically belongs.
function minutesToGridOffset(mins) {
  return ((mins - START_MINUTES) % 1440 + 1440) % 1440;
}

// dayColumns: array of 7 arrays, each holding placed blocks for that day
//   placed block shape: { id, blockDefId, name, color, startTime, endTime, type }
// onDropFreeform(dayOfWeek, time, blockDefId) — called when a freeform
//   block from the palette is dropped onto a slot
// onMoveBlock(block, newDayOfWeek, newStartTime) — called when an existing
//   placed block (routine block, not a calendar event) is dragged to a
//   new day/time. Calendar event blocks (block.source === "calendar")
//   are never draggable, since they're read-only here.
// onTapBlock(placedBlock) — called when an existing placed block is tapped
// fitToContainer: if true, the grid scales to fill its parent's height
//   with no internal scrollbar (percentage-based layout) — used for the
//   desktop "full schedule, no scroll" view. If false (default), it uses
//   a fixed-height scrollable window, sized for mobile/tablet.
// scrollHeight: pixel height of the scroll window when fitToContainer is false
function WeekTimelineGrid({
  dayColumns,
  onDropFreeform,
  onMoveBlock,
  onTapBlock,
  highlightDayIndex,
  fitToContainer = false,
  scrollHeight = 360,
}) {
  const gridRef = useRef(null);
  const [dragOverCell, setDragOverCell] = useState(null); // { day, time } | null

  // Top/bottom padding and label-column width, expressed as a percentage
  // of total grid height/width so the fit-to-container mode scales
  // cleanly with no fixed pixels involved.
  const TOP_PAD_PCT = 1.5;
  const BOTTOM_PAD_PCT = 2;
  const SLOT_PCT = (100 - TOP_PAD_PCT - BOTTOM_PAD_PCT) / TOTAL_SLOTS;

  const slotToTopPct = (slotIndex) => TOP_PAD_PCT + slotIndex * SLOT_PCT;

  const handleDragOver = (e, dayIndex) => {
    e.preventDefault();
    const columnEl = e.currentTarget;
    const rect = columnEl.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const offsetPct = (offsetY / rect.height) * 100;
    const slotsFromTop = (offsetPct - TOP_PAD_PCT) / SLOT_PCT;
    const snappedSlot = Math.max(0, Math.min(TOTAL_SLOTS - 1, Math.round(slotsFromTop)));
    const gridMinutes = snappedSlot * 30;
    const clockMinutes = (gridMinutes + START_MINUTES) % 1440;
    setDragOverCell({ day: dayIndex, time: minutesToTimeStr(clockMinutes) });
  };

  const handleDrop = (e, dayIndex) => {
    e.preventDefault();
    const blockDefId = e.dataTransfer.getData("text/block-def-id");
    const movingBlockId = e.dataTransfer.getData("text/placed-block-id");

    if (movingBlockId && dragOverCell && onMoveBlock) {
      const allBlocks = dayColumns.flat();
      const movingBlock = allBlocks.find((b) => String(b.id) === movingBlockId);
      if (movingBlock) {
        onMoveBlock(movingBlock, dayIndex, dragOverCell.time);
      }
    } else if (blockDefId && dragOverCell) {
      onDropFreeform(dayIndex, dragOverCell.time, blockDefId);
    }
    setDragOverCell(null);
  };

  // In scroll mode the grid body needs a concrete pixel height to size
  // against (percentages need a real parent height); in fit mode it
  // simply fills its flex-1 parent at 100%.
  const SCROLL_MODE_PIXEL_HEIGHT = 1200; // tall enough that scrollHeight always shows a partial view

  const gridBody = (
    <div
      ref={gridRef}
      className="relative grid grid-cols-[28px_repeat(7,1fr)]"
      style={fitToContainer ? { height: "100%" } : { height: `${SCROLL_MODE_PIXEL_HEIGHT}px` }}
    >
      {/* Hour labels column, starting at START_HOUR and wrapping around */}
      <div className="relative">
        {Array.from({ length: 24 }).map((_, i) => {
          const hour = (START_HOUR + i) % 24;
          const label =
            hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`;
          return (
            <span
              key={i}
              className="absolute -translate-y-1/2 text-[8px] text-brand-300 dark:text-brand-500"
              style={{ top: `${slotToTopPct(i * 2)}%`, right: "2px" }}
            >
              {label}
            </span>
          );
        })}
      </div>

      {/* 7 day columns */}
      {Array.from({ length: 7 }).map((_, dayIndex) => (
        <div
          key={dayIndex}
          className={`relative border-l border-brand-50 dark:border-brand-800 ${
            highlightDayIndex === dayIndex ? "bg-accent-50 dark:bg-brand-800/40" : ""
          }`}
          onDragOver={(e) => handleDragOver(e, dayIndex)}
          onDragLeave={() => setDragOverCell((c) => (c?.day === dayIndex ? null : c))}
          onDrop={(e) => handleDrop(e, dayIndex)}
        >
          {/* Hour gridlines, starting at START_HOUR */}
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="absolute left-0 right-0 border-t border-brand-50 dark:border-brand-800"
              style={{ top: `${slotToTopPct(i * 2)}%` }}
            />
          ))}

          {/* Drop-target preview line */}
          {dragOverCell?.day === dayIndex && (
            <div
              className="absolute left-0 right-0 h-0.5 bg-accent-500 z-10 pointer-events-none"
              style={{
                top: `${slotToTopPct(minutesToGridOffset(timeToMinutes(dragOverCell.time)) / 30)}%`,
              }}
            />
          )}

          {/* Placed blocks for this day, with overlap handling: when
              two blocks share time, the shorter one renders nested
              and inset inside the longer one (e.g. an interview
              appearing inside a Work block) rather than the two
              stacking illegibly on top of each other. */}
          {(() => {
            const blocks = dayColumns[dayIndex] || [];

            const resolved = blocks.map((block) => {
              const startMin = minutesToGridOffset(timeToMinutes(block.startTime));
              let endMin = minutesToGridOffset(timeToMinutes(block.endTime));
              if (endMin <= startMin) endMin = TOTAL_SLOTS * 30;
              return { block, startMin, endMin, duration: endMin - startMin };
            });

            const ordered = [...resolved].sort((a, b) => b.duration - a.duration);

            return ordered.map(({ block, startMin, endMin, duration }, sortedIndex) => {
              const color = getCategoryColor(block.color, true, block.customColor);
              const top = slotToTopPct(startMin / 30);
              const height = Math.max((duration / 30) * SLOT_PCT, 0.8);

              const isNested = ordered
                .slice(0, sortedIndex)
                .some((other) => other.startMin < endMin && other.endMin > startMin);

              return (
                <button
                  key={block.id}
                  draggable={block.source !== "calendar" && Boolean(onMoveBlock)}
                  onDragStart={(e) => {
                    if (block.source === "calendar") return;
                    e.dataTransfer.setData("text/placed-block-id", String(block.id));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => onTapBlock(block)}
                  className={`absolute rounded-md text-left overflow-hidden ${
                    color.isCustom ? "" : color.badge
                  } ${block.source !== "calendar" ? "cursor-grab active:cursor-grabbing" : ""} ${
                    isNested
                      ? "left-2 right-0.5 px-1 ring-2 ring-white dark:ring-brand-900 z-10"
                      : "left-0.5 right-0.5 px-1"
                  }`}
                  style={{
                    top: `${top}%`,
                    height: `${height}%`,
                    ...(color.isCustom ? color.badgeStyle : {}),
                  }}
                >
                  <span className="text-[8px] font-medium leading-tight block truncate">
                    {block.name}
                  </span>
                </button>
              );
            });
          })()}
        </div>
      ))}
    </div>
  );

  return (
    <div className={`rounded-2xl border-2 border-brand-200 dark:border-brand-500 bg-white dark:bg-brand-700 overflow-hidden ${fitToContainer ? "h-full flex flex-col" : ""}`}>
      {/* Day headers */}
      <div className="grid grid-cols-[28px_repeat(7,1fr)] border-b border-brand-100 dark:border-brand-600 flex-shrink-0">
        <div />
        {DAY_LETTERS.map((d, i) => (
          <div
            key={i}
            className={`text-center text-[10px] font-pixel py-1.5 ${
              highlightDayIndex === i
                ? "text-white bg-brand-500"
                : "text-brand-500 dark:text-brand-300"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {fitToContainer ? (
        <div className="relative flex-1">{gridBody}</div>
      ) : (
        <div className="overflow-y-auto" style={{ height: `${scrollHeight}px` }}>
          {gridBody}
        </div>
      )}
    </div>
  );
}

export default WeekTimelineGrid;
