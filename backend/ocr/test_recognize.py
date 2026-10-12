"""Image validation tests; run with the installed OCR virtual environment."""
import io
import struct
import unittest
from PIL import Image
from recognize import layout_lines, prepare_image


def encoded(image, format='PNG', **options):
    data = io.BytesIO()
    image.save(data, format=format, **options)
    return data.getvalue()


class ImageValidationTests(unittest.TestCase):
    def test_invalid_truncated_and_unsupported_images_are_rejected(self):
        valid = encoded(Image.new('RGB', (100, 100), 'white'))
        for data in (b'', b'not an image', b'\xff\xd8\xffbroken', valid[:40],
                     encoded(Image.new('RGB', (10, 10)), 'GIF')):
            with self.subTest(data=data[:10]), self.assertRaises(SystemExit) as error:
                prepare_image(data)
            self.assertEqual(error.exception.code, 2)

    def test_large_dimensions_are_rejected_before_decoding(self):
        # A valid PNG header declaring a huge image, without allocating its pixels.
        import zlib
        header = struct.pack('>IIBBBBB', 5000, 5000, 8, 2, 0, 0, 0)
        chunk = b'IHDR' + header
        data = b'\x89PNG\r\n\x1a\n' + struct.pack('>I', len(header)) + chunk + struct.pack('>I', zlib.crc32(chunk))
        with self.assertRaises(SystemExit) as error:
            prepare_image(data)
        self.assertEqual(error.exception.code, 2)

    def test_exif_rotation_is_applied_before_ocr(self):
        image = Image.new('RGB', (120, 60), 'white')
        exif = Image.Exif()
        exif[274] = 6
        prepared = prepare_image(encoded(image, 'JPEG', exif=exif))
        self.assertEqual(prepared.size, (60 + 160, 120 + 160))

    def test_size_is_bounded_and_transparency_converts_to_rgb(self):
        prepared = prepare_image(encoded(Image.new('RGBA', (3000, 2000), 'white')))
        self.assertEqual(prepared.size, (2400 + 160, 1600 + 160))
        self.assertEqual(prepared.mode, 'RGB')


def box(x, y, width=100, height=20):
    return [[x, y], [x + width, y], [x + width, y + height], [x, y + height]]


class LayoutTests(unittest.TestCase):
    def test_two_columns_read_top_to_bottom_without_dropping_repeats(self):
        texts = ['Litière', 'Sanex', 'Yaourts', 'Whisky', 'Fromage', 'Sanex']
        boxes = [box(0, 0), box(180, 0), box(0, 40), box(180, 40), box(0, 80), box(180, 80)]
        self.assertEqual(layout_lines(texts, boxes), ['Litière', 'Yaourts', 'Fromage', 'Sanex', 'Whisky', 'Sanex'])

    def test_single_column_and_multiword_products_stay_intact(self):
        texts = ['2 x lait', 'Crème fraîche', 'Pommes de terre', 'Chocolat noir']
        self.assertEqual(layout_lines(texts, [box(0, i * 40, 180) for i in range(4)]), texts)

    def test_missing_malformed_or_ambiguous_geometry_keeps_original_order(self):
        texts = ['Titre', 'Lait', 'Pain', 'Orange', 'Viande']
        self.assertEqual(layout_lines(texts), texts)
        self.assertEqual(layout_lines(texts, []), texts)
        self.assertEqual(layout_lines(texts, [None] * 5), texts)
        self.assertEqual(layout_lines(['Lait'], [box(float('nan'), 0)]), ['Lait'])
        self.assertEqual(layout_lines([], []), [])
        self.assertEqual(layout_lines(texts, [box(0, 0, 300), box(0, 40), box(180, 40),
                                             box(0, 80), box(180, 80)]), texts)

    def test_splits_only_large_gaps_in_a_detected_line(self):
        words = [[('Crème', .9, box(0, 0, 70)), ('fraîche', .9, box(80, 0, 80)),
                  ('Sanex', .9, box(240, 0, 70))]]
        self.assertEqual(layout_lines(['Crème fraîche Sanex'], [box(0, 0, 310)], words),
                         ['Crème fraîche', 'Sanex'])

    def test_preserves_quantities_and_punctuation(self):
        cases = [('2 x lait', [('2 x', .9, box(0, 0, 30)), ('lait', .9, box(100, 0))]),
                 ('lait x 2', [('lait', .9, box(0, 0)), ('x 2', .9, box(180, 0, 30))]),
                 ("L'Oréal", [('L', .9, box(0, 0, 10)), ('Oréal', .9, box(100, 0))])]
        for text, words in cases:
            with self.subTest(text=text):
                self.assertEqual(layout_lines([text], [box(0, 0, 300)], [words]), [text])

    def test_incomplete_word_alignment_does_not_lose_text(self):
        for words in (None, [], [[('Lait', .9, None)]], [[('Pain', .9, box(0, 0))]],
                      [[('Lait', .9, box(0, 0)), ('Sanex', .9, box(200, 0))]]):
            self.assertEqual(layout_lines(['Lait et Sanex'], [box(0, 0, 300)], words), ['Lait et Sanex'])

    def test_word_splitting_then_column_ordering(self):
        texts = ['Litière Sanex', 'Yaourts Whisky']
        words = [[(left, .9, box(0, y)), (right, .9, box(180, y))]
                 for left, right, y in [('Litière', 'Sanex', 0), ('Yaourts', 'Whisky', 40)]]
        self.assertEqual(layout_lines(texts, [box(0, 0, 280), box(0, 40, 280)], words),
                         ['Litière', 'Yaourts', 'Sanex', 'Whisky'])


if __name__ == '__main__':
    unittest.main()
