'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { companyProfilesApi } from '@/lib/api';
import DataTable from '@/components/DataTable';
import ExpiryBadge from '@/components/ExpiryBadge';
import { fmtDate } from '@/lib/dateUtils';
import { useAuth } from '@/lib/auth';

export default function CompanyProfilesPage() {
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('code');
  const [sortOrder, setSortOrder] = useState('ASC');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await companyProfilesApi.list({ page, limit: 20, search, sortBy, sortOrder });
      setData(res.data.data);
      setTotal(res.data.total);
    } catch {}
    setLoading(false);
  }, [page, search, sortBy, sortOrder]);

  useEffect(() => { load(); }, [load]);

  const handleSort = (field: string, order: string) => {
    setSortBy(field);
    setSortOrder(order);
    setPage(1);
  };

  const filterExpiry = (v: string) => {
    if (!v) return '-';
    return fmtDate(v);
  };

  const columns = [
    { key: 'code', label: '代碼', sortable: true, render: (v: string) => <span className="font-mono font-bold text-primary-600">{v}</span> },
    { key: 'chinese_name', label: '公司中文名', sortable: true, render: (v: string) => <span className="font-medium">{v}</span> },
    { key: 'english_name', label: '公司英文名', sortable: true, render: (v: string) => <span className="text-sm text-gray-600">{v || '-'}</span> },
    { key: 'br_number', label: '商業登記證號碼', render: (v: string) => v || '-' },
    { key: 'br_expiry_date', label: '商業登記屆滿日', sortable: true, render: (v: string) => <ExpiryBadge date={v} />, filterRender: filterExpiry },
    { key: 'subcontractor_reg_expiry', label: '分包商註冊到期', sortable: true, render: (v: string) => v ? <ExpiryBadge date={v} /> : <span className="text-gray-400">-</span>, filterRender: filterExpiry },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">公司資料</h1>
          <p className="text-gray-500 mt-1">管理明達集團旗下公司的詳細資料</p>
        </div>
      </div>

      <div className="card">
        <DataTable
          exportFilename="公司資料列表"
          columns={columns}
          data={data}
          total={total}
          page={page}
          limit={20}
          onPageChange={setPage}
          onSearch={(s) => { setSearch(s); setPage(1); }}
          searchPlaceholder="搜尋代碼、公司名稱..."
          onRowClick={(row) => router.push(`/company-profiles/${row.id}`)}
          loading={loading}
          sortBy={sortBy}
          sortOrder={sortOrder}
          onSort={handleSort}
        />
      </div>
    </div>
  );
}
