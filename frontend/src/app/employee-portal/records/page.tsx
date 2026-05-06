'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { employeePortalApi, WorkLogHistoryItem } from '@/lib/employee-portal-api';

type Tab = 'work' | 'expense' | 'leave' | 'payslip' | 'attendance';

const STATUS_COLORS: Record<string, string> = {
  editing: 'bg-gray-100 text-gray-700',
  unassigned: 'bg-yellow-100 text-yellow-800',
  assigned: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-orange-100 text-orange-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-700',
};

const LEAVE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

// 格式化日期，加上年份
function formatDateFull(d: string | null): string {
  if (!d) return '-';
  const date = new Date(d);
  return date.toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// 格式化日期時間，加上年份
function formatDateTimeFull(d: string): string {
  return new Date(d).toLocaleString('zh-HK', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatAmount(n: any): string {
  return `HK$ ${Number(n).toLocaleString('zh-HK', { minimumFractionDigits: 0 })}`;
}

// 工作紀錄卡片
function WorkLogCard({ log, onClick, t }: { log: WorkLogHistoryItem; onClick: () => void; t: Function }) {
  const clientName = log.client?.name ?? log.unverified_client_name ?? null;
  const isTransport = log.service_type === t('transport');

  // 1車/1天 顯示
  const quantityLabel = log.quantity != null    ? `${log.quantity}${log.unit ? ` ${log.unit}` : t('otHour')}`
    : null;

  // OT 時數
  const otLabel = log.ot_quantity != null && Number(log.ot_quantity) > 0
    ? `OT ${log.ot_quantity}${log.ot_unit ? log.ot_unit : '時'}`
    : null;

  // 中直
  const midShiftLabel = log.is_mid_shift ? t('midShift') : null;

  // 更次
  const shiftLabel = log.day_night === 'D' ? t('dayShift') : log.day_night === 'N' ? t('nightShift') : log.day_night ?? null;

  // 地點
  const locationParts = [log.start_location, log.end_location].filter(Boolean);
  const locationLabel = locationParts.length > 0 ? locationParts.join(t('locationConnector')) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-md active:scale-[0.99] transition-all"
    >
      {/* Header row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
            {log.service_type === t('transport') ? t('transport') : t('engineering')}
          </span>
          {shiftLabel && (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{shiftLabel}</span>
          )}
          {midShiftLabel && (
            <span className="text-xs text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full">{midShiftLabel}</span>
          )}
          {otLabel && (
            <span className="text-xs text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full">{otLabel}</span>
          )}
        </div>
        <div className="flex items-center gap-1 ml-2 flex-shrink-0">
          {log.status && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[log.status] || 'bg-gray-100 text-gray-600'}`}>
              {log.status}
            </span>
          )}
          <span className="text-gray-300 text-sm">›</span>
        </div>
      </div>

      {/* Date */}
      <p className="text-xs text-gray-400 mb-2">
        {formatDateFull(log.scheduled_date ?? log.created_at)}
      </p>

      {/* Client & Contract */}
      {(clientName || log.client_contract_no) && (
        <div className="flex items-center gap-1 mb-1.5 flex-wrap">
          {clientName && (
            <span className="text-sm font-medium text-gray-800">{clientName}</span>
          )}
          {log.client_contract_no && (
            <span className="text-xs text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{log.client_contract_no}</span>
          )}
        </div>
      )}

      {/* Machine type & equipment */}
      {(log.machine_type || log.equipment_number) && (
        <p className="text-xs text-gray-600 mb-1">
          🔧 {[log.machine_type, log.equipment_number, log.tonnage ? `${log.tonnage}${t('ton')}` : null].filter(Boolean).join(' · ')}
        </p>
      )}

      {/* Location */}
      {locationLabel && (
        <p className="text-xs text-gray-500 mb-1">
          📍 {locationLabel}
        </p>
      )}

      {/* Quantity */}
      {quantityLabel && (
        <p className="text-xs text-gray-500">
          {t('quantityLabel')}{quantityLabel}
        </p>
      )}
    </button>
  );
}

export default function RecordsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('work');
  const [workLogs, setWorkLogs] = useState<WorkLogHistoryItem[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [payrolls, setPayrolls] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData(tab);
  }, [tab]);

  const loadData = async (currentTab: Tab) => {
    setLoading(true);
    try {
      if (currentTab === 'work') {
        const res = await employeePortalApi.getMyWorkLogs({ limit: 30 });
        setWorkLogs(res.data?.data || []);
      } else if (currentTab === 'expense') {
        const res = await employeePortalApi.getMyExpenses({ limit: 30 });
        setExpenses(res.data?.data || []);
      } else if (currentTab === 'leave') {
        const res = await employeePortalApi.getLeaveRecords({ limit: 30 });
        setLeaves(res.data?.data || []);
      } else if (currentTab === 'payslip') {
        const res = await employeePortalApi.getMyPayrolls({ limit: 20 });
        setPayrolls(res.data?.data || []);
      } else if (currentTab === 'attendance') {
        const res = await employeePortalApi.getAttendanceHistory({ limit: 30 });
        setAttendance(res.data?.data || []);
      }
    } catch {}
    setLoading(false);
  };

  const getLeaveTypeLabel = (type: string) => {
    if (type === 'sick') return t('sickLeave');
    if (type === 'annual') return t('annualLeave');
    return type;
  };

  const getLeaveStatusLabel = (status: string) => {
    if (status === 'pending') return t('pending');
    if (status === 'approved') return t('approved');
    if (status === 'rejected') return t('rejected');
    return status;
  };

  const getPayrollStatusLabel = (status: string) => {
    if (status === 'draft') return t('draft');
    if (status === 'finalized') return t('finalized');
    if (status === 'paid') return t('paid_status');
    return status;
  };

  const tabs = [
    { key: 'work' as Tab, label: t('workRecords'), icon: '📋' },
    { key: 'expense' as Tab, label: t('expenseRecords'), icon: '💰' },
    { key: 'leave' as Tab, label: t('leaveRecords'), icon: '📅' },
    { key: 'payslip' as Tab, label: t('payslips'), icon: '💵' },
    { key: 'attendance' as Tab, label: t('attendanceRecords'), icon: '⏰' },
  ];

  return (
    <div className="p-4 pb-6">
      <h1 className="text-xl font-bold text-gray-900 mb-4">{t('myRecordsTitle')}</h1>

      {/* Tab Scroll */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            onClick={() => setTab(tabItem.key)}
            className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              tab === tabItem.key
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            {tabItem.icon} {tabItem.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">{t('loading')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Work Logs */}
          {tab === 'work' && (
            workLogs.length === 0 ? (
              <EmptyState icon="📋" label={t('noData')} />
            ) : (
              workLogs.map((log) => (
                  <WorkLogCard
                    key={log.id}
                    log={log}
                    onClick={() => router.push(`/employee-portal/work-report?edit=${log.id}`)}
                    t={t}
                  />
              ))
            )
          )}

          {/* Expenses */}
          {tab === 'expense' && (
            expenses.length === 0 ? (
              <EmptyState icon="💰" label={t('noData')} />
            ) : (
              expenses.map((exp) => (
                <div key={exp.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800 text-sm">{exp.item || '-'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatDateFull(exp.date)} · {exp.category?.name || '-'}
                      </p>
                      {exp.supplier_name && <p className="text-xs text-gray-400">{exp.supplier_name}</p>}
                    </div>
                    <div className="text-right ml-3">
                      <p className="font-bold text-gray-900 text-sm">{formatAmount(exp.total_amount)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        Number(exp.paid_amount) > 0 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {Number(exp.paid_amount) > 0 ? t('paid') : t('unpaid')}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )
          )}

          {/* Leave Records */}
          {tab === 'leave' && (
            leaves.length === 0 ? (
              <EmptyState icon="📅" label={t('noData')} />
            ) : (
              leaves.map((leave) => (
                <div key={leave.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-gray-800 text-sm">
                          {getLeaveTypeLabel(leave.leave_type)}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEAVE_STATUS_COLORS[leave.status] || 'bg-gray-100 text-gray-600'}`}>
                          {getLeaveStatusLabel(leave.status)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {formatDateFull(leave.date_from)} – {formatDateFull(leave.date_to)}
                      </p>
                      {leave.reason && <p className="text-xs text-gray-400 mt-1">{leave.reason}</p>}
                    </div>
                    <p className="font-bold text-gray-900 text-sm ml-3">{leave.days} {t('leaveDays')}</p>
                  </div>
                </div>
              ))
            )
          )}

          {/* Payslips */}
          {tab === 'payslip' && (
            payrolls.length === 0 ? (
              <EmptyState icon="💵" label={t('noData')} />
            ) : (
              payrolls.map((payroll) => (
                <div key={payroll.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-800">{payroll.period}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {payroll.company_profile?.chinese_name || '-'}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      payroll.status === 'paid' ? 'bg-green-100 text-green-700' :
                      payroll.status === 'finalized' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {getPayrollStatusLabel(payroll.status)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-500">{t('baseSalary')}</p>
                      <p className="font-semibold text-gray-800">{formatAmount(payroll.base_amount)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <p className="text-gray-500">{t('netAmount')}</p>
                      <p className="font-bold text-blue-700">{formatAmount(payroll.net_amount)}</p>
                    </div>
                  </div>
                  {payroll.payment_date && (
                    <p className="text-xs text-gray-400 mt-2">
                      {t('paymentDate')}: {formatDateFull(payroll.payment_date)}
                    </p>
                  )}
                </div>
              ))
            )
          )}

          {/* Attendance Records */}
          {tab === 'attendance' && (
            attendance.length === 0 ? (
              <EmptyState icon="⏰" label={t('noData')} />
            ) : (
              attendance.map((record) => (
                <div key={record.id} className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                    record.type === 'clock_in' ? 'bg-green-100' : 'bg-red-100'
                  }`}>
                    {record.type === 'clock_in' ? '🟢' : '🔴'}
                  </div>
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${record.type === 'clock_in' ? 'text-green-700' : 'text-red-700'}`}>
                      {record.type === 'clock_in' ? t('clockIn') : t('clockOut')}
                    </p>
                    <p className="text-xs text-gray-500">{formatDateTimeFull(record.timestamp)}</p>
                    {record.latitude && (
                      <p className="text-xs text-gray-400">
                        📍 {Number(record.latitude).toFixed(4)}, {Number(record.longitude).toFixed(4)}
                      </p>
                    )}
                  </div>
                  {record.photo_url && (
                    <img src={record.photo_url} alt="attendance" className="w-12 h-12 object-cover rounded-lg flex-shrink-0" />
                  )}
                </div>
              ))
            )
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="bg-white rounded-2xl p-10 text-center text-gray-400 shadow-sm border border-gray-100">
      <p className="text-4xl mb-3">{icon}</p>
      <p className="text-sm">{label}</p>
    </div>
  );
}
