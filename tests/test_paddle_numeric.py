"""Tek rakam kaybında yalnızca aynı hücredeki benzersiz OCR kanıtı kullanılır."""

import tempfile
from pathlib import Path
import unittest
from PIL import Image, ImageDraw
from ocr.paddle_reader import PaddleBackend


class PaddleNumericTests(unittest.TestCase):
    def test_empty_cell_or_border_line_is_not_default_quantity_one(self):
        backend = object.__new__(PaddleBackend)
        blank = Image.new("RGB", (80, 40), "white")
        self.assertEqual(backend.recognize_quantity(blank), [])
        ImageDraw.Draw(blank).line([(0, 0), (0, 39)], fill="black", width=1)
        self.assertEqual(backend.recognize_quantity(blank), [])

    def read_quantity(self, words, crop_words):
        backend = object.__new__(PaddleBackend)
        backend.page_words = words
        backend.numeric_fallbacks = []
        backend.recognize = lambda image: crop_words
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "page.png"
            Image.new("RGB", (200, 200), "white").save(path)
            result = backend(path, {"item.0.quantity": [0.25, 0.25, 0.5, 0.5]})
        return result["regions"]["item.0.quantity"], backend.numeric_fallbacks

    def test_single_digit_is_recovered_from_same_cell(self):
        digit = {"text": "1", "bbox": [60, 60, 70, 80]}
        observations, fields = self.read_quantity([digit], [])
        self.assertEqual(observations, [digit])
        self.assertEqual(fields, ["item.0.quantity"])

    def test_no_quantity_is_invented_from_neighboring_cell(self):
        observations, _ = self.read_quantity(
            [{"text": "1", "bbox": [120, 60, 130, 80]}], []
        )
        self.assertEqual(observations, [])

    def test_multiple_candidates_remain_unresolved(self):
        observations, _ = self.read_quantity(
            [
                {"text": "1", "bbox": [60, 60, 70, 80]},
                {"text": "2", "bbox": [80, 60, 90, 80]},
            ],
            [],
        )
        self.assertEqual(observations, [])

    def test_valid_crop_reading_is_preserved(self):
        crop = [{"text": "3", "bbox": [5, 5, 15, 25]}]
        observations, fields = self.read_quantity(
            [{"text": "1", "bbox": [60, 60, 70, 80]}], crop
        )
        self.assertEqual(observations, crop)
        self.assertEqual(fields, [])
