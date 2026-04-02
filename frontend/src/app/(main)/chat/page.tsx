'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  tool_call?: string;
}

const QUICK_ACTIONS = [
  {
    label: '系統提醒',
    prompt: '有什麼待處理的事項？',
    icon: '⚠️',
    color: 'bg-orange-50 border-orange-200',
  },
  {
    label: '財務摘要',
    prompt: '顯示全公司的財務摘要',
    icon: '💰',
    color: 'bg-green-50 border-green-200',
  },
  {
    label: '所有項目',
    prompt: '列出所有進行中的項目',
    icon: '📁',
    color: 'bg-blue-50 border-blue-200',
  },
  {
    label: '未收款',
    prompt: '有哪些已認證但未付款的 IPA？',
    icon: '📄',
    color: 'bg-red-50 border-red-200',
  },
];

export default function ChatPage() {
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
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
    }
    return '';
  };

  const handleSendMessage = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: messageText };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInput('');
    setIsLoading(true);

    try {
      const token = getAuthToken();
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: updatedMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('AI Chat HTTP error:', response.status, errText);
        throw new Error(`伺服器錯誤 ${response.status}`);
      }

      if (!response.body) {
        throw new Error('無法取得回應串流');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let streamingMsgIndex = -1;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.error) {
              console.error('AI service error:', parsed.error);
              setMessages(prev => [
                ...prev,
                { role: 'assistant', content: `❌ ${parsed.error}` },
              ]);
              setIsLoading(false);
              return;
            }

            if (parsed.tool_call) {
              // Show tool call as a separate indicator message
              setMessages(prev => {
                const newMsgs = [...prev];
                // Remove the streaming placeholder if exists
                if (streamingMsgIndex >= 0 && newMsgs[streamingMsgIndex]) {
                  if (!newMsgs[streamingMsgIndex].content.trim()) {
                    newMsgs.splice(streamingMsgIndex, 1);
                  }
                }
                streamingMsgIndex = -1;
                assistantContent = '';
                newMsgs.push({
                  role: 'assistant',
                  content: `🔧 正在查詢：${parsed.tool_call}...`,
                  tool_call: parsed.tool_call,
                });
                return newMsgs;
              });
            }

            if (parsed.content) {
              assistantContent += parsed.content;
              setMessages(prev => {
                const newMsgs = [...prev];
                if (streamingMsgIndex >= 0 && newMsgs[streamingMsgIndex] && !newMsgs[streamingMsgIndex].tool_call) {
                  // Update existing streaming message
                  newMsgs[streamingMsgIndex] = { role: 'assistant', content: assistantContent };
                } else {
                  // Add new streaming message
                  newMsgs.push({ role: 'assistant', content: assistantContent });
                  streamingMsgIndex = newMsgs.length - 1;
                }
                return newMsgs;
              });
            }
          } catch {
            // Ignore JSON parse errors for malformed chunks
          }
        }
      }
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '請稍後再試';
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `❌ 發生錯誤：${errMsg}`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-lg">🤖</span>
          </div>
          <div>
            <h1 className="font-bold text-lg text-gray-900">ERP 智能助手</h1>
            <p className="text-sm text-gray-500">查詢數據 · 自動化操作 · 智能分析</p>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
              <span className="text-white text-3xl">✨</span>
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold mb-2 text-gray-900">你好！我是 ERP 智能助手</h2>
              <p className="text-gray-500">我可以幫你查詢工程數據、建立文件、分析財務狀況</p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3 max-w-md w-full">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleSendMessage(action.prompt)}
                  className={`flex items-center gap-3 p-4 rounded-xl border transition-all hover:shadow-md ${action.color}`}
                >
                  <span className="text-2xl">{action.icon}</span>
                  <span className="text-sm font-medium text-gray-900">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm">🤖</span>
                </div>
              )}

              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : msg.tool_call
                    ? 'bg-blue-50 border border-blue-200 text-blue-700'
                    : 'bg-white border border-gray-200 shadow-sm'
                }`}
              >
                <div className={`whitespace-pre-wrap text-sm leading-relaxed ${msg.role === 'user' ? 'text-white' : msg.tool_call ? 'text-blue-700' : 'text-gray-900'}`}>
                  {msg.content}
                </div>
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-gray-600 text-sm">👤</span>
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm">🤖</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t bg-white p-6 shadow-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex gap-3 max-w-3xl mx-auto"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="輸入問題或指令..."
            className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            發送
          </button>
        </form>
        <p className="text-center text-xs text-gray-400 mt-2">
          AI 助手可能會出錯，請驗證重要資料
        </p>
      </div>
    </div>
  );
}
