"""Read a bounded image from stdin, run local OCR, emit text only. No image files."""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import warnings


def prepare_image(image_bytes):
    from PIL import Image, ImageOps
    Image.MAX_IMAGE_PIXELS = 12_000_000
    warnings.simplefilter('error', Image.DecompressionBombWarning)
    try:
        image = Image.open(io.BytesIO(image_bytes))
        if image.format not in ('JPEG', 'PNG') or image.width * image.height > 12_000_000:
            raise ValueError('invalid dimensions or format')
        image.load()
        image = ImageOps.exif_transpose(image).convert('RGB')
        image.thumbnail((2400, 2400))
        # A margin keeps tightly cropped handwriting from being split at the edges.
        return ImageOps.expand(image, border=80, fill='white')
    except Exception:
        raise SystemExit(2)


def recognize(image_bytes):
    image = prepare_image(image_bytes)
    root = Path(os.environ['OCR_MODELS_DIR'])
    # Explicit paths: recognition must never download models or send photos away.
    paths = {key: root / name for key, name in (
        ('Det.model_path', 'det.onnx'), ('Rec.model_path', 'rec.onnx'), ('Cls.model_path', 'cls.onnx'))}
    if not all(path.is_file() for path in paths.values()):
        raise RuntimeError('models missing')
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        from rapidocr import RapidOCR, OCRVersion, ModelType
        engine = RapidOCR(params={**{key: str(path) for key, path in paths.items()},
            'Global.log_level': 'error', 'Det.ocr_version': OCRVersion.PPOCRV6,
            'Rec.ocr_version': OCRVersion.PPOCRV6, 'Det.model_type': ModelType.SMALL,
            'Rec.model_type': ModelType.MEDIUM,
            'Det.mean': [0.5, 0.5, 0.5], 'Det.std': [0.5, 0.5, 0.5], 'EngineConfig.onnxruntime.intra_op_num_threads': 2,
            'EngineConfig.onnxruntime.inter_op_num_threads': 1})
        result = engine(np.asarray(image)[:, :, ::-1])
    lines = list(result.txts or [])
    text = '\n'.join(lines)
    if len(text.encode('utf-8')) > 20_000:
        raise SystemExit(2)
    return {'text': text}


if __name__ == '__main__':
    data = sys.stdin.buffer.read(3 * 1024 * 1024 + 1)
    if not data or len(data) > 3 * 1024 * 1024:
        raise SystemExit(2)
    print(json.dumps(recognize(data), ensure_ascii=False))
