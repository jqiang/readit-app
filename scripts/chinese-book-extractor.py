import os
import io
import re
import sys
import time
import shutil
import tempfile
import subprocess
from pathlib import Path
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.exceptions import RefreshError
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaIoBaseUpload
from google import genai

# Load .env from the same directory as this script
_env_path = Path(__file__).parent / '.env'
if _env_path.exists():
    for _line in _env_path.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith('#') and '=' in _line:
            _k, _v = _line.split('=', 1)
            os.environ.setdefault(_k.strip(), _v.strip())

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
# gemini-2.0-flash / gemini-2.5-flash are closed to new API users (404/429 limit:0);
# the -latest alias is the supported entry point.
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'gemini-flash-latest')

# Scanned picture books come in as 80MB+ PDFs of ~4000px page scans, which Gemini
# rejects with a bare 400 INVALID_ARGUMENT. Above this size, rasterize pages down
# to JPEGs before uploading.
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

SCOPES = ['https://www.googleapis.com/auth/drive']

# Only file types Gemini can process via the Files API
SUPPORTED_MIME_TYPES = {
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
}


def load_prompt():
    prompt_path = Path(__file__).parent / 'extractor-prompt.md'
    if not prompt_path.exists():
        sys.exit(f"Error: {prompt_path} not found.")
    return prompt_path.read_text(encoding='utf-8').strip()


