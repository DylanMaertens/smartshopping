#!/usr/bin/env python3
"""Install pinned RapidOCR models, checking the vendor's SHA-256 manifest."""
import hashlib
from importlib.util import find_spec
from pathlib import Path
import sys
import urllib.request
import yaml

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
manifest = yaml.safe_load((Path(find_spec('rapidocr').origin).parent / 'default_models.yaml').read_text())['onnxruntime']
models = {
    'det': manifest['PP-OCRv6']['det']['multi_PP-OCRv6_det_small'],
    'rec': manifest['PP-OCRv6']['rec']['multi_PP-OCRv6_rec_medium'],
    'cls': manifest['PP-OCRv4']['cls']['ch_ppocr_mobile_v2.0_cls_mobile'],
}
for name, entry in models.items():
    path = root / f'{name}.onnx'
    if path.exists() and hashlib.sha256(path.read_bytes()).hexdigest() == entry['SHA256']:
        continue
    with urllib.request.urlopen(entry['model_dir'], timeout=120) as response:
        data = response.read(100 * 1024 * 1024 + 1)
    if hashlib.sha256(data).hexdigest() != entry['SHA256']:
        raise SystemExit(f'Invalid checksum: {name}')
    path.write_bytes(data)
    print(f'{name}: {len(data)} bytes, checksum verified')
