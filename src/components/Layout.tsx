import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const navItems = [
  { to: '/', label: '首页', icon: '🏠' },
  { to: '/read', label: '朗读练习', icon: '📖' },
  { to: '/library', label: '生字本', icon: '📚' },
  { to: '/review', label: '巩固复习', icon: '🎯' },
  // Import uses a Claude API key that's only configured for local dev.
  ...(import.meta.env.DEV ? [{ to: '/import', label: '导入课文', icon: '📥' }] : []),
  { to: '/settings', label: '设置', icon: '⚙️' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const isFullWidth = pathname === '/read'

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📖</span>
            <span className="text-lg font-bold text-slate-800">
              LeoReads <span className="text-slate-400 font-normal">识字小助手</span>
            </span>
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
