'use client';

import { useEffect, useState } from 'react';
import { companiesApi, contractsApi, dailyReportsApi, partnersApi } from '@/lib/api';
import DateInput from '@/components/DateInput';

interface ConfirmProjectTarget {
  project_name: string;
  project_location?: string | null;
  client_id?: number | string | null;
}

interface CompanyOption {
  id: number | string;
  name: string;
}

interface PartnerOption {
  id: number | string;
  name: string;
  partner_type?: string | null;
}

interface ContractOption {
  id: number | string;
  client_id?: number | string | null;
  contract_no: string;
  contract_name?: string | null;
}

interface ConfirmProjectModalProps {
  target: ConfirmProjectTarget;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ConfirmProjectModal({ target, onClose, onSuccess }: ConfirmProjectModalProps) {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [clients, setClients] = useState<PartnerOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [companyId, setCompanyId] = useState<string>('');
  const [clientId, setClientId] = useState<string>(target.client_id ? String(target.client_id) : '');
  const [contractId, setContractId] = useState<string>('');
  const [address, setAddress] = useState<string>(target.project_location || '');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [status, setStatus] = useState<string>('active');
  const [description, setDescription] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    companiesApi.simple().then((r: { data?: CompanyOption[] }) => setCompanies(r.data || [])).catch(() => setCompanies([]));
    partnersApi.simple()
      .then((r: { data?: PartnerOption[] }) => setClients((r.data || []).filter(p => p.partner_type === 'client' || p.partner_type === 'both')))
      .catch(() => setClients([]));
    contractsApi.simple().then((r: { data?: ContractOption[] }) => setContracts(r.data || [])).catch(() => setContracts([]));
  }, []);

  const filteredContracts = contracts.filter(c => !clientId || String(c.client_id) === clientId);

  const handleSubmit = async () => {
    if (!companyId) {
      setError('請選擇內部公司');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await dailyReportsApi.confirmProject({
        project_name: target.project_name,
        company_id: Number(companyId),
        client_id: clientId ? Number(clientId) : undefined,
        contract_id: contractId ? Number(contractId) : undefined,
        address: address || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        status: status || 'active',
        description: description || undefined,
      });
      alert('工程已成功轉為正式項目，關聯的日報記錄已更新。');
      onSuccess();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : '轉正失敗，請重試';
      const responseMessage = typeof e === 'object' && e !== null && 'response' in e
        ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      setError(responseMessage || message || '轉正失敗，請重試');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={submitting ? undefined : onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">將未確認工程轉為正式工程項目</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" disabled={submitting}>✕</button>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            工程名稱：<span className="font-semibold">{target.project_name}</span>
            <p className="text-xs text-blue-700 mt-1">確認後系統會在「工程管理」中建立對應工程記錄，並自動更新所有關聯的日報記錄的 project_id。</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">內部公司 <span className="text-red-500">*</span></label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={companyId} onChange={e => setCompanyId(e.target.value)}>
              <option value="">請選擇內部公司</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={clientId} onChange={e => { setClientId(e.target.value); setContractId(''); }}>
                <option value="">無</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">客戶合約</label>
              <select className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={contractId} onChange={e => setContractId(e.target.value)}>
                <option value="">無</option>
                {filteredContracts.map(c => (
                  <option key={c.id} value={c.id}>{c.contract_no}{c.contract_name ? ` - ${c.contract_name}` : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">工程地點</label>
            <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={address} onChange={e => setAddress(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">開始日期</label>
 <DateInput className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={startDate} onChange={val => setStartDate(val || '')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">結束日期</label>
 <DateInput className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={endDate} onChange={val => setEndDate(val || '')} />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="active">進行中</option>
              <option value="pending">待啟動</option>
              <option value="completed">已完工</option>
              <option value="on_hold">暫停</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg" rows={2} value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
          )}
        </div>
        <div className="px-6 py-3 border-t bg-gray-50 flex justify-end gap-2 rounded-b-xl">
          <button onClick={onClose} disabled={submitting} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">取消</button>
          <button onClick={handleSubmit} disabled={submitting} className="px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
            {submitting ? '轉換中...' : '確認轉為正式工程'}
          </button>
        </div>
      </div>
    </div>
  );
}
