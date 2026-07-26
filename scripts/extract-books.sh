#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    echo "Usage: $0 [source-folder-url-or-id] [dest-folder-url-or-id]"
    echo ""
    echo "  Omit arguments to use the hardcoded defaults in chinese-book-extractor.py."
    echo ""
    echo "  URL example:"
    echo "    $0 'https://drive.google.com/drive/folders/ABC123' \\"
    echo "       'https://drive.google.com/drive/folders/XYZ789'"
    echo ""
    echo "  Folder ID example:"
    echo "    $0 ABC123 XYZ789"
    exit 1
}

extract_id() {
    local input="$1"
    if [[ "$input" == http* ]]; then
        echo "$input" | grep -oP '(?<=/folders/)[a-zA-Z0-9_-]+' | head -1
    else
        echo "$input"
    fi
}

if [ -f "$SCRIPT_DIR/credentials.json" ]; then
    cd "$SCRIPT_DIR"
else
    echo "Error: credentials.json not found in $SCRIPT_DIR"
    echo "Download it from: Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client"
    exit 1
fi

ARGS=()
if [ $# -ge 1 ]; then
    ID="$(extract_id "$1")"
    if [ -z "$ID" ]; then
        echo "Error: could not parse folder ID from: $1"
        usage
    fi
    ARGS+=("$ID")
fi
if [ $# -ge 2 ]; then
    ID="$(extract_id "$2")"
    if [ -z "$ID" ]; then
        echo "Error: could not parse folder ID from: $2"
        usage
    fi
    ARGS+=("$ID")
fi

PYTHON="${SCRIPT_DIR}/../.venv/bin/python3"
if [ ! -x "$PYTHON" ]; then
    PYTHON="python3"
fi

"$PYTHON" "$SCRIPT_DIR/chinese-book-extractor.py" "${ARGS[@]}"
