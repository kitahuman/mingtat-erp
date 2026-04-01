'use client';
import { useState, useRef, useEffect, useCallback } from 'react';

export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  width?: number;
  order: number;
}

interface Props {
  columns: ColumnConfig[];
  onChange: (columns: ColumnConfig[]) => void;
  onReset: () => void;
}

export default function ColumnCustomizer({ columns, onChange, onReset }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggleVisibility = (key: string) => {
    const updated = columns.map(c => c.key === key ? { ...c, visible: !c.visible } : c);
    // Ensure at least one column is visible
    if (updated.filter(c => c.visible).length === 0) return;
    onChange(updated);
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    const updated = [...columns];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    // Re-assign order
    updated.forEach((c, i) => c.order = i);
    setDragIndex(index);
    onChange(updated);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
        title="自訂欄位"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="text-sm font-bold text-gray-900">自訂欄位</h3>
            <button onClick={onReset} className="text-xs text-blue-600 hover:text-blue-800">
              重置預設
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {columns.map((col, index) => (
              <div
                key={col.key}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-move hover:bg-gray-50 transition-colors ${
                  dragIndex === index ? 'bg-blue-50 border border-blue-200' : ''
                }`}
              >
                <span className="text-gray-300 cursor-move">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                </span>
                <label className="flex items-center gap-2 flex-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={() => toggleVisibility(col.key)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{col.label}</span>
                </label>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 border-t bg-gray-50 rounded-b-xl">
            <p className="text-xs text-gray-400">拖動調整順序，勾選控制顯示</p>
          </div>
        </div>
      )}
    </div>
  );
}
