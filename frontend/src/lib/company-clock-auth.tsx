'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { companyClockApi } from './company-clock-api';

export interface CompanyClockUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

interface CompanyClockAuthContextType {
  user: CompanyClockUser | null;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const CompanyClockAuthContext = createContext<CompanyClockAuthContextType>(
  {} as CompanyClockAuthContextType,
);

export function CompanyClockAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CompanyClockUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = Cookies.get('cc_user');
    const token = Cookies.get('cc_token');
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (identifier: string, password: string) => {
    const res = await companyClockApi.login(identifier, password);
    Cookies.set('cc_token', res.data.access_token, { expires: 30 });
    Cookies.set('cc_user', JSON.stringify(res.data.user), { expires: 30 });
    setUser(res.data.user);
  };

  const logout = () => {
    Cookies.remove('cc_token');
    Cookies.remove('cc_user');
    setUser(null);
    window.location.href = '/company-clock/login';
  };

  return (
    <CompanyClockAuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </CompanyClockAuthContext.Provider>
  );
}

export const useCompanyClockAuth = () => useContext(CompanyClockAuthContext);
