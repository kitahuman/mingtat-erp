'use client';
import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string | null | undefined;
  onChange: (val: string | null) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
  className?: string;
}

/**
 * Combobox: supports both selecting from dropdown AND typing a custom value.
 * - Click the arrow to open dropdown
 * - Type to filter options OR enter a completely new value
 * - Press Enter or click outside to confirm typed value
 */
export default function Combobox({
  value, onChange, options, placeholder = '請選擇或輸入', disabled = false, clearable = true, className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input display with value
  useEffect(() => {
    if (!focused) {
      setInputVal(value ?? '');
    }
  }, [value, focused]);

  const filtered = options.filter(o =>
    !inputVal || o.label.toLowerCase().includes(inputVal.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
        // Commit the typed value if it differs from current
        if (inputVal !== (value ?? '')) {
          onChange(inputVal || null);
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inputVal, value, onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputVal(e.target.value);
    setOpen(true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onChange(inputVal || null);
      setOpen(false);
      setFocused(false);
    } else if (e.key === 'Escape') {
      setInputVal(value ?? '');
      setOpen(false);
      setFocused(false);
    }
  };

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setInputVal(optValue);
    setOpen(false);
    setFocused(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setInputVal('');
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className={`
        flex items-center border rounded overflow-hidden
        ${disabled ? 'bg-gray-100 border-gray-200' : 'bg-white border-gray-300 hover:border-blue-400'}
        ${(open || focused) ? 'border-blue-500 ring-1 ring-blue-300' : ''}
      `}>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={handleInputChange}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onKeyDown={handleInputKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 px-2 py-1 text-xs bg-transparent outline-none min-w-0"
        />
        <div className="flex items-center shrink-0 pr-1 gap-0.5">
          {clearable && inputVal && !disabled && (
            <span
              className="text-gray-400 hover:text-red-500 px-0.5 cursor-pointer text-xs"
              onMouseDown={handleClear}
            >✕</span>
          )}
          <span
            className="text-gray-400 cursor-pointer px-0.5"
            onMouseDown={e => { e.preventDefault(); if (!disabled) { setOpen(o => !o); inputRef.current?.focus(); } }}
          >▾</span>
        </div>
      </div>

      {open && !disabled && (
        <div className="absolute z-50 mt-0.5 w-full min-w-[140px] bg-white border border-gray-200 rounded shadow-lg">
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">
                {inputVal ? `按 Enter 新增「${inputVal}」` : '無選項'}
              </div>
            ) : (
              filtered.map(o => (
                <button
                  key={o.value}
                  type="button"
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 ${o.value === (value ?? '') ? 'bg-blue-100 text-blue-700 font-medium' : ''}`}
                  onMouseDown={() => handleSelect(o.value)}
                >
                  {o.label}
                </button>
              ))
            )}
            {inputVal && !filtered.find(o => o.label === inputVal) && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 border-t border-gray-100"
                onMouseDown={() => handleSelect(inputVal)}
              >
                + 使用「{inputVal}」
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
