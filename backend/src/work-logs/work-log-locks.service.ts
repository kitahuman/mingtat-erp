import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface WorkLogLockUser {
  id: number;
  name: string;
}

export interface WorkLogLockView {
  work_log_id: number;
  locked_by: WorkLogLockUser;
  locked_at: string;
}

export interface LockRowsResult {
  acquired: WorkLogLockView[];
  conflicts: WorkLogLockView[];
}

@Injectable()
export class WorkLogLocksService {
  private readonly timeoutMs = 5 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  private normalizeIds(workLogIds: Array<string | number>): number[] {
    return Array.from(
      new Set(
        (workLogIds || [])
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    );
  }

  private getExpiredThreshold(): Date {
    return new Date(Date.now() - this.timeoutMs);
  }

  private formatLock(lock: any): WorkLogLockView {
    const user = lock.locked_by;
    return {
      work_log_id: lock.work_log_id,
      locked_by: {
        id: user?.id ?? lock.locked_by_user_id,
        name:
          user?.displayName ||
          user?.username ||
          `User ${user?.id ?? lock.locked_by_user_id}`,
      },
      locked_at:
        lock.locked_at instanceof Date
          ? lock.locked_at.toISOString()
          : String(lock.locked_at),
    };
  }

  async cleanupExpiredLocks(): Promise<number[]> {
    const expiredLocks = await this.prisma.workLogLock.findMany({
      where: { locked_at: { lt: this.getExpiredThreshold() } },
      select: { work_log_id: true },
    });

    const expiredIds = expiredLocks.map((lock) => lock.work_log_id);
    if (expiredIds.length > 0) {
      await this.prisma.workLogLock.deleteMany({
        where: { work_log_id: { in: expiredIds } },
      });
    }
    return expiredIds;
  }

  async getActiveLocks(): Promise<WorkLogLockView[]> {
    await this.cleanupExpiredLocks();
    const locks = await this.prisma.workLogLock.findMany({
      include: {
        locked_by: {
          select: { id: true, username: true, displayName: true },
        },
      },
      orderBy: { locked_at: 'asc' },
    });
    return locks.map((lock) => this.formatLock(lock));
  }

  async lockRows(
    workLogIds: Array<string | number>,
    userId: number,
  ): Promise<LockRowsResult> {
    await this.cleanupExpiredLocks();

    const ids = this.normalizeIds(workLogIds);
    const acquired: WorkLogLockView[] = [];
    const conflicts: WorkLogLockView[] = [];

    for (const workLogId of ids) {
      const existing = await this.prisma.workLogLock.findUnique({
        where: { work_log_id: workLogId },
        include: {
          locked_by: {
            select: { id: true, username: true, displayName: true },
          },
        },
      });

      if (existing && existing.locked_by_user_id !== userId) {
        conflicts.push(this.formatLock(existing));
        continue;
      }

      try {
        const lock = existing
          ? await this.prisma.workLogLock.update({
              where: { work_log_id: workLogId },
              data: { locked_at: new Date() },
              include: {
                locked_by: {
                  select: { id: true, username: true, displayName: true },
                },
              },
            })
          : await this.prisma.workLogLock.create({
              data: {
                work_log_id: workLogId,
                locked_by_user_id: userId,
              },
              include: {
                locked_by: {
                  select: { id: true, username: true, displayName: true },
                },
              },
            });
        acquired.push(this.formatLock(lock));
      } catch {
        const latest = await this.prisma.workLogLock.findUnique({
          where: { work_log_id: workLogId },
          include: {
            locked_by: {
              select: { id: true, username: true, displayName: true },
            },
          },
        });
        if (latest) {
          if (latest.locked_by_user_id === userId) acquired.push(this.formatLock(latest));
          else conflicts.push(this.formatLock(latest));
        }
      }
    }

    return { acquired, conflicts };
  }

  async unlockRows(
    workLogIds: Array<string | number>,
    userId: number,
  ): Promise<number[]> {
    const ids = this.normalizeIds(workLogIds);
    if (ids.length === 0) return [];

    const locks = await this.prisma.workLogLock.findMany({
      where: { work_log_id: { in: ids }, locked_by_user_id: userId },
      select: { work_log_id: true },
    });
    const unlockedIds = locks.map((lock) => lock.work_log_id);
    if (unlockedIds.length > 0) {
      await this.prisma.workLogLock.deleteMany({
        where: { work_log_id: { in: unlockedIds }, locked_by_user_id: userId },
      });
    }
    return unlockedIds;
  }

  async unlockAllByUser(userId: number): Promise<number[]> {
    const locks = await this.prisma.workLogLock.findMany({
      where: { locked_by_user_id: userId },
      select: { work_log_id: true },
    });
    const unlockedIds = locks.map((lock) => lock.work_log_id);
    if (unlockedIds.length > 0) {
      await this.prisma.workLogLock.deleteMany({
        where: { locked_by_user_id: userId },
      });
    }
    return unlockedIds;
  }
}
