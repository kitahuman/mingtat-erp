import type { Metadata } from 'next';
import EmployeePortalClientLayout from './client-layout';

export const metadata: Metadata = {
  title: 'Ming Tat Construction Employee Portal',
  description: 'Ming Tat Construction Employee Portal',
  manifest: '/employee-portal/manifest.json',
  themeColor: '#2a4db7',
  icons: {
    icon: [
      { url: '/employee-portal/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/employee-portal/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/employee-portal/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function EmployeePortalLayout({ children }: { children: React.ReactNode }) {
  return <EmployeePortalClientLayout>{children}</EmployeePortalClientLayout>;
}
