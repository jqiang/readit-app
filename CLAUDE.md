# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

LeoReads (识字小助手) is a prototype for parent-led Chinese reading practice: a parent listens to a
child read a passage aloud and taps characters to mark them as correct/wrong/learned, building up
a personal character library with spaced-repetition review.

## Commands

```bash
npm install
npm run dev       # Vite dev server at http://localhost:5173 (UI only, see below)
npm run build     # tsc -b && vite build
npm run lint      # eslint .
npm test          # vitest run (Vitest, node env)
npx tsc -b        # type-check only (run after every change)
npx vercel dev    # Vite + api/ Edge Functions together — required for Google Drive
                   # connect/sync and /import (one-time: npm install -g vercel &&
                   # vercel login && vercel link)
```

`npx tsc -b` is the verification bar after each change; also run `npx eslint <changed files>` for
touched files. The only tests so far are `src/lib/librarySync.test.ts` (Vitest), covering the
additive cloud-merge data-safety invariants — run with `npm test`.

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
- `textExtraction.ts` — `extractTextFromFile()` extracts passage text from a PDF/image via the
  Claude API. Dev path (when `VITE_ANTHROPIC_API_KEY` is set): calls the Anthropic SDK directly
  from the browser (dynamically imported so it's excluded from the prod bundle). Otherwise: calls
  `/api/extract-text` with `Authorization: Bearer <google-access-token>` from
  `ensureAccessToken()`. `isClaudeConfigured()` is `import.meta.env.DEV ?
  Boolean(VITE_ANTHROPIC_API_KEY) : true` — the dev-only setup banner in `ImportPassage.tsx` only
  shows when the dev path is unconfigured.
- `googleDrive.ts` — Google OAuth Authorization Code flow with refresh tokens. `connect()`
  redirects the page to Google's consent screen (`access_type=offline&prompt=consent`);
  `handleOAuthRedirect()` (called from `useGoogleOAuthRedirect`) exchanges the returned `?code=`
  via `/api/google-token` and stores `{accessToken, expiresAt, refreshToken}` in `localStorage`.
  `requestToken()` silently refreshes via `/api/google-token` (`grant: 'refresh_token'`) and only
  falls back to a full-page `connect()` redirect when the refresh token is missing/expired. Also:
  appData backup (`pushLibrary`/`pullLibrary`), the "ReadIt 课文" passage folder
  (`savePassageToDrive`, `listPassageFiles`), `ensureAccessToken()`/`downloadFile()` used by the
  Picker, and the `declare global { interface Window { google, gapi } }` Picker typings.
- `googleDrivePicker.ts` — `pickDriveFile()`, opens the Google Drive file picker scoped to
  PDF/image mime types and returns `{id, name, mimeType}` or `null` on cancel.

### Backend (`api/`, Vercel Edge Functions)

- `api/extract-text.ts` — proxies `/import`'s text extraction to the Claude API using the
  server-only `ANTHROPIC_API_KEY`. Requires `Authorization: Bearer <google-access-token>` and
  checks the caller against `ALLOWED_EMAIL` via `api/_lib/googleAuth.ts`.
- `api/google-token.ts` — Google OAuth token exchange backing `googleDrive.ts`'s Authorization
  Code flow: `grant: 'authorization_code'` (initial exchange; also checks `ALLOWED_EMAIL` and
  revokes the token on mismatch), `grant: 'refresh_token'` (silent refresh), `grant: 'revoke'`
  (disconnect). Uses the server-only `GOOGLE_CLIENT_SECRET`.
- `api/_lib/googleAuth.ts` — shared `checkAllowedUser(accessToken)` helper, same
  `drive/v3/about?fields=user` pattern as `getDriveUser()`. Both endpoints above check
  `process.env.ALLOWED_EMAIL` is set *before* calling this and return 500 if not — fail closed,
  never silently allow everyone through.
- `tsconfig.api.json` — third project reference (alongside `tsconfig.app.json`/
  `tsconfig.node.json`) so `npx tsc -b` type-checks `api/` too (`lib: ["ES2023", "DOM"]` for
  `Request`/`Response`/`fetch`/`crypto`, `types: ["node"]` for `process.env`).

## Google Cloud / Drive integration

- Project: see `gcloud config get-value project` (Google Cloud Console), under your own Google account.
- APIs enabled: Google Drive API, Google Picker API, API Keys API.
- Env vars (gitignored `.env.local`; see `.env.local.example`):
  - **Client (`VITE_*`, bundled into the app — not secrets by design)**:
    - `VITE_GOOGLE_CLIENT_ID` — OAuth 2.0 Client ID (Web application). Used for sign-in
      (`SCOPES` in `lib/googleDrive.ts`: `drive.appdata`/`drive.file`/`drive.readonly`) and to
      build the Authorization Code redirect URL.
    - `VITE_GOOGLE_API_KEY` — browser API key restricted to the Picker API. Used by the Drive
      Picker only.
    - `VITE_GOOGLE_PROJECT_NUMBER` — passed to the Picker via `setAppId`.
    - `VITE_ANTHROPIC_API_KEY` — optional, dev-only direct-to-Claude path for `/import` (see
      `textExtraction.ts`). Never set in production.
  - **Server-only (no `VITE_` prefix; Vercel dashboard for prod, `.env.local` for `vercel dev`)**:
    - `GOOGLE_CLIENT_SECRET` — from the same OAuth client as `VITE_GOOGLE_CLIENT_ID` (Credentials
      > the client > "Client secret"). Used by `api/google-token.ts`.
    - `ANTHROPIC_API_KEY` — used by `api/extract-text.ts`.
    - `ALLOWED_EMAIL` — single email (case-insensitive) allowed to use the backend. Both `api/`
      endpoints fail closed (500) if this is unset.
- The OAuth client needs **Authorized JavaScript origins** *and* **Authorized redirect URIs** for
  every origin the app runs on (`http://localhost:5173`, the production URL). Redirect URIs need
  a trailing slash (`http://localhost:5173/`, `https://<app>.vercel.app/`) — `getRedirectUri()` in
  `lib/googleDrive.ts` builds `${window.location.origin}/`, which must match exactly.
- **`npm run dev` (plain Vite) cannot complete Google sign-in** — Drive connect/sync and
  `/import` need `/api/google-token` and `/api/extract-text`. Use `npx vercel dev` to run Vite +
  `api/` together with HMR. `npm run dev` is still fine for UI-only work that doesn't touch Drive
  or `/import`.
- Restart the dev server after changing `.env.local`.
- If the client vars are missing, the affected feature (Drive sync in Settings, or "从 Drive 选择" in
  Import) shows inline setup instructions / a clear error instead of failing silently.
- The IAP OAuth Admin API (`gcloud alpha iap oauth-brands ...`) is permanently shut down — OAuth
  client / consent screen setup must be done via the Cloud Console UI. Enabling APIs and creating
  API keys (`gcloud services enable`, `gcloud alpha services api-keys create`) does work via gcloud.
- **Refresh tokens are capped at 7 days** while the OAuth consent screen is in "Testing" publish
  status — `requestToken()` falls back to a full-page `connect()` redirect for re-consent once
  the refresh token expires/is revoked. Moving to "In production" lifts this cap but requires
  Google app verification (separate, larger effort).

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
