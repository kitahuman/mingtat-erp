'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { ColumnConfig } from '@/components/ColumnCustomizer';

interface Column {
  key: string;
  label: string;
  [key: string]: any;
}

export function useColumnConfig(pageKey: string, defaultColumns: Column[]) {
  const storageKey = `column-config-${pageKey}`;

  const getDefaultConfig = useCallback((): ColumnConfig[] => {
    return defaultColumns.map((col, index) => ({
      key: col.key,
      label: col.label,
      visible: true,
      order: index,
    }));
  }, [defaultColumns]);

  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>(() => {
    if (typeof window === 'undefined') return getDefaultConfig();
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: ColumnConfig[] = JSON.parse(saved);
        // Merge with defaults: add new columns, remove deleted ones
        const savedKeys = new Set(parsed.map(c => c.key));
        const defaultKeys = new Set(defaultColumns.map(c => c.key));
        
        // Keep saved configs for existing columns
        const merged = parsed.filter(c => defaultKeys.has(c.key));
        
        // Add new columns that aren't in saved config
        defaultColumns.forEach((col, index) => {
          if (!savedKeys.has(col.key)) {
            merged.push({
              key: col.key,
              label: col.label,
              visible: true,
              order: merged.length,
            });
          }
        });
        
        // Update labels from defaults
        merged.forEach(c => {
          const def = defaultColumns.find(d => d.key === c.key);
          if (def) c.label = def.label;
        });
        
        return merged;
      }
    } catch {}
    return getDefaultConfig();
  });

  // Save to localStorage whenever config changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columnConfigs));
    } catch {}
  }, [columnConfigs, storageKey]);

  // Column widths
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem(`${storageKey}-widths`);
      return saved ? JSON.parse(saved) : {};
    } catch {}
    return {};
  });

  useEffect(() => {
    try {
      localStorage.setItem(`${storageKey}-widths`, JSON.stringify(columnWidths));
    } catch {}
  }, [columnWidths, storageKey]);

  const handleColumnConfigChange = useCallback((configs: ColumnConfig[]) => {
    setColumnConfigs(configs);
  }, []);

  const handleReset = useCallback(() => {
    setColumnConfigs(getDefaultConfig());
    setColumnWidths({});
  }, [getDefaultConfig]);

  const handleColumnResize = useCallback((key: string, width: number) => {
    setColumnWidths(prev => ({ ...prev, [key]: width }));
  }, []);

  // Get visible columns in correct order, mapped back to original column definitions
  const visibleColumns = useMemo(() => {
    const sorted = [...columnConfigs]
      .filter(c => c.visible)
      .sort((a, b) => a.order - b.order);
    
    return sorted.map(config => {
      const original = defaultColumns.find(c => c.key === config.key);
      if (!original) return null;
      return {
        ...original,
        _width: columnWidths[config.key],
      };
    }).filter(Boolean);
  }, [columnConfigs, defaultColumns, columnWidths]);

  return {
    columnConfigs,
    columnWidths,
    visibleColumns,
    handleColumnConfigChange,
    handleReset,
    handleColumnResize,
  };
}
