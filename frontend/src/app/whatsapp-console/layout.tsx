import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#075e54',
};

export const metadata: Metadata = {
  title: 'WhatsApp 遙控台',
  description: '明達建築 WhatsApp 遙控介面',
  manifest: '/whatsapp-console/manifest.json',
  icons: {
    icon: [
      { url: '/whatsapp-console/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/whatsapp-console/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/whatsapp-console/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function WhatsappConsoleLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
