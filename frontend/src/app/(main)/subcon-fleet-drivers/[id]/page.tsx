'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { subconFleetDriversApi, partnersApi } from '@/lib/api';
import { fmtDate, toInputDate } from '@/lib/dateUtils';
import DocumentUpload from '@/components/DocumentUpload';
import Link from 'next/link';
import Modal from '@/components/Modal';
import { useAuth } from '@/lib/auth';

// ── Types ────────────────────────────────────────────────────

interface SubcontractorInfo {
  id: number;
  name: string;
  code: string | null;
  partner_type: string;
  phone: string | null;
  contact_person: string | null;
}

interface FleetDriverDetail {
  id: number;
  subcontractor_id: number;
  short_name: string | null;
  name_zh: string;
  name_en: string | null;
  id_number: string | null;
  machine_type: string | null;
  plate_no: string | null;
  phone: string | null;
  date_of_birth: string | null;
  yellow_cert_no: string | null;
  red_cert_no: string | null;
  has_d_cert: boolean;
  is_cert_returned: boolean;
  address: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  subcontractor: SubcontractorInfo;
  work_logs: WorkLogItem[];
  rate_cards: RateCardItem[];
  nickname_mappings: NicknameMapping[];
}

interface WorkLogItem {
  id: number;
  scheduled_date: string | null;
  service_type: string | null;
  machine_type: string | null;
  equipment_number: string | null;
  start_location: string | null;
  end_location: string | null;
  quantity: string | null;
  unit: string | null;
  day_night: string | null;
  status: string;
  is_confirmed: boolean;
  client: { id: number; name: string } | null;
  project: { id: number; name: string } | null;
}

interface RateCardItem {
  id: number;
  service_type: string | null;
  machine_type: string | null;
  origin: string | null;
  destination: string | null;
  rate: string;
  day_rate: string;
  night_rate: string;
  unit: string | null;
  effective_date: string | null;
  expiry_date: string | null;
  client: { id: number; name: string } | null;
}

interface NicknameMapping {
  id: number;
  nickname_value: string;
  nickname_employee_id: number | null;
  nickname_employee_name: string | null;
  nickname_vehicle_no: string | null;
  nickname_is_active: boolean;
  nickname_created_at: string;
  nickname_updated_at: string;
}

interface PartnerOption {
  id: number;
  name: string;
  code: string | null;
  partner_type: string;
}

interface FleetDriverForm {
  subcontractor_id: string;
  short_name: string;
  name_zh: string;
  name_en: string;
  id_number: string;
  machine_type: string;
  plate_no: string;
  phone: string;
  date_of_birth: string;
  yellow_cert_no: string;
  red_cert_no: string;
  has_d_cert: boolean;
  is_cert_returned: boolean;
  address: string;
  status: string;
}

interface NicknameMappingForm {
  nickname_value: string;
  nickname_employee_name: string;
  nickname_vehicle_no: string;
  nickname_is_active: boolean;
}

// ── Component ────────────────────────────────────────────────

const statusLabels: Record<string, string> = {
  active: '在職',
  inactive: '離職',
  suspended: '暫停',
};

const statusBadgeClass = (s: string) => {
  switch (s) {
    case 'active': return 'badge-green';
    case 'inactive': return 'badge-red';
    case 'suspended': return 'badge-yellow';
    default: return 'badge-gray';
  }
};

