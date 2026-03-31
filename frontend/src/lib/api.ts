import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
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

// Companies
export const companiesApi = {
  list: (params?: any) => api.get('/companies', { params }),
  simple: () => api.get('/companies/simple'),
  get: (id: number) => api.get(`/companies/${id}`),
  create: (data: any) => api.post('/companies', data),
  update: (id: number, data: any) => api.put(`/companies/${id}`, data),
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
};

// Vehicles
export const vehiclesApi = {
  list: (params?: any) => api.get('/vehicles', { params }),
  get: (id: number) => api.get(`/vehicles/${id}`),
  create: (data: any) => api.post('/vehicles', data),
  update: (id: number, data: any) => api.put(`/vehicles/${id}`, data),
  changePlate: (id: number, data: any) => api.post(`/vehicles/${id}/change-plate`, data),
  transfer: (id: number, data: any) => api.post(`/vehicles/${id}/transfer`, data),
};

// Machinery
export const machineryApi = {
  list: (params?: any) => api.get('/machinery', { params }),
  get: (id: number) => api.get(`/machinery/${id}`),
  create: (data: any) => api.post('/machinery', data),
  update: (id: number, data: any) => api.put(`/machinery/${id}`, data),
  transfer: (id: number, data: any) => api.post(`/machinery/${id}/transfer`, data),
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
};

// Dashboard
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
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
