import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000, // 120 seconds to handle Render cold starts
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('token');
      Cookies.remove('user');
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        const currentPath = window.location.pathname;
        // For whatsapp-console, redirect back to it after login
        const redirectParam = currentPath !== '/' ? `?redirect=${encodeURIComponent(currentPath)}` : '';
        window.location.href = `/login${redirectParam}`;
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Auth
export const authApi = {
  login: (data: { username: string; password: string }) => api.post('/auth/login', data),
  profile: () => api.get('/auth/profile'),
  getPageDefinitions: () => api.get('/auth/page-definitions'),
};

// Users (Admin only)
export const usersApi = {
  list: (params?: any) => api.get('/users', { params }),
  get: (id: number) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: number, data: any) => api.put(`/users/${id}`, data),
  toggleActive: (id: number) => api.patch(`/users/${id}/toggle-active`),
};

// Profile (current user)
export const profileApi = {
  get: () => api.get('/profile'),
  update: (data: any) => api.put('/profile', data),
  changePassword: (data: { oldPassword: string; newPassword: string }) =>
    api.post('/profile/change-password', data),
};

// Companies
export const companiesApi = {
  list: (params?: any) => api.get('/companies', { params }),
  simple: () => api.get('/companies/simple'),
  get: (id: number) => api.get(`/companies/${id}`),
  create: (data: any) => api.post('/companies', data),
  update: (id: number, data: any) => api.put(`/companies/${id}`, data),
};

// Company Profiles
export const companyProfilesApi = {
  list: (params?: any) => api.get('/company-profiles', { params }),
  simple: () => api.get('/company-profiles/simple'),
  get: (id: number) => api.get(`/company-profiles/${id}`),
  create: (data: any) => api.post('/company-profiles', data),
  update: (id: number, data: any) => api.put(`/company-profiles/${id}`, data),
};

// Employees
export const employeesApi = {
  list: (params?: any) => api.get('/employees', { params }),
  filterOptions: (column: string, params?: any) => api.get(`/employees/filter-options/${column}`, { params }),
  get: (id: number) => api.get(`/employees/${id}`),
  create: (data: any) => api.post('/employees', data),
  update: (id: number, data: any) => api.put(`/employees/${id}`, data),
  addSalary: (id: number, data: any) => api.post(`/employees/${id}/salary-settings`, data),
  getSalary: (id: number) => api.get(`/employees/${id}/salary-settings`),
  transfer: (id: number, data: any) => api.post(`/employees/${id}/transfer`, data),
  terminate: (id: number, data: { termination_date: string; termination_reason?: string }) => api.post(`/employees/${id}/terminate`, data),
  reinstate: (id: number) => api.post(`/employees/${id}/reinstate`),
  convertToRegular: (id: number, data: any) => api.post(`/employees/${id}/convert-to-regular`, data),
  delete: (id: number) => api.delete(`/employees/${id}`),
  batchDelete: (ids: number[], type?: 'inactive' | 'temporary') => api.post('/employees/batch-delete', { ids, type }),
  getPhoto: (id: number) => api.get(`/employees/${id}/photo`),
  updatePhoto: (id: number, photoBase64: string) => api.put(`/employees/${id}/photo`, { photo_base64: photoBase64 }),
  deletePhoto: (id: number) => api.delete(`/employees/${id}/photo`),
  // Nickname management
  getNicknames: (id: number) => api.get(`/employees/${id}/nicknames`),
  addNickname: (id: number, nickname: string, source?: string) => api.post(`/employees/${id}/nicknames`, { nickname, source }),
  removeNickname: (id: number, nicknameId: number) => api.delete(`/employees/${id}/nicknames/${nicknameId}`),
  searchByNickname: (q: string) => api.get('/employees/search/by-nickname', { params: { q } }),
};

// Vehicles
export const vehiclesApi = {
  simple: () => api.get('/vehicles/simple'),
  list: (params?: any) => api.get('/vehicles', { params }),
  get: (id: number) => api.get(`/vehicles/${id}`),
  create: (data: any) => api.post('/vehicles', data),
  update: (id: number, data: any) => api.put(`/vehicles/${id}`, data),
  changePlate: (id: number, data: any) => api.post(`/vehicles/${id}/change-plate`, data),
  transfer: (id: number, data: any) => api.post(`/vehicles/${id}/transfer`, data),
  delete: (id: number) => api.delete(`/vehicles/${id}`),
};

// Machinery
export const machineryApi = {
  simple: () => api.get('/machinery/simple'),
  list: (params?: any) => api.get('/machinery', { params }),
  get: (id: number) => api.get(`/machinery/${id}`),
  create: (data: any) => api.post('/machinery', data),
  update: (id: number, data: any) => api.put(`/machinery/${id}`, data),
  transfer: (id: number, data: any) => api.post(`/machinery/${id}/transfer`, data),
  delete: (id: number) => api.delete(`/machinery/${id}`),
};

// Documents
export const documentsApi = {
  list: (entityType: string, entityId: number) => api.get('/documents', { params: { entity_type: entityType, entity_id: entityId } }),
  upload: (formData: FormData) => api.post('/documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  download: (id: number) => `${API_BASE_URL}/documents/${id}/download`,
  update: (id: number, data: any) => api.put(`/documents/${id}`, data),
  remove: (id: number) => api.delete(`/documents/${id}`),
};

// Partners
export const partnersApi = {
  list: (params?: any) => api.get('/partners', { params }),
  simple: () => api.get('/partners/simple'),
  get: (id: number) => api.get(`/partners/${id}`),
  getFleet: (id: number) => api.get(`/partners/${id}/fleet`),
  create: (data: any) => api.post('/partners', data),
  update: (id: number, data: any) => api.put(`/partners/${id}`, data),
  delete: (id: number) => api.delete(`/partners/${id}`),
};

// Custom Fields
export const customFieldsApi = {
  list: (params?: any) => api.get('/custom-fields', { params }),
  get: (id: number) => api.get(`/custom-fields/${id}`),
  create: (data: any) => api.post('/custom-fields', data),
  update: (id: number, data: any) => api.put(`/custom-fields/${id}`, data),
  delete: (id: number) => api.delete(`/custom-fields/${id}`),
  // Values
  listValues: (params?: any) => api.get('/custom-fields/values/list', { params }),
  batchUpdateValues: (data: any) => api.put('/custom-fields/values/batch', data),
};

// Dashboard
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
  workStatus: () => api.get('/dashboard/work-status'),
  alerts: () => api.get('/dashboard/alerts'),
  financial: () => api.get('/dashboard/financial'),
  whatsappFeed: () => api.get('/dashboard/whatsapp-feed'),
  attendanceSummary: () => api.get('/dashboard/attendance-summary'),
};

