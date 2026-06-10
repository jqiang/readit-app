import { Link } from 'react-router-dom'
import { useDriveStore } from '../store/useDriveStore'
import { isConfigured } from '../lib/googleDrive'

export default function Settings() {
  const drive = useDriveStore()

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
            <p className="text-sm text-slate-600">
              已连接：{drive.name || drive.email}
            </p>
            <p className="text-xs text-slate-400">
              {drive.lastSyncedAt
                ? `上次同步：${new Date(drive.lastSyncedAt).toLocaleString('zh-CN')}`
                : '还没有同步过'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={drive.pushToCloud}
                disabled={drive.status === 'syncing'}
                className="px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50"
              >
                推送到云端
              </button>
              <button
                onClick={() => {
                  if (
                    confirm('从云端恢复将覆盖本地的生字本和练习记录，确定吗？')
                  ) {
                    drive.pullFromCloud()
                  }
                }}
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
