FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8765 \
    FATURA_DATA_DIR=/data \
    FATURA_OCR_PYTHON=/usr/local/bin/python \
    PADDLE_PDX_CACHE_HOME=/app/models/paddlex \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True \
    OMP_NUM_THREADS=1 \
    FATURA_OCR_CPU_THREADS=1 \
    TZ=Europe/Istanbul

WORKDIR /app
# Poppler PDF'leri render eder; Tesseract küçük miktar hücrelerinde yardımcıdır.
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl poppler-utils tesseract-ocr tesseract-ocr-tur libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-paddle.txt requirements-production.txt ./
RUN python -m pip install -r requirements-production.txt \
    && python -c "import paddle, paddleocr, waitress, pdfplumber"
COPY --chown=10001:10001 . .
RUN groupadd --gid 10001 fatura && useradd --uid 10001 --gid 10001 --create-home fatura \
    && mkdir -p /data /backups \
    && chown -R 10001:10001 /data /backups /app/models
USER 10001:10001
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl --fail --silent http://127.0.0.1:8765/health || exit 1
CMD ["python", "production.py"]
