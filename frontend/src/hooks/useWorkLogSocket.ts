import { useCallback, useEffect, useRef, useState } from 'react';
import Cookies from 'js-cookie';
import { io, Socket } from 'socket.io-client';

export interface WorkLogLockedBy {
  id: number;
  name: string;
}

export interface WorkLogLockInfo {
  work_log_id: number;
  locked_by: WorkLogLockedBy;
  locked_at: string;
}

interface UseWorkLogSocketOptions {
  onRowsUpdated?: (workLogs: any[]) => void;
}

const getSocketBaseUrl = () => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl || apiUrl === '/api') return undefined;
  return apiUrl.replace(/\/api\/?$/, '');
};

export function useWorkLogSocket(options: UseWorkLogSocketOptions = {}) {
  const [locks, setLocks] = useState<Map<number, WorkLogLockInfo>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const token = Cookies.get('token');
    if (!token) return;

    const socket = io(getSocketBaseUrl(), {
      path: '/ws/work-logs',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_room');
    });

    socket.on('lock_status', (payload: { locks?: WorkLogLockInfo[] }) => {
      const next = new Map<number, WorkLogLockInfo>();
      for (const lock of payload?.locks || []) {
        next.set(Number(lock.work_log_id), lock);
      }
      setLocks(next);
    });

    socket.on(
      'rows_locked',
      (payload: {
        work_log_ids?: Array<number | string>;
        locked_by?: WorkLogLockedBy;
        locked_at?: string;
      }) => {
        if (!payload?.locked_by) return;
        setLocks((prev) => {
          const next = new Map(prev);
          for (const id of payload.work_log_ids || []) {
            const workLogId = Number(id);
            if (!Number.isInteger(workLogId)) continue;
            next.set(workLogId, {
              work_log_id: workLogId,
              locked_by: payload.locked_by!,
              locked_at: payload.locked_at || new Date().toISOString(),
            });
          }
          return next;
        });
      },
    );

    socket.on('rows_unlocked', (payload: { work_log_ids?: Array<number | string> }) => {
      setLocks((prev) => {
        const next = new Map(prev);
        for (const id of payload?.work_log_ids || []) {
          next.delete(Number(id));
        }
        return next;
      });
    });

    socket.on('rows_updated', (payload: { work_logs?: any[] }) => {
      if (Array.isArray(payload?.work_logs) && payload.work_logs.length > 0) {
        optionsRef.current.onRowsUpdated?.(payload.work_logs);
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setLocks(new Map());
    };
  }, []);

  const lockRows = useCallback(
    (workLogIds: number[]): Promise<{ ok: boolean; conflicts?: WorkLogLockInfo[] }> => {
      const ids = Array.from(
        new Set(workLogIds.filter((id) => Number.isInteger(id) && id > 0)),
      );
      if (ids.length === 0) return Promise.resolve({ ok: true });
      const socket = socketRef.current;
      if (!socket || !socket.connected) return Promise.resolve({ ok: true });

      return new Promise((resolve) => {
        socket.timeout(5000).emit(
          'lock_rows',
          { work_log_ids: ids },
          (error: Error | null, response: { ok?: boolean; conflicts?: WorkLogLockInfo[] }) => {
            if (error) resolve({ ok: true });
            else resolve({ ok: response?.ok !== false, conflicts: response?.conflicts || [] });
          },
        );
      });
    },
    [],
  );

  const unlockRows = useCallback((workLogIds: number[]) => {
    const ids = Array.from(new Set(workLogIds.filter((id) => Number.isInteger(id) && id > 0)));
    if (ids.length === 0) return;
    socketRef.current?.emit('unlock_rows', { work_log_ids: ids });
    setLocks((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  return { locks, lockRows, unlockRows };
}
