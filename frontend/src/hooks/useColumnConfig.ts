'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ColumnConfig } from '@/components/ColumnCustomizer';
import { columnPreferencesApi } from '@/lib/api';

interface Column {
  key: string;
  label: string;
  [key: string]: any;
}

// 版本號：當欄位定義有重大變更時，遞增此版本號以強制重置所有用戶的 localStorage
const COLUMN_CONFIG_VERSION = 6;

export function useColumnConfig(pageKey: string, defaultColumns: Column[]) {
  const storageKey = `column-config-${pageKey}`;
  const versionKey = `column-config-version-${pageKey}`;

  const getDefaultConfig = useCallback((): ColumnConfig[] => {
    return defaultColumns.map((col, index) => ({
      key: col.key,
      label: col.label,
      visible: true,
      order: index,
    }));
  }, [defaultColumns]);

  const mergeWithDefaults = useCallback((saved: ColumnConfig[]): ColumnConfig[] => {
    const savedKeys = new Set(saved.map(c => c.key));
    const defaultKeys = new Set(defaultColumns.map(c => c.key));

    // Keep saved configs for existing columns
    const merged = saved.filter(c => defaultKeys.has(c.key));

    // Add new columns that aren't in saved config
    defaultColumns.forEach((col) => {
      if (!savedKeys.has(col.key)) {
        merged.push({
          key: col.key,
          label: col.label,
          visible: true,
          order: merged.length,
        });
      }
    });

    // Update labels from defaults (labels may change in code)
    merged.forEach(c => {
      const def = defaultColumns.find(d => d.key === c.key);
      if (def) c.label = def.label;
    });

    return merged;
  }, [defaultColumns]);

  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>(() => {
    if (typeof window === 'undefined') return getDefaultConfig();
    try {
      // 版本號檢查：若版本不符，強制重置為預設值
      const savedVersion = parseInt(localStorage.getItem(versionKey) || '0', 10);
      if (savedVersion < COLUMN_CONFIG_VERSION) {
        localStorage.removeItem(storageKey);
        localStorage.removeItem(`${storageKey}-widths`);
        localStorage.setItem(versionKey, String(COLUMN_CONFIG_VERSION));
        return getDefaultConfig();
      }

      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: ColumnConfig[] = JSON.parse(saved);
        return mergeWithDefaults(parsed);
      }
    } catch {}
    return getDefaultConfig();
  });

  // Track whether we've loaded from API (to avoid overwriting with stale localStorage)
  const apiLoadedRef = useRef(false);

  // Load from API on mount
  useEffect(() => {
    if (apiLoadedRef.current) return;
    apiLoadedRef.current = true;

    columnPreferencesApi.get(pageKey).then(res => {
      const { source, columns_config } = res.data;
      if (source !== 'none' && Array.isArray(columns_config) && columns_config.length > 0) {
        const merged = mergeWithDefaults(
          columns_config.map((c: any) => ({
            key: c.key,
            label: c.label || defaultColumns.find(d => d.key === c.key)?.label || c.key,
            visible: c.visible,
            order: c.order,
          }))
        );
        setColumnConfigs(merged);
        // Also update localStorage to keep in sync
        try {
          localStorage.setItem(storageKey, JSON.stringify(merged));
          localStorage.setItem(versionKey, String(COLUMN_CONFIG_VERSION));
        } catch {}
      }
    }).catch(() => {
      // API failed (e.g. not logged in yet), keep localStorage value
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey]);

  // Re-merge when defaultColumns changes (e.g. custom fields loaded async)
  const columnsKeyRef = useRef<string>('');
  useEffect(() => {
    const newKey = defaultColumns.map(c => c.key).join(',');
    if (columnsKeyRef.current && columnsKeyRef.current !== newKey) {
      // defaultColumns changed after initial render - merge new columns into config
      setColumnConfigs(prev => mergeWithDefaults(prev));
    }
    columnsKeyRef.current = newKey;
  }, [defaultColumns, mergeWithDefaults]);

  // Save to localStorage whenever config changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(columnConfigs));
      localStorage.setItem(versionKey, String(COLUMN_CONFIG_VERSION));
    } catch {}
  }, [columnConfigs, storageKey, versionKey]);

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

  const handleReset = useCallback(async () => {
    // Delete personal preference from API
    try {
      await columnPreferencesApi.resetPersonal(pageKey);
      // After reset, fetch the global default (or code default)
      const res = await columnPreferencesApi.get(pageKey);
      const { source, columns_config } = res.data;
      if (source !== 'none' && Array.isArray(columns_config) && columns_config.length > 0) {
        const merged = mergeWithDefaults(
          columns_config.map((c: any) => ({
            key: c.key,
            label: c.label || defaultColumns.find(d => d.key === c.key)?.label || c.key,
            visible: c.visible,
            order: c.order,
          }))
        );
        setColumnConfigs(merged);
        return;
      }
    } catch {}
    // Fall back to code default
    setColumnConfigs(getDefaultConfig());
    setColumnWidths({});
  }, [pageKey, getDefaultConfig, mergeWithDefaults, defaultColumns]);

  const handleSavePersonal = useCallback(async (configs: ColumnConfig[]) => {
    const payload = configs.map(c => ({ key: c.key, visible: c.visible, order: c.order }));
    await columnPreferencesApi.savePersonal(pageKey, payload);
  }, [pageKey]);

  const handleSaveDefault = useCallback(async (configs: ColumnConfig[]) => {
    const payload = configs.map(c => ({ key: c.key, visible: c.visible, order: c.order }));
    await columnPreferencesApi.saveDefault(pageKey, payload);
  }, [pageKey]);

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
    handleSavePersonal,
    handleSaveDefault,
    handleColumnResize,
  };
}
