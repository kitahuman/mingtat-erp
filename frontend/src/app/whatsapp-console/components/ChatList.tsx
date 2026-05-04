'use client';

import { useState, useRef, useEffect } from 'react';
import { WaChat, WaMessage } from '../page';

interface ChatListProps {
  chats: WaChat[];
  selectedChatId: string | null;
  unreadCounts: Record<string, number>;
  loading: boolean;
  onSelectChat: (chatId: string) => void;
  // 自訂備註 & pin
  notes: Record<string, string>;
  pins: Set<string>;
  onSetNote: (chatId: string, note: string) => void;
  onTogglePin: (chatId: string) => void;
  getDisplayName: (chatId: string, pushName?: string | null, phone?: string | null) => string;
}

// 判斷字串是否為純電話號碼
function isPhoneNumber(str: string): boolean {
  return /^[\d+\-\s()]+$/.test(str.trim());
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '';
  // Bot 已將時間戳轉為毫秒，直接使用
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false });
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return `星期${days[date.getDay()]}`;
  } else {
    return date.toLocaleDateString('zh-HK', { timeZone: 'Asia/Hong_Kong', month: 'numeric', day: 'numeric' });
  }
}

function getMessagePreview(msg: WaMessage | null | undefined): string {
  if (!msg) return '';
  if (msg.type === 'image') return '📷 圖片';
  if (msg.type === 'audio' || msg.type === 'ptt') return '🎤 語音訊息';
  if (msg.type === 'video') return '🎥 影片';
  if (msg.type === 'document') return '📄 文件';
  if (msg.type === 'sticker') return '😀 貼圖';
  if (msg.text) return msg.text;
  return '[訊息]';
}

function ChatAvatar({ name, isGroup }: { name: string; isGroup: boolean }) {
  const initials = name ? name.charAt(0).toUpperCase() : '?';
  const colors = ['#00a884', '#0099cc', '#7c5cbf', '#e67e22', '#e74c3c', '#1abc9c'];
  const colorIdx = name.charCodeAt(0) % colors.length;

  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold text-lg flex-shrink-0"
      style={{ backgroundColor: colors[colorIdx] }}
    >
      {isGroup ? (
        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
          <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
      ) : (
        initials
      )}
    </div>
  );
}

