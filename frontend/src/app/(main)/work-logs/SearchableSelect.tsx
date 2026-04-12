'use client';
import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string | number;
  label: string;
}

interface Props {
  value: string | number | null | undefined;
  onChange: (val: string | number | null) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}

export default function SearchableSelect({
  value, onChange, options, placeholder = '請選擇', disabled = false, clearable = true, className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find(o => String(o.value) === String(value ?? ''));
  const filtered = options.filter(o =>
    String(o.label).toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(o => !o); }}
        className={`
          w-full flex items-center justify-between px-2 py-1 text-xs border rounded
          ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white border-gray-300 hover:border-blue-400 cursor-pointer'}
          ${open ? 'border-blue-500 ring-1 ring-blue-300' : ''}
        `}
      >
        <span className={`truncate ${!selected ? 'text-gray-400' : ''}`}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-0.5 ml-1 shrink-0">
          {clearable && selected && !disabled && (
            <span
              className="text-gray-400 hover:text-red-500 px-0.5"
              onMouseDown={e => { e.stopPropagation(); onChange(null); }}
            >✕</span>
          )}
          <span className="text-gray-400">▾</span>
        </span>
      </button>

      {open && (
        <div className="absolute z-[200] mt-0.5 w-full min-w-[140px] bg-white border border-gray-200 rounded shadow-lg">
          <div className="p-1.5 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜尋..."
              className="w-full px-2 py-1 text-xs border border-gray-200 rounded outline-none focus:border-blue-400"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">無結果</div>
            ) : (
              filtered.map(o => (
                <button
                  key={String(o.value)}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 ${String(o.value) === String(value ?? '') ? 'bg-blue-100 text-blue-700 font-medium' : ''}`}
                  onMouseDown={() => { onChange(o.value); setOpen(false); setSearch(''); }}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
