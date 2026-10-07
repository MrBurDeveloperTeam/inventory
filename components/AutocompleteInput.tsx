import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Plus, Search } from 'lucide-react';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  className?: string;
}

/**
 * Text input with a styled suggestion list. Typing filters the options
 * (matches at the start of a word rank first), ↑/↓ to move, Enter/click to
 * pick, Esc to close. Free text is still accepted so existing product names
 * outside the list are never lost.
 */
const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  value, onChange, options, placeholder, required, className,
}) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return options;
    const starts: string[] = [];
    const contains: string[] = [];
    for (const o of options) {
      const l = o.toLowerCase();
      if (l.startsWith(q) || l.split(/[\s-]+/).some(w => w.startsWith(q))) starts.push(o);
      else if (l.includes(q)) contains.push(o);
    }
    return [...starts, ...contains];
  }, [options, value]);

  // Typed text that isn't an existing option can be saved as a new name.
  const typed = value.trim();
  const canCreate = typed.length > 0 && !options.some(o => o.toLowerCase() === typed.toLowerCase());
  const rowCount = filtered.length + (canCreate ? 1 : 0);

  useEffect(() => { setActive(0); }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (v: string) => { onChange(v); setOpen(false); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, rowCount - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open && rowCount > 0) { e.preventDefault(); pick(active < filtered.length ? filtered[active] : typed); }
    else if (e.key === 'Escape') setOpen(false);
  };

  const renderLabel = (label: string) => {
    const q = value.trim();
    const i = q ? label.toLowerCase().indexOf(q.toLowerCase()) : -1;
    if (i < 0) return label;
    return (
      <>
        {label.slice(0, i)}
        <span className="font-bold text-[#3498db]">{label.slice(i, i + q.length)}</span>
        {label.slice(i + q.length)}
      </>
    );
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          autoComplete="off"
          required={required}
          value={value}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={e => { onChange(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          className={className ?? 'w-full pl-9 pr-9 py-3 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#3498db] outline-none'}
        />
        <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && rowCount > 0 && (
        <div ref={listRef} className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[280px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1 custom-scrollbar">
          {filtered.map((opt, idx) => {
            const selected = opt === value;
            return (
              <button
                key={opt}
                type="button"
                data-idx={idx}
                onMouseEnter={() => setActive(idx)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => pick(opt)}
                className={`w-full flex items-center justify-between gap-2 text-left px-4 py-2 text-sm text-slate-700 transition-colors ${idx === active ? 'bg-blue-50' : ''} ${selected ? 'font-semibold' : ''}`}
              >
                <span className="truncate">{renderLabel(opt)}</span>
                {selected && <Check className="w-4 h-4 text-[#3498db] shrink-0" />}
              </button>
            );
          })}
          {canCreate && (
            <button
              type="button"
              data-idx={filtered.length}
              onMouseEnter={() => setActive(filtered.length)}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(typed)}
              className={`w-full flex items-center gap-2 text-left px-4 py-2 text-sm text-[#3498db] font-bold transition-colors ${filtered.length > 0 ? 'border-t border-slate-100 mt-1' : ''} ${active === filtered.length ? 'bg-blue-50' : ''}`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">Add “{typed}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default AutocompleteInput;
