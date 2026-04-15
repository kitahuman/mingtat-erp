import axios from 'axios';
import Cookies from 'js-cookie';

// ── Work Log Types ────────────────────────────────────────────────────────────
export interface WorkLogHistoryItem {
  id: number;
  service_type: string | null;
  scheduled_date: string | null;
  client_id: number | null;
  client: { id: number; name: string } | null;
  unverified_client_name: string | null;
  client_contract_no: string | null;
  machine_type: string | null;
  equipment_number: string | null;
  tonnage: string | null;
  start_location: string | null;
  end_location: string | null;
  day_night: string | null;
  start_time: string | null;
  end_time: string | null;
  quantity: string | null;
  unit: string | null;
  ot_quantity: string | null;
  ot_unit: string | null;
  is_mid_shift: boolean;
  goods_quantity: number | null;
  work_log_product_name: string | null;
  work_log_product_unit: string | null;
  work_log_photo_urls: string[] | null;
  work_log_signature_url: string | null;
  status: string | null;
  work_order_no: string | null;
  receipt_no: string | null;
  remarks: string | null;
  created_at: string;
}

export interface WorkLogListResponse {
  data: WorkLogHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

export interface SubmitWorkLogPayload {
  service_type?: string;
  scheduled_date?: string;
  client_id?: string | number;
  unverified_client_name?: string;
  client_contract_no?: string;
  machine_type?: string;
  equipment_number?: string;
  tonnage?: string;
  day_night?: string;
  start_location?: string;
  end_location?: string;
  start_time?: string;
  end_time?: string;
  quantity?: string | number;
  unit?: string;
  ot_hours?: number;
  ot_quantity?: number;
  is_mid_shift?: boolean;
  goods_quantity?: number;
  work_log_product_name?: string;
  work_log_product_unit?: string;
  work_order_no?: string;
  receipt_no?: string;
  remarks?: string;
  photo_urls?: string[];
  signature_url?: string;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const portalApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

portalApi.interceptors.request.use((config) => {
  const token = Cookies.get('ep_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

portalApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('ep_token');
      Cookies.remove('ep_user');
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/employee-portal/login')) {
        window.location.href = '/employee-portal/login';
      }
    }
    return Promise.reject(error);
  },
);

export const employeePortalApi = {
  // Auth - accepts phone number OR admin username
  login: (identifier: string, password: string) =>
    portalApi.post('/employee-portal/login', { identifier, password }),

  getProfile: () => portalApi.get('/employee-portal/profile'),

  // Attendance
  clockInOut: (data: {
    type: 'clock_in' | 'clock_out';
    photo_url?: string;
    attendance_photo_base64?: string;
    latitude?: number;
    longitude?: number;
    address?: string;
    remarks?: string;
    is_mid_shift?: boolean;
  }) => portalApi.post('/employee-portal/attendance', data),

  getTodayAttendance: () => portalApi.get('/employee-portal/attendance/today'),

  getAttendanceHistory: (params?: { page?: number; limit?: number }) =>
    portalApi.get('/employee-portal/attendance/history', { params }),

  // Photo upload
  uploadPhoto: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return portalApi.post('/employee-portal/upload-photo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Work logs
  submitWorkLog: (data: SubmitWorkLogPayload) => portalApi.post('/employee-portal/work-logs', data),
  getMyWorkLogs: (params?: { page?: number; limit?: number }) =>
    portalApi.get<WorkLogListResponse>('/employee-portal/work-logs', { params }),
  getMyWorkLog: (id: number) =>
    portalApi.get<WorkLogHistoryItem>(`/employee-portal/work-logs/${id}`),
  updateMyWorkLog: (id: number, data: SubmitWorkLogPayload) =>
    portalApi.put<WorkLogHistoryItem>(`/employee-portal/work-logs/${id}`, data),

  // Expenses
  submitExpense: (data: any) => portalApi.post('/employee-portal/expenses', data),
  getMyExpenses: (params?: { page?: number; limit?: number }) =>
    portalApi.get('/employee-portal/expenses', { params }),

  // Leave
  submitLeave: (data: {
    leave_type: 'sick' | 'annual';
    date_from: string;
    date_to: string;
    days: number;
    reason?: string;
  }) => portalApi.post('/employee-portal/leave', data),
  getLeaveRecords: (params?: { page?: number; limit?: number }) =>
    portalApi.get('/employee-portal/leave', { params }),

  // Payrolls
  getMyPayrolls: (params?: { page?: number; limit?: number }) =>
    portalApi.get('/employee-portal/payrolls', { params }),

  // Dashboard
  getDashboard: () => portalApi.get('/employee-portal/dashboard'),

  // Certificates
  getCertificates: () => portalApi.get('/employee-portal/certificates'),
  updateCertificate: (certKey: string, certNo: string | null, expiryDate: string | null) =>
    portalApi.post('/employee-portal/certificates/update', { cert_key: certKey, cert_no: certNo, expiry_date: expiryDate }),
  updateCertPhoto: (certKey: string, photoUrl: string) =>
    portalApi.post('/employee-portal/certificates/photo', { cert_key: certKey, photo_url: photoUrl }),
  getExpiringCerts: (days?: number) =>
    portalApi.get('/employee-portal/certificates/expiring', { params: days ? { days } : {} }),

  // Mid-Shift Approval
  getPendingMidShiftApprovals: () => portalApi.get('/employee-portal/mid-shift-approvals'),
  approveMidShift: (data: { attendance_ids: number[]; signature_base64: string }) =>
    portalApi.post('/employee-portal/mid-shift-approvals', data),
  getMidShiftApprovalHistory: (params?: { page?: number; limit?: number }) =>
    portalApi.get('/employee-portal/mid-shift-approvals/history', { params }),

  // Daily Reports
  getMyDailyReports: (params?: any) =>
    portalApi.get('/employee-portal/daily-reports', { params }),
  getDailyReport: (id: number) =>
    portalApi.get(`/employee-portal/daily-reports/${id}`),
  createDailyReport: (data: any) =>
    portalApi.post('/employee-portal/daily-reports', data),
  updateDailyReport: (id: number, data: any) =>
    portalApi.post(`/employee-portal/daily-reports/${id}`, data),
  deleteDailyReport: (id: number) =>
    portalApi.post(`/employee-portal/daily-reports/${id}/delete`),
  uploadDailyReportFile: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return portalApi.post('/employee-portal/daily-reports/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  addDailyReportAttachments: (id: number, attachments: { file_name: string; file_url: string; file_type: string }[]) =>
    portalApi.post(`/employee-portal/daily-reports/${id}/attachments`, { attachments }),
  removeDailyReportAttachment: (id: number, attachmentId: number) =>
    portalApi.post(`/employee-portal/daily-reports/${id}/attachments/${attachmentId}/delete`),
  getPreviousDailyReport: (params?: { project_id?: string; client_id?: string; client_contract_no?: string }) =>
    portalApi.get('/employee-portal/daily-reports/previous', { params }),

  // Acceptance Reports
  getMyAcceptanceReports: (params?: any) =>
    portalApi.get('/employee-portal/acceptance-reports', { params }),
  getAcceptanceReport: (id: number) =>
    portalApi.get(`/employee-portal/acceptance-reports/${id}`),
  createAcceptanceReport: (data: any) =>
    portalApi.post('/employee-portal/acceptance-reports', data),
  updateAcceptanceReport: (id: number, data: any) =>
    portalApi.post(`/employee-portal/acceptance-reports/${id}`, data),
  deleteAcceptanceReport: (id: number) =>
    portalApi.post(`/employee-portal/acceptance-reports/${id}/delete`),

  // Admin: Bulk create accounts for all employees with phone numbers
  bulkCreateAccounts: () =>
    portalApi.post('/employee-portal/bulk-create-accounts', {}),

  // Admin: Create a single employee account
  createAccount: (data: { phone: string; displayName: string; employee_id?: number }) =>
    portalApi.post('/employee-portal/create-account', data),
};

// Shared API for dropdown data (uses same base URL, no special auth needed)
const sharedApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});
sharedApi.interceptors.request.use((config) => {
  const token = Cookies.get('ep_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const portalSharedApi = {
  // Legacy admin endpoints (kept for backward compatibility)
  getPartners: (params?: any) => sharedApi.get('/partners', { params }),
  getCompanyProfiles: () => sharedApi.get('/company-profiles/simple'),
  getExpenseCategories: () => sharedApi.get('/expense-categories/tree'),
  getSubconFleetSimple: () => sharedApi.get('/subcon-fleet-drivers/simple'),
  // Portal-native shared endpoints (use employee portal JWT)
  getProjectsSimple: () => sharedApi.get('/employee-portal/shared/projects'),
  getEmployeesSimple: () => sharedApi.get('/employee-portal/shared/employees'),
  getVehiclesSimple: () => sharedApi.get('/employee-portal/shared/vehicles'),
  getMachinerySimple: () => sharedApi.get('/employee-portal/shared/machinery'),
  getPartnersSimple: () => sharedApi.get('/employee-portal/shared/partners'),
  getFieldOptions: (category: string) =>
    sharedApi.get('/employee-portal/shared/field-options', { params: { category } }),
  createFieldOption: (data: { category: string; label: string }) =>
    sharedApi.post('/field-options', data),
  getAllEquipmentSimple: () =>
    sharedApi.get<{ value: string; label: string; category: 'vehicle' | 'machinery' | 'subcon_fleet'; type: string | null; tonnage: string | null }[]>('/employee-portal/shared/all-equipment'),
};
