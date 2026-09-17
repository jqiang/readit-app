import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDriveStore } from '../store/useDriveStore'
import { useLibraryStore } from '../store/useLibraryStore'
import { isConfigured } from '../lib/googleDrive'
import { COIN_REASON_LABELS, coinBalance, recentCoinEntries } from '../lib/coins'

export default function Settings() {
  const drive = useDriveStore()
  const coins = useLibraryStore((s) => s.coins)
  const balance = useLibraryStore((s) => coinBalance(s.coins))
  const adjustCoins = useLibraryStore((s) => s.adjustCoins)
  const history = recentCoinEntries(coins, 10)

  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [coinFeedback, setCoinFeedback] = useState<string | null>(null)

  function handleCoinAdjust(sign: 1 | -1) {
    const n = Number(amount)
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      setCoinFeedback('请输入一个大于 0 的整数金额')
      return
    }
    const signed = sign * n
    const noteText = note.trim() || undefined
    adjustCoins(signed, noteText)
    if (sign === -1 && balance + signed < 0) {
      setCoinFeedback(`⚠️ 已兑换 ${n} 个金币，余额变为负数（${balance + signed}）`)
    } else {
      setCoinFeedback(sign === 1 ? `已奖励 ${n} 个金币` : `已兑换 ${n} 个金币`)
    }
    setAmount('')
    setNote('')
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold text-slate-800">设置</h1>
        <p className="text-slate-500 mt-1">管理云端同步和数据备份。</p>
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-bold text-slate-800">☁️ Google Drive 同步</h2>

        {!isConfigured() ? (
          <div className="text-sm text-slate-500 space-y-2">
            <p>还没有配置 Google Drive 登录。需要先完成以下步骤：</p>
            <ol className="list-decimal list-inside space-y-1 text-slate-600">
              <li>
                打开{' '}
                <a
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-600 underline"
                >
                  Google Cloud Console
                </a>
                ，新建一个项目
              </li>
              <li>启用「Google Drive API」</li>
              <li>
                配置 OAuth 同意屏幕（用户类型选「外部」，发布状态保持「测试」，把自己的
                Google 账号添加为测试用户）
              </li>
              <li>
                创建 OAuth 客户端 ID（应用类型选「Web 应用」），并将开发服务器地址（如{' '}
                <code className="bg-slate-100 px-1 rounded">http://localhost:5173</code>
                ）添加到「已获授权的 JavaScript 来源」
              </li>
              <li>
                把客户端 ID 填入项目根目录的{' '}
                <code className="bg-slate-100 px-1 rounded">.env.local</code> 文件（可参考{' '}
                <code className="bg-slate-100 px-1 rounded">.env.local.example</code>）：
                <pre className="mt-1 bg-slate-100 rounded-lg p-2 text-xs overflow-x-auto">
                  VITE_GOOGLE_CLIENT_ID=你的客户端ID.apps.googleusercontent.com
                </pre>
              </li>
              <li>重启开发服务器（重新运行 npm run dev）</li>
            </ol>
          </div>
        ) : !drive.connected ? (
          <>
            <p className="text-sm text-slate-500">
              连接后可以把生字本和练习记录备份到你的 Google Drive，并在其他设备上恢复。
            </p>
            <button
              onClick={drive.connect}
              disabled={drive.status === 'connecting'}
              className="px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
            >
              {drive.status === 'connecting' ? '连接中…' : '连接 Google Drive'}
            </button>
          </>
        ) : (
          <>
            {drive.needsReconnect && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                ⚠️ 连接已过期，需要重新登录才能继续同步。
              </p>
            )}
            <p className="text-sm text-slate-600">
              已连接：{drive.name || drive.email}
            </p>
            <p className="text-xs text-slate-400">
              {drive.lastSyncedAt
                ? `上次同步：${new Date(drive.lastSyncedAt).toLocaleString('zh-CN')}`
                : '还没有同步过'}
            </p>
            <p className="text-xs text-slate-400">已开启自动同步：每 60 秒与云端互相同步</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={drive.pushToCloud}
                disabled={drive.status === 'syncing'}
                className="px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
              >
                推送到云端
              </button>
              <button
                onClick={drive.pullFromCloud}
                disabled={drive.status === 'syncing'}
                className="px-4 py-2 rounded-lg font-medium bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 transition disabled:opacity-50"
              >
                从云端恢复
              </button>
              <button
                onClick={drive.connect}
                disabled={drive.status === 'connecting'}
                className="px-4 py-2 rounded-lg font-medium bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 transition disabled:opacity-50"
              >
                重新连接
              </button>
              <button
                onClick={drive.disconnect}
                className="px-4 py-2 rounded-lg font-medium bg-white border border-slate-200 text-slate-400 hover:border-rose-300 hover:text-rose-500 transition"
              >
                断开连接
              </button>
            </div>
          </>
        )}

        {drive.error && <p className="text-sm text-rose-600">{drive.error}</p>}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3">
        <h2 className="font-bold text-slate-800">🪙 金币管理</h2>
        <p className="text-sm text-slate-600">
          当前余额：<span className="font-bold text-amber-600">{balance}</span> 个金币
        </p>

        <div className="flex flex-wrap gap-2">
          <input
            type="number"
            min={1}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="数量"
            className="w-24 px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（可选），例如：换玩具"
            className="flex-1 min-w-[160px] px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white"
          />
          <button
            onClick={() => handleCoinAdjust(-1)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-rose-600 text-white hover:bg-rose-700 transition"
          >
            ➖ 兑换
          </button>
          <button
            onClick={() => handleCoinAdjust(1)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition"
          >
            ➕ 奖励
          </button>
        </div>
        {coinFeedback && <p className="text-xs text-slate-500">{coinFeedback}</p>}

        {history.length > 0 && (
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-400 mb-2">最近记录</h3>
            <ul className="divide-y divide-slate-100">
              {history.map((e) => (
                <li key={e.id} className="py-2 flex items-center justify-between gap-2 text-sm">
                  <div className="min-w-0">
                    <div className="text-slate-700">
                      {COIN_REASON_LABELS[e.reason]}
                      {e.note && <span className="text-slate-400 ml-1">· {e.note}</span>}
                    </div>
                    <div className="text-xs text-slate-400">
                      {new Date(e.date).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  <span
                    className={`font-semibold shrink-0 ${
                      e.amount > 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {e.amount > 0 ? '+' : ''}
                    {e.amount}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-2">
        <h2 className="font-bold text-slate-800">📄 导入课文</h2>
        <p className="text-sm text-slate-500">
          从 PDF 或图片中提取文字，生成新课文。支持本地上传，连接 Google Drive 后还可以直接从
          Drive 中选择文件。
        </p>
        <Link
          to="/import"
          className="inline-block px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
        >
          前往导入页面
        </Link>
      </section>
    </div>
  )
}
