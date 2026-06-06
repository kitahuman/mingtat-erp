'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  const selected = options.find(o => String(o.value) === String(value ?? ''));
  const filtered = options.filter(o =>
    String(o.label).toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => { setMounted(true); }, []);

  const updateDropdownPosition = useCallback(() => {
    if (!ref.current || !open) return;
    const rect = ref.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropdownHeight = Math.min(240, filtered.length * 30 + 44);
    const showAbove = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    setDropdownStyle({
      position: 'fixed',
      left: `${rect.left}px`,
      width: `${Math.max(rect.width, 140)}px`,
      ...(showAbove
        ? { bottom: `${window.innerHeight - rect.top + 2}px`, top: 'auto' }
        : { top: `${rect.bottom + 2}px`, bottom: 'auto' }),
    });
  }, [open, filtered.length]);

  useEffect(() => {
    if (open) updateDropdownPosition();
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    if (!open) return;
    const handleScrollOrResize = () => updateDropdownPosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open, updateDropdownPosition]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && ref.current.contains(target)) return;
      if (dropdownRef.current && dropdownRef.current.contains(target)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const dropdown = open && mounted ? createPortal(
    <div
      ref={dropdownRef}
      style={{ ...dropdownStyle, zIndex: 99999 }}
      className="bg-white border border-gray-200 rounded shadow-lg"
    >
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
    </div>,
    document.body
  ) : null;

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
      {dropdown}
    </div>
  );
}
