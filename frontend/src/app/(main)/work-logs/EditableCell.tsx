'use client';
import { useState, useRef, useEffect } from 'react';
import SearchableSelect from './SearchableSelect';
import Combobox from './Combobox';
import { fieldOptionsApi } from '@/lib/api';

interface Option { value: string | number; label: string; _raw?: any; }

export type CellType =
  | 'text' | 'number' | 'date' | 'time'
  | 'select' | 'combobox' | 'combobox_create'
  | 'checkbox' | 'readonly';

interface Props {
  value: any;
  displayValue?: string;
  onChange: (val: any) => void;
  type: CellType;
  options?: Option[];
  placeholder?: string;
  className?: string;
  isDirty?: boolean;
  disabled?: boolean;
  /** Category for combobox_create to auto-create new field options */
  createCategory?: string;
}

export default function EditableCell({
  value, displayValue, onChange, type, options = [], placeholder = '',
  className = '', isDirty = false, disabled = false, createCategory,
}: Props) {
  const [editing, setEditing] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close editing when clicking outside
  useEffect(() => {
    if (!editing) return;
    const handler = (e: MouseEvent) => {
      if (cellRef.current && !cellRef.current.contains(e.target as Node)) {
        setEditing(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editing]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current.type === 'text' || inputRef.current.type === 'number') {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const dirtyBorder = isDirty ? 'ring-2 ring-amber-400' : '';
  const baseCls = `px-2 py-1.5 text-xs cursor-pointer min-h-[28px] flex items-center ${className}`;

  if (disabled || type === 'readonly') {
    return (
      <div className={`${baseCls} text-gray-400`}>
        {displayValue ?? (value != null ? String(value) : '—')}
      </div>
    );
  }

  // Checkbox type: always show as checkbox, no need for click-to-edit
  if (type === 'checkbox') {
    return (
      <div className={`${baseCls} justify-center ${dirtyBorder}`} ref={cellRef}>
        <input
          type="checkbox"
          checked={!!value}
          onChange={e => onChange(e.target.checked)}
          className="w-4 h-4 cursor-pointer"
        />
      </div>
    );
  }

  // Display mode
  if (!editing) {
    return (
      <div
        className={`${baseCls} hover:bg-blue-50 ${dirtyBorder} truncate`}
        onClick={() => setEditing(true)}
        title={displayValue ?? (value != null ? String(value) : '')}
      >
        {displayValue ?? (value != null && value !== '' ? String(value) : <span className="text-gray-300">—</span>)}
      </div>
    );
  }

  // Edit mode
  const inputCls = 'w-full px-2 py-1 text-xs border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white';

  switch (type) {
    case 'text':
      return (
        <div ref={cellRef} className={`${dirtyBorder}`}>
          <input
            ref={inputRef}
            type="text"
            value={value || ''}
            onChange={e => onChange(e.target.value || null)}
            onKeyDown={e => { if (e.key === 'Enter') setEditing(false); if (e.key === 'Escape') setEditing(false); }}
            placeholder={placeholder}
            className={inputCls}
          />
        </div>
      );

    case 'number':
      return (
        <div ref={cellRef} className={`${dirtyBorder}`}>
          <input
            ref={inputRef}
            type="number"
            step="0.01"
            value={value ?? ''}
            onChange={e => onChange(e.target.value !== '' ? e.target.value : null)}
            onKeyDown={e => { if (e.key === 'Enter') setEditing(false); if (e.key === 'Escape') setEditing(false); }}
            placeholder={placeholder}
            className={`${inputCls} text-right`}
          />
        </div>
      );

    case 'date':
      return (
        <div ref={cellRef} className={`${dirtyBorder}`}>
          <input
            ref={inputRef}
            type="date"
            value={value || ''}
            onChange={e => { onChange(e.target.value || null); }}
            onBlur={() => setEditing(false)}
            className={inputCls}
          />
        </div>
      );

    case 'time':
      return (
        <div ref={cellRef} className={`${dirtyBorder}`}>
          <input
            ref={inputRef}
            type="time"
            value={value || ''}
            onChange={e => { onChange(e.target.value || null); }}
            onBlur={() => setEditing(false)}
            className={inputCls}
          />
        </div>
      );

    case 'select':
      return (
        <div ref={cellRef} className={`${dirtyBorder}`}>
          <SearchableSelect
            value={value}
            onChange={v => { onChange(v); setEditing(false); }}
            options={options}
            placeholder={placeholder}
          />
        </div>
      );

    case 'combobox':
      return (
        <div ref={cellRef} className={`${dirtyBorder}`}>
          <Combobox
            value={value || ''}
            onChange={v => { onChange(v ? String(v) : null); setEditing(false); }}
            options={options}
            placeholder={placeholder}
          />
        </div>
      );

    case 'combobox_create':
      return (
        <div ref={cellRef} className={`${dirtyBorder}`}>
          <Combobox
            value={value || ''}
            onChange={v => { onChange(v ? String(v) : null); setEditing(false); }}
            options={options}
            placeholder={placeholder}
            onCreateOption={createCategory ? async (val) => {
              try { await fieldOptionsApi.create({ category: createCategory, label: val }); } catch {}
            } : undefined}
          />
        </div>
      );

    default:
      return (
        <div ref={cellRef} className={`${dirtyBorder}`}>
          <input
            ref={inputRef}
            type="text"
            value={value || ''}
            onChange={e => onChange(e.target.value || null)}
            onKeyDown={e => { if (e.key === 'Enter') setEditing(false); }}
            className={inputCls}
          />
        </div>
      );
  }
}