// Contracts (合約)
export const contractsApi = {
  list: (params?: any) => api.get('/contracts', { params }),
  simple: () => api.get('/contracts/simple'),
  get: (id: number) => api.get(`/contracts/${id}`),
  create: (data: any) => api.post('/contracts', data),
  update: (id: number, data: any) => api.put(`/contracts/${id}`, data),
  delete: (id: number) => api.delete(`/contracts/${id}`),
  merge: (primaryId: number, mergeIds: number[]) => api.post('/contracts/merge', { primaryId, mergeIds }),
};

// Projects (工程項目)
export const projectsApi = {
  list: (params?: any) => api.get('/projects', { params }),
  simple: () => api.get('/projects/simple'),
  get: (id: number) => api.get(`/projects/${id}`),
  create: (data: any) => api.post('/projects', data),
  update: (id: number, data: any) => api.put(`/projects/${id}`, data),
  updateStatus: (id: number, status: string) => api.patch(`/projects/${id}/status`, { status }),
};

// Quotations (報價單)
export const quotationsApi = {
  list: (params?: any) => api.get('/quotations', { params }),
  get: (id: number) => api.get(`/quotations/${id}`),
  create: (data: any) => api.post('/quotations', data),
  update: (id: number, data: any) => api.put(`/quotations/${id}`, data),
  updateStatus: (id: number, status: string) => api.patch(`/quotations/${id}/status`, { status }),
  accept: (id: number, options?: any) => api.post(`/quotations/${id}/accept`, options || {}),
  byProject: (projectId: number) => api.get(`/quotations/by-project/${projectId}`),
  syncToRateCards: (id: number, options?: any) => api.post(`/quotations/${id}/sync-to-rate-cards`, options || {}),
};

// Field Options (選項管理)
export const fieldOptionsApi = {
  getAll: () => api.get('/field-options'),
  getByCategory: (category: string) => api.get(`/field-options/category/${category}`),
  create: (data: { category: string; label: string; sort_order?: number }) => api.post('/field-options', data),
  update: (id: number, data: { label?: string; sort_order?: number; is_active?: boolean }) => api.put(`/field-options/${id}`, data),
  remove: (id: number) => api.delete(`/field-options/${id}`),
  reorder: (category: string, orderedIds: number[]) => api.post('/field-options/reorder', { category, orderedIds }),
  mergeLocations: (primaryId: number, mergeIds: number[]) => api.post('/field-options/merge-locations', { primaryId, mergeIds }),
  mergeContractOptions: (primaryId: number, mergeIds: number[]) => api.post('/field-options/merge-contract-options', { primaryId, mergeIds }),
  updateAliases: (id: number, aliases: string[]) => api.put(`/field-options/${id}/aliases`, { aliases }),
  bulkImport: (category: string, labels: string[]) => api.post('/field-options/bulk-import', { category, labels }),
  updateGps: (id: number, data: { field_option_latitude: number; field_option_longitude: number }) =>
    api.put(`/field-options/${id}/gps`, data),
  getLocationsWithGps: () => api.get('/field-options/locations/with-gps'),
};

// Rate Cards (客戶價目表)
export const rateCardsApi = {
  list: (params?: any) => api.get('/rate-cards', { params }),
  get: (id: number) => api.get(`/rate-cards/${id}`),
  create: (data: any) => api.post('/rate-cards', data),
  update: (id: number, data: any) => api.put(`/rate-cards/${id}`, data),
  delete: (id: number) => api.delete(`/rate-cards/${id}`),
};

// Fleet Rate Cards (租賃價目表)
export const fleetRateCardsApi = {
  list: (params?: any) => api.get('/fleet-rate-cards', { params }),
  get: (id: number) => api.get(`/fleet-rate-cards/${id}`),
  create: (data: any) => api.post('/fleet-rate-cards', data),
  update: (id: number, data: any) => api.put(`/fleet-rate-cards/${id}`, data),
  delete: (id: number) => api.delete(`/fleet-rate-cards/${id}`),
  linked: (rateCardId: number) => api.get(`/fleet-rate-cards/linked/${rateCardId}`),
};

// Subcontractor Vehicle Rate Cards (供應商價目表)
export const subconRateCardsApi = {
  list: (params?: any) => api.get('/subcon-rate-cards', { params }),
  get: (id: number) => api.get(`/subcon-rate-cards/${id}`),
  create: (data: any) => api.post('/subcon-rate-cards', data),
  update: (id: number, data: any) => api.put(`/subcon-rate-cards/${id}`, data),
  delete: (id: number) => api.delete(`/subcon-rate-cards/${id}`),
};

// Salary Config (員工薪酬配置)
export const salaryConfigApi = {
  list: (params?: any) => api.get('/salary-config', { params }),
  get: (id: number) => api.get(`/salary-config/${id}`),
  getByEmployee: (employeeId: number) => api.get(`/salary-config/employee/${employeeId}`),
  create: (data: any) => api.post('/salary-config', data),
  update: (id: number, data: any) => api.put(`/salary-config/${id}`, data),
  delete: (id: number) => api.delete(`/salary-config/${id}`),
};

