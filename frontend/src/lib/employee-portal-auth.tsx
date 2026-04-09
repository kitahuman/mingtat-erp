'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { employeePortalApi } from './employee-portal-api';

export interface EmployeeUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  phone?: string | null;
  isAdmin?: boolean;
  employeeId?: number | null;
  canCompanyClock?: boolean;
  can_approve_mid_shift?: boolean;
  can_daily_report?: boolean;
  can_acceptance_report?: boolean;
  employee?: {
    id: number;
    name_zh: string;
    name_en?: string | null;
    emp_code?: string | null;
    role: string;
    company_id?: number | null;
  } | null;
}

interface EmployeePortalAuthContextType {
  user: EmployeeUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const EmployeePortalAuthContext = createContext<EmployeePortalAuthContextType>(
  {} as EmployeePortalAuthContextType,
);

export function EmployeePortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<EmployeeUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = Cookies.get('ep_user');
    const token = Cookies.get('ep_token');
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (identifier: string, password: string) => {
    const res = await employeePortalApi.login(identifier, password);
    Cookies.set('ep_token', res.data.access_token, { expires: 30 });
    Cookies.set('ep_user', JSON.stringify(res.data.user), { expires: 30 });
    setUser(res.data.user);
  };

  const logout = () => {
    Cookies.remove('ep_token');
    Cookies.remove('ep_user');
    setUser(null);
    window.location.href = '/employee-portal/login';
  };

  return (
    <EmployeePortalAuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </EmployeePortalAuthContext.Provider>
  );
}

export const useEmployeePortalAuth = () => useContext(EmployeePortalAuthContext);
