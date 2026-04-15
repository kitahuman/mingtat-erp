'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/Modal';
import { attendancesApi, employeesApi } from '@/lib/api';

interface AttendanceEditModalProps {
  isOpen: boolean;
  recordId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

const TYPE_OPTIONS = [
  { value: 'clock_in', label: '開工' },
  { value: 'clock_out', label: '收工' },
];

export default function AttendanceEditModal({
  isOpen,
  recordId,
  onClose,
  onSaved,
}: AttendanceEditModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [record, setRecord] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [empSearch, setEmpSearch] = useState('');

  // Form fields
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [empCode, setEmpCode] = useState('');
  const [type, setType] = useState('clock_in');
  const [timestamp, setTimestamp] = useState('');
  const [address, setAddress] = useState('');
  const [remarks, setRemarks] = useState('');
  const [workNotes, setWorkNotes] = useState('');
  const [isMidShift, setIsMidShift] = useState(false);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  // Load employees list
  useEffect(() => {
    employeesApi.list({ limit: 999 }).then(res => {
      setEmployees(res.data.data || []);
    }).catch(() => {});
  }, []);

  // Load record when modal opens
  useEffect(() => {
    if (!isOpen || !recordId) return;
    setLoading(true);
    attendancesApi.get(recordId).then(res => {
      const r = res.data;
      setRecord(r);
      setEmployeeId(r.employee_id || '');
      setEmpCode(r.employee?.emp_code || '');
      setType(r.type || 'clock_in');
      // Convert timestamp to local datetime-local format
      if (r.timestamp) {
        const d = new Date(r.timestamp);
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setTimestamp(local);
      } else {
        setTimestamp('');
      }
      setAddress(r.address || '');
      setRemarks(r.remarks || '');
      setWorkNotes(r.work_notes || '');
      setIsMidShift(r.is_mid_shift || false);
      setLatitude(r.latitude != null ? String(r.latitude) : '');
      setLongitude(r.longitude != null ? String(r.longitude) : '');
      setEmpSearch('');
    }).catch(() => {
      alert('載入打卡記錄失敗');
      onClose();
    }).finally(() => setLoading(false));
  }, [isOpen, recordId]);

  // When employee is selected, auto-fill emp_code
  const handleEmployeeChange = (id: number | '') => {
    setEmployeeId(id);
    if (id === '') {
      setEmpCode('');
      return;
    }
    const emp = employees.find(e => e.id === Number(id));
    if (emp) {
      setEmpCode(emp.emp_code || '');
    }
  };

  const handleSave = async () => {
    if (!recordId) return;
    setSaving(true);
    try {
      const payload: any = {
        type,
        address,
        remarks,
        work_notes: workNotes,
        is_mid_shift: isMidShift,
      };
      if (employeeId !== '') payload.employee_id = Number(employeeId);
      if (timestamp) payload.timestamp = new Date(timestamp).toISOString();
      if (latitude !== '') payload.latitude = parseFloat(latitude);
      if (longitude !== '') payload.longitude = parseFloat(longitude);

      await attendancesApi.update(recordId, payload);
      onSaved();
      onClose();
    } catch (e: any) {
      alert('儲存失敗：' + (e?.response?.data?.message || e?.message || '未知錯誤'));
    } finally {
      setSaving(false);
    }
  };

  // Filter employees for search
  const filteredEmployees = empSearch
    ? employees.filter(e =>
        (e.name_zh || '').includes(empSearch) ||
        (e.name_en || '').toLowerCase().includes(empSearch.toLowerCase()) ||
        (e.emp_code || '').toLowerCase().includes(empSearch.toLowerCase())
      )
    : employees;

  const selectedEmployee = employeeId ? employees.find(e => e.id === Number(employeeId)) : null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="編輯打卡記錄" size="lg">
      {loading ? (
        <div className="text-center py-8 text-gray-400">載入中...</div>
      ) : (
        <div className="space-y-4">
          {/* Employee selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              員工 <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  placeholder="搜尋員工姓名或編號..."
                  className="input-field text-sm w-full mb-1"
                />
                <select
                  value={employeeId}
                  onChange={e => handleEmployeeChange(e.target.value === '' ? '' : Number(e.target.value))}
                  className="input-field text-sm w-full"
                  size={Math.min(filteredEmployees.length + 1, 6)}
                >
                  <option value="">-- 選擇員工 --</option>
                  {filteredEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.emp_code ? `[${emp.emp_code}] ` : '[臨時] '}
                      {emp.name_zh || emp.name_en}
                      {emp.employee_is_temporary ? ' (臨時)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-36">
                <label className="block text-xs text-gray-500 mb-1">員工編號（自動帶入）</label>
                <input
                  type="text"
                  value={empCode}
                  readOnly
                  className="input-field text-sm w-full bg-gray-50 text-gray-600 cursor-not-allowed"
                  placeholder="自動帶入"
                />
              </div>
            </div>
            {selectedEmployee && (
              <p className="text-xs text-gray-500 mt-1">
                已選：{selectedEmployee.name_zh || selectedEmployee.name_en}
                {selectedEmployee.employee_is_temporary && (
                  <span className="ml-1 text-amber-600 font-bold">（臨時員工）</span>
                )}
                {selectedEmployee.role && ` · ${selectedEmployee.role}`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">打卡類型</label>
              <select
                value={type}
                onChange={e => setType(e.target.value)}
                className="input-field text-sm w-full"
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Timestamp */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">打卡時間</label>
              <input
                type="datetime-local"
                value={timestamp}
                onChange={e => setTimestamp(e.target.value)}
                className="input-field text-sm w-full"
              />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">地址</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              className="input-field text-sm w-full"
              placeholder="打卡地址"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Latitude */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">緯度</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={e => setLatitude(e.target.value)}
                className="input-field text-sm w-full"
                placeholder="緯度"
              />
            </div>
            {/* Longitude */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">經度</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={e => setLongitude(e.target.value)}
                className="input-field text-sm w-full"
                placeholder="經度"
              />
            </div>
          </div>

          {/* Work Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">工作備註</label>
            <input
              type="text"
              value={workNotes}
              onChange={e => setWorkNotes(e.target.value)}
              className="input-field text-sm w-full"
              placeholder="工作備註"
            />
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className="input-field text-sm w-full"
              rows={2}
              placeholder="備註"
            />
          </div>

          {/* Mid Shift */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_mid_shift"
              checked={isMidShift}
              onChange={e => setIsMidShift(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <label htmlFor="is_mid_shift" className="text-sm text-gray-700">中直打卡</label>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={onClose}
              className="btn-secondary text-sm"
              disabled={saving}
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="btn-primary text-sm"
              disabled={saving}
            >
              {saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
