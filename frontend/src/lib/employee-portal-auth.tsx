'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
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

// Helper: decode JWT payload to check expiry
function getTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

// Check if token expires within the given threshold (in seconds)
function isTokenExpiringSoon(token: string, thresholdSeconds: number): boolean {
  const exp = getTokenExp(token);
  if (!exp) return true; // If can't decode, treat as expiring
  const nowSec = Math.floor(Date.now() / 1000);
  return exp - nowSec < thresholdSeconds;
}

// Refresh threshold: 7 days in seconds
const REFRESH_THRESHOLD = 7 * 24 * 60 * 60;
// Check interval: every 4 hours
const CHECK_INTERVAL = 4 * 60 * 60 * 1000;

export function EmployeePortalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<EmployeeUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tryRefreshToken = useCallback(async () => {
    const token = Cookies.get('ep_token');
    if (!token) return;
    if (!isTokenExpiringSoon(token, REFRESH_THRESHOLD)) return;

    try {
      const res = await employeePortalApi.refresh();
      Cookies.set('ep_token', res.data.access_token, { expires: 30 });
      Cookies.set('ep_user', JSON.stringify(res.data.user), { expires: 30 });
      setUser(res.data.user);
    } catch {
      // Refresh failed - token may be fully expired, interceptor will handle redirect
    }
  }, []);

  useEffect(() => {
    const savedUser = Cookies.get('ep_user');
    const token = Cookies.get('ep_token');
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {}
      // Proactively refresh if token is expiring soon
      tryRefreshToken();
    }
    setLoading(false);

    // Set up periodic refresh check
    refreshTimerRef.current = setInterval(tryRefreshToken, CHECK_INTERVAL);
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [tryRefreshToken]);

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
    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    window.location.href = '/employee-portal/login';
  };

  return (
    <EmployeePortalAuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </EmployeePortalAuthContext.Provider>
  );
}

export const useEmployeePortalAuth = () => useContext(EmployeePortalAuthContext);