// Payroll (計糧)
export const payrollApi = {
  list: (params?: any) => api.get('/payroll', { params }),
  get: (id: number) => api.get(`/payroll/${id}`),
  // 預覽計糧（不儲存）
  preview: (data: { employee_id: number; date_from: string; date_to: string; company_profile_id?: number; company_id?: number }) =>
    api.post('/payroll/preview', data),
  // 準備糧單（建立草稿 + 複製工作記錄到糧單工作記錄，狀態為 preparing）
  prepare: (data: { employee_id: number; date_from: string; date_to: string; company_id?: number; period?: string }) =>
    api.post('/payroll/prepare', data),
  // 確定糧單工作記錄並計算糧單（從 preparing 轉為 draft）
  finalizePreparation: (id: number) =>
    api.post(`/payroll/${id}/finalize-preparation`),
  // 生成糧單（單一員工 + 日期範圍）
  generate: (data: { employee_id: number; date_from: string; date_to: string; company_profile_id?: number; company_id?: number; period?: string }) =>
    api.post('/payroll/generate', data),
  update: (id: number, data: any) => api.put(`/payroll/${id}`, data),
  bulkConfirm: (ids: number[]) => api.post('/payroll/bulk/confirm', { ids }),
  bulkMarkPaid: (ids: number[], paymentDate?: string, chequeNumber?: string) =>
    api.post('/payroll/bulk/mark-paid', { ids, payment_date: paymentDate, cheque_number: chequeNumber }),
  recalculate: (id: number, body?: { override_manual_rates?: boolean }) => api.post(`/payroll/${id}/recalculate`, body || {}),
  setGroupRate: (id: number, groupKey: string, rate: number) =>
    api.post(`/payroll/${id}/set-group-rate`, { group_key: groupKey, rate }),
  addToRateCard: (id: number, formData: {
    client_id?: number;
    company_id?: number;
    client_contract_no?: string;
    service_type?: string;
    day_night?: string;
    tonnage?: string;
    machine_type?: string;
    origin?: string;
    destination?: string;
    rate: number;
    unit?: string;
    ot_rate?: number;
    mid_shift_rate?: number;
    effective_date?: string;
    remarks?: string;
  }) => api.post(`/payroll/${id}/add-to-rate-card`, formData),
  finalize: (id: number) => api.post(`/payroll/${id}/finalize`),
  unconfirm: (id: number) => api.post(`/payroll/${id}/unconfirm`),
  cancelPayment: (id: number) => api.post(`/payroll/${id}/cancel-payment`),
  remove: (id: number) => api.delete(`/payroll/${id}`),
  summary: (params?: any) => api.get('/payroll/summary', { params }),

  // ── 糧單工作記錄管理 ──
  updateWorkLog: (payrollId: number, pwlId: number, data: any) =>
    api.put(`/payroll/${payrollId}/work-logs/${pwlId}`, data),
  updateOriginalWorkLog: (payrollId: number, pwlId: number, data: any) =>
    api.put(`/payroll/${payrollId}/work-logs/${pwlId}/original`, data),
  excludeWorkLog: (payrollId: number, pwlId: number) =>
    api.post(`/payroll/${payrollId}/work-logs/${pwlId}/exclude`),
  restoreWorkLog: (payrollId: number, pwlId: number) =>
    api.post(`/payroll/${payrollId}/work-logs/${pwlId}/restore`),

  // ── 自定義調整項管理 ──
  addAdjustment: (payrollId: number, data: { item_name: string; amount: number; remarks?: string }) =>
    api.post(`/payroll/${payrollId}/adjustments`, data),
  removeAdjustment: (payrollId: number, adjId: number) =>
    api.delete(`/payroll/${payrollId}/adjustments/${adjId}`),

  // ── 每日津貼管理 ──
  addDailyAllowance: (payrollId: number, data: {
    date: string; allowance_key: string; allowance_name: string; amount: number; remarks?: string;
  }) => api.post(`/payroll/${payrollId}/daily-allowances`, data),
  removeDailyAllowance: (payrollId: number, daId: number) =>
    api.delete(`/payroll/${payrollId}/daily-allowances/${daId}`),
  setDailyAllowances: (payrollId: number, data: {
    date: string;
    allowances: { allowance_key: string; allowance_name: string; amount: number; remarks?: string }[];
  }) => api.post(`/payroll/${payrollId}/daily-allowances/batch`, data),

  // ── 糧單付款記錄管理 ──
  addPayrollPayment: (payrollId: number, data: {
    payroll_payment_date: string;
    payroll_payment_amount: number;
    payroll_payment_reference_no?: string;
    payroll_payment_bank_account?: string;
    payroll_payment_remarks?: string;
    payroll_payment_payment_out_id?: number;
  }) => api.post(`/payroll/${payrollId}/payments`, data),
  removePayrollPayment: (payrollId: number, paymentId: number) =>
    api.delete(`/payroll/${payrollId}/payments/${paymentId}`),

  // ── 員工報銷管理 ──
  getUnsettledExpenses: (payrollId: number) =>
    api.get(`/payroll/${payrollId}/unsettled-expenses`),
  attachExpenses: (payrollId: number, data: { expense_ids: number[] }) =>
    api.post(`/payroll/${payrollId}/expenses`, data),
  detachExpense: (payrollId: number, expenseId: number) =>
    api.delete(`/payroll/${payrollId}/expenses/${expenseId}`),
};

// Enums (系統枚舉)
export const enumsApi = {
  getAll: () => api.get('/enums'),
};

// Work Logs (工作記錄)
export const workLogsApi = {
  list: (params?: any) => api.get('/work-logs', { params }),
  get: (id: number) => api.get(`/work-logs/${id}`),
  create: (data: any) => api.post('/work-logs', data),
  update: (id: number, data: any) => api.put(`/work-logs/${id}`, data),
  remove: (id: number) => api.delete(`/work-logs/${id}`),
  duplicate: (id: number) => api.post(`/work-logs/${id}/duplicate`),
  bulkDelete: (ids: number[]) => api.post('/work-logs/bulk/delete', { ids }),
  bulkConfirm: (ids: number[]) => api.post('/work-logs/bulk/confirm', { ids }),
  bulkUnconfirm: (ids: number[]) => api.post('/work-logs/bulk/unconfirm', { ids }),
  bulkUpdate: (ids: number[], field: string, value: any) => api.post('/work-logs/bulk/update', { ids, field, value }),
  equipmentOptions: (machineType: string, tonnage?: string) =>
    api.get('/work-logs/equipment-options', { params: { machine_type: machineType, tonnage } }),
  locationSuggestions: (type: 'start' | 'end', q: string) =>
    api.get('/work-logs/location-suggestions', { params: { type, q } }),
  bulkSave: (changes: Array<{ id: number; data: any }>) =>
    api.post('/work-logs/bulk/save', { changes }),
  editLockAcquire: (lockKey: string) =>
    api.post('/work-logs/edit-lock/acquire', { lockKey }),
  editLockHeartbeat: (lockKey: string) =>
    api.post('/work-logs/edit-lock/heartbeat', { lockKey }),
  editLockRelease: (lockKey: string) =>
    api.post('/work-logs/edit-lock/release', { lockKey }),
  editLockStatus: (lockKey: string) =>
    api.get('/work-logs/edit-lock/status', { params: { lockKey } }),
  confirmLocation: (id: number) =>
    api.post(`/work-logs/${id}/confirm-location`),
  filterOptions: (column: string) =>
    api.get(`/work-logs/filter-options/${column}`),
  unmatchedCombinations: (params?: Record<string, string | number | undefined>) =>
    api.get('/work-logs/unmatched-combinations', { params }),
  unmatchedFilterOptions: (column: string) =>
    api.get(`/work-logs/unmatched-combinations/filter-options/${column}`),
  addRateAndRematch: (data: Record<string, unknown>) =>
    api.post('/work-logs/add-rate-and-rematch', data),
};

