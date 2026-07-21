import { useState } from "react";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function MonthYearPicker({ currentYear, currentMonth, onSelect, onClose }) {
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  // A reasonably wide range — 50 years back, 50 years forward from now
  const thisYear = new Date().getFullYear();
  const yearOptions = [];
  for (let y = thisYear - 50; y <= thisYear + 50; y++) {
    yearOptions.push(y);
  }

  const handleGo = () => {
    onSelect(year, month);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div className="relative w-full sm:w-80 bg-white dark:bg-brand-700 rounded-2xl border-2 border-brand-200 dark:border-brand-600 shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-pixel text-brand-800 dark:text-brand-100">JUMP TO</h2>
          <button
            onClick={onClose}
            className="text-brand-400 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-100 text-xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="flex gap-3 mb-4">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="flex-1 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>

          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="w-28 rounded-lg border border-brand-200 dark:border-brand-600 bg-white dark:bg-brand-800 text-brand-800 dark:text-brand-100 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-400"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleGo}
          className="w-full py-2.5 bg-brand-500 text-white rounded-lg font-medium hover:bg-brand-600"
        >
          Go
        </button>
      </div>
    </div>
  );
}

export default MonthYearPicker;
