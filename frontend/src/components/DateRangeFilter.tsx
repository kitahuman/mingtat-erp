'use client';
import { useMemo } from 'react';
import DateInput from '@/components/DateInput';

export interface DateTypeOption {
  value: string;
  label: string;
}

interface DateRangeFilterProps {
  /** 日期類型選項，例如 [{ value: 'date', label: '支出日期' }] */
  dateTypeOptions: DateTypeOption[];
  /** 目前選中的日期類型 */
  dateType: string;
  onDateTypeChange: (value: string) => void;
  /** 起始日 YYYY-MM-DD */
  dateFrom: string;
  /** 結束日 YYYY-MM-DD */
  dateTo: string;
  onRangeChange: (from: string, to: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** 取得某年某月的首日與尾日（YYYY-MM-DD） */
function monthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return { from: ymd(year, month, 1), to: ymd(year, month, lastDay) };
}

/** 嘗試從日期範圍反推年月：如果剛好是某月首尾，回傳該年月，否則回傳 null */
function detectMonth(from: string, to: string): { year: number; month: number } | null {
  if (!from || !to) return null;
  const mFrom = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const mTo = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (!mFrom || !mTo) return null;
  const fy = Number(mFrom[1]);
  const fm = Number(mFrom[2]);
  const fd = Number(mFrom[3]);
  const ty = Number(mTo[1]);
  const tm = Number(mTo[2]);
  const td = Number(mTo[3]);
  if (fy !== ty || fm !== tm) return null;
  if (fd !== 1) return null;
  const lastDay = new Date(fy, fm, 0).getDate();
  if (td !== lastDay) return null;
  return { year: fy, month: fm };
}

export default function DateRangeFilter({
  dateTypeOptions,
  dateType,
  onDateTypeChange,
  dateFrom,
  dateTo,
  onRangeChange,
}: DateRangeFilterProps) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= 2024; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  // 從目前的日期範圍反推年月，作為年/月下拉的顯示值
  const detected = useMemo(() => detectMonth(dateFrom, dateTo), [dateFrom, dateTo]);
  const selectedYear = detected ? detected.year : '';
  const selectedMonth = detected ? detected.month : '';

  const handleYearChange = (yearStr: string) => {
    if (!yearStr) {
      onRangeChange('', '');
      return;
    }
    const year = Number(yearStr);
    const month = selectedMonth ? Number(selectedMonth) : 1;
    const { from, to } = monthRange(year, month);
    onRangeChange(from, to);
  };

  const handleMonthChange = (monthStr: string) => {
    const year = selectedYear ? Number(selectedYear) : currentYear;
    if (!monthStr) {
      // 清空月份：保留年份的整年範圍
      onRangeChange(ymd(year, 1, 1), ymd(year, 12, 31));
      return;
    }
    const month = Number(monthStr);
    const { from, to } = monthRange(year, month);
    onRangeChange(from, to);
  };

  // ── 快捷按鈕 ───────────────────────────────────────────────────────────────
  const applyMonthOffset = (offset: number) => {
    const base = new Date(currentYear, new Date().getMonth() + offset, 1);
    const y = base.getFullYear();
    const m = base.getMonth() + 1;
    const { from, to } = monthRange(y, m);
    onRangeChange(from, to);
  };

  const applyThisQuarter = () => {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3); // 0..3
    const startMonth = q * 3 + 1;
    const endMonth = startMonth + 2;
    const y = now.getFullYear();
    const lastDay = new Date(y, endMonth, 0).getDate();
    onRangeChange(ymd(y, startMonth, 1), ymd(y, endMonth, lastDay));
  };

  const applyThisYear = () => {
    onRangeChange(ymd(currentYear, 1, 1), ymd(currentYear, 12, 31));
  };

  const pillClass =
    'px-2.5 py-1 text-xs rounded-full border border-gray-300 text-gray-600 hover:bg-primary-50 hover:border-primary-400 hover:text-primary-600 transition-colors';

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* 日期類型 */}
      <select
        value={dateType}
        onChange={(e) => onDateTypeChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        {dateTypeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {/* 年份 */}
      <select
        value={selectedYear === '' ? '' : String(selectedYear)}
        onChange={(e) => handleYearChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">年份</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>

      {/* 月份 */}
      <select
        value={selectedMonth === '' ? '' : String(selectedMonth)}
        onChange={(e) => handleMonthChange(e.target.value)}
        className="text-sm border border-gray-300 rounded-lg px-3 py-1.5"
      >
        <option value="">月份</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {m} 月
          </option>
        ))}
      </select>

      {/* 日期範圍 */}
      <div className="flex items-center gap-1 text-sm">
        <DateInput
          value={dateFrom}
          onChange={(val) => onRangeChange(val || '', dateTo)}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
        <span className="text-gray-400">~</span>
        <DateInput
          value={dateTo}
          onChange={(val) => onRangeChange(dateFrom, val || '')}
          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
        />
      </div>

      {/* 快捷按鈕 */}
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => applyMonthOffset(0)} className={pillClass}>
          本月
        </button>
        <button type="button" onClick={() => applyMonthOffset(-1)} className={pillClass}>
          上月
        </button>
        <button type="button" onClick={() => applyMonthOffset(-2)} className={pillClass}>
          上上月
        </button>
        <button type="button" onClick={applyThisQuarter} className={pillClass}>
          本季
        </button>
        <button type="button" onClick={applyThisYear} className={pillClass}>
          本年
        </button>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => onRangeChange('', '')}
            className="text-xs text-gray-500 hover:text-red-500 ml-1"
          >
            清除
          </button>
        )}
      </div>
    </div>
  );
}
