'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { subconPayrollApi } from '@/lib/api';
import Link from 'next/link';
import { fmtDate } from '@/lib/dateUtils';
import PaymentOutBlock from '@/components/payment/PaymentOutBlock';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
  partially_paid: '部分付款',
  cancelled: '已取消',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  partially_paid: 'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function SubconPayrollDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);

  const [payroll, setPayroll] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPayroll = useCallback(() => {
    if (!id) return;
    setLoading(true);
    subconPayrollApi.get(id)
      .then(res => setPayroll(res.data))
      .catch(err => setError(err.response?.data?.message || '載入失敗'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { loadPayroll(); }, [loadPayroll]);

  const handleDelete = async () => {
    if (!confirm('確定要刪除此糧單嗎？此操作將同時刪除關聯的支出記錄，且不可恢復。')) return;
    try {
      await subconPayrollApi.remove(id);
      router.push('/subcon-payroll/records');
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const formatMonth = (dateStr: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月`;
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">載入中...</div>
      </div>
    );
  }

  if (error || !payroll) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || '糧單不存在'}
        </div>
        <Link href="/subcon-payroll/records" className="text-primary-600 hover:underline mt-4 inline-block">
          返回糧單列表
        </Link>
      </div>
    );
  }

  const items = payroll.items || [];
  const workItems = items.filter((item: any) => item.subcon_payroll_item_work_log_id != null);
  const extraItems = items.filter((item: any) => item.subcon_payroll_item_work_log_id == null);

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/subcon-payroll/records" className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold">判頭糧單 #{payroll.id}</h1>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[payroll.subcon_payroll_status] || 'bg-gray-100 text-gray-800'}`}>
            {STATUS_LABELS[payroll.subcon_payroll_status] || payroll.subcon_payroll_status}
          </span>
        </div>
        <div className="flex gap-2">
          {payroll.subcon_payroll_status !== 'paid' && (
            <button
              onClick={handleDelete}
              className="text-sm text-red-600 hover:text-red-700 border border-red-300 rounded px-3 py-1.5 hover:bg-red-50"
            >
              刪除糧單
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">供應商</p>
          <p className="text-lg font-bold">{payroll.subcontractor?.name || '-'}</p>
          {payroll.subcontractor?.code && (
            <p className="text-xs text-gray-400">{payroll.subcontractor.code}</p>
          )}
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">月份</p>
          <p className="text-lg font-bold">{formatMonth(payroll.subcon_payroll_month)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">總金額</p>
          <p className="text-lg font-bold text-primary-600">
            ${Number(payroll.subcon_payroll_total_amount).toLocaleString()}
          </p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500 mb-1">明細筆數</p>
          <p className="text-lg font-bold">{items.length}</p>
          <p className="text-xs text-gray-400">
            工作記錄 {workItems.length} 筆 / 其他 {extraItems.length} 筆
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">確認時間：</span>
            <span className="font-medium">
              {payroll.subcon_payroll_confirmed_at
                ? new Date(payroll.subcon_payroll_confirmed_at).toLocaleString('zh-HK')
                : '-'}
            </span>
          </div>
          <div>
            <span className="text-gray-500">建立時間：</span>
            <span className="font-medium">
              {new Date(payroll.subcon_payroll_created_at).toLocaleString('zh-HK')}
            </span>
          </div>
          {payroll.expenses && payroll.expenses.length > 0 && (
            <div>
              <span className="text-gray-500">關聯支出：</span>
              <Link href={`/expenses/${payroll.expenses[0].id}`} className="text-primary-600 hover:underline font-medium">
                Expense #{payroll.expenses[0].id}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Work Items Table */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-4 py-3 border-b">
          <h2 className="font-bold text-gray-700">工作記錄明細</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">日期</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">司機</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">車牌</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600">工作內容</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">數量</th>
                <th className="px-3 py-2 text-center font-medium text-gray-600">單位</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">單價</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600">小計</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {workItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-gray-400">沒有工作記錄明細</td>
                </tr>
              ) : (
                workItems.map((item: any, idx: number) => (
                  <tr key={item.subcon_payroll_item_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(item.subcon_payroll_item_work_date)}</td>
                    <td className="px-3 py-2 font-medium">{item.subcon_payroll_item_driver_name}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {item.driver?.plate_no || item.work_log?.equipment_number || '-'}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs max-w-[200px] truncate">
                      {item.subcon_payroll_item_work_content || '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {Number(item.subcon_payroll_item_quantity)}
                    </td>
                    <td className="px-3 py-2 text-center">{item.subcon_payroll_item_unit}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      ${Number(item.subcon_payroll_item_unit_price).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      ${Number(item.subcon_payroll_item_subtotal).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {workItems.length > 0 && (
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={8} className="px-3 py-2 text-right font-bold text-gray-600">工作記錄小計</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">
                    ${workItems.reduce((s: number, i: any) => s + Number(i.subcon_payroll_item_subtotal), 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Extra Items */}
      {extraItems.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="px-4 py-3 border-b">
            <h2 className="font-bold text-gray-700">其他費用項目</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">#</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600">項目名稱</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-600">金額</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {extraItems.map((item: any, idx: number) => (
                  <tr key={item.subcon_payroll_item_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2 font-medium">{item.subcon_payroll_item_work_content || '其他'}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">
                      ${Number(item.subcon_payroll_item_subtotal).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-right font-bold text-gray-600">其他費用小計</td>
                  <td className="px-3 py-2 text-right font-mono font-bold">
                    ${extraItems.reduce((s: number, i: any) => s + Number(i.subcon_payroll_item_subtotal), 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Grand Total */}
      <div className="bg-primary-50 rounded-lg shadow p-4 mb-6 flex justify-between items-center">
        <span className="font-bold text-primary-700 text-lg">糧單總金額</span>
        <span className="font-bold text-primary-700 text-2xl font-mono">
          ${Number(payroll.subcon_payroll_total_amount).toLocaleString()}
        </span>
      </div>

      {/* Payment Records Block - replaced placeholder with PaymentOutBlock */}
      <PaymentOutBlock
        sourceType="subcon_payroll"
        sourceRefId={id}
        totalAmount={Number(payroll.subcon_payroll_total_amount) || 0}
        onStatusChange={loadPayroll}
      />
    </div>
  );
}
