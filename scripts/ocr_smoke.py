"""Belge kullanmadan algılama ve Latin metin tanıma motorunu doğrular."""

from PIL import Image, ImageDraw, ImageFont
from ocr.paddle_reader import PaddleBackend


def main():
    image = Image.new("RGB", (800, 180), "white")
    ImageDraw.Draw(image).text(
        (30, 45), "FATURA 12345", fill="black", font=ImageFont.load_default(size=60)
    )
    lines = PaddleBackend().recognize(image)
    if not any(line.get("text", "").strip() for line in lines):
        raise RuntimeError("OCR başlangıç kontrolü metin tanıyamadı.")
    print("PaddleOCR başlangıç kontrolü başarılı.")


if __name__ == "__main__":
    main()
