'use client';
import { useState, useRef, useEffect } from 'react';

interface Option {
  value: string | number;
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
  /** Called when user confirms a new value not in the options list */
  onCreateOption?: (value: string) => void | Promise<void>;
}

/**
 * Combobox: supports both selecting from dropdown AND typing a custom value.
 * - Click the arrow to open dropdown
 * - Type to filter options OR enter a completely new value
 * - Press Enter or click outside to confirm typed value
 * - If onCreateOption is provided, it will be called when a new value is created
 */
export default function Combobox({
  value, onChange, options, placeholder = '請選擇或輸入', disabled = false, clearable = true, className = '',
  onCreateOption,
}: Props) {
  const [open, setOpen] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync input display with value — show label if value matches an option, else show raw value
  useEffect(() => {
    if (!focused) {
      const matchedOption = options.find(o => String(o.value) === String(value ?? ''));
      setInputVal(matchedOption ? matchedOption.label : (value ?? ''));
    }
  }, [value, focused, options]);

  const filtered = options.filter(o =>
    !inputVal || o.label.toLowerCase().includes(inputVal.toLowerCase())
  );

  const commitValue = (val: string) => {
    const isNew = val && !options.find(o => String(o.value) === val || o.label === val);
    onChange(val || null);
    if (isNew && onCreateOption) {
      onCreateOption(val);
    }
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
        // Compare against the current displayed label (not raw value) to detect real changes
        const currentLabel = options.find(o => String(o.value) === String(value ?? ''))?.label ?? (value ?? '');
        if (inputVal !== currentLabel) {
          commitValue(inputVal);
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [inputVal, value, onChange, onCreateOption, options]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputVal(e.target.value);
    setOpen(true);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitValue(inputVal);
      setOpen(false);
      setFocused(false);
    } else if (e.key === 'Escape') {
      const matchedOption = options.find(o => String(o.value) === String(value ?? ''));
      setInputVal(matchedOption ? matchedOption.label : (value ?? ''));
      setOpen(false);
      setFocused(false);
    }
  };

  const handleSelect = (optValue: string | number) => {
    const strVal = String(optValue);
    onChange(strVal);
    // Display the label, not the raw value
    const matchedOption = options.find(o => String(o.value) === strVal);
    setInputVal(matchedOption ? matchedOption.label : strVal);
    setOpen(false);
    setFocused(false);
  };

  const handleCreate = (newVal: string) => {
    onChange(newVal);
    setInputVal(newVal);
    setOpen(false);
    setFocused(false);
    if (onCreateOption) {
      onCreateOption(newVal);
    }
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
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 ${String(o.value) === (value ?? '') ? 'bg-blue-100 text-blue-700 font-medium' : ''}`}
                  onMouseDown={() => handleSelect(String(o.value))}
                >
                  {o.label}
                </button>
              ))
            )}
            {inputVal && !filtered.find(o => o.label === inputVal) && (
              <button
                type="button"
                className="w-full text-left px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 border-t border-gray-100"
                onMouseDown={() => handleCreate(inputVal)}
              >
                + 使用「{inputVal}」{onCreateOption ? '（新增至選項）' : ''}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
