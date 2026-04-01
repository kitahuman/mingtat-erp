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
        window.location.href = '/login';
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
  get: (id: number) => api.get(`/employees/${id}`),
  create: (data: any) => api.post('/employees', data),
  update: (id: number, data: any) => api.put(`/employees/${id}`, data),
  addSalary: (id: number, data: any) => api.post(`/employees/${id}/salary-settings`, data),
  getSalary: (id: number) => api.get(`/employees/${id}/salary-settings`),
  transfer: (id: number, data: any) => api.post(`/employees/${id}/transfer`, data),
  terminate: (id: number, data: { termination_date: string; termination_reason?: string }) => api.post(`/employees/${id}/terminate`, data),
  reinstate: (id: number) => api.post(`/employees/${id}/reinstate`),
  delete: (id: number) => api.delete(`/employees/${id}`),
};

// Vehicles
export const vehiclesApi = {
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
};

// Rate Cards (客戶價目表)
export const rateCardsApi = {
  list: (params?: any) => api.get('/rate-cards', { params }),
  get: (id: number) => api.get(`/rate-cards/${id}`),
  create: (data: any) => api.post('/rate-cards', data),
  update: (id: number, data: any) => api.put(`/rate-cards/${id}`, data),
  delete: (id: number) => api.delete(`/rate-cards/${id}`),
};

// Fleet Rate Cards (車隊價目表)
export const fleetRateCardsApi = {
  list: (params?: any) => api.get('/fleet-rate-cards', { params }),
  get: (id: number) => api.get(`/fleet-rate-cards/${id}`),
  create: (data: any) => api.post('/fleet-rate-cards', data),
  update: (id: number, data: any) => api.put(`/fleet-rate-cards/${id}`, data),
  delete: (id: number) => api.delete(`/fleet-rate-cards/${id}`),
};

// Subcontractor Vehicle Rate Cards (街車價目表)
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
  preview: (data: { employee_id: number; date_from: string; date_to: string; company_profile_id?: number }) =>
    api.post('/payroll/preview', data),
  // 生成糧單（單一員工 + 日期範圍）
  generate: (data: { employee_id: number; date_from: string; date_to: string; company_profile_id?: number; period?: string }) =>
    api.post('/payroll/generate', data),
  update: (id: number, data: any) => api.put(`/payroll/${id}`, data),
  bulkConfirm: (ids: number[]) => api.post('/payroll/bulk/confirm', { ids }),
  bulkMarkPaid: (ids: number[], paymentDate?: string, chequeNumber?: string) =>
    api.post('/payroll/bulk/mark-paid', { ids, payment_date: paymentDate, cheque_number: chequeNumber }),
  recalculate: (id: number) => api.post(`/payroll/${id}/recalculate`),
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
  equipmentOptions: (machineType: string, tonnage?: string) =>
    api.get('/work-logs/equipment-options', { params: { machine_type: machineType, tonnage } }),
  locationSuggestions: (type: 'start' | 'end', q: string) =>
    api.get('/work-logs/location-suggestions', { params: { type, q } }),
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
