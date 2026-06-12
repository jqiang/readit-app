import { useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDriveStore } from '../store/useDriveStore'
import { useBookLibraryStore } from '../store/useBookLibraryStore'
import {
  isConfigured as isDriveConfigured,
  downloadFile,
  savePassageToDrive,
} from '../lib/googleDrive'
import { pickDriveFile } from '../lib/googleDrivePicker'
import { extractTextFromFile, isPdfFile, isImageFile, isClaudeConfigured } from '../lib/textExtraction'

type Stage = 'select' | 'extracting' | 'review' | 'saved'

export default function ImportPassage() {
  const driveConnected = useDriveStore((s) => s.connected)
  const refreshBooks = useBookLibraryStore((s) => s.refresh)
  const driveReady = isDriveConfigured() && driveConnected
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('select')
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [progress, setProgress] = useState(0)
  const [extractedText, setExtractedText] = useState('')
  const [title, setTitle] = useState('')
  const [driveSync, setDriveSync] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [driveSyncError, setDriveSyncError] = useState<string | null>(null)

  function reset() {
    setStage('select')
    setError(null)
    setStatusMessage('')
    setProgress(0)
    setExtractedText('')
    setTitle('')
    setDriveSync('idle')
    setDriveSyncError(null)
  }

  async function processFiles(files: File[]) {
    if (files.length === 0) return
    setError(null)
    setProgress(0)
    setStage('extracting')
    try {
      const texts: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        if (!isPdfFile(file) && !isImageFile(file)) {
          throw new Error(`不支持的文件类型：${file.name}`)
        }
        setStatusMessage(
          files.length > 1
            ? `正在识别第 ${i + 1}/${files.length} 个文件（${file.name}）…`
            : '正在识别文字…',
        )
        const text = await extractTextFromFile(file)
        if (text.trim()) texts.push(text.trim())
        setProgress((i + 1) / files.length)
      }
      if (texts.length === 0) throw new Error('没有识别到文字，请尝试其他文件')
      setExtractedText(texts.join('\n\n'))
      setTitle(files[0].name.replace(/\.[^.]+$/, ''))
      setStage('review')
    } catch (err) {
      setError(err instanceof Error ? err.message : '提取文字失败')
      setStage('select')
    }
  }

  function handleLocalFile(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    void processFiles(Array.from(files)).finally(() => {
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  async function handleDrivePick() {
    setError(null)
    try {
      const picked = await pickDriveFile()
      if (!picked) return
      setStage('extracting')
      setStatusMessage('正在从 Drive 下载文件…')
      const blob = await downloadFile(picked.id)
      const file = new File([blob], picked.name, { type: picked.mimeType })
      await processFiles([file])
    } catch (err) {
      setError(err instanceof Error ? err.message : '从 Drive 导入失败')
      setStage('select')
    }
  }

  function handleSave() {
    if (!title.trim() || !extractedText.trim() || !driveReady) return
    const trimmedTitle = title.trim()
    const trimmedText = extractedText.trim()
    setStage('saved')
    setDriveSync('syncing')
    savePassageToDrive(trimmedTitle, trimmedText)
      .then(() => {
        setDriveSync('done')
        return refreshBooks()
      })
      .catch((err) => {
        setDriveSync('error')
        setDriveSyncError(err instanceof Error ? err.message : '同步到 Drive 失败')
      })
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-bold text-slate-800">导入课文</h1>
        <p className="text-slate-500 mt-1">从 PDF 或图片中提取文字，生成新的朗读课文。</p>
      </section>

      {error && (
        <div className="bg-rose-50 border border-rose-100 text-rose-600 text-sm rounded-xl p-3">
          {error}
        </div>
      )}

      {!isClaudeConfigured() && (
        <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800 space-y-2">
          <p className="font-medium">ℹ️ 未配置 VITE_ANTHROPIC_API_KEY</p>
          <p>
            提取文字会通过{' '}
            <code className="bg-amber-100 px-1 rounded">/api/extract-text</code> 代理调用 Claude
            API —— 这需要用{' '}
            <code className="bg-amber-100 px-1 rounded">npx vercel dev</code> 启动（而不是{' '}
            <code className="bg-amber-100 px-1 rounded">npm run dev</code>），并在{' '}
            <code className="bg-amber-100 px-1 rounded">.env.local</code> 中配置好{' '}
            <code className="bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> 和{' '}
            <code className="bg-amber-100 px-1 rounded">ALLOWED_EMAIL</code>。
          </p>
          <p>
            如果只想用 <code className="bg-amber-100 px-1 rounded">npm run dev</code>，可以在{' '}
            <code className="bg-amber-100 px-1 rounded">.env.local</code> 中额外配置{' '}
            <code className="bg-amber-100 px-1 rounded">VITE_ANTHROPIC_API_KEY</code>
            （从{' '}
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Anthropic Console
            </a>{' '}
            获取），让浏览器直接调用 Claude API，然后重启开发服务器。
          </p>
        </section>
      )}

      {stage === 'select' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <div>
            <h2 className="font-bold text-slate-800 mb-2">📁 本地文件</h2>
            <p className="text-sm text-slate-500 mb-3">
              选择一个或多个 PDF / 图片文件（JPG / PNG / WEBP），可多选。
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf,image/*"
              multiple
              onChange={handleLocalFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              选择文件
            </button>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <h2 className="font-bold text-slate-800 mb-2">☁️ Google Drive</h2>
            {!isDriveConfigured() || !driveConnected ? (
              <p className="text-sm text-slate-400">请先在「设置」中连接 Google Drive。</p>
            ) : (
              <>
                <p className="text-sm text-slate-500 mb-3">
                  从你的 Google Drive 中选择 PDF 或图片文件。
                </p>
                <button
                  onClick={handleDrivePick}
                  className="px-4 py-2 rounded-lg font-medium bg-white border border-slate-200 text-slate-600 hover:border-indigo-300 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  从 Drive 选择
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {stage === 'extracting' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 text-center">
          <div className="text-3xl animate-pulse">⏳</div>
          <p className="text-slate-600">{statusMessage}</p>
          {progress > 0 && (
            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 transition-all"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          )}
        </section>
      )}

      {stage === 'review' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
          <h2 className="font-bold text-slate-800">检查并保存课文</h2>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">标题</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">课文内容</label>
            <textarea
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              rows={10}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm leading-relaxed"
            />
            <p className="text-xs text-slate-400 mt-1">可以手动修正识别错误的文字。</p>
          </div>
          {!driveReady && (
            <p className="text-sm text-amber-600">
              请先在「设置」中连接 Google Drive，才能保存课文。
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!title.trim() || !extractedText.trim() || !driveReady}
              className="px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              保存课文
            </button>
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg font-medium bg-white border border-slate-200 text-slate-600 hover:border-slate-300 transition"
            >
              取消
            </button>
          </div>
        </section>
      )}

      {stage === 'saved' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-3 text-center">
          {driveSync === 'syncing' && (
            <>
              <div className="text-3xl animate-pulse">⏳</div>
              <p className="text-slate-600">正在保存到 Google Drive…</p>
            </>
          )}
          {driveSync === 'done' && (
            <>
              <div className="text-3xl">✅</div>
              <p className="text-slate-600">
                已保存到 Google Drive 的「ReadIt 课文」文件夹：{title}.txt
              </p>
            </>
          )}
          {driveSync === 'error' && (
            <>
              <div className="text-3xl">⚠️</div>
              <p className="text-rose-500">保存到 Google Drive 失败：{driveSyncError}</p>
            </>
          )}
          <div className="flex justify-center gap-2">
            {driveSync === 'error' ? (
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition"
              >
                重试
              </button>
            ) : (
              <button
                onClick={() => navigate('/read')}
                className="px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition"
              >
                去朗读练习
              </button>
            )}
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg font-medium bg-white border border-slate-200 text-slate-600 hover:border-slate-300 transition"
            >
              继续导入
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
