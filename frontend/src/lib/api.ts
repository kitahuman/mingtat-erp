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

// Dashboard
export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
};
