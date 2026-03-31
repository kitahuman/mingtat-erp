'use client';
import { useAuth, UserRole } from '@/lib/auth';

interface RoleGuardProps {
  roles?: UserRole[];
  minRole?: UserRole;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const defaultFallback = (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="text-center">
      <div className="text-6xl mb-4">🔒</div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">無權限訪問</h2>
      <p className="text-gray-500">您沒有權限查看此頁面，請聯繫管理員。</p>
    </div>
  </div>
);

export default function RoleGuard({ roles, minRole, children, fallback }: RoleGuardProps) {
  const { hasRole, hasMinRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  let allowed = false;
  if (roles) {
    allowed = hasRole(...roles);
  } else if (minRole) {
    allowed = hasMinRole(minRole);
  } else {
    allowed = true;
  }

  if (!allowed) {
    return <>{fallback || defaultFallback}</>;
  }

  return <>{children}</>;
}
