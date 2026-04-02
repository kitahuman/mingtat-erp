'use client';
import { useState, useEffect } from 'react';
import { bankAccountsApi } from '@/lib/api';
import InlineEditDataTable, { InlineColumn } from '@/components/InlineEditDataTable';
import RoleGuard from '@/components/RoleGuard';

export default function BankAccountsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

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
      if (id === 0) {
        await bankAccountsApi.create(row);
      } else {
        await bankAccountsApi.update(id, row);
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
    <RoleGuard roles={['admin']}>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">銀行帳戶管理</h1>
          <button 
            onClick={() => setData([{ id: 0, bank_name: '', account_name: '', account_no: '', currency: 'HKD', is_active: true }, ...data])}
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
