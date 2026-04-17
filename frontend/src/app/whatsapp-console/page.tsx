'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Cookies from 'js-cookie';
import { whatsappConsoleApi } from '@/lib/api';
import { ChatList } from './components/ChatList';
import { MessageView } from './components/MessageView';
import { usePushNotifications } from './hooks/usePushNotifications';
import { useWhatsappSSE } from './hooks/useWhatsappSSE';

export interface WaMessage {
  id: string;
  chatId: string;
  fromMe: boolean;
  sender: string;
  senderName?: string | null;
  chatName?: string | null;
  text: string;
  type: string;
  timestamp: number;
  hasMedia: boolean;
}

export interface WaChat {
  id: string;
  name: string;
  phone?: string | null; // 電話號碼（私聊才有）
  isGroup: boolean;
  lastMessage?: WaMessage | null;
  unreadCount: number;
}

export default function WhatsappConsolePage() {
  const [chats, setChats] = useState<WaChat[]>([]);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [botStatus, setBotStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null); // null = 尚未檢查
  const notificationSound = useRef<HTMLAudioElement | null>(null);

  // 初始化通知音效
  useEffect(() => {
    notificationSound.current = new Audio('/whatsapp-console/notification.mp3');
    notificationSound.current.volume = 0.5;
  }, []);

  // 檢查登入狀態和角色 — 必須在任何 API 請求之前完成
  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) {
      window.location.href = '/login?redirect=/whatsapp-console';
      return;
    }
    // 檢查用戶角色（從 cookie 讀取）
    try {
      const userStr = Cookies.get('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.role === 'admin') {
          setIsAdmin(true);
          setIsAuthenticated(true);
        } else {
          setIsAdmin(false);
        }
      } else {
        // 沒有 user cookie，認為無權限
        setIsAdmin(false);
      }
    } catch {
      setIsAdmin(false);
    }
  }, []);

  // 載入對話列表
  const loadChats = useCallback(async () => {
    try {
      setLoadingChats(true);
      const res = await whatsappConsoleApi.getChats();
      const chatList: WaChat[] = res.data.chats || [];
      setChats(chatList);
      // 初始化未讀計數
      const counts: Record<string, number> = {};
      chatList.forEach(c => { counts[c.id] = c.unreadCount || 0; });
      setUnreadCounts(counts);
    } catch (err) {
      console.error('Failed to load chats:', err);
    } finally {
      setLoadingChats(false);
    }
  }, []);

  // 載入訊息記錄
  const loadMessages = useCallback(async (chatId: string) => {
    try {
      setLoadingMessages(true);
      const res = await whatsappConsoleApi.getMessages(chatId, 50);
      setMessages(res.data.messages || []);
      // 清除該對話的未讀計數
      setUnreadCounts(prev => ({ ...prev, [chatId]: 0 }));
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  // 查詢 Bot 狀態
  const checkBotStatus = useCallback(async () => {
    try {
      const res = await whatsappConsoleApi.getStatus();
      setBotStatus(res.data.status === 'connected' ? 'connected' : 'disconnected');
    } catch {
      setBotStatus('disconnected');
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadChats();
    checkBotStatus();
    const interval = setInterval(checkBotStatus, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, loadChats, checkBotStatus]);

  useEffect(() => {
    if (selectedChatId) {
      loadMessages(selectedChatId);
    }
  }, [selectedChatId, loadMessages]);

  // SSE 即時訊息
  const handleNewMessage = useCallback((msg: WaMessage) => {
    // 更新訊息列表（如果是當前對話）
    if (msg.chatId === selectedChatId) {
      setMessages(prev => {
        // 避免重複
        if (prev.some(m => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    } else if (!msg.fromMe) {
      // 增加未讀計數
      setUnreadCounts(prev => ({
        ...prev,
        [msg.chatId]: (prev[msg.chatId] || 0) + 1,
      }));
      // 播放提示音
      notificationSound.current?.play().catch(() => {});
    }

    // 更新對話列表的最後訊息
    setChats(prev => {
      const idx = prev.findIndex(c => c.id === msg.chatId);
      if (idx === -1) {
        // 新對話，重新載入
        loadChats();
        return prev;
      }
      const updated = [...prev];
      updated[idx] = { ...updated[idx], lastMessage: msg };
      // 把有新訊息的對話移到頂部
      const chat = updated.splice(idx, 1)[0];
      return [chat, ...updated];
    });
  }, [selectedChatId, loadChats]);

  const handleStatusChange = useCallback((status: string) => {
    setBotStatus(status === 'connected' ? 'connected' : 'disconnected');
  }, []);

  useWhatsappSSE({ onMessage: handleNewMessage, onStatus: handleStatusChange });

  // Web Push 通知
  usePushNotifications();

  // 監聽 Service Worker 訊息（通知點擊後開啟對應對話）
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_CHAT' && event.data.chatId) {
        setSelectedChatId(event.data.chatId);
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  // 選擇對話
  const handleSelectChat = useCallback((chatId: string) => {
    setSelectedChatId(chatId);
  }, []);

  // 發送訊息
  const handleSendMessage = useCallback(async (text: string) => {
    if (!selectedChatId || !text.trim()) return;
    try {
      const res = await whatsappConsoleApi.sendMessage(selectedChatId, text);
      if (res.data.message) {
        setMessages(prev => [...prev, res.data.message]);
      }
    } catch (err) {
      console.error('Send message failed:', err);
      alert('發送失敗，請重試');
    }
  }, [selectedChatId]);

  // 發送圖片
  const handleSendImage = useCallback(async (imageBase64: string, caption?: string, mimeType?: string) => {
    if (!selectedChatId) return;
    try {
      const res = await whatsappConsoleApi.sendImage(selectedChatId, imageBase64, caption, mimeType);
      if (res.data.message) {
        setMessages(prev => [...prev, res.data.message]);
      }
    } catch (err) {
      console.error('Send image failed:', err);
      alert('圖片發送失敗，請重試');
    }
  }, [selectedChatId]);

  // 發送語音
  const handleSendVoice = useCallback(async (audioBase64: string, mimeType?: string) => {
    if (!selectedChatId) return;
    try {
      const res = await whatsappConsoleApi.sendVoice(selectedChatId, audioBase64, mimeType);
      if (res.data.message) {
        setMessages(prev => [...prev, res.data.message]);
      }
    } catch (err) {
      console.error('Send voice failed:', err);
      alert('語音發送失敗，請重試');
    }
  }, [selectedChatId]);

  const selectedChat = chats.find(c => c.id === selectedChatId);
  const filteredChats = searchQuery.trim()
    ? chats.filter(c => {
        const q = searchQuery.toLowerCase();
        // 搜尋顯示名稱、電話號碼（phone 欄位）、以及 chat id（包含 @s.whatsapp.net 的完整 JID）
        return (
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.includes(q)) ||
          c.id.toLowerCase().includes(q)
        );
      })
    : chats;
  const totalUnread = Object.values(unreadCounts).reduce((a, b) => a + b, 0);

  // 尚未驗證登入狀態時，顯示載入畫面
  if (!isAuthenticated && isAdmin === null) {
    return (
      <div className="flex h-screen bg-[#111b21] items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00a884]"></div>
      </div>
    );
  }

  // 非 admin 角色，顯示無權限提示
  if (isAdmin === false) {
    return (
      <div className="flex h-screen bg-[#111b21] items-center justify-center">
        <div className="text-center px-8">
          <div className="w-20 h-20 rounded-full bg-[#2a3942] flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[#e9edef] mb-2">無權限訪問</h2>
          <p className="text-[#8696a0] text-sm mb-6">此頁面僅限 Admin 角色的帳號訪問</p>
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="px-6 py-2 bg-[#00a884] text-white rounded-lg text-sm hover:bg-[#008f72] transition-colors"
          >
            返回主頁
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#111b21] text-white overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* 標題欄 */}
      <title>{totalUnread > 0 ? `(${totalUnread}) WhatsApp 遙控台` : 'WhatsApp 遙控台'}</title>

      {/* 左側：對話列表 */}
      <div className={`flex flex-col bg-[#111b21] border-r border-[#2a3942] ${selectedChatId ? 'hidden md:flex' : 'flex'} w-full md:w-[380px] flex-shrink-0`}>
        {/* 頂部標題列 */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#202c33]">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white font-bold text-lg">
              W
            </div>
            <span className="font-semibold text-[#e9edef]">WhatsApp 遙控台</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Bot 狀態指示燈 */}
            <div className="flex items-center gap-1.5 text-xs">
              <div className={`w-2 h-2 rounded-full ${
                botStatus === 'connected' ? 'bg-[#00a884]' :
                botStatus === 'loading' ? 'bg-yellow-400 animate-pulse' :
                'bg-red-500'
              }`} />
              <span className="text-[#8696a0]">
                {botStatus === 'connected' ? '已連線' : botStatus === 'loading' ? '連線中' : '離線'}
              </span>
            </div>
            {totalUnread > 0 && (
              <div className="bg-[#00a884] text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {totalUnread > 99 ? '99+' : totalUnread}
              </div>
            )}
          </div>
        </div>

        {/* 搜尋框 */}
        <div className="px-3 py-2 bg-[#111b21]">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="搜尋或開始新的對話"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-[#202c33] text-[#e9edef] placeholder-[#8696a0] rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:ring-1 focus:ring-[#00a884]"
            />
          </div>
        </div>

        {/* 對話列表 */}
        <ChatList
          chats={filteredChats}
          selectedChatId={selectedChatId}
          unreadCounts={unreadCounts}
          loading={loadingChats}
          onSelectChat={handleSelectChat}
        />
      </div>

      {/* 右側：訊息區域 */}
      <div className={`flex-1 flex flex-col ${selectedChatId ? 'flex' : 'hidden md:flex'}`}>
        {selectedChat ? (
          <MessageView
            chat={selectedChat}
            messages={messages}
            loading={loadingMessages}
            onSendMessage={handleSendMessage}
            onSendImage={handleSendImage}
            onSendVoice={handleSendVoice}
            onBack={() => setSelectedChatId(null)}
          />
        ) : (
          /* 未選擇對話的空白頁 */
          <div className="flex-1 flex flex-col items-center justify-center bg-[#222e35] text-center px-8">
            <div className="w-24 h-24 rounded-full bg-[#2a3942] flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-[#8696a0]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h2 className="text-2xl font-light text-[#e9edef] mb-2">WhatsApp 遙控台</h2>
            <p className="text-[#8696a0] text-sm max-w-sm">
              從左側選擇一個對話，開始收發 WhatsApp 訊息
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
