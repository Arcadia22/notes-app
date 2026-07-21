// Fixed set of selectable colors for event categories.
// Each has a dot color (for calendar markers) and a badge style (for chips/labels).
// Users name their own categories, but pick from this curated palette so
// everything stays visually consistent and themed.

// Curated preset palette — trimmed down since people can now also pick
// any custom color via the color wheel in the picker UI. These presets
// stay as quick one-tap options for the common case.
export const CATEGORY_COLORS = [
  { id: "purple", label: "Purple", dot: "bg-brand-500", badge: "bg-brand-100 text-brand-700 dark:bg-brand-800 dark:text-brand-200" },
  { id: "red", label: "Red", dot: "bg-red-600", badge: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200" },
  { id: "amber", label: "Amber", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200" },
  { id: "emerald", label: "Emerald", dot: "bg-emerald-600", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200" },
  { id: "blue", label: "Blue", dot: "bg-blue-600", badge: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200" },
  { id: "fuchsia", label: "Fuchsia", dot: "bg-fuchsia-500", badge: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900 dark:text-fuchsia-200" },
];

// Used when an event references a category that no longer exists
// (e.g. the user deleted it) — shows as neutral gray instead of
// silently falling back to a real color and looking miscategorized.
const UNCATEGORIZED_COLOR = {
  id: "uncategorized",
  label: "Uncategorized",
  dot: "bg-gray-400 dark:bg-gray-500",
  badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

// Builds a color-info object for a custom hex color, shaped the same
// as a preset entry so calling code doesn't need separate branches.
// Uses inline styles (dotStyle/badgeStyle) instead of Tailwind classes,
// since arbitrary hex values can't map to pre-defined utility classes.
export function customColorInfo(hex) {
  return {
    id: "custom",
    label: "Custom",
    isCustom: true,
    hex,
    dotStyle: { backgroundColor: hex },
    badgeStyle: { backgroundColor: `${hex}26`, color: hex }, // ~15% opacity tint background
    // Fallback class strings so any code still reading .dot/.badge as
    // classNames doesn't crash — they just won't show a color, the
    // inline style above is what actually carries the right color.
    dot: "",
    badge: "",
  };
}

// categoryExists should be true if the category document is still present,
// false if it's missing/deleted. Pass colorId as undefined/null when there's
// simply no category assigned at all — that also renders gray.
// customColor (optional): if the category/block has a custom hex color
// saved, pass it here and it takes priority over colorId.
export function getCategoryColor(colorId, categoryExists = true, customColor = null) {
  if (!categoryExists) return UNCATEGORIZED_COLOR;
  if (customColor) return customColorInfo(customColor);
  if (!colorId) return UNCATEGORIZED_COLOR;
  return CATEGORY_COLORS.find((c) => c.id === colorId) || UNCATEGORIZED_COLOR;
}
