#!/usr/bin/env bash
# Python 3.12+; model downloads happen during setup only, never during recognition.
set -euo pipefail
repo_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
ocr_dir="$repo_dir/.local-dev/ocr"
python_binary=${OCR_SETUP_PYTHON:-python3}
"$python_binary" -c 'import sys; assert (3,12) <= sys.version_info[:2] < (3,14), "Utiliser Python 3.12 ou 3.13 pour les dépendances OCR."'
"$python_binary" -m venv "$ocr_dir/venv"
"$ocr_dir/venv/bin/python" -m pip install --no-cache-dir -r "$repo_dir/backend/ocr/requirements.txt"
"$ocr_dir/venv/bin/python" "$repo_dir/backend/ocr/install-models.py" "$ocr_dir/models"
printf 'OCR installé. Le lanceur Android le détectera au prochain démarrage.\n'
