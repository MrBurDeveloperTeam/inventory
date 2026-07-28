import { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';

type DOBPickerProps = {
  value: string;
  onChange: (value: string) => void;
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, index) => currentYear - index);

function getDaysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

function parseISO(value: string) {
  if (!value) return { day: null, month: null, year: null };

  const [year, month, day] = value.split('-').map(Number);

  return {
    day: day || null,
    month: month || null,
    year: year || null,
  };
}

function toISOValue(day: number, month: number, year: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function DOBPicker({ value, onChange }: DOBPickerProps) {
  const [open, setOpen] = useState(false);
  const [tempDay, setTempDay] = useState<number | null>(null);
  const [tempMonth, setTempMonth] = useState<number | null>(null);
  const [tempYear, setTempYear] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closePicker = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', closePicker);

    return () => document.removeEventListener('mousedown', closePicker);
  }, []);

  const savedDate = parseISO(value);
  const day = tempDay ?? savedDate.day;
  const month = tempMonth ?? savedDate.month;
  const year = tempYear ?? savedDate.year;
  const daysInMonth = month && year ? getDaysInMonth(month, year) : 31;
  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const isComplete = Boolean(day && month && year);

  const openPicker = () => {
    const existingDate = parseISO(value);
    setTempDay(existingDate.day);
    setTempMonth(existingDate.month);
    setTempYear(existingDate.year);
    setOpen(true);
  };

  const cancelPicker = () => {
    setTempDay(null);
    setTempMonth(null);
    setTempYear(null);
    setOpen(false);
  };

  const confirmPicker = () => {
    if (!day || !month || !year) return;

    onChange(toISOValue(day, month, year));
    cancelPicker();
  };

  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={openPicker}
        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center text-left text-sm transition-all focus:outline-none focus:ring-2 focus:ring-tiffany-600/20 focus:border-tiffany-600"
      >
        <CalendarDays className="h-4 w-4 text-slate-300 mr-3 shrink-0" />
        <span className={value ? 'text-slate-700' : 'text-slate-400'}>
          {value
            ? `${String(savedDate.day).padStart(2, '0')}/${String(savedDate.month).padStart(2, '0')}/${savedDate.year}`
            : 'dd/mm/yyyy'}
        </span>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-2 w-[300px] bg-white border border-slate-200 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.12)] p-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            Date of Birth
          </p>

          <div className="flex gap-2 mb-4">
            <div className="flex flex-col flex-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Day
              </label>
              <select
                value={day ?? ''}
                onChange={(event) => setTempDay(event.target.value ? Number(event.target.value) : null)}
                className="border border-slate-200 rounded-xl px-2 py-2 text-sm font-medium text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-tiffany-500/30 focus:border-tiffany-400"
              >
                <option value="">--</option>
                {days.map((item) => (
                  <option key={item} value={item}>{String(item).padStart(2, '0')}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col flex-[2]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Month
              </label>
              <select
                value={month ?? ''}
                onChange={(event) => {
                  const selectedMonth = event.target.value ? Number(event.target.value) : null;
                  setTempMonth(selectedMonth);

                  if (selectedMonth && day) {
                    const maximumDay = getDaysInMonth(selectedMonth, year ?? currentYear);
                    if (day > maximumDay) setTempDay(maximumDay);
                  }
                }}
                className="border border-slate-200 rounded-xl px-2 py-2 text-sm font-medium text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-tiffany-500/30 focus:border-tiffany-400"
              >
                <option value="">--</option>
                {MONTHS.map((item, index) => (
                  <option key={item} value={index + 1}>{item}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col flex-[1.5]">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Year
              </label>
              <select
                value={year ?? ''}
                onChange={(event) => setTempYear(event.target.value ? Number(event.target.value) : null)}
                className="border border-slate-200 rounded-xl px-2 py-2 text-sm font-medium text-slate-700 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-tiffany-500/30 focus:border-tiffany-400"
              >
                <option value="">----</option>
                {YEARS.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          {isComplete && (
            <div className="bg-slate-50 rounded-xl px-3 py-2 mb-3 text-center">
              <span className="text-sm font-bold text-slate-700">
                {day} {MONTHS[month - 1]} {year}
              </span>
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancelPicker}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmPicker}
              disabled={!isComplete}
              className="flex-1 px-4 py-2.5 rounded-xl bg-tiffany-600 text-white text-sm font-bold transition-colors hover:bg-tiffany-700 disabled:bg-tiffany-600/40 disabled:cursor-not-allowed"
            >
              Confirm
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
