'use client';

import { useState, useMemo } from 'react';

export interface MultiSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectPopupProps {
  title: string;
  options: MultiSelectOption[];
  selected: string[];
  onConfirm: (selected: string[]) => void;
  onClose: () => void;
  allowManualInput?: boolean;
  manualInputPlaceholder?: string;
}

export default function MultiSelectPopup({
  title,
  options,
  selected,
  onConfirm,
  onClose,
  allowManualInput = false,
  manualInputPlaceholder = '手動輸入...',
}: MultiSelectPopupProps) {
  const [search, setSearch] = useState('');
  const [localSelected, setLocalSelected] = useState<string[]>(selected);
  const [manualInput, setManualInput] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sublabel && o.sublabel.toLowerCase().includes(q)) ||
        o.id.toLowerCase().includes(q)
    );
  }, [options, search]);

  const toggle = (id: string) => {
    setLocalSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleAddManual = () => {
    const val = manualInput.trim();
    if (val && !localSelected.includes(`manual:${val}`)) {
      setLocalSelected((prev) => [...prev, `manual:${val}`]);
      setManualInput('');
    }
  };

  const getLabel = (id: string) => {
    if (id.startsWith('manual:')) return id.replace('manual:', '');
    const opt = options.find((o) => o.id === id);
    return opt ? opt.label : id;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">{title}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>
          <input
            type="text"
            placeholder="搜尋..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {/* Selected tags */}
        {localSelected.length > 0 && (
          <div className="px-4 pt-2 flex flex-wrap gap-1">
            {localSelected.map((id) => (
              <span
                key={id}
                className="inline-flex items-center bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full"
              >
                {getLabel(id)}
                <button
                  onClick={() => toggle(id)}
                  className="ml-1 text-blue-600 hover:text-blue-800"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Options list */}
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="text-center text-gray-400 py-4 text-sm">沒有找到結果</p>
          ) : (
            filtered.map((opt) => (
              <label
                key={opt.id}
                className="flex items-center px-3 py-2 hover:bg-gray-50 rounded cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={localSelected.includes(opt.id)}
                  onChange={() => toggle(opt.id)}
                  className="mr-3 h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{opt.label}</div>
                  {opt.sublabel && (
                    <div className="text-xs text-gray-500 truncate">{opt.sublabel}</div>
                  )}
                </div>
              </label>
            ))
          )}
        </div>

        {/* Manual input */}
        {allowManualInput && (
          <div className="px-4 py-2 border-t flex gap-2">
            <input
              type="text"
              placeholder={manualInputPlaceholder}
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddManual(); } }}
              className="flex-1 border rounded px-3 py-1.5 text-sm"
            />
            <button
              onClick={handleAddManual}
              disabled={!manualInput.trim()}
              className="px-3 py-1.5 bg-gray-100 text-sm rounded hover:bg-gray-200 disabled:opacity-50"
            >
              新增
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 border rounded-lg text-sm hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(localSelected)}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            確認 ({localSelected.length})
          </button>
        </div>
      </div>
    </div>
  );
}