export default function SubconFleetDriverDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isReadOnly } = useAuth();
  const [driver, setDriver] = useState<FleetDriverDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FleetDriverForm>({
    subcontractor_id: '', short_name: '', name_zh: '', name_en: '',
    id_number: '', machine_type: '', plate_no: '', phone: '',
    date_of_birth: '', yellow_cert_no: '', red_cert_no: '',
    has_d_cert: false, is_cert_returned: false, address: '', status: 'active',
  });
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'docs' | 'nicknames' | 'worklogs' | 'rates'>('info');

  // Nickname mapping state
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [editingNickname, setEditingNickname] = useState<NicknameMapping | null>(null);
  const [nicknameForm, setNicknameForm] = useState<NicknameMappingForm>({
    nickname_value: '', nickname_employee_name: '', nickname_vehicle_no: '', nickname_is_active: true,
  });

  const loadData = useCallback(() => {
    const id = Number(params.id);
    subconFleetDriversApi.getDetail(id).then(res => {
      const data = res.data as FleetDriverDetail;
      setDriver(data);
      setForm({
        subcontractor_id: String(data.subcontractor_id),
        short_name: data.short_name || '',
        name_zh: data.name_zh || '',
        name_en: data.name_en || '',
        id_number: data.id_number || '',
        machine_type: data.machine_type || '',
        plate_no: data.plate_no || '',
        phone: data.phone || '',
        date_of_birth: toInputDate(data.date_of_birth),
        yellow_cert_no: data.yellow_cert_no || '',
        red_cert_no: data.red_cert_no || '',
        has_d_cert: data.has_d_cert,
        is_cert_returned: data.is_cert_returned,
        address: data.address || '',
        status: data.status,
      });
      setLoading(false);
    }).catch(() => router.push('/subcon-fleet-drivers'));
  }, [params.id, router]);

  useEffect(() => {
    loadData();
    partnersApi.simple().then(res => {
      setPartners((res.data as PartnerOption[]).filter(p => p.partner_type === 'subcontractor'));
    });
  }, [loadData]);

  const handleSave = async () => {
    try {
      await subconFleetDriversApi.update(driver!.id, {
        ...form,
        subcontractor_id: Number(form.subcontractor_id),
        date_of_birth: form.date_of_birth || null,
      });
      setEditing(false);
      loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      alert(error.response?.data?.message || '更新失敗');
    }
  };

  // ── Nickname CRUD ──────────────────────────────────────────

  const openNicknameModal = (mapping?: NicknameMapping) => {
    if (mapping) {
      setEditingNickname(mapping);
      setNicknameForm({
        nickname_value: mapping.nickname_value,
        nickname_employee_name: mapping.nickname_employee_name || '',
        nickname_vehicle_no: mapping.nickname_vehicle_no || '',
        nickname_is_active: mapping.nickname_is_active,
      });
    } else {
      setEditingNickname(null);
      setNicknameForm({
        nickname_value: '',
        nickname_employee_name: '',
        nickname_vehicle_no: driver?.plate_no || '',
        nickname_is_active: true,
      });
    }
    setShowNicknameModal(true);
  };

  const handleSaveNickname = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingNickname) {
        await subconFleetDriversApi.updateNicknameMapping(editingNickname.id, { ...nicknameForm });
      } else {
        await subconFleetDriversApi.createNicknameMapping({ ...nicknameForm });
      }
      setShowNicknameModal(false);
      loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      alert(error.response?.data?.message || '儲存失敗');
    }
  };

  const handleDeleteNickname = async (id: number) => {
    if (!confirm('確定刪除此花名對應？')) return;
    try {
      await subconFleetDriversApi.deleteNicknameMapping(id);
      loadData();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      alert(error.response?.data?.message || '刪除失敗');
    }
  };

  // ── Render ─────────────────────────────────────────────────

  const InfoField = ({ label, value, className = '' }: { label: string; value: React.ReactNode; className?: string }) => (
    <div className={className}>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-0.5">{value || '-'}</p>
    </div>
  );

  if (loading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;

  const tabs = [
    { key: 'info' as const, label: '基本資料' },
    { key: 'docs' as const, label: '證件文件' },
    { key: 'nicknames' as const, label: '花名對應' },
    { key: 'worklogs' as const, label: '工作紀錄' },
    { key: 'rates' as const, label: '費率卡' },
  ];

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/subcon-fleet-drivers" className="hover:text-primary-600">街車車隊管理</Link>
        <span>/</span>
        <span className="text-gray-900">{driver?.name_zh || driver?.plate_no}</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {driver?.name_zh}
            {driver?.plate_no && <span className="ml-2 text-lg font-mono text-primary-600">{driver.plate_no}</span>}
          </h1>
          <p className="text-gray-500">
            {driver?.subcontractor?.name || '未知公司'} | {driver?.machine_type || '未設定機種'}
          </p>
        </div>
        <div className="flex gap-2">
          {!editing ? (
            <>
              <span className={statusBadgeClass(driver?.status || '')}>{statusLabels[driver?.status || ''] || driver?.status}</span>
              <button onClick={() => setEditing(true)} className="btn-primary">編輯</button>
            </>
          ) : (
            <>
              <button onClick={() => { setEditing(false); loadData(); }} className="btn-secondary">取消</button>
              <button onClick={handleSave} className="btn-primary">儲存</button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6 -mb-px">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.key === 'nicknames' && driver?.nickname_mappings && driver.nickname_mappings.length > 0 && (
                <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{driver.nickname_mappings.length}</span>
              )}
              {tab.key === 'worklogs' && driver?.work_logs && driver.work_logs.length > 0 && (
                <span className="ml-1 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{driver.work_logs.length}</span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'info' && (
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="card">
            <h2 className="text-lg font-bold text-gray-900 mb-4">基本資料</h2>
            {editing ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">街車公司 *</label>
                  <select value={form.subcontractor_id} onChange={e => setForm({...form, subcontractor_id: e.target.value})} className="input-field" required>
                    <option value="">請選擇</option>
                    {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">花名（WA配對用）</label>
                  <input type="text" value={form.short_name} onChange={e => setForm({...form, short_name: e.target.value})} className="input-field" placeholder="例如：文,阿文,文哥" />
                  <p className="text-xs text-gray-400 mt-1">多個花名用逗號分隔</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">中文姓名 *</label>
                  <input type="text" value={form.name_zh} onChange={e => setForm({...form, name_zh: e.target.value})} className="input-field" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">英文姓名</label>
                  <input type="text" value={form.name_en} onChange={e => setForm({...form, name_en: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">身份證號碼</label>
                  <input type="text" value={form.id_number} onChange={e => setForm({...form, id_number: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">機種</label>
                  <input type="text" value={form.machine_type} onChange={e => setForm({...form, machine_type: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">常用車牌</label>
                  <input type="text" value={form.plate_no} onChange={e => setForm({...form, plate_no: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">聯絡電話</label>
                  <input type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">出生日期</label>
                  <input type="date" value={form.date_of_birth} onChange={e => setForm({...form, date_of_birth: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">黃證no</label>
                  <input type="text" value={form.yellow_cert_no} onChange={e => setForm({...form, yellow_cert_no: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">紅證no</label>
                  <input type="text" value={form.red_cert_no} onChange={e => setForm({...form, red_cert_no: e.target.value})} className="input-field" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">狀態</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})} className="input-field">
                    <option value="active">在職</option>
                    <option value="inactive">離職</option>
                    <option value="suspended">暫停</option>
                  </select>
                </div>
                <div className="flex gap-4 items-center h-full pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.has_d_cert} onChange={e => setForm({...form, has_d_cert: e.target.checked})} className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4" />
                    <span className="text-sm text-gray-700">D證 (Y/N)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_cert_returned} onChange={e => setForm({...form, is_cert_returned: e.target.checked})} className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4" />
                    <span className="text-sm text-gray-700">已還證 (Y/N)</span>
                  </label>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-1">聯絡地址</label>
                  <textarea value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="input-field" rows={2} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <InfoField label="街車公司" value={
                  <Link href={`/partners/${driver?.subcontractor?.id}`} className="text-primary-600 hover:underline">
                    {driver?.subcontractor?.name}
                  </Link>
                } />
                <InfoField label="花名（WA配對用）" value={driver?.short_name} />
                <InfoField label="中文姓名" value={<span className="font-medium text-lg">{driver?.name_zh}</span>} />
                <InfoField label="英文姓名" value={driver?.name_en} />
                <InfoField label="身份證號碼" value={driver?.id_number} />
                <InfoField label="機種" value={driver?.machine_type} />
                <InfoField label="常用車牌" value={driver?.plate_no ? <span className="font-mono text-primary-600 font-medium">{driver.plate_no}</span> : null} />
                <InfoField label="聯絡電話" value={driver?.phone} />
                <InfoField label="出生日期" value={fmtDate(driver?.date_of_birth || null)} />
                <InfoField label="黃證no" value={driver?.yellow_cert_no} />
                <InfoField label="紅證no" value={driver?.red_cert_no} />
                <InfoField label="D證" value={driver?.has_d_cert ? <span className="badge-green">有</span> : <span className="badge-gray">無</span>} />
                <InfoField label="已還證" value={driver?.is_cert_returned ? <span className="badge-green">是</span> : <span className="badge-red">否</span>} />
                <div className="md:col-span-2 lg:col-span-3">
                  <InfoField label="聯絡地址" value={driver?.address} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'docs' && driver && (
        <div className="card">
          <DocumentUpload
            entityType="subcon-fleet-driver"
            entityId={driver.id}
            docTypes={['驗機紙', '保險', '行車證', '牌費', '其他']}
          />
        </div>
      )}

      {activeTab === 'nicknames' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">花名對應管理</h2>
            <button onClick={() => openNicknameModal()} className="btn-primary text-sm">新增花名</button>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            管理 verification_nickname_mappings 表中的花名對應記錄。花名用於 AI 辨認 WhatsApp 訊息中的司機身份。
          </p>
          {driver?.nickname_mappings && driver.nickname_mappings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">花名</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">員工名稱</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">車牌號碼</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">狀態</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">建立時間</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">操作</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {driver.nickname_mappings.map(nm => (
                    <tr key={nm.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{nm.nickname_value}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{nm.nickname_employee_name || '-'}</td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-600">{nm.nickname_vehicle_no || '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={nm.nickname_is_active ? 'badge-green' : 'badge-red'}>
                          {nm.nickname_is_active ? '啟用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(nm.nickname_created_at)}</td>
                      <td className="px-4 py-3 text-sm text-right">
                        <button onClick={() => openNicknameModal(nm)} className="text-primary-600 hover:text-primary-800 mr-3">編輯</button>
                        <button onClick={() => handleDeleteNickname(nm.id)} className="text-red-600 hover:text-red-800">刪除</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm py-8 text-center">暫無花名對應記錄</p>
          )}
        </div>
      )}

      {activeTab === 'worklogs' && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">工作紀錄（最近 50 筆）</h2>
          {driver?.work_logs && driver.work_logs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">客戶</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">項目</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">機種</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">起點</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">終點</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">數量</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日/夜</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">狀態</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {driver.work_logs.map(wl => (
                    <tr key={wl.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{fmtDate(wl.scheduled_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{wl.client?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{wl.project?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{wl.machine_type || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[120px] truncate">{wl.start_location || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[120px] truncate">{wl.end_location || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{wl.quantity ? `${wl.quantity} ${wl.unit || ''}` : '-'}</td>
                      <td className="px-4 py-3 text-sm">
                        {wl.day_night === 'day' && <span className="badge-yellow">日</span>}
                        {wl.day_night === 'night' && <span className="badge-blue">夜</span>}
                        {!wl.day_night && '-'}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {wl.is_confirmed ? <span className="badge-green">已確認</span> : <span className="badge-gray">未確認</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm py-8 text-center">暫無工作紀錄</p>
          )}
        </div>
      )}

      {activeTab === 'rates' && (
        <div className="card">
          <h2 className="text-lg font-bold text-gray-900 mb-4">街車費率卡</h2>
          {driver?.rate_cards && driver.rate_cards.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">客戶</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">服務類型</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">機種</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">起點</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">終點</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">日更</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">夜更</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">單位</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">生效日</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {driver.rate_cards.map(rc => (
                    <tr key={rc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-600">{rc.client?.name || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rc.service_type || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rc.machine_type || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rc.origin || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rc.destination || '-'}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">${Number(rc.day_rate).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono">${Number(rc.night_rate).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rc.unit || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(rc.effective_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-400 text-sm py-8 text-center">暫無費率卡</p>
          )}
        </div>
      )}

      {/* Nickname Modal */}
      <Modal isOpen={showNicknameModal} onClose={() => setShowNicknameModal(false)} title={editingNickname ? '編輯花名對應' : '新增花名對應'} size="md">
        <form onSubmit={handleSaveNickname} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">花名 *</label>
            <input
              type="text"
              value={nicknameForm.nickname_value}
              onChange={e => setNicknameForm({...nicknameForm, nickname_value: e.target.value})}
              className="input-field"
              required
              placeholder="例如：阿文、文哥"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">員工名稱</label>
            <input
              type="text"
              value={nicknameForm.nickname_employee_name}
              onChange={e => setNicknameForm({...nicknameForm, nickname_employee_name: e.target.value})}
              className="input-field"
              placeholder="對應的員工全名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">車牌號碼</label>
            <input
              type="text"
              value={nicknameForm.nickname_vehicle_no}
              onChange={e => setNicknameForm({...nicknameForm, nickname_vehicle_no: e.target.value})}
              className="input-field"
              placeholder="對應的車牌號碼"
            />
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={nicknameForm.nickname_is_active}
                onChange={e => setNicknameForm({...nicknameForm, nickname_is_active: e.target.checked})}
                className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"
              />
              <span className="text-sm text-gray-700">啟用</span>
            </label>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <button type="button" onClick={() => setShowNicknameModal(false)} className="btn-secondary">取消</button>
            <button type="submit" className="btn-primary">{editingNickname ? '更新' : '新增'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
