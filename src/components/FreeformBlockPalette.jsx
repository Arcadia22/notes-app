import { getCategoryColor } from "../lib/categoryColors";

function formatDuration(mins) {
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainder = mins % 60;
  return remainder ? `${hours}h${remainder}m` : `${hours}h`;
}

// freeformBlocks: array of block definitions (type === "freeform")
function FreeformBlockPalette({ freeformBlocks }) {
  if (freeformBlocks.length === 0) {
    return (
      <p className="text-xs text-brand-300 dark:text-brand-500 italic px-1">
        No freeform blocks yet — add some in Manage blocks.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 px-1">
      {freeformBlocks.map((block) => {
        const color = getCategoryColor(block.color, true, block.customColor);
        return (
          <div
            key={block.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/block-def-id", block.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-md border-2 cursor-grab active:cursor-grabbing select-none ${
              color.isCustom ? "" : color.badge
            }`}
            style={
              color.isCustom
                ? { ...color.badgeStyle, borderColor: color.hex }
                : { borderColor: "currentColor" }
            }
          >
            {color.isCustom ? (
              <span className="w-1.5 h-1.5 rounded-full" style={color.dotStyle} />
            ) : (
              <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
            )}
            <span className="text-[11px] font-medium">{block.name}</span>
            <span className="text-[9px] opacity-70">{formatDuration(block.durationMinutes)}</span>
          </div>
        );
      })}
    </div>
  );
}

export default FreeformBlockPalette;