class CurriculumProcessor:
    def __init__(self, source_folder_id, dest_folder_id):
        self.source_id = source_folder_id
        self.dest_id = dest_folder_id
        self.service = self.get_drive_service()
        self.manifest = {}
        self.prompt = load_prompt()
        if not GEMINI_API_KEY or GEMINI_API_KEY == 'PASTE_YOUR_GEMINI_API_KEY_HERE':
            sys.exit("Error: set GEMINI_API_KEY in scripts/.env before running.")
        self.client = genai.Client(api_key=GEMINI_API_KEY)

    def get_drive_service(self):
        creds = None
        token_path = Path(__file__).parent / 'token.json'
        creds_path = Path(__file__).parent / 'credentials.json'
        if token_path.exists():
            creds = Credentials.from_authorized_user_file(str(token_path), SCOPES)
        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                try:
                    creds.refresh(Request())
                except RefreshError:
                    # Refresh token expired/revoked (7-day cap while the OAuth
                    # consent screen is in "Testing") — re-run the full flow.
                    creds = None
            if not creds or not creds.valid:
                flow = InstalledAppFlow.from_client_secrets_file(str(creds_path), SCOPES)
                creds = flow.run_local_server(port=0)
            token_path.write_text(creds.to_json())
        return build('drive', 'v3', credentials=creds)

    def phase_1_ingest(self):
        print("⚡ Phase 1: Cataloging source folder...")
        query = f"'{self.source_id}' in parents and trashed = false"
        results = self.service.files().list(q=query, fields="files(id, name, mimeType)").execute()
        skipped = 0
        for item in results.get('files', []):
            if item['mimeType'] not in SUPPORTED_MIME_TYPES:
                print(f"  Skipping {item['name']!r} ({item['mimeType']})")
                skipped += 1
                continue
            self.manifest[item['id']] = {
                'name': item['name'],
                'mimeType': item['mimeType'],
                'status': 'Pending',
                'extracted_text': '',
                'title': '',
                'flag_reason': ''
            }
        print(f"  Cataloged {len(self.manifest)} files" + (f", skipped {skipped} non-PDF/image." if skipped else "."))

    def phase_2_extract(self):
        print("\n⚡ Phase 2: Extracting text via Gemini...")
        for file_id, meta in self.manifest.items():
            try:
                # Download from Drive
                request = self.service.files().get_media(fileId=file_id)
                fh = io.BytesIO()
                downloader = MediaIoBaseDownload(fh, request)
                done = False
                while not done:
                    _, done = downloader.next_chunk()

                # Upload to Gemini Files API
                suffix = os.path.splitext(meta['name'])[1] or '.pdf'
                with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                    tmp.write(fh.getvalue())
                    tmp_path = tmp.name

                try:
                    if meta['mimeType'] == 'application/pdf' and os.path.getsize(tmp_path) > MAX_UPLOAD_BYTES:
                        print(f"    downsampling oversized PDF ({os.path.getsize(tmp_path) // (1024 * 1024)}MB)...")
                        self.shrink_pdf(tmp_path)
                    gemini_file = self.client.files.upload(file=tmp_path)
                    response = self.generate_with_retry([gemini_file, self.prompt])
                    self.client.files.delete(name=gemini_file.name)
                finally:
                    os.unlink(tmp_path)

                text, flag_reason = self.split_flag(response.text.strip())
                non_empty = [l for l in text.split('\n') if l.strip()]
                meta['title'] = non_empty[0].strip() if non_empty else self.title_from_filename(meta['name'])
                meta['extracted_text'] = text
                meta['flag_reason'] = flag_reason
                meta['status'] = 'Succeeded'
                print(f"  ✓ {meta['name']}" + (f" (⚠ {flag_reason})" if flag_reason else ""))

            except Exception as e:
                meta['status'] = 'Failed'
                print(f"  ❌ {meta['name']}: {e}")

    def shrink_pdf(self, pdf_path):
        if not shutil.which('pdftoppm'):
            raise RuntimeError("pdftoppm not found — install poppler-utils to process oversized PDFs")
        from PIL import Image
        with tempfile.TemporaryDirectory() as tmpdir:
            subprocess.run(
                ['pdftoppm', '-jpeg', '-jpegopt', 'quality=80', '-scale-to', '1600',
                 pdf_path, os.path.join(tmpdir, 'pg')],
                check=True
            )
            pages = sorted(Path(tmpdir).glob('pg-*.jpg'))
            if not pages:
                raise RuntimeError("pdftoppm produced no pages")
            images = [Image.open(p) for p in pages]
            images[0].save(pdf_path, save_all=True, append_images=images[1:])

    def generate_with_retry(self, contents, attempts=3):
        for attempt in range(attempts):
            try:
                return self.client.models.generate_content(model=GEMINI_MODEL, contents=contents)
            except Exception as e:
                if 'RESOURCE_EXHAUSTED' in str(e) and attempt < attempts - 1:
                    print(f"    rate-limited, retrying in 40s ({attempt + 1}/{attempts - 1})...")
                    time.sleep(40)
                    continue
                raise

    FLAG_RE = re.compile(r'^\s*(?:FLAGGED\s*:|Flagged for Review\b)(.*)$', re.IGNORECASE | re.MULTILINE)

    def split_flag(self, text):
        """Split the model's flag marker (and anything after it) out of the story text."""
        m = self.FLAG_RE.search(text)
        if not m:
            return text, ''
        reason = (m.group(1).strip(' :') + ' ' + text[m.end():].strip()).strip()
        clean = re.sub(r'\*{3,}\s*$', '', text[:m.start()].strip()).strip()
        return clean, reason or 'flagged by extractor (no reason given)'

    def title_from_filename(self, filename):
        name = re.sub(r'\.[^.]+$', '', filename)
        name = re.sub(r'^\d+-', '', name)
        name = re.sub(r'【[^】]*】', '', name)
        return name.strip() or "Untitled"

    def phase_3_qc(self):
        print("\n⚡ Phase 3: Quality control...")
        for file_id, meta in self.manifest.items():
            if meta['status'] == 'Succeeded':
                lines = meta['extracted_text'].split('\n')
                deduped = []
                for i, line in enumerate(lines):
                    if i > 0 and line == lines[i - 1] and len(line) > 5:
                        continue
                    deduped.append(line)
                meta['extracted_text'] = "\n".join(deduped)

    def phase_4_output(self):
        print("\n⚡ Phase 4: Uploading to destination folder...")
        for file_id, meta in self.manifest.items():
            if meta['status'] == 'Succeeded':
                clean_title = re.sub(r'[\\/*?:"<>|]', ' ', meta['title']).strip() or "Untitled"
                filename = f"{clean_title}.txt"
                media = MediaIoBaseUpload(
                    io.BytesIO(meta['extracted_text'].encode('utf-8')),
                    mimetype='text/plain',
                    resumable=True
                )
                escaped = filename.replace("'", "\\'")
                existing = self.service.files().list(
                    q=f"'{self.dest_id}' in parents and name = '{escaped}' and trashed = false",
                    fields="files(id)"
                ).execute().get('files', [])
                if existing:
                    self.service.files().update(fileId=existing[0]['id'], media_body=media).execute()
                    print(f"  ✓ {filename} (updated existing)")
                else:
                    self.service.files().create(
                        body={'name': filename, 'parents': [self.dest_id]},
                        media_body=media, fields='id'
                    ).execute()
                    print(f"  ✓ {filename}")
            elif meta['status'] == 'Flagged':
                print(f"  ⚠ Flagged (needs review): {meta['name']}")

    def run_pipeline(self):
        self.phase_1_ingest()
        self.phase_2_extract()
        self.phase_3_qc()
        self.phase_4_output()
        succeeded = sum(1 for m in self.manifest.values() if m['status'] == 'Succeeded')
        failed = sum(1 for m in self.manifest.values() if m['status'] == 'Failed')
        flagged = [m for m in self.manifest.values() if m['flag_reason']]
        if flagged:
            print("\n⚠ Needs review:")
            for m in flagged:
                print(f"  - {m['name']}: {m['flag_reason']}")
        print(f"\n✅ Done: {succeeded} succeeded, {failed} failed, {len(flagged)} flagged for review out of {len(self.manifest)} total.")
        if failed:
            sys.exit(1)


DEFAULT_SOURCE_FOLDER_ID = "1ZhatRdrjm1gjXycwyuRmyzruUfS0_Hl1"
DEFAULT_DEST_FOLDER_ID = "1ri7IDoPO_9X1cEJPfw4C4lSEtAK-rSx9"

if __name__ == '__main__':
    source_id = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SOURCE_FOLDER_ID
    dest_id   = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_DEST_FOLDER_ID
    processor = CurriculumProcessor(source_id, dest_id)
    processor.run_pipeline()
