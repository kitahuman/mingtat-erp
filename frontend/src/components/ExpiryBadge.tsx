'use client';
import { getExpiryStatus, getExpiryColor, getExpiryLabel } from '@/lib/api';
import { fmtDate } from '@/lib/dateUtils';

interface ExpiryBadgeProps {
  date: string | null;
  showLabel?: boolean;
}

export default function ExpiryBadge({ date, showLabel = true }: ExpiryBadgeProps) {
  if (!date) return <span className="text-gray-400">-</span>;

  const formatted = fmtDate(date);
  const status = getExpiryStatus(date);
  const color = getExpiryColor(status);
  const label = getExpiryLabel(status);

  if (status === 'ok' || status === 'none') {
    return <span className="text-gray-700">{formatted}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {formatted}
      {showLabel && label && <span>({label})</span>}
    </span>
  );
}

export function ExpiryDot({ date }: { date: string | null }) {
  if (!date) return null;
  const status = getExpiryStatus(date);
  if (status === 'ok' || status === 'none') return null;
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${status === 'expired' || status === 'critical' ? 'bg-red-500' : 'bg-yellow-500'}`} />
  );
}

/** @deprecated Use fmtDate from @/lib/dateUtils instead */
export function formatDate(d: string): string {
  return fmtDate(d);
}
