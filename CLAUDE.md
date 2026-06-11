# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LeoReads (识字小助手) is a prototype for parent-led Chinese reading practice: a parent listens to a
child read a passage aloud and taps characters to mark them as correct/wrong/learned, building up
a personal character library with spaced-repetition review.

## Commands

```bash
npm install
npm run dev       # Vite dev server at http://localhost:5173
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npx tsc -b        # type-check only (run after every change)
```

There is no test suite. `npx tsc -b` is the verification bar after each change; also run
`npx eslint <changed files>` for touched files.

## Stack

Vite + React 19 + TypeScript + Tailwind CSS v4 + Zustand (`persist` middleware, localStorage) +
HashRouter. `tsconfig` has `noUnusedLocals`/`noUnusedParameters`/`verbatimModuleSyntax: true`,
`moduleResolution: "bundler"`, no `strict`/`noImplicitAny`.

## Architecture

### Routes / pages (`src/pages/`)
- `/` Dashboard — overview, demo data seeding
- `/read` ReadingPractice — flat searchable list of `.txt` books from the Drive "ReadIt 课文"
  folder, plus manual character-marking mode (click-to-cycle)
- `/library` CharacterLibrary — browse/manage the character library
- `/review` ReviewMode — Leitner-box flashcard review
- `/import` ImportPassage — extract a passage from a PDF/image (local upload or Google Drive) and
  save it as a `.txt` file to the Drive "ReadIt 课文" folder
- `/settings` Settings — Google Drive connect/sync

### Stores (`src/store/`, all Zustand + `persist` to localStorage)
- `useLibraryStore` (`readit-library`) — `characters: Record<char, CharacterStats>` (Leitner box,
  counts, next-review time) and `sessions: ReadingSession[]`. See `lib/mastery.ts` for the box
  intervals and `getMastery()`.
- `useBookLibraryStore` (`readit-book-cache`) — book list + lazy-loaded text for `/read`. `books`
  (id/name/title/modifiedTime) comes from `listPassageFiles()`; `refresh()` re-lists the Drive
  folder. `getText(id)` downloads and caches a book's content (only `cache` is persisted,
  keyed/invalidated by `modifiedTime`), so opening hundreds of books stays cheap until selected.
- `useDriveStore` (`readit-drive`) — Google Drive connection state (connected/email/name/
  lastSyncedAt), wraps `lib/googleDrive.ts`.

### Key libs (`src/lib/`)
- `marking.ts` — character-mark state machine for Reading Practice. In-library chars cycle
  `unmarked → wrong → remove → unmarked`; not-in-library chars cycle `unmarked → learned →
  unmarked`. `getCharResults()` turns marks into `CharResult[]` for `recordSession`.
- `mastery.ts` — Leitner spaced-repetition (boxes 1-6, `applyAttempt`, `getMastery`).
- `pinyin.ts` — pinyin lookups (`pinyin-pro`, memoized) and `isChineseChar()`.
- `textExtraction.ts` — `extractTextFromPdf()` (pdfjs-dist, reads the PDF text layer) and
  `extractTextFromImage()` (tesseract.js OCR, `chi_sim` model, downloads ~10-15MB on first use).
- `googleDrive.ts` — Google Identity Services OAuth token client + Drive v3 REST: appDataFolder
  backup of the character library (`pushLibrary`/`pullLibrary`), the "ReadIt 课文" passage folder
  (`savePassageToDrive`, `listPassageFiles`), plus `ensureAccessToken()`/`downloadFile()` used by
  the Picker. Also centralizes all `declare global { interface Window { google, gapi } }` typings
  (including `google.picker.*`) to avoid declaration-merge conflicts.
- `googleDrivePicker.ts` — `pickDriveFile()`, opens the Google Drive file picker scoped to
  PDF/image mime types and returns `{id, name, mimeType}` or `null` on cancel.

## Google Cloud / Drive integration

- Project: see `gcloud config get-value project` (Google Cloud Console), under your own Google account.
- APIs enabled: Google Drive API, Google Picker API, API Keys API.
- Required env vars in `.env.local` (gitignored; see `.env.local.example`):
  - `VITE_GOOGLE_CLIENT_ID` — OAuth 2.0 Client ID (Web application), authorized JS origin
    `http://localhost:5173`. Used for sign-in and the `drive.appdata`/`drive.file`/`drive.readonly`
    scopes (`SCOPES` in `lib/googleDrive.ts`).
  - `VITE_GOOGLE_API_KEY` — browser API key restricted to the Picker API and
    `http://localhost:5173/*`. Used by the Drive Picker only.
- Restart `npm run dev` after changing `.env.local` (Vite restarts automatically on change, but
  confirm the new env values are picked up).
- If either var is missing, the affected feature (Drive sync in Settings, or "从 Drive 选择" in
  Import) shows inline setup instructions / a clear error instead of failing silently.
- The IAP OAuth Admin API (`gcloud alpha iap oauth-brands ...`) is permanently shut down — OAuth
  client / consent screen setup must be done via the Cloud Console UI. Enabling APIs and creating
  API keys (`gcloud services enable`, `gcloud alpha services api-keys create`) does work via gcloud.

### "ReadIt 课文" passage folder and `.txt` drop-in books

- `/read` sources its book list **purely** from a "ReadIt 课文" folder in the user's Drive (no
  built-in or localStorage passages). `useBookLibraryStore.refresh()` calls
  `listPassageFiles()`, which lists every `.txt` file directly inside that folder — including
  files added manually (e.g. dragged into Drive in a browser, or synced from another tool), not
  just files this app uploaded.
- To add a book: drop a `.txt` file into the "ReadIt 课文" Drive folder (create the folder first
  if it doesn't exist — `/import`'s save flow creates it automatically), then click "🔄 刷新" on
  `/read`. The list is a flat, alphabetically-sorted (`orderBy=name_natural`), searchable list —
  there is no difficulty-level classification.
- This requires the `drive.readonly` scope (added alongside `drive.appdata`/`drive.file`), because
  `drive.file` only grants access to files the app itself created. **Existing connected sessions
  do not have this scope** — go to **设置** and click "重新连接" once to re-grant access; otherwise
  `listPassageFiles()` fails with a permissions error.
- Book content is lazy-loaded and cached: `useBookLibraryStore` only fetches `id`/`name`/
  `modifiedTime` for the list, then downloads+caches a book's text via `getText(id)` only when
  selected, invalidating the cache when `modifiedTime` changes.
