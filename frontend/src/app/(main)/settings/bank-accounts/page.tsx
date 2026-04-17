'use client';
import { useState, useEffect, useMemo } from 'react';
import { bankAccountsApi, companiesApi } from '@/lib/api';
import InlineEditDataTable, { InlineColumn } from '@/components/InlineEditDataTable';
import RoleGuard from '@/components/RoleGuard';
import { useAuth } from '@/lib/auth';

export default function BankAccountsPage() {
  const { isReadOnly } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<any[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await bankAccountsApi.list();
      setData(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    companiesApi.list({ limit: 200 }).then(r => {
      const list = r.data?.data || r.data || [];
      setCompanies(list);
    }).catch(() => {});
  }, []);

  const companyOptions = useMemo(() => [
    { label: '（未指定）', value: '' },
    ...companies.map((c: any) => ({ label: c.name, value: c.id })),
  ], [companies]);

  const companyMap = useMemo(() => {
    const map: Record<number, string> = {};
    companies.forEach((c: any) => { map[c.id] = c.name; });
    return map;
  }, [companies]);

  const columns: InlineColumn[] = [
    { key: 'bank_name', label: '銀行名稱', editable: true },
    { key: 'account_name', label: '帳戶名稱', editable: true },
    { key: 'account_no', label: '帳號', editable: true },
    { 
      key: 'currency', 
      label: '幣種', 
      editable: true, 
      editType: 'select', 
      editOptions: [
        { label: 'HKD', value: 'HKD' },
        { label: 'USD', value: 'USD' },
        { label: 'RMB', value: 'RMB' },
      ] 
    },
    {
      key: 'company_id',
      label: '所屬公司',
      editable: true,
      editType: 'select',
      editOptions: companyOptions,
      render: (val: any, row: any) => {
        // First try: use the included company relation (most reliable)
        if (row?.company?.name) return <span className="text-sm">{row.company.name}</span>;
        // Second try: look up by id (support both number and string)
        if (!val && val !== 0) return <span className="text-gray-400">—</span>;
        const name = companyMap[Number(val)] || companyMap[val];
        if (name) return <span className="text-sm">{name}</span>;
        return <span className="text-gray-400">—</span>;
      },
    },
    { 
      key: 'is_active', 
      label: '狀態', 
      editable: true, 
      editType: 'select',
      editOptions: [
        { label: '啟用', value: true },
        { label: '停用', value: false },
      ],
      render: (val) => val ? <span className="text-green-600 font-medium">啟用</span> : <span className="text-red-600 font-medium">停用</span>
    },
    { key: 'remarks', label: '備註', editable: true },
  ];

  const handleSave = async (id: number, row: any) => {
    try {
      const payload = { ...row };
      // Convert company_id: empty string → null, string → number
      if (payload.company_id === '' || payload.company_id === null || payload.company_id === undefined) {
        payload.company_id = null;
      } else {
        payload.company_id = Number(payload.company_id);
      }
      if (id === 0) {
        await bankAccountsApi.create(payload);
      } else {
        await bankAccountsApi.update(id, payload);
      }
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '儲存失敗');
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('確定要刪除此銀行帳戶嗎？')) {
      try {
        await bankAccountsApi.delete(id);
        loadData();
      } catch (err: any) {
        alert(err.response?.data?.message || '刪除失敗');
      }
    }
  };

  return (
    <RoleGuard pageKey="settings-bank-accounts">
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">銀行帳戶管理</h1>
          <button 
            onClick={() => setData([{ id: 0, bank_name: '', account_name: '', account_no: '', currency: 'HKD', company_id: '', is_active: true }, ...data])}
            className="btn-primary"
          >
            + 新增帳戶
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <InlineEditDataTable
            columns={columns}
            data={data}
            loading={loading}
            onSave={handleSave}
            onDelete={handleDelete}
            total={data.length}
            page={1}
            limit={100}
            onPageChange={() => {}}
          />
        </div>
      </div>
    </RoleGuard>
  );
}
