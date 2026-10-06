"""Image validation tests; run with the installed OCR virtual environment."""
import io
import struct
import unittest
from PIL import Image
from recognize import prepare_image


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


if __name__ == '__main__':
    unittest.main()
