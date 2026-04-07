'use client';

import { CompanyClockAuthProvider } from '@/lib/company-clock-auth';

export default function CompanyClockLayout({ children }: { children: React.ReactNode }) {
  return (
    <CompanyClockAuthProvider>
      {children}
    </CompanyClockAuthProvider>
  );
}
