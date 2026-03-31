'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { workLogsApi } from '@/lib/api';

interface Props {
  value: string;
  onChange: (val: string) => void;
  type: 'start' | 'end';
  placeholder?: string;
  disabled?: boolean;
}

export default function LocationAutocomplete({ value, onChange, type, placeholder, disabled }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q || q.length < 1) { setSuggestions([]); return; }
    try {
      const res = await workLogsApi.locationSuggestions(type, q);
      setSuggestions(res.data || []);
      setOpen(true);
    } catch { setSuggestions([]); }
  }, [type]);

  const handleChange = (v: string) => {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => fetchSuggestions(v), 300);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value || ''}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-0.5 w-full bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50"
              onMouseDown={() => { onChange(s); setOpen(false); }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
