'use client';

import { WaChat, WaMessage } from '../page';

interface ChatListProps {
  chats: WaChat[];
  selectedChatId: string | null;
  unreadCounts: Record<string, number>;
  loading: boolean;
  onSelectChat: (chatId: string) => void;
}

// 判斷字串是否為純電話號碼
function isPhoneNumber(str: string): boolean {
  return /^[\d+\-\s()]+$/.test(str.trim());
}

function formatTime(timestamp: number): string {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit', hour12: false });
  } else if (diffDays === 1) {
    return '昨天';
  } else if (diffDays < 7) {
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    return `星期${days[date.getDay()]}`;
  } else {
    return date.toLocaleDateString('zh-HK', { month: 'numeric', day: 'numeric' });
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

export function ChatList({ chats, selectedChatId, unreadCounts, loading, onSelectChat }: ChatListProps) {
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

  return (
    <div className="flex-1 overflow-y-auto">
      {chats.map(chat => {
        const unread = unreadCounts[chat.id] || 0;
        const isSelected = chat.id === selectedChatId;
        const preview = getMessagePreview(chat.lastMessage);
        const time = formatTime(chat.lastMessage?.timestamp || 0);

        return (
          <div
            key={chat.id}
            onClick={() => onSelectChat(chat.id)}
            className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[#2a3942] transition-colors ${
              isSelected ? 'bg-[#2a3942]' : 'hover:bg-[#202c33]'
            }`}
          >
            <ChatAvatar name={chat.name} isGroup={chat.isGroup} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[#e9edef] font-medium text-sm truncate">{chat.name}</span>
                <span className={`text-xs flex-shrink-0 ml-2 ${unread > 0 ? 'text-[#00a884]' : 'text-[#8696a0]'}`}>
                  {time}
                </span>
              </div>
              {/* 如果顯示名稱不是電話號碼，則在名稱下方顯示電話號碼 */}
              {!chat.isGroup && chat.phone && !isPhoneNumber(chat.name) && (
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
          </div>
        );
      })}
    </div>
  );
}