// CSV Import (CSV 匯入)
export const csvImportApi = {
  getTemplate: (module: string) => api.get('/csv-import/template', { params: { module } }),
  preview: (module: string, csvData: string) => api.post('/csv-import/preview', { module, csvData }),
  execute: (module: string, rows: any[]) => api.post('/csv-import/execute', { module, rows }),
};

// Utility: Expiry date helpers
export function getExpiryStatus(date: string | null): 'expired' | 'critical' | 'warning' | 'ok' | 'none' {
  if (!date) return 'none';
  const diff = (new Date(date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'expired';
  if (diff <= 7) return 'critical';
  if (diff <= 60) return 'warning';
  return 'ok';
}

export function getExpiryColor(status: string): string {
  switch (status) {
    case 'expired': return 'bg-red-100 text-red-800 border-red-200';
    case 'critical': return 'bg-red-100 text-red-800 border-red-200';
    case 'warning': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'ok': return 'bg-green-100 text-green-800 border-green-200';
    default: return 'text-gray-400';
  }
}

export function getExpiryLabel(status: string): string {
  switch (status) {
    case 'expired': return '已過期';
    case 'critical': return '即將到期';
    case 'warning': return '注意';
    default: return '';
  }
}

// Subcontractor Fleet Drivers (街車車隊管理)
export const subconFleetDriversApi = {
  simple: () => api.get('/subcon-fleet-drivers/simple'),
  simpleDrivers: () => api.get('/subcon-fleet-drivers/simple-drivers'),
  list: (params?: Record<string, string | number | undefined>) => api.get('/subcon-fleet-drivers', { params }),
  get: (id: number) => api.get(`/subcon-fleet-drivers/${id}`),
  getDetail: (id: number) => api.get(`/subcon-fleet-drivers/${id}/detail`),
  create: (data: Record<string, unknown>) => api.post('/subcon-fleet-drivers', data),
  update: (id: number, data: Record<string, unknown>) => api.put(`/subcon-fleet-drivers/${id}`, data),
  delete: (id: number) => api.delete(`/subcon-fleet-drivers/${id}`),
  // Nickname Mappings
  listNicknameMappings: (params?: Record<string, string | number | undefined>) =>
    api.get('/subcon-fleet-drivers/nickname-mappings', { params }),
  createNicknameMapping: (data: Record<string, unknown>) =>
    api.post('/subcon-fleet-drivers/nickname-mappings', data),
  updateNicknameMapping: (id: number, data: Record<string, unknown>) =>
    api.put(`/subcon-fleet-drivers/nickname-mappings/${id}`, data),
  deleteNicknameMapping: (id: number) =>
    api.delete(`/subcon-fleet-drivers/nickname-mappings/${id}`),
};

// Expenses (支出)
export const expensesApi = {
  list: (params?: any) => api.get('/expenses', { params }),
  get: (id: number) => api.get(`/expenses/${id}`),
  create: (data: any) => api.post('/expenses', data),
  update: (id: number, data: any) => api.put(`/expenses/${id}`, data),
  delete: (id: number) => api.delete(`/expenses/${id}`),
  // Items
  createItem: (id: number, data: any) => api.post(`/expenses/${id}/items`, data),
  updateItem: (id: number, itemId: number, data: any) => api.put(`/expenses/${id}/items/${itemId}`, data),
  deleteItem: (id: number, itemId: number) => api.delete(`/expenses/${id}/items/${itemId}`),
  // Attachments
  uploadAttachment: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/expenses/${id}/attachments`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  deleteAttachment: (id: number, attachmentId: number) => api.delete(`/expenses/${id}/attachments/${attachmentId}`),
};

// Expense Categories (支出類別)
export const expenseCategoriesApi = {
  getAll: () => api.get('/expense-categories'),
  getTree: () => api.get('/expense-categories/tree'),
  get: (id: number) => api.get(`/expense-categories/${id}`),
  create: (data: { name: string; parent_id?: number; type?: string }) => api.post('/expense-categories', data),
  update: (id: number, data: { name?: string; is_active?: boolean; sort_order?: number; type?: string }) => api.put(`/expense-categories/${id}`, data),
  remove: (id: number) => api.delete(`/expense-categories/${id}`),
  reorder: (parent_id: number | null, orderedIds: number[]) => api.post('/expense-categories/reorder', { parent_id, orderedIds }),
};

// Attendances (打卡紀錄) - Admin view
export const attendancesApi = {
  list: (params?: any) => api.get('/attendances', { params }),
  get: (id: number) => api.get(`/attendances/${id}`),
  update: (id: number, data: any) => api.put(`/attendances/${id}`, data),
  delete: (id: number) => api.delete(`/attendances/${id}`),

  // 打卡配對增強
  matchDetail: (workLogId: number) => api.get(`/attendances/match-detail/${workLogId}`),
  employeeDay: (employeeId: number, date: string) =>
    api.get(`/attendances/employee-day/${employeeId}/${date}`),

  // 異常記錄
  anomalies: (params?: any) => api.get('/attendances/anomalies', { params }),
  scanAnomalies: (data: { date_from: string; date_to: string }) =>
    api.post('/attendances/anomalies/scan', data),
  resolveAnomaly: (id: number, data?: { anomaly_resolved_notes?: string }) =>
    api.post(`/attendances/anomalies/${id}/resolve`, data || {}),
  unresolveAnomaly: (id: number) =>
    api.post(`/attendances/anomalies/${id}/unresolve`),
};

// Leaves (請假紀錄) - Admin view
export const leavesApi = {
  list: (params?: any) => api.get('/leaves', { params }),
  get: (id: number) => api.get(`/leaves/${id}`),
  update: (id: number, data: any) => api.put(`/leaves/${id}`, data),
  approve: (id: number) => api.post(`/leaves/${id}/approve`),
  reject: (id: number, remarks?: string) => api.post(`/leaves/${id}/reject`, { remarks }),
  delete: (id: number) => api.delete(`/leaves/${id}`),
};

// ══════════════════════════════════════════════════════════════
// Phase 2: BQ (工程量清單) + VO (變更指令)
// ══════════════════════════════════════════════════════════════

// BQ Sections (BQ 分部)
export const bqSectionsApi = {
  list: (contractId: number) => api.get(`/contracts/${contractId}/bq-sections`),
  create: (contractId: number, data: any) => api.post(`/contracts/${contractId}/bq-sections`, data),
  update: (contractId: number, id: number, data: any) => api.put(`/contracts/${contractId}/bq-sections/${id}`, data),
  delete: (contractId: number, id: number) => api.delete(`/contracts/${contractId}/bq-sections/${id}`),
};

// BQ Items (BQ 項目)
export const bqItemsApi = {
  list: (contractId: number, params?: any) => api.get(`/contracts/${contractId}/bq-items`, { params }),
  create: (contractId: number, data: any) => api.post(`/contracts/${contractId}/bq-items`, data),
  update: (contractId: number, id: number, data: any) => api.put(`/contracts/${contractId}/bq-items/${id}`, data),
  delete: (contractId: number, id: number) => api.delete(`/contracts/${contractId}/bq-items/${id}`),
  batchCreate: (contractId: number, items: any[]) => api.post(`/contracts/${contractId}/bq-items/batch`, { items }),
  reorder: (contractId: number, orderedIds: number[]) => api.put(`/contracts/${contractId}/bq-items/reorder`, { orderedIds }),
};

// Variation Orders (變更指令)
export const variationOrdersApi = {
  list: (contractId: number) => api.get(`/contracts/${contractId}/variation-orders`),
  get: (contractId: number, id: number) => api.get(`/contracts/${contractId}/variation-orders/${id}`),
  create: (contractId: number, data: any) => api.post(`/contracts/${contractId}/variation-orders`, data),
  update: (contractId: number, id: number, data: any) => api.put(`/contracts/${contractId}/variation-orders/${id}`, data),
  delete: (contractId: number, id: number) => api.delete(`/contracts/${contractId}/variation-orders/${id}`),
};

// Contract Summary (合約金額匯總)
export const contractSummaryApi = {
  get: (contractId: number) => api.get(`/contracts/${contractId}/summary`),
};

// ══════════════════════════════════════════════════════════════
// Phase 3: Payment Applications (IPA / 計糧)
// ══════════════════════════════════════════════════════════════

export const paymentApplicationsApi = {
  list: (contractId: number) => api.get(`/contracts/${contractId}/payment-applications`),
  get: (contractId: number, paId: number) => api.get(`/contracts/${contractId}/payment-applications/${paId}`),
  create: (contractId: number, data: any) => api.post(`/contracts/${contractId}/payment-applications`, data),
  update: (contractId: number, paId: number, data: any) => api.put(`/contracts/${contractId}/payment-applications/${paId}`, data),
  delete: (contractId: number, paId: number) => api.delete(`/contracts/${contractId}/payment-applications/${paId}`),

  // Progress
  updateBqProgress: (contractId: number, paId: number, items: any[]) =>
    api.put(`/contracts/${contractId}/payment-applications/${paId}/bq-progress`, { items }),
  updateVoProgress: (contractId: number, paId: number, items: any[]) =>
    api.put(`/contracts/${contractId}/payment-applications/${paId}/vo-progress`, { items }),

  // Materials
  addMaterial: (contractId: number, paId: number, data: any) =>
    api.post(`/contracts/${contractId}/payment-applications/${paId}/materials`, data),
  updateMaterial: (contractId: number, paId: number, materialId: number, data: any) =>
    api.put(`/contracts/${contractId}/payment-applications/${paId}/materials/${materialId}`, data),
  removeMaterial: (contractId: number, paId: number, materialId: number) =>
    api.delete(`/contracts/${contractId}/payment-applications/${paId}/materials/${materialId}`),

  // Deductions
  addDeduction: (contractId: number, paId: number, data: any) =>
    api.post(`/contracts/${contractId}/payment-applications/${paId}/deductions`, data),
  updateDeduction: (contractId: number, paId: number, deductionId: number, data: any) =>
    api.put(`/contracts/${contractId}/payment-applications/${paId}/deductions/${deductionId}`, data),
  removeDeduction: (contractId: number, paId: number, deductionId: number) =>
    api.delete(`/contracts/${contractId}/payment-applications/${paId}/deductions/${deductionId}`),

  // Status transitions
  submit: (contractId: number, paId: number) =>
    api.post(`/contracts/${contractId}/payment-applications/${paId}/submit`),
  certify: (contractId: number, paId: number, data: any) =>
    api.post(`/contracts/${contractId}/payment-applications/${paId}/certify`, data),
  recordPayment: (contractId: number, paId: number, data: any) =>
    api.post(`/contracts/${contractId}/payment-applications/${paId}/record-payment`, data),
  revert: (contractId: number, paId: number) =>
    api.post(`/contracts/${contractId}/payment-applications/${paId}/revert`),
  void: (contractId: number, paId: number) =>
    api.post(`/contracts/${contractId}/payment-applications/${paId}/void`),

  // Retention settings
  updateRetention: (contractId: number, data: any) =>
    api.put(`/contracts/${contractId}/payment-applications/retention`, data),
};

// ══════════════════════════════════════════════════════════════
// Phase 4: PaymentIn (收款記錄) + PaymentOut (付款記錄)
// ══════════════════════════════════════════════════════════════

export const paymentInApi = {
  list: (params?: any) => api.get('/payment-in', { params }),
  get: (id: number) => api.get(`/payment-in/${id}`),
  create: (data: any) => api.post('/payment-in', data),
  update: (id: number, data: any) => api.put(`/payment-in/${id}`, data),
  updateStatus: (id: number, status: string) => api.patch(`/payment-in/${id}/status`, { payment_in_status: status }),
  delete: (id: number) => api.delete(`/payment-in/${id}`),
};

export const paymentOutApi = {
  list: (params?: any) => api.get('/payment-out', { params }),
  get: (id: number) => api.get(`/payment-out/${id}`),
  create: (data: any) => api.post('/payment-out', data),
  update: (id: number, data: any) => api.put(`/payment-out/${id}`, data),
  updateStatus: (id: number, status: string) => api.patch(`/payment-out/${id}/status`, { payment_out_status: status }),
  delete: (id: number) => api.delete(`/payment-out/${id}`),
};

// ══════════════════════════════════════════════════════════════
// Phase 6: Retention (扣留金追蹤)
// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// Phase 5: Invoices (發票管理)
// ══════════════════════════════════════════════════════════════

export const invoicesApi = {
  list: (params?: any) => api.get('/invoices', { params }),
  get: (id: number) => api.get(`/invoices/${id}`),
  create: (data: any) => api.post('/invoices', data),
  createFromQuotation: (quotationId: number, data?: any) => api.post(`/invoices/from-quotation/${quotationId}`, data || {}),
  update: (id: number, data: any) => api.put(`/invoices/${id}`, data),
  updateStatus: (id: number, status: string) => api.patch(`/invoices/${id}/status`, { status }),
  recordPayment: (id: number, data: any) => api.post(`/invoices/${id}/record-payment`, data),
  deletePayment: (id: number, paymentId: number) => api.delete(`/invoices/${id}/payment/${paymentId}`),
  getPayments: (id: number) => api.get(`/invoices/${id}/payments`),
  delete: (id: number) => api.delete(`/invoices/${id}`),
};

export const retentionApi = {
  getSummary: (contractId: number) => api.get(`/contracts/${contractId}/retention`),
  sync: (contractId: number) => api.post(`/contracts/${contractId}/retention/sync`),
  createRelease: (contractId: number, data: any) => api.post(`/contracts/${contractId}/retention/release`, data),
  deleteRelease: (contractId: number, releaseId: number) => api.delete(`/contracts/${contractId}/retention/release/${releaseId}`),
};

// ══════════════════════════════════════════════════════════════
// Phase 9: Bank Accounts (銀行帳戶)
// ══════════════════════════════════════════════════════════════

export const bankAccountsApi = {
  list: () => api.get('/bank-accounts'),
  simple: () => api.get('/bank-accounts/simple'),
  get: (id: number) => api.get(`/bank-accounts/${id}`),
  create: (data: any) => api.post('/bank-accounts', data),
  update: (id: number, data: any) => api.put(`/bank-accounts/${id}`, data),
  delete: (id: number) => api.delete(`/bank-accounts/${id}`),
};

// ══════════════════════════════════════════════════════════════
// Phase 9: Bank Reconciliation (銀行對帳)
// ══════════════════════════════════════════════════════════════

export const bankReconciliationApi = {
  findTransactions: (params: any) => api.get('/bank-reconciliation/transactions', { params }),
  importTransactions: (bankAccountId: number, rows: any[], source?: string) => api.post(`/bank-reconciliation/import/${bankAccountId}`, { rows, source }),
  createTransaction: (data: any) => api.post('/bank-reconciliation/transactions', data),
  updateTransaction: (id: number, data: any) => api.put(`/bank-reconciliation/transactions/${id}`, data),
  deleteTransaction: (id: number) => api.delete(`/bank-reconciliation/transactions/${id}`),
  updateRemark: (id: number, remark: string) => api.put(`/bank-reconciliation/transactions/${id}/remark`, { bank_txn_remark: remark }),
  batchDelete: (ids: number[]) => api.post('/bank-reconciliation/batch-delete', { ids }),
  batchMove: (ids: number[], targetBankAccountId: number) => api.post('/bank-reconciliation/batch-move', { ids, target_bank_account_id: targetBankAccountId }),
  parsePdf: (file: File, companies?: any[], bankAccounts?: any[]) => {
    const formData = new FormData();
    formData.append('file', file);
    if (companies) formData.append('companies', JSON.stringify(companies));
    if (bankAccounts) formData.append('bank_accounts', JSON.stringify(bankAccounts));
    return api.post('/bank-reconciliation/parse-pdf', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 180000, // 3 minutes for AI processing
    });
  },
  getSummary: (bankAccountId: number, params?: { date_from?: string; date_to?: string }) => api.get(`/bank-reconciliation/summary/${bankAccountId}`, { params }),
  findCandidates: (txId: number) => api.get(`/bank-reconciliation/candidates/${txId}`),
  autoMatchAll: (bankAccountId: number) => api.post(`/bank-reconciliation/auto-match/${bankAccountId}`),
  match: (txId: number, type: 'payment_in' | 'payment_out', matchedId: number) => api.post(`/bank-reconciliation/match/${txId}`, { type, matchedId }),
  unmatch: (txId: number) => api.post(`/bank-reconciliation/unmatch/${txId}`),
  exclude: (txId: number, remarks?: string) => api.post(`/bank-reconciliation/exclude/${txId}`, { remarks }),
};

// Project Profit & Loss (工程損益表)
export const projectProfitLossApi = {
  getOverview: (params?: any) => api.get('/project-profit-loss/overview', { params }),
  getProjectPL: (projectId: number, params?: any) => api.get(`/project-profit-loss/${projectId}`, { params }),
};

// ══════════════════════════════════════════════════════════════
// Phase 11: Company Profit & Loss (公司損益表)
// ══════════════════════════════════════════════════════════════

export const companyProfitLossApi = {
  get: (params?: any) => api.get('/company-profit-loss', { params }),
  trend: (params?: any) => api.get('/company-profit-loss/trend', { params }),
};

// ══════════════════════════════════════════════════════════════
// Equipment Profit (機械/車輛損益)
// ══════════════════════════════════════════════════════════════

export const equipmentProfitApi = {
  getReport: (params?: { date_from?: string; date_to?: string; equipment_type?: string; equipment_id?: number; include_inactive?: boolean }) =>
    api.get('/equipment-profit/report', { params }),
  getDetails: (type: string, id: number, params?: { date_from?: string; date_to?: string }) =>
    api.get(`/equipment-profit/report/${type}/${id}/details`, { params }),
  getSettings: () => api.get('/equipment-profit/settings'),
  updateCommission: (equipmentType: string, equipmentId: number, commissionPercentage: number) =>
    api.put(`/equipment-profit/settings/${equipmentType}/${equipmentId}`, { commission_percentage: commissionPercentage }),
};

// ══════════════════════════════════════════════════════════════
// Subcon Payroll (供應商計糧)
// ══════════════════════════════════════════════════════════════

export const subconPayrollApi = {
  preview: (data: { subcon_id: number; date_from: string; date_to: string; company_id?: number }) =>
    api.post('/subcon-payroll/preview', data),
  confirm: (data: {
    subcon_id: number;
    date_from: string;
    date_to: string;
    company_id?: number;
    extra_items?: { name: string; amount: number }[];
  }) => api.post('/subcon-payroll/confirm', data),
  list: (params?: { subcon_id?: number; month?: string; status?: string; page?: number; limit?: number }) =>
    api.get('/subcon-payroll/list', { params }),
  get: (id: number) => api.get(`/subcon-payroll/${id}`),
  remove: (id: number) => api.delete(`/subcon-payroll/${id}`),
};

// ══════════════════════════════════════════════════════════════
// Verification (工作紀錄核對)
// ══════════════════════════════════════════════════════════════

export const verificationApi = {
  // 上傳檔案
  upload: (formData: FormData) =>
    api.post('/verification/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 min for large files
    }),

  // 確認匯入並開始配對
  confirmBatch: (batchId: number) =>
    api.post(`/verification/batch/${batchId}/confirm`),

  // 核對工作台
  getWorkbench: (params?: any) =>
    api.get('/verification/workbench', { params }),

  // 單筆配對詳情
  getMatchDetail: (matchId: number) =>
    api.get(`/verification/match/${matchId}`),

  // 對配對結果進行操作
  performMatchAction: (matchId: number, data: { action: string; override_data?: any; notes?: string }) =>
    api.post(`/verification/match/${matchId}/action`, data),

  // 批次列表
  getBatches: (params?: any) =>
    api.get('/verification/batches', { params }),

  // 刪除批次
  deleteBatch: (batchId: number) =>
    api.delete(`/verification/batch/${batchId}`),

  // 作廢批次
  cancelBatch: (batchId: number) =>
    api.post(`/verification/batch/${batchId}/cancel`),

  // 同步打卡記錄
  syncClock: (data: { year: number; month: number }) =>
    api.post('/verification/sync-clock', data),

  // 來源列表
  getSources: () =>
    api.get('/verification/sources'),

  // 批量操作
  batchAction: (data: { match_ids: number[]; action: string; notes?: string }) =>
    api.post('/verification/batch-action', data),

  // 匯出 Excel（返回 blob）
  exportExcel: (params?: any) =>
    api.get('/verification/export', { params, responseType: 'blob' }),


  // 已匯入資料列表
  getRecords: (params?: {
    page?: number;
    limit?: number;
    source_type?: string;
    date_from?: string;
    date_to?: string;
    search?: string;
  }) =>
    api.get('/verification/records', { params }),

  // ── OCR 相關 ──────────────────────────────────────────────

  // 上傳掃描圖片進行 AI OCR
  ocrProcess: (formData: FormData) =>
    api.post('/verification/ocr/process', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 10 min for OCR processing
    }),

  // 確認 OCR 結果
  ocrConfirm: (ocrId: number, corrections?: Record<string, any>) =>
    api.post(`/verification/ocr/${ocrId}/confirm`, { corrections }),

  // 刪除 OCR 結果
  ocrDelete: (ocrId: number) =>
    api.delete(`/verification/ocr/${ocrId}`),

  // 取得待確認的 OCR 結果列表
  ocrPending: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/verification/ocr/pending', { params }),

  // ── GPS 相關 ──────────────────────────────────────────────

  // 上傳 GPS 追蹤報表
  gpsUpload: (formData: FormData) =>
    api.post('/verification/gps/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 600000, // 10 min for GPS processing
    }),

  // ── WhatsApp 相關 ──────────────────────────────────────────

  // 每日 Order 總結列表（主要 API）
  getWhatsappDailySummaries: (params?: {
    page?: number;
    limit?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
  }) =>
    api.get('/verification/whatsapp-daily-summaries', { params }),

  // 單日 Order 總結詳情
  getWhatsappDailySummary: (date: string, shift?: string) =>
    api.get(`/verification/whatsapp-daily-summary/${date}`, { params: { shift: shift || 'day' } }),

  // WhatsApp Orders 列表（向後兼容）
  getWhatsappOrders: (params?: {
    page?: number;
    limit?: number;
    date_from?: string;
    date_to?: string;
    search?: string;
  }) =>
    api.get('/verification/whatsapp-orders', { params }),

  // WhatsApp Order 詳情（向後兼容）
  getWhatsappOrderDetail: (id: number) =>
    api.get(`/verification/whatsapp-orders/${id}`),

  // WhatsApp Messages 列表
  getWhatsappMessages: (params?: {
    page?: number;
    limit?: number;
    classification?: string;
  }) =>
    api.get('/verification/whatsapp-messages', { params }),

  // Bot 狀態查詢
  getWhatsappBotStatus: () =>
    api.get('/verification/whatsapp-bot-status'),

  // QR Code 查詢
  getWhatsappQrCode: () =>
    api.get('/verification/whatsapp-qrcode'),

  // ── Order Item CRUD ────────────────────────────────────────

  updateWhatsappOrderItem: (orderId: number, itemId: number, data: Record<string, any>) =>
    api.put(`/verification/whatsapp-orders/${orderId}/items/${itemId}`, data),

  addWhatsappOrderItem: (orderId: number, data: Record<string, any>) =>
    api.post(`/verification/whatsapp-orders/${orderId}/items`, data),

  deleteWhatsappOrderItem: (orderId: number, itemId: number) =>
    api.delete(`/verification/whatsapp-orders/${orderId}/items/${itemId}`),

  // 重新解析訊息
  reparseMessage: (messageId: number) =>
    api.post(`/verification/whatsapp-messages/${messageId}/reparse`),

  // ── 六來源交叉比對 ────────────────────────────────────────────

  // 交叉比對總覽
  getMatchingOverview: (params: {
    date_from: string;
    date_to: string;
    group_by?: string;
    search?: string;
    review_status?: string;
    page?: number;
    limit?: number;
  }) =>
    api.get('/verification/matching', { params }),

  // 單筆工作紀錄核對（工作紀錄頁面展開面板）
  matchSingle: (workLogId: number) =>
    api.get(`/verification/match-single/${workLogId}`),

  // 確認/拒絕/手動配對
  upsertConfirmation: (data: {
    work_log_id: number;
    source_code: string;
    status: 'confirmed' | 'rejected' | 'manual_match';
    matched_record_id?: number;
    matched_record_type?: string;
    notes?: string;
  }) =>
    api.post('/verification/confirmations', data),

  // 重置為未審核
  deleteConfirmation: (workLogId: number, sourceCode: string) =>
    api.delete(`/verification/confirmations/${workLogId}/${sourceCode}`),

  // 查詢單筆工作紀錄的確認狀態
  getConfirmations: (workLogId: number) =>
    api.get(`/verification/confirmations/${workLogId}`),

  // 搜尋可配對的記錄（手動配對用）
  searchRecords: (params: { source_code: string; date: string; search: string }) =>
    api.get('/verification/confirmations/search/records', { params }),
};

// Statutory Holidays (法定假期)
export const statutoryHolidaysApi = {
  list: (params?: any) => api.get('/statutory-holidays', { params }),
  get: (id: number) => api.get(`/statutory-holidays/${id}`),
  create: (data: { date: string; name: string }) => api.post('/statutory-holidays', data),
  update: (id: number, data: { date?: string; name?: string }) => api.put(`/statutory-holidays/${id}`, data),
  delete: (id: number) => api.delete(`/statutory-holidays/${id}`),
  bulkCreate: (items: { date: string; name: string }[]) => api.post('/statutory-holidays/bulk', { items }),
};

// Audit Logs (操作歷史)
export const auditLogsApi = {
  list: (params?: any) => api.get('/audit-logs', { params }),
  getByTarget: (targetTable: string, targetId: number) => api.get('/audit-logs', { params: { targetTable, targetId: targetId.toString() } }),
};

// Daily Reports (工程日報) - Admin
// Daily Report Statistics (日報統計)
export const dailyReportStatsApi = {
  getStats: (params?: any) => api.get('/daily-report-stats', { params }),
  getExportData: (params?: any) => api.get('/daily-report-stats/export', { params }),
  getProjectCost: (projectId: number, params?: any) => api.get(`/daily-report-stats/project-cost/${projectId}`, { params }),
};

export const dailyReportsApi = {
  list: (params?: any) => api.get('/daily-reports', { params }),
  get: (id: number) => api.get(`/daily-reports/${id}`),
  create: (data: any) => api.post('/daily-reports', data),
  update: (id: number, data: any) => api.put(`/daily-reports/${id}`, data),
  adminUpdate: (id: number, data: any) => api.put(`/daily-reports/${id}/admin-update`, data),
  delete: (id: number) => api.delete(`/daily-reports/${id}`),
  byProject: (projectId: number, params?: any) => api.get(`/daily-reports/by-project/${projectId}`, { params }),
  exportPdf: (id: number) => api.get(`/daily-reports/${id}/pdf`, { responseType: 'blob' }),
  projectNames: () => api.get('/daily-reports/project-names'),
};

// Acceptance Reports (工程收貨報告) - Admin
export const acceptanceReportsApi = {
  list: (params?: any) => api.get('/acceptance-reports', { params }),
  get: (id: number) => api.get(`/acceptance-reports/${id}`),
  create: (data: any) => api.post('/acceptance-reports', data),
  update: (id: number, data: any) => api.put(`/acceptance-reports/${id}`, data),
  delete: (id: number) => api.delete(`/acceptance-reports/${id}`),
  byProject: (projectId: number, params?: any) => api.get(`/acceptance-reports/by-project/${projectId}`, { params }),
  exportPdf: (id: number) => api.get(`/acceptance-reports/${id}/pdf`, { responseType: 'blob' }),
};

// System Settings (系統設定)
export const systemSettingsApi = {
  getAll: () => api.get('/system-settings'),
  setMany: (settings: { key: string; value: string; description?: string }[]) =>
    api.put('/system-settings', { settings }),
};

// WhatsApp Console API
export const whatsappConsoleApi = {
  getStatus: () => api.get('/whatsapp-console/status'),
  getChats: () => api.get('/whatsapp-console/chats'),
  getMessages: (chatId: string, limit?: number) =>
    api.get(`/whatsapp-console/messages/${encodeURIComponent(chatId)}`, { params: { limit } }),
  sendMessage: (chatId: string, text: string) =>
    api.post('/whatsapp-console/send-message', { chatId, text }),
  sendImage: (chatId: string, imageBase64: string, caption?: string, mimeType?: string) =>
    api.post('/whatsapp-console/send-image', { chatId, imageBase64, caption, mimeType }),
  sendVoice: (chatId: string, audioBase64: string, mimeType?: string) =>
    api.post('/whatsapp-console/send-voice', { chatId, audioBase64, mimeType }),
  getMediaUrl: (messageId: string, chatId: string) =>
    `/api/whatsapp-console/media/${encodeURIComponent(messageId)}?chatId=${encodeURIComponent(chatId)}`,
  getVapidKey: () => api.get('/whatsapp-console/push/vapid-key'),
  subscribePush: (subscription: PushSubscriptionJSON) =>
    api.post('/whatsapp-console/push/subscribe', { subscription }),
  unsubscribePush: (endpoint: string) =>
    api.delete('/whatsapp-console/push/subscribe', { data: { endpoint } }),
};
