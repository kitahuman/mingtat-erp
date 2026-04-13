'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Option {
  value: string | number;
  label: string;
}

interface Props {
  value: (string | number)[];
  onChange: (vals: (string | number)[]) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Max tags shown inline before collapsing to "+N" */
  maxTagsShown?: number;
}

export default function MultiSearchableSelect({
  value = [],
  onChange,
  options,
  placeholder = '全部',
  disabled = false,
  className = '',
  maxTagsShown = 2,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOptions = options.filter(o =>
    value.map(String).includes(String(o.value))
  );
  const filtered = options.filter(o =>
    String(o.label).toLowerCase().includes(search.toLowerCase())
  );

  const updateDropdownPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 2,
      left: rect.left,
      width: Math.max(rect.width, 180),
      zIndex: 9999,
    });
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    if (!open) updateDropdownPosition();
    setOpen(o => !o);
  };

  const toggleOption = (val: string | number) => {
    const strVal = String(val);
    const current = value.map(String);
    if (current.includes(strVal)) {
      onChange(value.filter(v => String(v) !== strVal));
    } else {
      onChange([...value, val]);
    }
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const handler = () => updateDropdownPosition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open, updateDropdownPosition]);

  // Render selected tags inline
  const renderTriggerContent = () => {
    if (selectedOptions.length === 0) {
      return <span className="text-gray-400 text-xs truncate">{placeholder}</span>;
    }
    const shown = selectedOptions.slice(0, maxTagsShown);
    const extra = selectedOptions.length - maxTagsShown;
    return (
      <span className="flex items-center gap-0.5 flex-wrap min-w-0">
        {shown.map(o => (
          <span
            key={String(o.value)}
            className="inline-flex items-center gap-0.5 bg-blue-100 text-blue-700 text-[10px] px-1 py-0.5 rounded"
          >
            <span className="max-w-[60px] truncate">{o.label}</span>
            <span
              className="hover:text-red-500 cursor-pointer leading-none"
              onMouseDown={e => { e.stopPropagation(); toggleOption(o.value); }}
            >×</span>
          </span>
        ))}
        {extra > 0 && (
          <span className="text-[10px] text-blue-600 font-medium">+{extra}</span>
        )}
      </span>
    );
  };

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="bg-white border border-gray-200 rounded shadow-lg"
    >
      {/* Search input */}
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
      {/* Select all / Clear all */}
      {options.length > 0 && (
        <div className="flex gap-2 px-2 py-1 border-b border-gray-100">
          <button
            type="button"
            className="text-[10px] text-blue-600 hover:underline"
            onMouseDown={e => { e.preventDefault(); onChange(filtered.map(o => o.value)); }}
          >
            {search ? '全選搜尋結果' : '全選'}
          </button>
          {value.length > 0 && (
            <button
              type="button"
              className="text-[10px] text-gray-400 hover:text-red-500 hover:underline"
              onMouseDown={e => { e.preventDefault(); onChange([]); }}
            >
              清除
            </button>
          )}
        </div>
      )}
      {/* Options list */}
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-400">無結果</div>
        ) : (
          filtered.map(o => {
            const isSelected = value.map(String).includes(String(o.value));
            return (
              <button
                key={String(o.value)}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-blue-50 ${isSelected ? 'bg-blue-50 text-blue-700' : ''}`}
                onMouseDown={e => { e.preventDefault(); toggleOption(o.value); }}
              >
                <span className={`w-3.5 h-3.5 shrink-0 border rounded flex items-center justify-center text-[9px] ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300'}`}>
                  {isSelected ? '✓' : ''}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  ) : null;

  return (
    <div ref={triggerRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`
          w-full flex items-center justify-between px-2 py-1 text-xs border rounded min-h-[26px]
          ${disabled ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white border-gray-300 hover:border-blue-400 cursor-pointer'}
          ${open ? 'border-blue-500 ring-1 ring-blue-300' : ''}
        `}
      >
        <span className="flex-1 min-w-0 text-left">{renderTriggerContent()}</span>
        <span className="flex items-center gap-0.5 ml-1 shrink-0">
          {selectedOptions.length > 0 && !disabled && (
            <span
              className="text-gray-400 hover:text-red-500 px-0.5 text-[10px]"
              onMouseDown={clearAll}
            >✕</span>
          )}
          <span className="text-gray-400">▾</span>
        </span>
      </button>

      {/* Render dropdown via Portal to escape any overflow container */}
      {typeof document !== 'undefined' && dropdown
        ? createPortal(dropdown, document.body)
        : null}
    </div>
  );
}
