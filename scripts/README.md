# chinese-book-extractor

Batch-extracts Chinese text from PDFs in a Google Drive source folder using Gemini AI, then writes clean `.txt` files to a destination folder — ready to drop into the LeoReads **ReadIt 课文** folder.

## How it works

| Phase | What happens |
|-------|-------------|
| 1 Ingest | Lists all files in the source Drive folder |
| 2 Extract | Downloads each PDF, uploads it to the Gemini Files API, prompts Gemini to extract the title and story text, then deletes the temp file |
| 3 QC | Removes consecutive duplicate lines longer than 5 characters |
| 4 Output | Uploads a `<title>.txt` file to the destination Drive folder |

Titles come from the first line of Gemini's response. If extraction fails, the title falls back to the filename (numeric prefixes and publisher tags stripped).

## Setup

### 1. Gemini API key

Open [chinese-book-extractor.py](chinese-book-extractor.py) and paste your key at the top:

```python
GEMINI_API_KEY = "PASTE_YOUR_GEMINI_API_KEY_HERE"
```

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

### 2. Google Drive credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com) → **APIs & Services → Credentials**
2. Create an **OAuth 2.0 Client ID** (Desktop app)
3. Download the JSON and save it as `scripts/credentials.json`
4. Enable the **Google Drive API** for your project

The first run opens a browser for OAuth consent. Subsequent runs reuse the saved `token.json`.

### 3. Python dependencies

```bash
pip install google-api-python-client google-auth-oauthlib google-auth google-generativeai
```

## Usage

### Bash wrapper (recommended)

```bash
# Use hardcoded default folder IDs
./scripts/extract-books.sh

# Pass Drive folder URLs
./scripts/extract-books.sh \
  'https://drive.google.com/drive/folders/SOURCE_FOLDER_ID' \
  'https://drive.google.com/drive/folders/DEST_FOLDER_ID'

# Pass folder IDs directly
./scripts/extract-books.sh SOURCE_FOLDER_ID DEST_FOLDER_ID
```

### Python directly

```bash
python3 scripts/chinese-book-extractor.py
# or with explicit IDs:
python3 scripts/chinese-book-extractor.py SOURCE_FOLDER_ID DEST_FOLDER_ID
```

## Files

| File | Purpose |
|------|---------|
| `chinese-book-extractor.py` | Main pipeline script |
| `extract-books.sh` | Bash wrapper — parses Drive URLs and calls the Python script |
| `credentials.json` | OAuth client credentials (not committed) |
| `token.json` | Saved OAuth token (auto-created on first run, not committed) |

## Notes

- The destination folder accumulates files on every run — duplicates are not detected or overwritten
- Files that are not PDFs or images (e.g. subfolders) will fail and be skipped
- Gemini model is set to `gemini-2.0-flash`; change it in the constructor if you want a different model
