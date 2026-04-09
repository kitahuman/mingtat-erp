import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const companyClockAxios = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000, // 120s for AI face comparison
});

companyClockAxios.interceptors.request.use((config) => {
  const token = Cookies.get('cc_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

companyClockAxios.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      Cookies.remove('cc_token');
      Cookies.remove('cc_user');
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/company-clock/login')) {
        window.location.href = '/company-clock/login';
      }
    }
    return Promise.reject(error);
  },
);

export const companyClockApi = {
  // Auth
  login: (identifier: string, password: string) =>
    companyClockAxios.post('/company-clock/login', { identifier, password }),

  // Employee list for clock-in selection
  getEmployees: (params?: {
    search?: string;
    company_id?: number;
    status?: string;
    page?: number;
    limit?: number;
  }) => companyClockAxios.get('/company-clock/employees', { params }),

  // Companies for filter dropdown
  getCompanies: () => companyClockAxios.get('/company-clock/companies'),

  // Get employee standard photo
  getEmployeePhoto: (id: number) =>
    companyClockAxios.get(`/company-clock/employees/${id}/photo`),

  // Update employee standard photo
  updateEmployeePhoto: (id: number, photoBase64: string) =>
    companyClockAxios.put(`/company-clock/employees/${id}/photo`, { photo_base64: photoBase64 }),

  // Check if temporary employee name already exists
  checkTemporaryEmployeeName: (name_zh: string) =>
    companyClockAxios.get('/company-clock/temporary-employee/check-name', { params: { name_zh } }),

  // Clock in/out with face recognition
  clock: (data: {
    employee_id: number;
    photo_base64: string;
    type: 'clock_in' | 'clock_out';
    latitude?: number;
    longitude?: number;
    address?: string;
    remarks?: string;
    is_mid_shift?: boolean;
    work_notes?: string;
  }) => companyClockAxios.post('/company-clock/clock', data),

  // Create temporary employee
  createTemporaryEmployee: (data: {
    name_zh: string;
    name_en?: string;
    phone?: string;
    photo_base64: string;
    company_id?: number;
    role_title?: string;
    work_notes?: string;
    is_mid_shift?: boolean;
  }) => companyClockAxios.post('/company-clock/temporary-employee', data),

  // Today's attendance records
  getTodayAttendances: (params?: { company_id?: number; search?: string }) =>
    companyClockAxios.get('/company-clock/today-attendances', { params }),
};
