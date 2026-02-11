import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Sidebar } from '@/components/Sidebar'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ottoresearch.io'

export const metadata: Metadata = {
  title: {
    default: 'OTTO Research Labs',
    template: '%s | OTTO Research Labs',
  },
  description: 'Automated eBay dropshipping product research and listing optimization. Discover profitable products, automate listings, and scale your eBay business.',
  keywords: [
    'eBay dropshipping',
    'product research',
    'eBay automation',
    'dropshipping software',
    'eBay listing tool',
    'product sourcing',
    'eBay seller tools',
    'ecommerce automation',
  ],
  authors: [{ name: 'OTTO Research Labs' }],
  creator: 'OTTO Research Labs',
  publisher: 'OTTO Research Labs',
  metadataBase: new URL(APP_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: APP_URL,
    siteName: 'OTTO Research Labs',
    title: 'OTTO Research Labs - Automated eBay Product Research',
    description: 'Discover profitable products, automate listings, and scale your eBay dropshipping business with AI-powered research and optimization.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'OTTO Research Labs',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OTTO Research Labs',
    description: 'Automated eBay dropshipping product research and listing optimization.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180' },
    ],
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="font-sans">
        <div className="flex h-screen bg-gray-100">
          <Sidebar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
