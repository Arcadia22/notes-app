import { useState } from "react";
import { CATEGORY_COLORS } from "../lib/categoryColors";

// Shared color picker: preset swatches plus a rainbow-wheel circle that
// opens a native color input for any custom hex value. Used everywhere
// a category/block color is chosen (events, categories, routine blocks,
// habits) so the picking experience is consistent across the app.
//
// value: { colorId, customColor } — colorId is set for a preset pick,
//   customColor (hex string) is set for a custom pick; only one is ever
//   active at a time.
// onChange: (next) => void, where next is { colorId, customColor }
function ColorPicker({ value, onChange }) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const customHex = value.customColor || "#a878d8";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {CATEGORY_COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setShowCustomInput(false);
              onChange({ colorId: c.id, customColor: null });
            }}
            className={`w-7 h-7 rounded-full ${c.dot} ${
              value.colorId === c.id && !value.customColor ? "ring-2 ring-offset-1 ring-accent-500" : ""
            }`}
            aria-label={c.label}
          />
        ))}

        {/* Custom color wheel trigger */}
        <button
          type="button"
          onClick={() => setShowCustomInput((s) => !s)}
          className={`w-7 h-7 rounded-full flex-shrink-0 ${
            value.customColor ? "ring-2 ring-offset-1 ring-accent-500" : ""
          }`}
          style={{
            background: value.customColor
              ? value.customColor
              : "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
          }}
          aria-label="Pick a custom color"
          title="Pick a custom color"
        />
      </div>

      {showCustomInput && (
        <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-brand-50 dark:bg-brand-900 border border-brand-200 dark:border-brand-600">
          <input
            type="color"
            value={customHex}
            onChange={(e) => onChange({ colorId: null, customColor: e.target.value })}
            className="w-9 h-9 rounded-lg cursor-pointer border border-brand-200 dark:border-brand-600"
          />
          <input
            value={customHex}
            onChange={(e) => onChange({ colorId: null, customColor: e.target.value })}
            className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-900 dark:text-brand-100 px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-accent-400"
          />
        </div>
      )}
    </div>
  );
}

export default ColorPicker;
