import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import '@/components/ProcureXLoader.css'
import Layout from '@/components/Layout'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
 title: 'ProcureX',
 description: 'ProcureX — Intelligent IT Procurement & Vendor Verification Platform',
 icons: {
  icon: [
   { url: '/favicon.ico', sizes: 'any' },
   { url: '/procurex-icon-32.png', sizes: '32x32', type: 'image/png' },
   { url: '/procurex-icon-192.png', sizes: '192x192', type: 'image/png' },
   { url: '/procurex-icon-512.png', sizes: '512x512', type: 'image/png' },
  ],
  apple: '/apple-touch-icon.png',
 },
}

export const viewport: Viewport = {
 width: 'device-width',
 initialScale: 1,
 viewportFit: 'cover',
 themeColor: '#171717',
}

export default function RootLayout({
 children,
}: {
 children: React.ReactNode
}) {
 return (
 <html lang="en">
 <body className={inter.className}>
 <Layout>{children}</Layout>
 </body>
 </html>
 )
}


