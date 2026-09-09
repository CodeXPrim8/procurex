import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import Layout from '@/components/Layout'

const inter = Inter({ subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
 title: 'ProcureX',
 description: 'ProcureX — Intelligent IT Procurement & Vendor Verification Platform',
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


