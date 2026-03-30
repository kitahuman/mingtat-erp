import './globals.css';
import { AuthProvider } from '@/lib/auth';

export const metadata = {
  title: '明達 ERP - 主檔管理系統',
  description: '明達建築有限公司 ERP 系統',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body className="bg-gray-50 min-h-screen">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
