'use client';
import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { payrollApi } from '@/lib/api';
import Link from 'next/link';
import Modal from '@/components/Modal';

const STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  confirmed: '已確認',
  paid: '已付款',
};
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
};

export default function PayrollDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [payroll, setPayroll] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentDate, setPaymentDate] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const printRef = useRef<HTMLDivElement>(null);

  const loadData = async () => {
    try {
      const res = await payrollApi.get(Number(params.id));
      setPayroll(res.data);
      setPaymentDate(res.data.payment_date || '');
      setChequeNumber(res.data.cheque_number || '');
    } catch {
      router.push('/payroll');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [params.id]);

  const handleConfirm = async () => {
    try {
      await payrollApi.update(payroll.id, { status: 'confirmed' });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleSavePayment = async () => {
    try {
      await payrollApi.update(payroll.id, {
        payment_date: paymentDate || null,
        cheque_number: chequeNumber || null,
        status: 'paid',
      });
      setShowPayment(false);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleRecalculate = async () => {
    if (!confirm('確定要重新計算此糧單？')) return;
    try {
      const res = await payrollApi.recalculate(payroll.id);
      setPayroll(res.data);
    } catch (err: any) {
      alert(err.response?.data?.message || '操作失敗');
    }
  };

  const handleDelete = async () => {
    if (!confirm('確定要刪除此糧單？')) return;
    try {
      await payrollApi.remove(payroll.id);
      router.push('/payroll');
    } catch (err: any) {
      alert(err.response?.data?.message || '刪除失敗');
    }
  };

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>糧單 - ${payroll.employee?.name_zh}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif; margin: 0; padding: 20px; color: #000; }
          .payslip { max-width: 800px; margin: 0 auto; }
          .company-header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #000; padding-bottom: 10px; }
          .company-header h1 { font-size: 24px; margin: 0 0 5px; }
          .company-header h2 { font-size: 14px; font-weight: bold; margin: 0 0 5px; letter-spacing: 1px; }
          .company-header p { font-size: 11px; font-weight: bold; margin: 0; letter-spacing: 0.5px; }
          .info-table { width: 100%; border-collapse: collapse; margin: 15px 0; border: 2px solid #000; }
          .info-table td { padding: 6px 12px; border: 1px solid #000; font-size: 13px; }
          .info-table .label { width: 120px; text-align: right; font-weight: normal; white-space: nowrap; }
          .info-table .value { font-weight: normal; }
          .period-row { margin: 15px 0; font-size: 14px; }
          .period-row strong { font-weight: bold; }
          .calc-table { width: 100%; border-collapse: collapse; margin: 15px 0; border: 2px solid #000; }
          .calc-table th, .calc-table td { padding: 6px 12px; border: 1px solid #000; font-size: 13px; }
          .calc-table th { background: #fff; font-weight: bold; text-align: center; border-bottom: 2px solid #000; }
          .calc-table .item-name { text-align: left; width: 200px; }
          .calc-table .number { text-align: right; font-family: monospace; }
          .calc-table .total-row { border-top: 2px solid #000; }
          .calc-table .total-row td { font-weight: bold; font-size: 14px; }
          .payment-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .payment-table td { padding: 6px 12px; border: 1px solid #000; font-size: 13px; }
          .payment-table .label { text-align: right; width: 200px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${content.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (!payroll) return null;

  const emp = payroll.employee;
  const cp = payroll.company_profile;
  const items = payroll.items || [];

  // Parse period
  const [yearStr, monthStr] = payroll.period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const lastDay = new Date(year, month, 0).getDate();
  const periodStart = `${year}年${month}月1日`;
  const periodEnd = `${year}年${month}月${lastDay}日`;

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/payroll" className="hover:text-primary-600">計糧管理</Link>
        <span>/</span>
        <span className="text-gray-900">糧單詳情</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{emp?.name_zh} - {payroll.period} 糧單</h1>
          <p className="text-sm text-gray-500">
            {emp?.name_en} | {emp?.emp_code} |
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[payroll.status] || ''}`}>
              {STATUS_LABELS[payroll.status] || payroll.status}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {payroll.status === 'draft' && (
            <>
              <button onClick={handleRecalculate} className="btn-secondary">重新計算</button>
              <button onClick={handleConfirm} className="btn-primary">確認糧單</button>
              <button onClick={handleDelete} className="btn-secondary text-red-600 hover:text-red-700">刪除</button>
            </>
          )}
          {payroll.status === 'confirmed' && (
            <button onClick={() => setShowPayment(true)} className="btn-primary">記錄付款</button>
          )}
          <button onClick={handlePrint} className="btn-secondary">列印 / PDF</button>
        </div>
      </div>

      {/* On-screen preview */}
      <div className="card mb-6">
        <div ref={printRef}>
          <div className="payslip">
            {/* Company Header */}
            <div style={{ textAlign: 'center', marginBottom: '20px', borderBottom: '3px solid #000', paddingBottom: '10px' }}>
              <h1 style={{ fontSize: '24px', margin: '0 0 5px', fontWeight: 'bold' }}>
                {cp?.chinese_name || '明達建築有限公司'}
              </h1>
              <h2 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 5px', letterSpacing: '1px' }}>
                {cp?.english_name || 'DICKY CONSTRUCTION COMPANY LIMITED'}
              </h2>
              <p style={{ fontSize: '11px', fontWeight: 'bold', margin: 0, letterSpacing: '0.5px' }}>
                {cp?.registered_address || cp?.office_address || 'P. O. BOX 120, TUNG CHUNG POST OFFICE, TUNG CHUNG, LANTAU ISLAND, NT'}
              </p>
            </div>

            {/* Employee Info */}
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '15px 0', border: '2px solid #000' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', width: '120px', textAlign: 'right', fontSize: '13px' }}>員工姓名(中)：</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>{emp?.name_zh || '-'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontSize: '13px' }}>員工姓名(英)：</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>{emp?.name_en || '-'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontSize: '13px' }}>身份證號碼：</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>{emp?.id_number || '-'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontSize: '13px' }}>地址：</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>{emp?.address || '-'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontSize: '13px' }}>緊急聯絡人：</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>{emp?.emergency_contact || '-'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontSize: '13px' }}>出糧戶口：</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>{emp?.bank_account || '-'}</td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontSize: '13px' }}>受僱日期：</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>
                    {emp?.join_date ? `${new Date(emp.join_date).getFullYear()}年${new Date(emp.join_date).getMonth() + 1}月${new Date(emp.join_date).getDate()}日` : '-'}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Period */}
            <div style={{ margin: '15px 0', fontSize: '14px' }}>
              <strong>本月工作日期：</strong>
              <span style={{ fontWeight: 'bold', textDecoration: 'underline' }}>{periodStart}-{lastDay}日</span>
            </div>

            {/* Calculation Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '15px 0', border: '2px solid #000' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 12px', border: '1px solid #000', borderBottom: '2px solid #000', textAlign: 'left', width: '200px', fontSize: '13px' }}></th>
                  <th style={{ padding: '6px 12px', border: '1px solid #000', borderBottom: '2px solid #000', textAlign: 'center', fontSize: '13px' }}>單價($)</th>
                  <th style={{ padding: '6px 12px', border: '1px solid #000', borderBottom: '2px solid #000', textAlign: 'center', fontSize: '13px' }}>天數</th>
                  <th style={{ padding: '6px 12px', border: '1px solid #000', borderBottom: '2px solid #000', textAlign: 'right', fontSize: '13px', width: '150px' }} colSpan={2}>金額($)</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => {
                  const isDeduction = Number(item.amount) < 0;
                  const displayAmount = Math.abs(Number(item.amount));
                  const itemNumber = idx + 1;

                  return (
                    <tr key={item.id || idx}>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>
                        ({itemNumber}) {item.item_name}
                      </td>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'center', fontFamily: 'monospace', fontSize: '13px' }}>
                        {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry'
                          ? `${(Number(item.quantity) * 100).toFixed(0)}%`
                          : Number(item.unit_price).toFixed(2)}
                      </td>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'center', fontFamily: 'monospace', fontSize: '13px' }}>
                        {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry'
                          ? ''
                          : Number(item.quantity)}
                      </td>
                      <td style={{ padding: '6px 4px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '13px', width: '30px' }}>
                        {isDeduction ? '-$' : '$'}
                      </td>
                      <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '13px' }}>
                        {displayAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })}
                {/* Total row */}
                <tr style={{ borderTop: '2px solid #000' }}>
                  <td colSpan={3} style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '14px', fontWeight: 'bold' }}></td>
                  <td style={{ padding: '6px 4px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold' }}>$</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', textAlign: 'right', fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold' }}>
                    {Number(payroll.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Payment Info */}
            <table style={{ width: '100%', borderCollapse: 'collapse', margin: '15px 0' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 12px', textAlign: 'right', width: '200px', fontSize: '13px' }}></td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: '13px' }}>付款日期:</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px', width: '200px' }}>
                    {payroll.payment_date || ''}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '6px 12px' }}></td>
                  <td style={{ padding: '6px 12px', textAlign: 'right', fontSize: '13px' }}>支票號碼:</td>
                  <td style={{ padding: '6px 12px', border: '1px solid #000', fontSize: '13px' }}>
                    {payroll.cheque_number || ''}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detailed breakdown (on-screen only) */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">計算明細</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">薪資類型</p>
            <p className="font-bold">{payroll.salary_type === 'daily' ? '日薪' : '月薪'}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">底薪單價</p>
            <p className="font-bold font-mono">${Number(payroll.base_rate).toLocaleString()}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">工作天數</p>
            <p className="font-bold">{Number(payroll.work_days)}</p>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">強積金計劃</p>
            <p className="font-bold">{payroll.mpf_plan === 'industry' ? '行業計劃' : payroll.mpf_plan === 'manulife' ? 'Manulife' : payroll.mpf_plan === 'aia' ? 'AIA' : payroll.mpf_plan || '-'}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="px-3 py-2 text-left">項目</th>
                <th className="px-3 py-2 text-right">單價</th>
                <th className="px-3 py-2 text-right">數量</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2 text-left">備註</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: any) => (
                <tr key={item.id} className="border-b">
                  <td className="px-3 py-2 font-medium">{item.item_name}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry'
                      ? `${(Number(item.quantity) * 100).toFixed(0)}%`
                      : `$${Number(item.unit_price).toLocaleString()}`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {item.item_type === 'mpf_deduction' && payroll.mpf_plan !== 'industry'
                      ? ''
                      : Number(item.quantity)}
                  </td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${Number(item.amount) < 0 ? 'text-red-600' : ''}`}>
                    {Number(item.amount) < 0 ? '-' : ''}${Math.abs(Number(item.amount)).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{item.remarks || '-'}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-900 bg-gray-50">
                <td colSpan={3} className="px-3 py-2 font-bold text-right">淨額</td>
                <td className="px-3 py-2 text-right font-mono font-bold text-lg text-primary-600">
                  ${Number(payroll.net_amount).toLocaleString()}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Info Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">付款記錄</h2>
          {payroll.status !== 'paid' && (
            <button onClick={() => setShowPayment(true)} className="text-sm text-primary-600 hover:underline">
              記錄付款
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-500">付款日期</p>
            <p className="font-medium">{payroll.payment_date || '未付款'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">支票號碼</p>
            <p className="font-medium font-mono">{payroll.cheque_number || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">出糧日</p>
            <p className="text-sm text-gray-400">翌月7日前</p>
          </div>
        </div>
      </div>

      {/* Payment Modal */}
      <Modal isOpen={showPayment} onClose={() => setShowPayment(false)} title="記錄付款">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">付款日期</label>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">支票號碼</label>
            <input value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} className="input-field" placeholder="例：SCB237081" />
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button onClick={() => setShowPayment(false)} className="btn-secondary">取消</button>
            <button onClick={handleSavePayment} className="btn-primary">確認付款</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
