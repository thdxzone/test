"""Türkçe PP-OCRv5 çıktısını ortak konumlu OCR sözleşmesine uyarlar."""

from pathlib import Path
import os
import platform
import re

from invoice import number

ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(ROOT / "models/paddlex"))
os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")


class PaddleBackend:
    name = "paddleocr"

    def review_headers(self, record, ocr):
        from ocr.paddle_headers import review_headers

        result = review_headers(record, ocr)
        if self.numeric_fallbacks:
            result["issues"].append(
                {
                    "code": "paddle_numeric_review",
                    "detail": "Dar hücre okuması yerine tam sayfada aynı hücrede görülen sayı kullanıldı: "
                    + ", ".join(self.numeric_fallbacks),
                }
            )
        if self.quantity_retries:
            result["issues"].append(
                {
                    "code": "paddle_quantity_review",
                    "detail": "Küçük miktar metni hücreden ek yerel OCR okumalarıyla alındı; kaynakla doğrulayın: "
                    + ", ".join(self.quantity_retries),
                }
            )
        return result

    def __init__(self):
        from paddleocr import PaddleOCR

        # ARM Linux'ta çok iş parçacıklı tahmin native süreç çökmesine yol açabilir.
        # Mac'teki mevcut ayar korunur; sunucuda çekirdek sayısı açıkça sınırlanabilir.
        arm_linux = platform.system() == "Linux" and platform.machine() in (
            "aarch64",
            "arm64",
        )
        cpu_threads = int(
            os.environ.get("FATURA_OCR_CPU_THREADS", "1" if arm_linux else "10")
        )
        if not 1 <= cpu_threads <= 32:
            raise ValueError("FATURA_OCR_CPU_THREADS 1–32 aralığında olmalı.")
        self.cpu_threads = cpu_threads
        self.engine = PaddleOCR(
            lang="tr",
            ocr_version="PP-OCRv5",
            text_detection_model_name="PP-OCRv5_mobile_det",
            text_recognition_model_name="latin_PP-OCRv5_mobile_rec",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
            device="cpu",
            enable_mkldnn=False,
            cpu_threads=cpu_threads,
        )

    def recognize(self, image):
        import numpy as np

        result = list(self.engine.predict(np.array(image.convert("RGB"))))[0]
        data = result.json
        if callable(data):
            data = data()
        if isinstance(data, str):
            import json

            data = json.loads(data)
        data = data.get("res", data)
        lines = []
        for text, score, polygon in zip(
            data["rec_texts"], data["rec_scores"], data["rec_polys"]
        ):
            points = np.asarray(polygon)
            lines.append(
                {
                    "text": text,
                    "confidence": float(score),
                    "bbox": [
                        float(points[:, 0].min()),
                        float(points[:, 1].min()),
                        float(points[:, 0].max()),
                        float(points[:, 1].max()),
                    ],
                }
            )
        return lines

    def __call__(self, path, regions=None):
        from PIL import Image

        with Image.open(path) as source:
            image = source.convert("RGB")
        output = {
            "width": image.width,
            "height": image.height,
            "languages": ["tr"],
            "engine": self.name,
        }
        if regions is None:
            # Algılayıcı hücre/satır kutuları verir. Alan eşleştirmesi için sözcük
            # kutuları yaklaşık paylaştırılır; ham satırlar ayrıca korunur.
            raw = self.recognize(image)
            words = []
            for line in raw:
                tokens = line["text"].split()
                if not tokens:
                    continue
                b = line["bbox"]
                total = sum(len(token) for token in tokens) + len(tokens) - 1
                offset = 0
                for token in tokens:
                    left = b[0] + (b[2] - b[0]) * offset / total
                    right = b[0] + (b[2] - b[0]) * (offset + len(token)) / total
                    words.append(
                        {
                            "text": token,
                            "confidence": line["confidence"],
                            "bbox": [left, b[1], right, b[3]],
                        }
                    )
                    offset += len(token) + 1
            output["lines"] = words
            output["raw_lines"] = raw
            self.page_words = words
            self.numeric_fallbacks = []
            self.quantity_retries = []
        else:
            output["regions"] = {}
            for key, (x0, y0, x1, y1) in regions.items():
                crop = image.crop(
                    (
                        round(x0 * image.width),
                        round(y0 * image.height),
                        round(x1 * image.width),
                        round(y1 * image.height),
                    )
                )
                observations = self.recognize(crop)
                # Küçük tek rakamlar ayrı hücre OCR'sinde kaybolabilir. Yalnızca
                # aynı hücrede tek sayısal aday varsa tam sayfa kanıtı kullanılır.
                numeric_field = key.startswith("item.") and key.rsplit(".", 1)[-1] in (
                    "quantity",
                    "unit_price",
                    "vat_rate",
                    "line_total",
                    "discount",
                )
                if numeric_field and not self.readable_number(observations):
                    candidates = [
                        word
                        for word in self.page_words
                        if x0 * image.width
                        <= (word["bbox"][0] + word["bbox"][2]) / 2
                        <= x1 * image.width
                        and y0 * image.height
                        <= (word["bbox"][1] + word["bbox"][3]) / 2
                        <= y1 * image.height
                        and re.fullmatch(r"%?\d[\d.,]*", word["text"])
                    ]
                    if len(candidates) == 1:
                        observations = candidates
                        self.numeric_fallbacks.append(key)
                    elif not candidates and key.endswith(".quantity"):
                        retry = self.recognize_quantity(crop)
                        if retry:
                            observations = retry
                            self.quantity_retries.append(key)
                output["regions"][key] = observations
        return output

    def recognize_quantity(self, crop):
        """Algılayıcının kaçırdığı küçük rakamı doğrudan metin modeliyle okur.

        İki ölçekteki okuma aynı ve yüksek güvenli olmalıdır. Hücrede iki
        aday bulunduğunda bu yol çağrılmaz; satır birleşmesini gizlemez.
        """
        from PIL import Image, ImageOps
        from image_preprocessing import remove_table_lines
        import numpy as np
        import cv2

        cleaned = remove_table_lines(crop).convert("L")
        # Hücre kenarında kalan tek piksellik çizgi parçaları rakamın sınırını
        # tüm hücreye genişletmesin. İçerideki nokta/virgül korunur.
        pixels = np.array(cleaned)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(
            (pixels < 155).astype("uint8"), 8
        )
        for component in range(1, count):
            x, y, width, height, _ = stats[component]
            edge = (
                x == 0 or y == 0 or x + width == crop.width or y + height == crop.height
            )
            if edge and min(width, height) <= 2:
                pixels[labels == component] = 255
        cleaned = Image.fromarray(pixels)
        ink = cleaned.point(lambda p: 255 if p < 155 else 0)
        bounds = ink.getbbox()
        if (
            bounds is None
            or bounds[3] - bounds[1] < 8
            or sum(p > 0 for p in ink.tobytes()) < 10
        ):
            return []
        tight = cleaned.crop(bounds).convert("RGB")
        padded = ImageOps.expand(tight, border=12, fill="white")
        enlarged = padded.resize(
            (padded.width * 3, padded.height * 3), Image.Resampling.LANCZOS
        )
        if not hasattr(self, "quantity_recognizer"):
            from paddleocr import TextRecognition

            self.quantity_recognizer = TextRecognition(
                model_name="latin_PP-OCRv5_mobile_rec",
                device="cpu",
                enable_mkldnn=False,
                cpu_threads=self.cpu_threads,
            )
        results = list(
            self.quantity_recognizer.predict([np.array(padded), np.array(enlarged)])
        )
        texts = [str(result["rec_text"]).strip() for result in results]
        agreed = not (
            len(texts) != 2
            or texts[0] != texts[1]
            or not self.readable_number([{"text": texts[0]}])
        )
        confidence = min(float(result["rec_score"]) for result in results)
        if agreed and confidence >= 0.90:
            return [
                {
                    "text": texts[0],
                    "confidence": confidence,
                    "bbox": list(bounds),
                    "engine": "paddleocr",
                }
            ]
        # Paddle tek ince rakamı harf/çizgi sanabilir. Kuruluysa Tesseract'ın
        # yalnızca bu hücrede, birden fazla segmentasyonda uzlaşan okuması alınır.
        # Düşük güvenli ek okumalar ayrıca görünür inceleme uyarısı taşır.
        import shutil

        if not shutil.which("tesseract"):
            return []
        from ocr_backends import TesseractBackend

        import subprocess

        try:
            if not hasattr(self, "quantity_auxiliary"):
                self.quantity_auxiliary = TesseractBackend(languages="eng")
            # Otomatik kontrastın temizlenmiş, açık renkli çizgi artıklarını
            # tekrar koyulaştırmaması için yardımcı motora ikili kopya verilir.
            binary = cleaned.point(lambda p: 255 if p >= 155 else 0)
            observations, _ = self.quantity_auxiliary.quantity(binary)
        except (OSError, ValueError, subprocess.SubprocessError):
            # İsteğe bağlı motor/dil eksikliği tüm faturayı başarısız yapmaz.
            return []
        for observation in observations:
            observation["engine"] = "tesseract_quantity"
        return observations

    @staticmethod
    def readable_number(observations):
        text = " ".join(word["text"] for word in observations).strip()
        text = re.sub(r"\s*(TL|TRY|USD|EUR|GBP|₺)$", "", text).lstrip("%").strip()
        try:
            number(text)
            return True
        except ValueError:
            return False
