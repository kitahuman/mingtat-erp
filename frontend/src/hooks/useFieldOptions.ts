'use client';
import { useState, useEffect, useCallback } from 'react';
import { fieldOptionsApi } from '@/lib/api';

interface FieldOption {
  id: number;
  category: string;
  label: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * Hook to load field options from the Options Management API.
 * Returns an array of { value, label } for use in Combobox/Select components.
 * Also returns addOption() to optimistically add a new option locally + persist to API.
 */
export function useFieldOptions(category: string) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!category) return;
    setLoading(true);
    fieldOptionsApi.getByCategory(category)
      .then(res => {
        const data: FieldOption[] = res.data;
        setOptions(
          data
            .filter(opt => opt.is_active !== false)
            .map(opt => ({ value: opt.label, label: opt.label }))
        );
      })
      .catch(() => {
        setOptions([]);
      })
      .finally(() => setLoading(false));
  }, [category]);

  const addOption = useCallback(async (label: string) => {
    // Optimistically add to local state immediately
    setOptions(prev => {
      if (prev.find(o => o.label === label)) return prev;
      return [...prev, { value: label, label }];
    });
    // Persist to API (ignore errors – value is already selected in form)
    try {
      await fieldOptionsApi.create({ category, label });
    } catch {}
  }, [category]);

  return { options, loading, addOption };
}

/**
 * Hook to load multiple field option categories at once.
 * Returns a map of category -> { value, label }[]
 * Also returns addOption(category, label) to optimistically add a new option.
 */
export function useMultiFieldOptions(categories: string[]) {
  const [optionsMap, setOptionsMap] = useState<Record<string, { value: string; label: string }[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (categories.length === 0) return;
    setLoading(true);
    Promise.all(
      categories.map(cat =>
        fieldOptionsApi.getByCategory(cat)
          .then(res => ({ category: cat, data: res.data as FieldOption[] }))
          .catch(() => ({ category: cat, data: [] as FieldOption[] }))
      )
    ).then(results => {
      const map: Record<string, { value: string; label: string }[]> = {};
      for (const { category, data } of results) {
        map[category] = data
          .filter(opt => opt.is_active !== false)
          .map(opt => ({ value: opt.label, label: opt.label }));
      }
      setOptionsMap(map);
    }).finally(() => setLoading(false));
  }, [categories.join(',')]);

  /**
   * Optimistically add a new option to a specific category in the local state,
   * then persist it to the API.
   */
  const addOption = useCallback(async (category: string, label: string) => {
    setOptionsMap(prev => {
      const existing = prev[category] || [];
      if (existing.find(o => o.label === label)) return prev;
      return { ...prev, [category]: [...existing, { value: label, label }] };
    });
    try {
      await fieldOptionsApi.create({ category, label });
    } catch {}
  }, []);

  return { optionsMap, loading, addOption };
}
