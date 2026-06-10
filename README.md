# ReadIt 识字小助手

A prototype for parent-led Chinese reading practice. A parent listens to a child read a passage
aloud and taps characters to mark them as correct / wrong / newly-learned, building up a personal
character library with spaced-repetition review.

Built with Vite + React 19 + TypeScript + Tailwind CSS v4 + Zustand. Everything is stored locally
in the browser (`localStorage`), with optional Google Drive backup/sync.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173 (the dev server reloads on file changes).

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
  its text (PDF text layer via `pdf.js`, or OCR via `tesseract.js` for images), either from a
  local file or directly from Google Drive.
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
4. Create an **OAuth 2.0 Client ID** (Application type "Web application") with
   `http://localhost:5173` added to "Authorized JavaScript origins".
5. Create an **API key** restricted to the Picker API and `http://localhost:5173/*`.
6. Copy `.env.local.example` to `.env.local` and fill in both values:

   ```
   VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   VITE_GOOGLE_API_KEY=your-api-key
   ```

7. Restart `npm run dev`.

`.env.local` is gitignored (matches `*.local`) and should never be committed.
