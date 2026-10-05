import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';

export interface ComboOption { value: string; label: string; hint?: string }
export interface ComboGroup { label: string; options: ComboOption[] }

const MAX_VISIBLE = 100;

interface ProductComboboxProps {
  value: string;
  onChange: (value: string) => void;
  groups: ComboGroup[];
  /** Pinned first row, e.g. "Create New Product..." (value 'new'). */
  pinned?: ComboOption;
  placeholder?: string;
  loading?: boolean;
  required?: boolean;
  className?: string;
}

/**
 * A <select> replacement you can type into: click (or focus) and start
 * typing to filter by name/hint, ↑/↓ to move, Enter to pick, Esc to close.
 * A hidden input keeps native `required` form validation working.
 */
const ProductCombobox: React.FC<ProductComboboxProps> = ({
  value, onChange, groups, pinned, placeholder = 'Choose existing product...', loading, required, className,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedLabel = useMemo(() => {
    if (pinned && value === pinned.value) return pinned.label;
    for (const g of groups) {
      const o = g.options.find(o => o.value === value);
      if (o) return o.label;
    }
    return '';
  }, [value, groups, pinned]);

  // Flat, filtered list (drives both rendering and keyboard navigation).
  const flat = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (o: ComboOption) => !q || `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q);
    const rows: { group?: string; opt: ComboOption }[] = [];
    if (pinned && (!q || pinned.label.toLowerCase().includes(q) || 'create new'.includes(q))) rows.push({ opt: pinned });
    for (const g of groups) {
      const opts = g.options.filter(match);
      opts.forEach((opt, i) => rows.push({ group: i === 0 ? g.label : undefined, opt }));
    }
    return rows;
  }, [groups, pinned, query]);

  // Rendering ~1,000 buttons at once is slow; show the first MAX_VISIBLE
  // matches and ask the user to keep typing for the rest. Keyboard nav and
  // Enter operate on the visible rows.
  const visible = flat.length > MAX_VISIBLE ? flat.slice(0, MAX_VISIBLE) : flat;
  const hiddenCount = flat.length - visible.length;

  useEffect(() => { setActive(0); }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) { setOpen(false); setQuery(''); }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const pick = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive(a => Math.min(a + 1, visible.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && open) { e.preventDefault(); if (visible[active]) pick(visible[active].opt.value); }
    else if (e.key === 'Escape') { setOpen(false); setQuery(''); }
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
          value={open ? query : selectedLabel}
          placeholder={loading ? 'Loading shop products...' : placeholder}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKeyDown}
          className={className ?? 'w-full pl-9 pr-9 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm outline-none focus:ring-2 focus:ring-[#3498db] shadow-sm'}
        />
        <ChevronDown className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>
      {/* keeps native "required" validation working */}
      <input tabIndex={-1} aria-hidden="true" required={required} value={value} onChange={() => {}} className="absolute inset-0 opacity-0 pointer-events-none" />

      {open && (
        <div ref={listRef} className="absolute left-0 right-0 top-full mt-1 z-50 max-h-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl py-1">
          {visible.length === 0 && <div className="px-4 py-3 text-xs text-slate-400">No matching products</div>}
          {visible.map((row, idx) => (
            <React.Fragment key={`${row.opt.value}-${idx}`}>
              {row.group && <div className="px-4 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">{row.group}</div>}
              <button
                type="button"
                data-idx={idx}
                onMouseEnter={() => setActive(idx)}
                onClick={() => pick(row.opt.value)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${idx === active ? 'bg-blue-50' : ''} ${row.opt.value === 'new' ? 'text-[#3498db] font-bold' : 'text-slate-700'} ${row.opt.value === value ? 'font-semibold' : ''}`}
              >
                {row.opt.label}
              </button>
            </React.Fragment>
          ))}
          {hiddenCount > 0 && (
            <div className="px-4 py-2 text-[11px] text-slate-400">{hiddenCount} more — keep typing to narrow the list</div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProductCombobox;
