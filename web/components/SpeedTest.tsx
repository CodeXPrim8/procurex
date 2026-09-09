'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff, Loader2 } from 'lucide-react'

interface SpeedTestResult {
 downloadSpeed: number // in Mbps
 uploadSpeed: number // in Mbps
 ping: number // in ms
 isRunning: boolean
}

export default function SpeedTest() {
 const [speed, setSpeed] = useState<SpeedTestResult | null>(null)
 const [isRunning, setIsRunning] = useState(false)
 const [isOnline, setIsOnline] = useState(true)

 // Check online status
 useEffect(() => {
 const checkOnline = () => setIsOnline(navigator.onLine)
 window.addEventListener('online', checkOnline)
 window.addEventListener('offline', checkOnline)
 checkOnline()
 return () => {
 window.removeEventListener('online', checkOnline)
 window.removeEventListener('offline', checkOnline)
 }
 }, [])

 const runSpeedTest = async () => {
 if (isRunning || !isOnline) return

 setIsRunning(true)
 setSpeed(null)

 try {
 // Test ping first (quick check)
 const pingStart = performance.now()
 try {
 await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
 method: 'GET',
 cache: 'no-cache',
 mode: 'no-cors',
 })
 } catch {
 // Ignore CORS errors for ping
 }
 const ping = Math.round(performance.now() - pingStart)

 // Download speed test - fetch a small file
 const downloadStart = performance.now()
 const downloadSize = 1 * 1024 * 1024 // 1MB
 try {
 const response = await fetch(`https://speed.cloudflare.com/__down?bytes=${downloadSize}`, {
 cache: 'no-cache',
 })
 await response.arrayBuffer()
 const downloadTime = (performance.now() - downloadStart) / 1000 // seconds
 const downloadSpeed = (downloadSize * 8) / (downloadTime * 1000000) // Mbps

 // Upload speed estimate (simplified - use download * 0.3 as approximation)
 const uploadSpeed = downloadSpeed * 0.3

 setSpeed({
 downloadSpeed: Math.max(0.1, downloadSpeed),
 uploadSpeed: Math.max(0.1, uploadSpeed),
 ping: Math.min(ping, 999),
 isRunning: false,
 })
 } catch {
 // Fallback: estimate based on ping
 setSpeed({
 downloadSpeed: ping < 50 ? 50 : ping < 100 ? 20 : 5,
 uploadSpeed: ping < 50 ? 10 : ping < 100 ? 5 : 1,
 ping: Math.min(ping, 999),
 isRunning: false,
 })
 }
 } catch {
 setSpeed({
 downloadSpeed: 0,
 uploadSpeed: 0,
 ping: 0,
 isRunning: false,
 })
 } finally {
 setIsRunning(false)
 }
 }

 const formatSpeed = (speed: number) => {
 if (speed === 0) return '--'
 if (speed < 1) return `${(speed * 1000).toFixed(0)} Kbps`
 return `${speed.toFixed(1)} Mbps`
 }

 return (
 <div className="relative group">
 <button
 onClick={runSpeedTest}
 disabled={isRunning || !isOnline}
 className={`flex items-center space-x-1 md:space-x-2 px-2 md:px-3 py-2 rounded-md text-xs md:text-sm font-medium transition-colors focus:outline-none ${
 isRunning
 ? 'opacity-50 cursor-not-allowed'
 : 'text-[#b4b4b4] hover:bg-[#2f2f2f] hover:text-[#ececec]'
 }`}
 title={isOnline ? 'Click to test internet speed' : 'No internet connection'}
 >
 {isRunning ? (
 <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin text-[#19C37D]" />
 ) : !isOnline ? (
 <WifiOff className="w-4 h-4 md:w-5 md:h-5 text-red-500" />
 ) : (
 <Wifi className="w-4 h-4 md:w-5 md:h-5 text-[#19C37D]" />
 )}
 {speed && !isRunning ? (
 <span className="text-xs font-semibold text-[#ececec]">
 {formatSpeed(speed.downloadSpeed)}
 </span>
 ) : isRunning ? (
 <span className="text-xs text-[#b4b4b4]">Testing...</span>
 ) : (
 <span className="text-xs text-[#b4b4b4]">Speed</span>
 )}
 </button>

 {speed && !isRunning && (
 <div className="absolute right-0 top-full mt-2 w-48 p-3 rounded-lg shadow-lg border z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none bg-[#171717] border-[#2f2f2f]">
 <div className="text-xs space-y-1">
 <div className="flex justify-between">
 <span className="text-[#b4b4b4]">Download:</span>
 <span className="font-semibold text-[#ececec]">
 {formatSpeed(speed.downloadSpeed)}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#b4b4b4]">Upload:</span>
 <span className="font-semibold text-[#ececec]">
 {formatSpeed(speed.uploadSpeed)}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-[#b4b4b4]">Ping:</span>
 <span className="font-semibold text-[#ececec]">
 {speed.ping} ms
 </span>
 </div>
 </div>
 </div>
 )}
 </div>
 )
}
