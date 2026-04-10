'use client';

import { useState, useRef, useEffect } from 'react';
import Cookies from 'js-cookie';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  isToolCall?: boolean;
}

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const getAuthToken = (): string => {
    return Cookies.get('token') || '';
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const token = getAuthToken();
      const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';
      const response = await fetch(`${apiBase}/ai-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: updatedMessages
            .filter(m => !m.isToolCall)
            .map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('AI Chat HTTP error:', response.status, errText);
        throw new Error(`伺服器錯誤 ${response.status}`);
      }

      const data = await response.json();

      // Show tool calls that were executed (if any)
      if (data.tool_calls && data.tool_calls.length > 0) {
        const toolMsg: Message = {
          role: 'assistant',
          content: `🔧 已查詢：${data.tool_calls.join('、')}`,
          isToolCall: true,
        };
        setMessages(prev => [...prev, toolMsg]);
      }

      // Show the final reply
      if (data.reply) {
        const replyMsg: Message = { role: 'assistant', content: data.reply };
        setMessages(prev => [...prev, replyMsg]);
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '請稍後再試';
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `❌ 發生錯誤：${errMsg}` },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const assistantMsgCount = messages.filter(m => m.role === 'assistant' && !m.isToolCall).length;

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full shadow-lg flex items-center justify-center hover:shadow-xl transition-all z-50 group"
          title="打開 AI 助手"
        >
          <span className="text-xl group-hover:scale-110 transition-transform">💬</span>
          {assistantMsgCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs flex items-center justify-center text-white font-bold">
              {assistantMsgCount > 9 ? '9+' : assistantMsgCount}
            </span>
          )}
        </button>
      )}

      {/* Chat Window */}
      {isOpen && (
        <div
          className={`fixed bottom-6 right-6 bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 flex flex-col overflow-hidden transition-all ${
            isMinimized ? 'w-72 h-14' : 'w-96 h-[550px]'
          }`}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white cursor-pointer"
            onClick={() => isMinimized && setIsMinimized(false)}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <span className="font-semibold text-sm">ERP 智能助手</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMinimized(!isMinimized);
                }}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title={isMinimized ? '展開' : '最小化'}
              >
                <span className="text-sm">{isMinimized ? '▲' : '▼'}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(false);
                }}
                className="p-1 hover:bg-white/20 rounded transition-colors"
                title="關閉"
              >
                <span className="text-sm">✕</span>
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Messages */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50">
                {messages.length === 0 && (
                  <div className="text-center text-gray-400 text-sm mt-8">
                    <div className="text-3xl mb-2">🤖</div>
                    <p>有什麼可以幫你？</p>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : msg.isToolCall
                          ? 'bg-blue-50 border border-blue-200 text-blue-700'
                          : 'bg-white border border-gray-200 text-gray-900'
                      }`}
                    >
                      <div className="whitespace-pre-wrap leading-relaxed">
                        {msg.content}
                      </div>
                    </div>
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-gray-200 rounded-xl px-3 py-2">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="border-t p-3 flex gap-2 bg-white"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="輸入訊息..."
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="bg-blue-600 text-white p-2 rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors"
                  title="發送"
                >
                  <span className="text-sm">➤</span>
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}
