import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useDriveStore } from '../store/useDriveStore'
import { useLibraryStore } from '../store/useLibraryStore'
import { isConfigured } from '../lib/googleDrive'
import { coinBalance } from '../lib/coins'

const navItems = [
  { to: '/', label: '首页', icon: '🏠' },
  { to: '/read', label: '朗读练习', icon: '📖' },
  { to: '/library', label: '生字本', icon: '📚' },
  { to: '/review', label: '巩固复习', icon: '🎯' },
  { to: '/pinyin', label: '拼音练习', icon: '🔤' },
  { to: '/import', label: '导入课文', icon: '📥' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

/** Compact coin-total pill shown in the header on every page. Reads the
 * balance through a zustand selector (not `.getState()`), so it re-renders on
 * every source of change: a local award, a parent adjustment in Settings, and
 * a cloud sync (`applyMerged` calls `useLibraryStore.setState`, which
 * notifies subscribers the same as any other mutation). Flashes briefly when
 * the balance goes *up* — never on a first mount or on a decrease (a
 * redemption), so a parent deducting coins doesn't get a celebratory pop. */
function CoinPill() {
  const balance = useLibraryStore((s) => coinBalance(s.coins))
  const prevBalance = useRef(balance)
  const [pulse, setPulse] = useState(false)

  useEffect(() => {
    if (balance > prevBalance.current) {
      setPulse(true)
      const timer = setTimeout(() => setPulse(false), 900)
      prevBalance.current = balance
      return () => clearTimeout(timer)
    }
    prevBalance.current = balance
  }, [balance])

  return (
    <span
      className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold ${
        pulse ? 'animate-coin-pop' : ''
      }`}
    >
      🪙 {balance}
    </span>
  )
}

/** Global banner shown on every page (not just Settings) whenever the app
 * isn't actively backed up to Google Drive — covering all three ways that
 * can happen: never connected, manually disconnected, or connected-but-
 * broken (e.g. the refresh token expired after 7 days in OAuth "Testing"
 * mode). Without this, "not backed up" was only visible on the Settings
 * page — easy to miss, so the child's progress could go unbacked-up
 * indefinitely without anyone noticing. The button always goes through
 * connect(), which also immediately re-pulls from the cloud once it
 * succeeds (see useGoogleOAuthRedirect). Never shown when Drive isn't
 * configured at all (no OAuth client id) — there would be nothing to
 * connect the button to. */
function DriveReconnectBanner() {
  const connected = useDriveStore((s) => s.connected)
  const needsReconnect = useDriveStore((s) => s.needsReconnect)
  const connecting = useDriveStore((s) => s.status === 'connecting')
  const label = useDriveStore((s) => s.name || s.email)
  const connect = useDriveStore((s) => s.connect)

  if (!isConfigured()) return null
  const broken = connected && needsReconnect
  if (connected && !broken) return null

  const message = broken
    ? `⚠️ 与 Google Drive${label ? `（${label}）` : ''}的连接已断开，生字本暂时不会自动同步。`
    : '☁️ 还没有连接 Google Drive，生字本目前只保存在这台设备上，换设备或清除浏览器数据会丢失。'

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-900">
      <div className="max-w-4xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{message}</span>
        <button
          onClick={connect}
          disabled={connecting}
          className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition disabled:opacity-50"
        >
          {connecting ? '连接中…' : broken ? '重新连接' : '连接 Google Drive'}
        </button>
      </div>
    </div>
  )
}

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const isFullWidth = pathname === '/read'

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl shrink-0">📖</span>
            <span className="text-lg font-bold text-slate-800 truncate">
              LeoReads <span className="text-slate-400 font-normal">识字小助手</span>
            </span>
            <CoinPill />
          </div>
          <nav className="flex gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-2 rounded-lg text-sm font-medium transition ${
                    isActive
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                <span className="mr-1">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <DriveReconnectBanner />
      </header>
      <main
        className={`flex-1 mx-auto px-4 py-6 ${isFullWidth ? 'w-[80%]' : 'w-full max-w-4xl'}`}
      >
        {children}
      </main>
      <footer className="text-center text-xs text-slate-400 py-4">
        原型演示 · 数据保存在本地浏览器中
      </footer>
    </div>
  )
}
