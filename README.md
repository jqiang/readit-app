# LeoReads 识字小助手

A prototype for parent-led Chinese reading practice. A parent listens to a child read a passage
aloud and taps characters to mark them as correct / wrong / newly-learned, building up a personal
character library with spaced-repetition review.

Built with Vite + React 19 + TypeScript + Tailwind CSS v4 + Zustand. Character library data is
stored locally in the browser (`localStorage`), with optional Google Drive backup/sync. A small
Vercel Edge Function backend (`api/`) handles Google OAuth token exchange and proxies the Claude
API for Import Passage, gated to a single allowed Google account.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 (the dev server reloads on file changes).

This runs the UI only — local-storage features (Reading Practice, Character Library, Review)
work fully. Google Drive sign-in/sync and Import Passage (`/import`) also need the `api/`
backend; see "Testing locally with the backend" below.

## Other commands

```bash
npm run build     # type-check (tsc -b) and build for production
npm run preview   # preview the production build
npm run lint      # eslint .
npx tsc -b        # type-check only
```

## Features

- **Reading Practice** (`/read`) — manual character marking while a child reads aloud, with
  pinyin shown above characters not yet in the library.
- **Character Library** (`/library`) — browse and manage tracked characters.
- **Review Mode** (`/review`) — Leitner-box flashcard review for due characters.
- **Import Passage** (`/import`) — turn a PDF or image into a new reading passage by extracting
  its text via the Claude API, either from a local file or directly from Google Drive.
- **Settings** (`/settings`) — connect Google Drive to back up/restore your character library and
  enable importing passages from Drive.

## Google Drive setup (optional)

The Drive features (cloud sync in Settings, "import from Drive" in Import Passage) require a
Google Cloud project with OAuth + an API key. Without this configuration, those features show
inline setup instructions and the rest of the app works normally with local storage only.

1. Create/select a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Drive API** and **Google Picker API**.
3. Configure the OAuth consent screen (User type "External", keep it in "Testing", add your own
   Google account as a test user).
4. Create an **OAuth 2.0 Client ID** (Application type "Web application"):
   - Add `http://localhost:5173` to "Authorized JavaScript origins" (add your production URL,
     e.g. `https://<your-app>.vercel.app`, once you've deployed).
   - Add `http://localhost:5173/` to "Authorized redirect URIs" (add your production URL with a
     trailing slash, e.g. `https://<your-app>.vercel.app/`, once you've deployed). This must
     exactly match the page origin plus `/`.
   - Note the **Client secret** (click into the client, it's shown alongside the Client ID) —
     you'll need it for `GOOGLE_CLIENT_SECRET` below.
5. Create an **API key** restricted to the Picker API and `http://localhost:5173/*`.
6. Copy `.env.local.example` to `.env.local` and fill in the **client vars**:

   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-api-key
   VITE_GOOGLE_PROJECT_NUMBER=your-project-number
   ```

7. Also fill in the **server-only vars** in `.env.local` (used by `vercel dev`, see "Testing
   locally with the backend" below — `npm run dev` alone can't complete Google sign-in):

   ```
   GOOGLE_CLIENT_SECRET=your-client-secret
   ALLOWED_EMAIL=your-google-account@gmail.com
   ```

8. Restart the dev server.

## Import Passage (Claude API) setup (optional)

Get an API key from [console.anthropic.com](https://console.anthropic.com), then choose one of:

- **Dev convenience**: set `VITE_ANTHROPIC_API_KEY` in `.env.local`. `npm run dev` then calls the
  Claude API directly from the browser. **Never set this in production** — it would ship the key
  to every visitor.
- **Proxied (the production path)**: set `ANTHROPIC_API_KEY` (no `VITE_` prefix) and
  `ALLOWED_EMAIL`. Extraction goes through `/api/extract-text`, gated to the signed-in
  `ALLOWED_EMAIL` Google account. This is the only option in production, and is also used
  whenever `VITE_ANTHROPIC_API_KEY` is unset (including under `vercel dev`).

## Testing locally with the backend

`npx vercel dev` serves the Vite app and the `api/` Edge Functions together (with HMR), so it
exercises the same paths as production — Google sign-in via redirect, silent token refresh, and
the `/import` Claude proxy.

1. One-time setup: `npm install -g vercel`, `vercel login`, `vercel link` (links this directory to
   a Vercel project, creating one if needed).
2. Make sure `.env.local` has `GOOGLE_CLIENT_SECRET`, `ALLOWED_EMAIL`, and `ANTHROPIC_API_KEY` set,
   and `VITE_ANTHROPIC_API_KEY` unset (so `/import` goes through the proxy).
3. Run `npx vercel dev` and open the printed URL.
4. In **Settings**, click "连接 Google Drive" — this redirects to Google's consent screen;
   approve, and you'll be redirected back to the same page, now showing "已连接：...".
5. In **Import Passage**, upload a PDF or image and confirm extraction works via
   `/api/extract-text`.
6. To verify the allowlist, temporarily set `ALLOWED_EMAIL` to a different address, restart
   `vercel dev`, and confirm both Drive connect and `/import` fail with a clear error (403).
   Restore `ALLOWED_EMAIL` afterward.

## Deploying to Vercel

1. `npm install -g vercel`, `vercel login`, `vercel link` (one-time, if not already done above).
2. In the Vercel project's **Settings > Environment Variables** (Production and Preview), set:
   - Server-only (no `VITE_` prefix): `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `ALLOWED_EMAIL`.
   - Client: `VITE_GOOGLE_CLIENT_ID`, `VITE_GOOGLE_API_KEY`, `VITE_GOOGLE_PROJECT_NUMBER`.
   - Do **not** set `VITE_ANTHROPIC_API_KEY` in Vercel — that would ship the key to the browser
     and skip the `ALLOWED_EMAIL` check.
3. In the Cloud Console, add the deployed URL (e.g. `https://<your-app>.vercel.app`) to the OAuth
   client's **Authorized JavaScript origins**, and the same URL with a trailing slash (e.g.
   `https://<your-app>.vercel.app/`) to **Authorized redirect URIs**. Also add the deployed origin
   to the Picker API key's HTTP referrer restrictions.
4. Deploy with `vercel --prod`, or push to the connected git branch if using Vercel's Git
   integration.
5. Smoke test on the deployed URL: connect Google Drive (full OAuth redirect round trip), then
   confirm sync and `/import` both work.

---

`.env.local` is gitignored (matches `*.local`) and should never be committed.

**Note on the OAuth "Testing" publish status**: while the consent screen stays in "Testing"
(the default, and what step 3 above sets up), Google caps refresh tokens at 7 days — after about
a week you'll need to click "连接 Google Drive" again to re-consent. Moving the consent screen to
"In production" removes this cap but requires Google's app verification process (separate,
larger effort, out of scope here).
