'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { authApi } from './api';

export type UserRole = 'admin' | 'manager' | 'clerk' | 'worker';

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  isActive?: boolean;
}

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 4,
  manager: 3,
  clerk: 2,
  worker: 1,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理員',
  manager: '主管',
  clerk: '文員',
  worker: '司機/工人',
};

export const DEPARTMENT_OPTIONS = ['工程部', '街車', '運輸部', '辦公室'];

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  updateUser: (user: User) => void;
  hasRole: (...roles: UserRole[]) => boolean;
  hasMinRole: (minRole: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = Cookies.get('user');
    const token = Cookies.get('token');
    if (savedUser && token) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {}
    }
    setLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    const res = await authApi.login({ username, password });
    Cookies.set('token', res.data.access_token, { expires: 7 });
    Cookies.set('user', JSON.stringify(res.data.user), { expires: 7 });
    setUser(res.data.user);
  };

  const logout = () => {
    Cookies.remove('token');
    Cookies.remove('user');
    setUser(null);
    window.location.href = '/login';
  };

  const updateUser = (updatedUser: User) => {
    setUser(updatedUser);
    Cookies.set('user', JSON.stringify(updatedUser), { expires: 7 });
  };

  const hasRole = (...roles: UserRole[]) => {
    if (!user) return false;
    return roles.includes(user.role);
  };

  const hasMinRole = (minRole: UserRole) => {
    if (!user) return false;
    return ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[minRole];
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, updateUser, hasRole, hasMinRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
