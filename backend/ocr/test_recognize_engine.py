"""Opt-in integration test: local models, synthetic printed image, no network."""
import io
import os
import unittest
from PIL import Image, ImageDraw, ImageFont
from recognize import recognize


@unittest.skipUnless(os.environ.get('OCR_MODELS_DIR'), 'local OCR models not configured')
class EngineTests(unittest.TestCase):
    def test_printed_two_columns_preserve_names_and_quantities(self):
        try:
            font = ImageFont.truetype(os.environ.get('OCR_TEST_FONT', 'DejaVuSans.ttf'), 38)
        except OSError:
            self.skipTest('set OCR_TEST_FONT to an installed Latin font')
        image = Image.new('RGB', (1100, 520), 'white')
        draw = ImageDraw.Draw(image)
        left = ['Litière', 'Yaourts', 'Crème fraîche', '2 x lait']
        right = ['Sanex', 'Whisky', 'Orange', 'Croquettes']
        for x, entries in [(50, left), (650, right)]:
            for index, entry in enumerate(entries):
                draw.text((x, 45 + index * 110), entry, font=font, fill='black')
        data = io.BytesIO()
        image.save(data, format='PNG')
        self.assertEqual(recognize(data.getvalue()), {'text': '\n'.join(left + right)})


if __name__ == '__main__':
    unittest.main()
