'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import Cookies from 'js-cookie';
import { authApi } from './api';

interface User {
  id: number;
  username: string;
  display_name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
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

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
