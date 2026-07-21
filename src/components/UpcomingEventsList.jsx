import { getCategoryColor } from "../lib/categoryColors";

function formatDateShort(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const todayStr = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  if (dateStr === todayStr) return "Today";
  if (dateStr === tomorrowStr) return "Tomorrow";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTimeShort(time) {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${period}` : `${hour12}:${String(m).padStart(2, "0")}${period}`;
}

function UpcomingEventRow({ occurrence, categories, onSelect }) {
  const matchedCategory = categories.find((c) => c.id === occurrence.categoryId);
  const color = getCategoryColor(matchedCategory?.color, Boolean(matchedCategory), matchedCategory?.customColor);

  return (
    <button
      onClick={() => onSelect(occurrence)}
      className="w-full text-left flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-brand-50 dark:hover:bg-brand-800 transition"
    >
      {color.isCustom ? (
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={color.dotStyle} />
      ) : (
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color.dot}`} />
      )}
      <span className="flex-1 text-sm font-medium text-brand-800 dark:text-brand-100 truncate">
        {occurrence.title}
      </span>
      <span className="text-xs text-brand-400 dark:text-brand-500 flex-shrink-0">
        {formatDateShort(occurrence.occurrenceDate)}
        {!occurrence.allDay && ` · ${formatTimeShort(occurrence.startTime)}`}
      </span>
    </button>
  );
}

function UpcomingEventsList({ occurrences, categories, onSelectEvent }) {
  if (occurrences.length === 0) {
    return (
      <p className="text-sm text-brand-300 dark:text-brand-600 italic px-3 py-4 text-center">
        No upcoming events.
      </p>
    );
  }

  return (
    <div className="divide-y divide-brand-50 dark:divide-brand-800">
      {occurrences.map((occ) => (
        <UpcomingEventRow
          key={`${occ.id}-${occ.occurrenceDate}`}
          occurrence={occ}
          categories={categories}
          onSelect={onSelectEvent}
        />
      ))}
    </div>
  );
}

export default UpcomingEventsList;
