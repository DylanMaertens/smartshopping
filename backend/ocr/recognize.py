"""Read a bounded image from stdin, run local OCR, emit text only. No image files."""
import contextlib
import io
import json
import math
import os
from pathlib import Path
import re
from statistics import median
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


def rectangle(box):
    """Normalize RapidOCR quads; malformed geometry must not lose recognized text."""
    try:
        points = [(float(point[0]), float(point[1])) for point in box]
        if len(points) != 4 or not all(math.isfinite(n) for point in points for n in point):
            return None
        x0, y0 = min(p[0] for p in points), min(p[1] for p in points)
        x1, y1 = max(p[0] for p in points), max(p[1] for p in points)
        return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None
    except (TypeError, ValueError, IndexError):
        return None


def split_spaced_line(text, box, words):
    """Split only large physical gaps, never each space in a product name.

    Word boxes are estimates. Keep the original string (including punctuation and
    quantities) unless every word maps back to it without dropping characters.
    """
    fallback = [(text, box)]
    if words is None or not 2 <= len(words) <= 256:
        return fallback
    positioned = []
    cursor = 0
    for word in words:
        if len(word) != 3 or not isinstance(word[0], str) or not word[0]:
            return fallback
        word_text, _, word_box = word
        rect = rectangle(word_box)
        start = text.find(word_text, cursor)
        if rect is None or start < 0 or text[cursor:start].strip():
            return fallback
        positioned.append((start, start + len(word_text), rect))
        cursor = start + len(word_text)
    if text[cursor:].strip():
        return fallback
    height = median(rect[3] - rect[1] for _, _, rect in positioned)
    cuts = [0]
    for index in range(1, len(positioned)):
        _, end, left = positioned[index - 1]
        start, _, right = positioned[index]
        gap = right[0] - left[2]
        same_row = abs((left[1] + left[3]) - (right[1] + right[3])) <= height
        # Do not detach a quantity from its item, even if the handwriting spaces it out.
        prefix = text[positioned[cuts[-1]][0]:end].strip()
        suffix = text[start:].strip()
        quantity = re.fullmatch(r'\d+(?:[.,]\d+)?\s*(?:[x×]|kg|g|l|ml)?', prefix, re.I)
        trailing_quantity = re.fullmatch(r'[x×]\s*\d+', suffix, re.I)
        if gap > height * 1.5 and same_row and text[end:start].isspace() and not quantity and not trailing_quantity:
            cuts.append(index)
    if len(cuts) == 1:
        return fallback
    cuts.append(len(positioned))
    lines = []
    for first, last in zip(cuts, cuts[1:]):
        rects = [item[2] for item in positioned[first:last]]
        bounds = (min(r[0] for r in rects), min(r[1] for r in rects),
                  max(r[2] for r in rects), max(r[3] for r in rects))
        lines.append((text[positioned[first][0]:positioned[last - 1][1]].strip(), bounds))
    return lines


def layout_lines(texts, boxes=None, word_results=None):
    """Conservative two-column reading; retain all text, including duplicate items."""
    original = list(texts)
    if not original or len(original) > 500 or boxes is None or len(boxes) != len(original):
        return original
    lines = []
    has_words = word_results is not None and len(word_results) == len(original)
    for index, (text, box) in enumerate(zip(original, boxes)):
        bounds = rectangle(box)
        if bounds is None:
            return original
        lines.extend(split_spaced_line(text, bounds, word_results[index] if has_words else None))
    if len(lines) < 4:
        return [text for text, _ in lines]
    height = median(box[3] - box[1] for _, box in lines)
    by_x = sorted(lines, key=lambda line: line[1][0])
    # A genuine empty corridor must separate at least two entries on each side.
    # Headers spanning both columns deliberately prevent reordering: no text is discarded.
    for split in range(2, len(by_x) - 1):
        left, right = by_x[:split], by_x[split:]
        gap = min(b[0] for _, b in right) - max(b[2] for _, b in left)
        overlap = min(max(b[3] for _, b in left), max(b[3] for _, b in right)) - max(
            min(b[1] for _, b in left), min(b[1] for _, b in right))
        if gap >= height * 0.75 and overlap >= height:
            reading_order = sorted(left, key=lambda line: line[1][1]) + sorted(right, key=lambda line: line[1][1])
            return [text for text, _ in reading_order]
    return [text for text, _ in lines]


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
        result = engine(np.asarray(image)[:, :, ::-1], return_word_box=True)
    lines = layout_lines(result.txts or [], result.boxes, result.word_results)
    text = '\n'.join(lines)
    if len(text.encode('utf-8')) > 20_000:
        raise SystemExit(2)
    return {'text': text}


if __name__ == '__main__':
    data = sys.stdin.buffer.read(3 * 1024 * 1024 + 1)
    if not data or len(data) > 3 * 1024 * 1024:
        raise SystemExit(2)
    print(json.dumps(recognize(data), ensure_ascii=False))
