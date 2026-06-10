import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.mjs?url'
import * as Tesseract from 'tesseract.js'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

/** Render a PDF page to a canvas at a resolution suitable for OCR. */
async function renderPageToCanvas(page: pdfjsLib.PDFPageProxy): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return canvas
}

/**
 * Extract text from a PDF, joining pages with blank lines. Pages that have
 * no text layer (e.g. scanned/photographed worksheets) are rendered to an
 * image and OCR'd with Tesseract instead.
 */
export async function extractTextFromPdf(
  file: File | Blob,
  onProgress?: (progress: number, status: string) => void,
): Promise<string> {
  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pages: string[] = []
  let ocrWorker: Tesseract.Worker | null = null

  try {
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if ('str' in item) {
          text += item.str
          if (item.hasEOL) text += '\n'
        }
      }
      text = text.trim()

      if (!text) {
        onProgress?.((i - 1) / pdf.numPages, `正在识别第 ${i}/${pdf.numPages} 页（无文字层，使用 OCR）…`)
        ocrWorker ??= await Tesseract.createWorker('chi_sim', undefined, {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              onProgress?.(
                (i - 1 + m.progress) / pdf.numPages,
                `正在识别第 ${i}/${pdf.numPages} 页（无文字层，使用 OCR）…`,
              )
            }
          },
        })
        const canvas = await renderPageToCanvas(page)
        const result = await ocrWorker.recognize(canvas)
        text = result.data.text.trim()
      }

      pages.push(text)
      onProgress?.(i / pdf.numPages, `正在解析第 ${i}/${pdf.numPages} 页…`)
    }
  } finally {
    await ocrWorker?.terminate()
  }

  return pages.join('\n\n')
}

/**
 * OCR an image with Tesseract (Simplified Chinese model). The Chinese
 * language data (~10-15MB) is downloaded on first use and cached by the
 * browser afterwards.
 */
export async function extractTextFromImage(
  file: File | Blob,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const result = await Tesseract.recognize(file, 'chi_sim', {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
  return result.data.text
}

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}
