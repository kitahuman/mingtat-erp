'use client';
import { useState, useEffect } from 'react';
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
        // Fallback: empty array if API fails
        setOptions([]);
      })
      .finally(() => setLoading(false));
  }, [category]);

  return { options, loading };
}

/**
 * Hook to load multiple field option categories at once.
 * Returns a map of category -> { value, label }[]
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

  return { optionsMap, loading };
}
