'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useI18n } from '@/lib/i18n/i18n-context';
import { TranslationKey } from '@/lib/i18n/translations';
import { employeePortalApi, portalSharedApi } from '@/lib/employee-portal-api';
import DateInput from '@/components/DateInput';

const statusColors: Record<string, string> = { draft: "bg-yellow-100 text-yellow-700", submitted: "bg-green-100 text-green-700" };

export default function DailyReportListPage() {
  const router = useRouter();
  const { t } = useI18n();
  const statusLabels: Record<string, string> = { draft: t("draft"), submitted: t("submitted") };
  const shiftLabels: Record<string, string> = { day: t("dayShift"), night: t("nightShift") };
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [contractOptions, setContractOptions] = useState<string[]>([]);
  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterClientId, setFilterClientId] = useState('');
  const [filterClientName, setFilterClientName] = useState('');
  const [filterContractNo, setFilterContractNo] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const loadReports = async () => {
    try {
      setLoading(true);
      const params: any = { limit: 50 };
      if (filterProjectId) params.project_id = filterProjectId;
      if (filterClientId) params.client_id = filterClientId;
      if (filterClientName) params.client_name = filterClientName;
      if (filterContractNo) params.client_contract_no = filterContractNo;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;
      const res = await employeePortalApi.getMyDailyReports(params);
      setReports(res.data?.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    portalSharedApi.getProjectsSimple().then(res => setProjects(res.data || [])).catch(() => {});
    portalSharedApi.getPartnersSimple().then(res => setPartners(res.data || [])).catch(() => {});
    portalSharedApi.getFieldOptions('client_contract_no').then(res => {
      setContractOptions((res.data || []).filter((o: any) => o.is_active !== false).map((o: any) => t(o.label as TranslationKey)));
    }).catch(() => {});
    loadReports();
  }, []);

  useEffect(() => {
    loadReports();
  }, [filterProjectId, filterClientId, filterClientName, filterContractNo, filterDateFrom, filterDateTo]);

  const fmtDate = (d: string) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('en-GB');
  };

  const handleClientChange = (val: string) => {
    setFilterClientId(val);
    // If selecting a partner, clear manual client name
    if (val) setFilterClientName('');
  };

  const handleClientNameChange = (val: string) => {
    setFilterClientName(val);
    // If typing manually, clear partner selection
    if (val) setFilterClientId('');
  };

  const handleCopy = (e: React.MouseEvent, reportId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm(t('confirmCopyDailyReport'))) {
      router.push(`/employee-portal/supervisor/daily-report/new?copy_from=${reportId}`);
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/employee-portal/supervisor" className="text-blue-600 flex items-center gap-1">
            <span>‹</span> {t('back')}
          </Link>
          <h1 className="text-xl font-bold text-gray-800 ml-2">{t('dailyReportTitle')}</h1>
        </div>
        <Link
          href="/employee-portal/supervisor/daily-report/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all"
        >
          + {t('add')}
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100 space-y-2">
        {/* Project filter */}
        <select
          value={filterProjectId}
          onChange={e => setFilterProjectId(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50"
        >
          <option value="">{t('allProjects')}</option>
          {projects.map((p: any) => (
            <option key={p.id} value={p.id}>{p.project_no} - {p.project_name}</option>
          ))}
        </select>

        {/* Client filter */}
        <select
          value={filterClientId}
          onChange={e => handleClientChange(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50"
        >
          <option value="">{t('allClients')}</option>
          {partners.map((p: any) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Manual client name filter */}
        <input
          type="text"
          value={filterClientName}
          onChange={e => handleClientNameChange(e.target.value)}
          placeholder={t('clientNameSearch')}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50"
        />

        {/* Contract filter */}
        <select
          value={filterContractNo}
          onChange={e => setFilterContractNo(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50"
        >
          <option value="">{t('allClientContracts')}</option>
          {contractOptions.map(c => (
            <option key={c} value={c}>{t(c as TranslationKey)}</option>
          ))}
        </select>

        {/* Date range */}
        <div className="flex gap-2">
          <DateInput value={filterDateFrom}
            onChange={val => setFilterDateFrom(val || '')}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50"
            placeholder={t('startDate')}
          />
          <DateInput value={filterDateTo}
            onChange={val => setFilterDateTo(val || '')}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50"
            placeholder={t('endDate')}
          />
        </div>

        {/* Clear filters */}
        {(filterProjectId || filterClientId || filterClientName || filterContractNo || filterDateFrom || filterDateTo) && (
          <button
            onClick={() => {
              setFilterProjectId('');
              setFilterClientId('');
              setFilterClientName('');
              setFilterContractNo('');
              setFilterDateFrom('');
              setFilterDateTo('');
            }}
            className="w-full py-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            {t('clearAllFilters')}
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">{t('loading')}</div>
      ) : reports.length === 0 ? (
        <div className="bg-gray-50 rounded-2xl p-10 text-center border border-dashed border-gray-300">
          <p className="text-gray-500">{t('noDailyRecords')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(report => (
            <Link
              key={report.id}
              href={`/employee-portal/supervisor/daily-report/${report.id}`}
              className="block bg-white rounded-2xl p-4 border border-gray-100 shadow-sm active:scale-[0.98] transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-800 truncate">
                    {report.daily_report_project_name || report.project?.project_name || '-'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {report.daily_report_client_name || report.client?.name || '-'}
                    {report.daily_report_client_contract_no && (
                      <span className="ml-1 text-gray-400">· {report.daily_report_client_contract_no}</span>
                    )}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[report.daily_report_status] || 'bg-gray-100 text-gray-600'}`}>
                  {statusLabels[report.daily_report_status] || report.daily_report_status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span>{fmtDate(report.daily_report_date)}</span>
                <span className="bg-gray-100 px-2 py-0.5 rounded-full">{shiftLabels[report.daily_report_shift_type] || report.daily_report_shift_type}</span>
                <span>{report.items?.length || 0} {t('items')}</span>
              </div>
              <p className="text-sm text-gray-600 mt-2 line-clamp-2">{report.daily_report_work_summary}</p>
              
              <div className="mt-3 pt-3 border-t border-gray-50 flex justify-end">
                <button
                  onClick={(e) => handleCopy(e, report.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-700 rounded-lg text-xs font-bold border border-amber-100 active:scale-95 transition-all"
                >
                  <span>📋</span> {t('copy')}
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
