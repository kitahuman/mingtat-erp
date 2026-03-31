'use client';
import { getExpiryStatus, getExpiryColor, getExpiryLabel } from '@/lib/api';

interface ExpiryBadgeProps {
  date: string | null;
  showLabel?: boolean;
}

export default function ExpiryBadge({ date, showLabel = true }: ExpiryBadgeProps) {
  if (!date) return <span className="text-gray-400">-</span>;

  const status = getExpiryStatus(date);
  const color = getExpiryColor(status);
  const label = getExpiryLabel(status);

  if (status === 'ok' || status === 'none') {
    return <span className="text-gray-700">{date}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {date}
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
