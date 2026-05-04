'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { WaChat, WaMessage } from '../page';
import { whatsappConsoleApi } from '@/lib/api';
import { AudioPlayer } from './AudioPlayer';
import { VoiceRecorder } from './VoiceRecorder';
import { ImageViewer } from './ImageViewer';

interface MessageViewProps {
  chat: WaChat;
  messages: WaMessage[];
  loading: boolean;
  onSendMessage: (text: string) => Promise<void>;
  onSendImage: (imageBase64: string, caption?: string, mimeType?: string) => Promise<void>;
  onSendVoice: (audioBase64: string, mimeType?: string) => Promise<void>;
  onBack: () => void;
}

function formatMessageTime(timestamp: number): string {
  if (!timestamp) return '';
  // Bot 已將時間戳轉為毫秒，直接使用
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-HK', { timeZone: 'Asia/Hong_Kong', hour: '2-digit', minute: '2-digit', hour12: false });
}

function MessageBubble({ msg }: { msg: WaMessage }) {
  const isMe = msg.fromMe;
  const time = formatMessageTime(msg.timestamp);

  const renderContent = () => {
    if (msg.type === 'image' || (msg.type === 'media' && msg.hasMedia)) {
      const mediaUrl = whatsappConsoleApi.getMediaUrl(msg.id, msg.chatId);
      return (
        <div>
          <ImageViewer src={mediaUrl} alt="圖片" />
          {msg.text && <p className="mt-1 text-sm">{msg.text}</p>}
        </div>
      );
    }
    if (msg.type === 'audio' || msg.type === 'ptt') {
      const mediaUrl = whatsappConsoleApi.getMediaUrl(msg.id, msg.chatId);
      return <AudioPlayer src={mediaUrl} />;
    }
    if (msg.type === 'video') {
      const mediaUrl = whatsappConsoleApi.getMediaUrl(msg.id, msg.chatId);
      return (
        <div>
          <video
            src={mediaUrl}
            controls
            className="max-w-[260px] rounded-lg"
            preload="metadata"
          />
          {msg.text && <p className="mt-1 text-sm">{msg.text}</p>}
        </div>
      );
    }
    if (msg.type === 'document') {
      const mediaUrl = whatsappConsoleApi.getMediaUrl(msg.id, msg.chatId);
      return (
        <a
          href={mediaUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-sm underline"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
          </svg>
          {msg.text || '文件'}
        </a>
      );
    }
    return <p className="text-sm whitespace-pre-wrap break-words">{msg.text || '[訊息]'}</p>;
  };

  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} mb-1 px-4`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm relative ${
          isMe ? 'bg-[#005c4b] text-[#e9edef]' : 'bg-[#202c33] text-[#e9edef]'
        }`}
      >
        {!isMe && msg.senderName && (
          <p className="text-xs font-medium text-[#00a884] mb-1">{msg.senderName}</p>
        )}
        {renderContent()}
        <div className={`flex items-center justify-end gap-1 mt-0.5 ${isMe ? 'text-[#8696a0]' : 'text-[#8696a0]'}`}>
          <span className="text-[10px]">{time}</span>
          {isMe && (
            <svg className="w-3.5 h-3.5 text-[#53bdeb]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z" />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

function DateDivider({ timestamp }: { timestamp: number }) {
  // Bot 已將時間戳轉為毫秒，直接使用
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  let label: string;
  if (diffDays === 0) label = '今天';
  else if (diffDays === 1) label = '昨天';
  else label = date.toLocaleDateString('zh-HK', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="flex items-center justify-center my-3 px-4">
      <div className="bg-[#182229] text-[#8696a0] text-xs px-3 py-1 rounded-full shadow-sm">
        {label}
      </div>
    </div>
  );
}

export function MessageView({
  chat,
  messages,
  loading,
  onSendMessage,
  onSendImage,
  onSendVoice,
  onBack,
}: MessageViewProps) {
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自動滾動到最新訊息
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputText.trim() || sending) return;
    const text = inputText.trim();
    setInputText('');
    setSending(true);
    try {
      await onSendMessage(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setShowAttachMenu(false);

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      // 去掉 data:image/xxx;base64, 前綴
      const base64 = dataUrl.split(',')[1];
      const mimeType = file.type;
      setSending(true);
      try {
        await onSendImage(base64, undefined, mimeType);
      } finally {
        setSending(false);
      }
    };
    reader.readAsDataURL(file);
    // 重置 input
    e.target.value = '';
  };

  const handleVoiceSend = async (audioBase64: string, mimeType: string) => {
    setShowVoiceRecorder(false);
    setSending(true);
    try {
      await onSendVoice(audioBase64, mimeType);
    } finally {
      setSending(false);
    }
  };

  // 自動調整 textarea 高度
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  // 分組訊息（按日期）
  const groupedMessages: { date: number; messages: WaMessage[] }[] = [];
  let currentDate = '';
  let currentGroup: WaMessage[] = [];

  messages.forEach(msg => {
    // Bot 已將時間戳轉為毫秒，直接使用
    const date = new Date(msg.timestamp);
    const dateStr = date.toDateString();
    if (dateStr !== currentDate) {
      if (currentGroup.length > 0) {
        groupedMessages.push({ date: currentGroup[0].timestamp, messages: currentGroup });
      }
      currentDate = dateStr;
      currentGroup = [msg];
    } else {
      currentGroup.push(msg);
    }
  });
  if (currentGroup.length > 0) {
    groupedMessages.push({ date: currentGroup[0].timestamp, messages: currentGroup });
  }

  return (
    <div className="flex flex-col h-full bg-[#0b141a]" style={{ backgroundImage: 'url(/whatsapp-console/chat-bg.png)', backgroundSize: '400px' }}>
      {/* 頂部標題列 */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#202c33] shadow-sm flex-shrink-0">
        {/* 返回按鈕（手機版） */}
        <button
          onClick={onBack}
          className="md:hidden text-[#aebac1] hover:text-white p-1 -ml-1"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* 頭像 */}
        <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white font-semibold flex-shrink-0">
          {chat.isGroup ? (
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
          ) : (
            chat.name.charAt(0).toUpperCase()
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[#e9edef] font-medium text-sm truncate">{chat.name}</p>
          <p className="text-[#8696a0] text-xs">
            {chat.isGroup ? '群組' : 'WhatsApp 聯絡人'}
          </p>
        </div>
      </div>

      {/* 訊息列表 */}
      <div className="flex-1 overflow-y-auto py-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-[#00a884] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-[#8696a0] text-sm">
            沒有訊息記錄
          </div>
        ) : (
          <>
            {groupedMessages.map((group, gi) => (
              <div key={gi}>
                <DateDivider timestamp={group.date} />
                {group.messages.map(msg => (
                  <MessageBubble key={msg.id} msg={msg} />
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* 語音錄音器 */}
      {showVoiceRecorder && (
        <VoiceRecorder
          onSend={handleVoiceSend}
          onCancel={() => setShowVoiceRecorder(false)}
        />
      )}

      {/* 底部輸入列 */}
      {!showVoiceRecorder && (
        <div className="flex items-end gap-2 px-3 py-2 bg-[#202c33] flex-shrink-0">
          {/* 附件按鈕 */}
          <div className="relative">
            <button
              onClick={() => setShowAttachMenu(!showAttachMenu)}
              className="w-10 h-10 flex items-center justify-center text-[#8696a0] hover:text-[#aebac1] transition-colors flex-shrink-0"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            {showAttachMenu && (
              <div className="absolute bottom-12 left-0 bg-[#233138] rounded-xl shadow-lg py-2 w-44 z-10">
                <button
                  onClick={() => { fileInputRef.current?.click(); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-[#e9edef] text-sm hover:bg-[#182229]"
                >
                  <div className="w-8 h-8 rounded-full bg-[#bf59cf] flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                    </svg>
                  </div>
                  相片 / 影片
                </button>
              </div>
            )}
          </div>

          {/* 隱藏的文件輸入 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleImageSelect}
          />

          {/* 文字輸入框 */}
          <div className="flex-1 bg-[#2a3942] rounded-3xl px-4 py-2 flex items-end">
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="輸入訊息"
              rows={1}
              className="flex-1 bg-transparent text-[#e9edef] placeholder-[#8696a0] outline-none resize-none text-sm leading-5 max-h-[120px] overflow-y-auto"
              style={{ minHeight: '20px' }}
            />
          </div>

          {/* 發送/語音按鈕 */}
          {inputText.trim() ? (
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-10 h-10 bg-[#00a884] rounded-full flex items-center justify-center text-white hover:bg-[#017561] transition-colors disabled:opacity-50 flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => setShowVoiceRecorder(true)}
              className="w-10 h-10 flex items-center justify-center text-[#8696a0] hover:text-[#aebac1] transition-colors flex-shrink-0"
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* 點擊外部關閉附件選單 */}
      {showAttachMenu && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setShowAttachMenu(false)}
        />
      )}
    </div>
  );
}
