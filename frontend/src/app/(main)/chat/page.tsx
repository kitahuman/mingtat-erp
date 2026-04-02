'use client';

import { useState, useRef, useEffect } from 'react';
import axios from 'axios';

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

  const handleSendMessage = async (text?: string) => {
    const messageText = text || input;
    if (!messageText.trim()) return;

    const userMessage: Message = { role: 'user', content: messageText };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await axios.post('/api/ai-chat', {
        messages: [...messages, userMessage].map(m => ({
          role: m.role,
          content: m.content,
        })),
      }, {
        responseType: 'stream',
      });

      let assistantContent = '';
      let buffer = '';

      response.data.on('data', (chunk: any) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                assistantContent += parsed.content;
              }
              if (parsed.tool_call) {
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: assistantContent,
                  tool_call: parsed.tool_call,
                }]);
                assistantContent = '';
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      response.data.on('end', () => {
        if (assistantContent.trim()) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: assistantContent,
          }]);
        }
        setIsLoading(false);
      });

      response.data.on('error', (error: any) => {
        console.error('Stream error:', error);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '抱歉，AI 服務暫時不可用，請稍後再試。',
        }]);
        setIsLoading(false);
      });
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '抱歉，發生錯誤，請稍後再試。',
      }]);
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
                    : 'bg-white border border-gray-200 shadow-sm'
                }`}
              >
                {msg.tool_call && (
                  <div className="mb-2 p-2 bg-gray-50 rounded-lg text-xs border border-gray-200">
                    <span className="font-mono text-blue-600">🔧 {msg.tool_call}</span>
                    <span className="text-green-600 ml-2">✓ 完成</span>
                  </div>
                )}
                <div className={`whitespace-pre-wrap text-sm leading-relaxed ${msg.role === 'user' ? 'text-white' : 'text-gray-900'}`}>
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
              <span className="text-white text-sm animate-spin">⏳</span>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 shadow-sm">
              <div className="flex gap-1">
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
