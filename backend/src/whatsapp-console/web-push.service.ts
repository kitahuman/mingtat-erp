import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, any>;
}

@Injectable()
export class WebPushService implements OnModuleInit {
  private readonly logger = new Logger(WebPushService.name);
  private initialized = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:admin@dickyconstruction.com';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.initialized = true;
      this.logger.log('Web Push (VAPID) initialized');
    } else {
      this.logger.warn('VAPID keys not configured — Web Push notifications disabled');
    }
  }

  getVapidPublicKey(): string | null {
    return process.env.VAPID_PUBLIC_KEY || null;
  }

  /** 儲存或更新推送訂閱 */
  async saveSubscription(
    userId: number,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ) {
    return this.prisma.webPushSubscription.upsert({
      where: {
        user_id_endpoint: {
          user_id: userId,
          endpoint: subscription.endpoint,
        },
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent,
        updated_at: new Date(),
      },
      create: {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent,
      },
    });
  }

  /** 刪除推送訂閱 */
  async deleteSubscription(userId: number, endpoint: string) {
    try {
      await this.prisma.webPushSubscription.delete({
        where: {
          user_id_endpoint: {
            user_id: userId,
            endpoint,
          },
        },
      });
    } catch {
      // 不存在則忽略
    }
  }

  /** 向指定用戶的所有訂閱發送推送通知 */
  async sendToUser(userId: number, payload: PushPayload): Promise<void> {
    if (!this.initialized) return;

    const subscriptions = await this.prisma.webPushSubscription.findMany({
      where: { user_id: userId },
    });

    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 86400 },
        ),
      ),
    );

    // 清理失效的訂閱（410 Gone）
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const err = result.reason as any;
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          this.logger.log(`Removing expired push subscription for user ${userId}`);
          await this.prisma.webPushSubscription.delete({
            where: { id: subscriptions[i].id },
          }).catch(() => {});
        } else {
          this.logger.error(`Push notification failed for user ${userId}: ${err?.message}`);
        }
      }
    }
  }

  /** 向所有有訂閱的用戶廣播 */
  async broadcast(payload: PushPayload): Promise<void> {
    if (!this.initialized) return;

    const subscriptions = await this.prisma.webPushSubscription.findMany();
    const results = await Promise.allSettled(
      subscriptions.map(sub =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: 86400 },
        ),
      ),
    );

    // 清理失效訂閱
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const err = result.reason as any;
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await this.prisma.webPushSubscription.delete({
            where: { id: subscriptions[i].id },
          }).catch(() => {});
        }
      }
    }
  }
}
