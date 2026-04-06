'use client';
/**
 * ClientContractCombobox
 *
 * A self-contained Combobox for the `client_contract_no` field.
 * - Loads options from the field_options API (category: 'client_contract_no')
 * - Allows the user to select an existing value OR type a new one
 * - When a new value is confirmed, it is immediately added to the local options list
 *   AND persisted to the API so it appears in all other dropdowns after next load
 *
 * Usage:
 *   <ClientContractCombobox
 *     value={form.client_contract_no || ''}
 *     onChange={(val) => setForm({ ...form, client_contract_no: val || '' })}
 *   />
 *
 * Optional props:
 *   extraOptions  – additional { value, label } pairs to merge (e.g. from a parent hook)
 *   placeholder   – defaults to '選擇或輸入客戶合約'
 *   disabled
 *   className
 */

import { useState, useEffect, useCallback } from 'react';
import Combobox from '@/components/Combobox';
import { fieldOptionsApi } from '@/lib/api';

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string | null | undefined;
  onChange: (val: string | null) => void;
  extraOptions?: Option[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function ClientContractCombobox({
  value,
  onChange,
  extraOptions,
  placeholder = '選擇或輸入客戶合約',
  disabled = false,
  className = '',
}: Props) {
  const [options, setOptions] = useState<Option[]>([]);

  // Load options from API on mount
  useEffect(() => {
    fieldOptionsApi.getByCategory('client_contract_no')
      .then(res => {
        const data: { label: string; is_active: boolean }[] = res.data;
        setOptions(
          data
            .filter(o => o.is_active !== false)
            .map(o => ({ value: o.label, label: o.label }))
        );
      })
      .catch(() => setOptions([]));
  }, []);

  // Merge extra options (deduplicated)
  const mergedOptions: Option[] = (() => {
    if (!extraOptions || extraOptions.length === 0) return options;
    const labels = new Set(options.map(o => o.label));
    const extras = extraOptions.filter(o => !labels.has(o.label));
    return [...options, ...extras];
  })();

  /**
   * Called by Combobox when the user confirms a value that is NOT in the options list.
   * We immediately add it to local state (optimistic update) and persist to the API.
   */
  const handleCreate = useCallback(async (val: string) => {
    // Add to local options immediately so the dropdown shows it next time
    setOptions(prev => {
      if (prev.find(o => o.label === val)) return prev;
      return [...prev, { value: val, label: val }];
    });
    // Persist to API (fire-and-forget; errors are silently ignored)
    try {
      await fieldOptionsApi.create({ category: 'client_contract_no', label: val });
    } catch {}
  }, []);

  return (
    <Combobox
      value={value}
      onChange={onChange}
      options={mergedOptions}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      onCreateOption={handleCreate}
    />
  );
}
