import type { Metadata } from 'next';
import CompanyClockClientLayout from './client-layout';

export const metadata: Metadata = {
  title: '明達建築 ERP 公司打卡系統',
  description: '明達建築有限公司 ERP 公司打卡系統',
  manifest: '/company-clock/manifest.json',
  themeColor: '#1a5c3a',
  icons: {
    icon: [
      { url: '/company-clock/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/company-clock/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/company-clock/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function CompanyClockLayout({ children }: { children: React.ReactNode }) {
  return <CompanyClockClientLayout>{children}</CompanyClockClientLayout>;
}
