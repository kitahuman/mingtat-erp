'use client';

import { useState, useCallback, useEffect } from 'react';

const NOTES_KEY = 'wa_contact_notes';   // chatId -> 自訂備註名稱
const PINS_KEY  = 'wa_pinned_chats';    // Set<chatId>

function loadNotes(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'); } catch { return {}; }
}

function loadPins(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const arr = JSON.parse(localStorage.getItem(PINS_KEY) || '[]');
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

export function useContactStore() {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pins, setPins] = useState<Set<string>>(new Set());

  // 初始化（client-side only）
  useEffect(() => {
    setNotes(loadNotes());
    setPins(loadPins());
  }, []);

  /** 設定或清除自訂備註名稱 */
  const setNote = useCallback((chatId: string, note: string) => {
    setNotes(prev => {
      const next = { ...prev };
      if (note.trim()) {
        next[chatId] = note.trim();
      } else {
        delete next[chatId];
      }
      localStorage.setItem(NOTES_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  /** 取得聯絡人顯示名稱（自訂備註 > pushName > 電話號碼）*/
  const getDisplayName = useCallback((chatId: string, pushName?: string | null, phone?: string | null): string => {
    if (notes[chatId]) return notes[chatId];
    if (pushName) return pushName;
    if (phone) return phone;
    return chatId.replace('@s.whatsapp.net', '').replace('@g.us', '');
  }, [notes]);

  /** 切換 pin 狀態 */
  const togglePin = useCallback((chatId: string) => {
    setPins(prev => {
      const next = new Set(prev);
      if (next.has(chatId)) {
        next.delete(chatId);
      } else {
        next.add(chatId);
      }
      localStorage.setItem(PINS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const isPinned = useCallback((chatId: string) => pins.has(chatId), [pins]);

  return { notes, pins, setNote, getDisplayName, togglePin, isPinned };
}