/** 備註編輯彈窗 */
function NoteEditor({
  chatId,
  currentNote,
  displayName,
  onSave,
  onClose,
}: {
  chatId: string;
  currentNote: string;
  displayName: string;
  onSave: (note: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(currentNote);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = () => {
    onSave(value);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#233138] rounded-xl shadow-2xl w-full max-w-sm p-5"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-[#e9edef] font-semibold mb-1">設定備註名稱</h3>
        <p className="text-[#8696a0] text-xs mb-4 truncate">
          {displayName}
          {chatId.includes('@s.whatsapp.net') && (
            <span className="ml-1 text-[#8696a0]">· {chatId.replace('@s.whatsapp.net', '')}</span>
          )}
        </p>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
          placeholder="輸入備註名稱（留空則清除）"
          className="w-full bg-[#2a3942] text-[#e9edef] placeholder-[#8696a0] rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-[#00a884] mb-4"
          maxLength={50}
        />
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[#8696a0] text-sm hover:text-[#e9edef] transition-colors"
          >
            取消
          </button>
          {value !== currentNote && value.trim() === '' && currentNote && (
            <button
              onClick={() => { onSave(''); onClose(); }}
              className="px-4 py-2 text-red-400 text-sm hover:text-red-300 transition-colors"
            >
              清除備註
            </button>
          )}
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-[#00a884] text-white text-sm rounded-lg hover:bg-[#017561] transition-colors"
          >
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChatList({
  chats,
  selectedChatId,
  unreadCounts,
  loading,
  onSelectChat,
  notes,
  pins,
  onSetNote,
  onTogglePin,
  getDisplayName,
}: ChatListProps) {
  const [editingNote, setEditingNote] = useState<string | null>(null); // chatId
  const [contextMenu, setContextMenu] = useState<{ chatId: string; x: number; y: number } | null>(null);

  // 關閉右鍵選單
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[#2a3942]">
            <div className="w-12 h-12 rounded-full bg-[#2a3942] animate-pulse flex-shrink-0" />
            <div className="flex-1">
              <div className="h-4 bg-[#2a3942] rounded animate-pulse mb-2 w-3/4" />
              <div className="h-3 bg-[#2a3942] rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (chats.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#8696a0] text-sm">
        沒有對話記錄
      </div>
    );
  }

  // 排序：pin 的在前，其餘按最後訊息時間
  const sorted = [...chats].sort((a, b) => {
    const aPinned = pins.has(a.id) ? 1 : 0;
    const bPinned = pins.has(b.id) ? 1 : 0;
    if (aPinned !== bPinned) return bPinned - aPinned;
    const ta = a.lastMessage?.timestamp || 0;
    const tb = b.lastMessage?.timestamp || 0;
    return tb - ta;
  });

  const editingChat = editingNote ? chats.find(c => c.id === editingNote) : null;

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        {sorted.map(chat => {
          const unread = unreadCounts[chat.id] || 0;
          const isSelected = chat.id === selectedChatId;
          const pinned = pins.has(chat.id);
          const preview = getMessagePreview(chat.lastMessage);
          const time = formatTime(chat.lastMessage?.timestamp || 0);
          const displayName = getDisplayName(chat.id, chat.name !== chat.phone ? chat.name : null, chat.phone);
          const hasNote = !!notes[chat.id];

          return (
            <div
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
              onContextMenu={e => {
                e.preventDefault();
                setContextMenu({ chatId: chat.id, x: e.clientX, y: e.clientY });
              }}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[#2a3942] transition-colors relative group ${
                isSelected ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'
              }`}
            >
              {/* Pin 標記 */}
              {pinned && (
                <div className="absolute top-2 right-2 text-[#00a884]">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                  </svg>
                </div>
              )}

              <ChatAvatar name={displayName} isGroup={chat.isGroup} />

              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center justify-between mb-0.5">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="text-[#e9edef] font-medium text-sm truncate">{displayName}</span>
                    {hasNote && (
                      <svg className="w-3 h-3 text-[#00a884] flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                      </svg>
                    )}
                  </div>
                  <span className={`text-xs flex-shrink-0 ml-2 ${unread > 0 ? 'text-[#00a884]' : 'text-[#8696a0]'}`}>
                    {time}
                  </span>
                </div>

                {/* 電話號碼（當顯示名稱不是電話號碼時顯示） */}
                {!chat.isGroup && chat.phone && !isPhoneNumber(displayName) && (
                  <div className="text-[#8696a0] text-xs mb-0.5 truncate">{chat.phone}</div>
                )}

                <div className="flex items-center justify-between">
                  <p className="text-[#8696a0] text-xs truncate flex-1">
                    {chat.lastMessage?.fromMe && <span className="text-[#8696a0]">✓✓ </span>}
                    {preview}
                  </p>
                  {unread > 0 && (
                    <div className="ml-2 bg-[#00a884] text-white text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0 font-medium">
                      {unread > 99 ? '99+' : unread}
                    </div>
                  )}
                </div>
              </div>

              {/* Hover 操作按鈕 */}
              <div
                className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-1 bg-[#202c33] rounded-lg px-1 py-0.5 shadow"
                onClick={e => e.stopPropagation()}
              >
                {/* 備註按鈕 */}
                <button
                  title="設定備註名稱"
                  onClick={() => setEditingNote(chat.id)}
                  className="p-1 text-[#8696a0] hover:text-[#00a884] transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                  </svg>
                </button>
                {/* Pin 按鈕 */}
                <button
                  title={pinned ? '取消置頂' : '置頂'}
                  onClick={() => onTogglePin(chat.id)}
                  className={`p-1 transition-colors ${pinned ? 'text-[#00a884]' : 'text-[#8696a0] hover:text-[#00a884]'}`}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 右鍵選單 */}
      {contextMenu && (() => {
        const chat = chats.find(c => c.id === contextMenu.chatId);
        if (!chat) return null;
        const pinned = pins.has(chat.id);
        return (
          <div
            className="fixed z-50 bg-[#233138] rounded-xl shadow-2xl py-1 w-44"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setEditingNote(chat.id); setContextMenu(null); }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-[#e9edef] text-sm hover:bg-[#182229]"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
              設定備註名稱
            </button>
            <button
              onClick={() => { onTogglePin(chat.id); setContextMenu(null); }}
              className="flex items-center gap-3 w-full px-4 py-2.5 text-[#e9edef] text-sm hover:bg-[#182229]"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
              {pinned ? '取消置頂' : '置頂對話'}
            </button>
          </div>
        );
      })()}

      {/* 備註編輯彈窗 */}
      {editingNote && editingChat && (
        <NoteEditor
          chatId={editingNote}
          currentNote={notes[editingNote] || ''}
          displayName={getDisplayName(editingNote, editingChat.name !== editingChat.phone ? editingChat.name : null, editingChat.phone)}
          onSave={note => onSetNote(editingNote, note)}
          onClose={() => setEditingNote(null)}
        />
      )}
    </>
  );
}
