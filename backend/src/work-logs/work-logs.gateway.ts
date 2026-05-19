import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import {
  WorkLogLocksService,
  WorkLogLockView,
} from './work-log-locks.service';

const WORK_LOGS_ROOM = 'work-logs';
const cleanupIntervalMs = 60_000;

function getCorsOrigin(): string | string[] {
  const origin = process.env.CORS_ORIGIN;
  if (!origin) return ['http://localhost:3000'];
  return origin
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

interface WorkLogsSocketUser {
  id: number;
  username: string;
  displayName?: string | null;
  role?: string;
}

@WebSocketGateway({
  path: '/ws/work-logs',
  cors: {
    origin: getCorsOrigin(),
    credentials: true,
  },
})
export class WorkLogsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private server!: Server;

  private readonly logger = new Logger(WorkLogsGateway.name);
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly locksService: WorkLogLocksService,
  ) {}

  afterInit() {
    this.cleanupTimer = setInterval(() => {
      this.broadcastExpiredUnlocks().catch((error) => {
        this.logger.warn(`Failed to cleanup expired work-log locks: ${error?.message || error}`);
      });
    }, cleanupIntervalMs);
  }

  async handleConnection(socket: Socket) {
    try {
      const user = await this.authenticateSocket(socket);
      socket.data.user = user;
      this.logger.debug(`Work logs socket connected: ${socket.id} user=${user.id}`);
    } catch (error) {
      this.logger.warn(`Rejected work logs socket ${socket.id}: ${error?.message || error}`);
      socket.emit('error', { message: 'Unauthorized' });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const user = socket.data.user as WorkLogsSocketUser | undefined;
    if (!user) return;

    const unlockedIds = await this.locksService.unlockAllByUser(user.id);
    if (unlockedIds.length > 0) {
      socket.to(WORK_LOGS_ROOM).emit('rows_unlocked', {
        work_log_ids: unlockedIds,
      });
    }
    this.logger.debug(`Work logs socket disconnected: ${socket.id} user=${user.id}`);
  }

  @SubscribeMessage('join_room')
  async handleJoinRoom(@ConnectedSocket() socket: Socket) {
    this.assertAuthenticated(socket);
    await socket.join(WORK_LOGS_ROOM);
    await this.emitLockStatus(socket);
    return { ok: true };
  }

  @SubscribeMessage('lock_rows')
  async handleLockRows(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { work_log_ids?: Array<string | number> },
  ) {
    const user = this.assertAuthenticated(socket);
    await socket.join(WORK_LOGS_ROOM);

    const result = await this.locksService.lockRows(payload?.work_log_ids || [], user.id);
    if (result.acquired.length > 0) {
      const grouped = this.groupLocksByUser(result.acquired);
      for (const group of grouped) {
        socket.to(WORK_LOGS_ROOM).emit('rows_locked', group);
      }
    }
    await this.emitLockStatus(socket, result.conflicts);
    return {
      ok: result.conflicts.length === 0,
      acquired: result.acquired,
      conflicts: result.conflicts,
    };
  }

  @SubscribeMessage('unlock_rows')
  async handleUnlockRows(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: { work_log_ids?: Array<string | number> },
  ) {
    const user = this.assertAuthenticated(socket);
    const unlockedIds = await this.locksService.unlockRows(
      payload?.work_log_ids || [],
      user.id,
    );
    if (unlockedIds.length > 0) {
      socket.to(WORK_LOGS_ROOM).emit('rows_unlocked', {
        work_log_ids: unlockedIds,
      });
    }
    await this.emitLockStatus(socket);
    return { ok: true, work_log_ids: unlockedIds };
  }

  broadcastRowsUpdated(workLogs: any[]) {
    const rows = Array.isArray(workLogs) ? workLogs.filter(Boolean) : [];
    if (rows.length === 0 || !this.server) return;
    this.server.to(WORK_LOGS_ROOM).emit('rows_updated', { work_logs: rows });
  }

  private async broadcastExpiredUnlocks() {
    const expiredIds = await this.locksService.cleanupExpiredLocks();
    if (expiredIds.length > 0 && this.server) {
      this.server.to(WORK_LOGS_ROOM).emit('rows_unlocked', {
        work_log_ids: expiredIds,
      });
    }
  }

  private async emitLockStatus(socket: Socket, extraLocks: WorkLogLockView[] = []) {
    const locks = await this.locksService.getActiveLocks();
    const merged = new Map<number, WorkLogLockView>();
    for (const lock of locks.concat(extraLocks)) merged.set(lock.work_log_id, lock);
    socket.emit('lock_status', { locks: Array.from(merged.values()) });
  }

  private groupLocksByUser(locks: WorkLogLockView[]) {
    const groups = new Map<string, { work_log_ids: number[]; locked_by: WorkLogLockView['locked_by']; locked_at: string }>();
    for (const lock of locks) {
      const key = String(lock.locked_by.id);
      const existing = groups.get(key);
      if (existing) {
        existing.work_log_ids.push(lock.work_log_id);
        if (lock.locked_at > existing.locked_at) existing.locked_at = lock.locked_at;
      } else {
        groups.set(key, {
          work_log_ids: [lock.work_log_id],
          locked_by: lock.locked_by,
          locked_at: lock.locked_at,
        });
      }
    }
    return Array.from(groups.values());
  }

  private async authenticateSocket(socket: Socket): Promise<WorkLogsSocketUser> {
    const token = this.extractToken(socket);
    if (!token) throw new UnauthorizedException('Missing token');

    const payload = await this.jwtService.verifyAsync(token);
    const userId = Number(payload.sub ?? payload.id);
    if (!Number.isInteger(userId)) throw new UnauthorizedException('Invalid token');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('帳號已被停用或不存在');
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    };
  }

  private extractToken(socket: Socket): string | null {
    const authToken = socket.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) return authToken.trim();

    const queryToken = socket.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) return queryToken.trim();

    const header = socket.handshake.headers?.authorization;
    if (typeof header === 'string') {
      const [scheme, value] = header.split(' ');
      if (/^bearer$/i.test(scheme) && value) return value.trim();
    }

    return null;
  }

  private assertAuthenticated(socket: Socket): WorkLogsSocketUser {
    const user = socket.data.user as WorkLogsSocketUser | undefined;
    if (!user) throw new UnauthorizedException('Unauthorized');
    return user;
  }
}
