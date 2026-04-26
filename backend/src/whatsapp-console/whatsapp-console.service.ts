import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Subject } from 'rxjs';
import axios from 'axios';

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

export interface SseEvent {
  type: 'message' | 'status' | 'qr' | 'connected';
  message?: WaMessage;
  status?: string;
  qr?: string;
}

@Injectable()
export class WhatsappConsoleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappConsoleService.name);

  // SSE 廣播用的 Subject
  readonly events$ = new Subject<SseEvent>();

  // Bot API 設定
  private get botApiUrl(): string {
    return process.env.WHATSAPP_BOT_API_URL || 'http://147.182.233.182:3002';
  }
  private get botApiSecret(): string {
    return process.env.WHATSAPP_BOT_API_SECRET || 'mingtat-bot-api-2026';
  }

  private get botHeaders() {
    return {
      'x-bot-secret': this.botApiSecret,
      'Content-Type': 'application/json',
    };
  }

  // SSE 連線到 Bot 的 EventSource
  private botSseController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  onModuleInit() {
    this.connectToBotSSE();
  }

  onModuleDestroy() {
    this.disconnectBotSSE();
  }

  /** 連接到 Bot 的 SSE 端點，接收即時訊息 */
  private connectToBotSSE() {
    this.disconnectBotSSE();
    const url = `${this.botApiUrl}/api/events`;
    this.logger.log(`Connecting to Bot SSE: ${url}`);

    this.botSseController = new AbortController();
    const signal = this.botSseController.signal;

    // 使用 node-fetch 連接 SSE
    axios.get(url, {
      headers: { ...this.botHeaders, Accept: 'text/event-stream' },
      responseType: 'stream',
      timeout: 0, // 不超時
      signal: signal as any,
    }).then(response => {
      const stream = response.data;
      let buffer = '';

      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              this.handleBotEvent(data);
            } catch {
              // 忽略解析錯誤
            }
          }
        }
      });

      stream.on('end', () => {
        this.logger.warn('Bot SSE connection ended, reconnecting in 5s...');
        this.scheduleReconnect();
      });

      stream.on('error', (err: Error) => {
        if (!signal.aborted) {
          this.logger.warn(`Bot SSE error: ${err.message}, reconnecting in 5s...`);
          this.scheduleReconnect();
        }
      });
    }).catch(err => {
      if (!signal?.aborted) {
        this.logger.warn(`Bot SSE connect failed: ${err.message}, reconnecting in 10s...`);
        this.scheduleReconnect(10000);
      }
    });
  }

  private disconnectBotSSE() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.botSseController) {
      this.botSseController.abort();
      this.botSseController = null;
    }
  }

  private scheduleReconnect(delay = 5000) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectToBotSSE();
    }, delay);
  }

  /** 處理 Bot 推送的事件 */
  private handleBotEvent(data: any) {
    if (data.type === 'message' && data.message) {
      this.events$.next({ type: 'message', message: data.message });
    } else if (data.type === 'status') {
      this.events$.next({ type: 'status', status: data.status });
    } else if (data.type === 'qr') {
      this.events$.next({ type: 'qr', qr: data.qr });
    }
  }

  // ── Bot API 代理方法 ─────────────────────────────────────────

  /** 取得對話列表 */
  async getChats(): Promise<{ chats: WaChat[] }> {
    const res = await axios.get(`${this.botApiUrl}/api/chats`, {
      headers: this.botHeaders,
      timeout: 15000,
    });
    return res.data;
  }

  /** 取得訊息記錄 */
  async getMessages(chatId: string, limit = 50): Promise<{ messages: WaMessage[]; chatId: string }> {
    const res = await axios.get(
      `${this.botApiUrl}/api/messages/${encodeURIComponent(chatId)}`,
      {
        headers: this.botHeaders,
        params: { limit },
        timeout: 15000,
      },
    );
    return res.data;
  }

  /** 取得 Bot 狀態 */
  async getBotStatus(): Promise<any> {
    const res = await axios.get(`${this.botApiUrl}/api/status`, {
      headers: this.botHeaders,
      timeout: 10000,
    });
    return res.data;
  }

  /** 發送文字訊息 */
  async sendMessage(chatId: string, text: string): Promise<any> {
    const res = await axios.post(
      `${this.botApiUrl}/api/send-message`,
      { chatId, text },
      { headers: this.botHeaders, timeout: 30000 },
    );
    return res.data;
  }

  /** 發送圖片 */
  async sendImage(chatId: string, imageBase64: string, caption?: string, mimeType?: string): Promise<any> {
    const res = await axios.post(
      `${this.botApiUrl}/api/send-image`,
      { chatId, imageBase64, caption, mimeType },
      { headers: this.botHeaders, timeout: 60000 },
    );
    return res.data;
  }

  /** 發送語音 */
  async sendVoice(chatId: string, audioBase64: string, mimeType?: string): Promise<any> {
    const res = await axios.post(
      `${this.botApiUrl}/api/send-voice`,
      { chatId, audioBase64, mimeType },
      { headers: this.botHeaders, timeout: 60000 },
    );
    return res.data;
  }

  /** 下載媒體（代理到 Bot）*/
  async downloadMedia(messageId: string, chatId: string): Promise<{ buffer: Buffer; contentType: string }> {
    const res = await axios.get(
      `${this.botApiUrl}/api/download-media/${encodeURIComponent(messageId)}`,
      {
        headers: this.botHeaders,
        params: { chatId },
        responseType: 'arraybuffer',
        timeout: 30000,
      },
    );
    return {
      buffer: Buffer.from(res.data),
      contentType: String(res.headers['content-type'] ?? 'application/octet-stream'),
    };
  }
}
