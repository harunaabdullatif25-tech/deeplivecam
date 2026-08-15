# ── Stage 1: Build ────────────────────────────────────────────
FROM python:3.11-slim AS builder

# System deps needed to compile native wheels (opencv, etc.)
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        ffmpeg \
        libgl1 \
        libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer caching)
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Runtime ─────────────────────────────────────────
FROM python:3.11-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        libgl1 \
        libglib2.0-0 && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy the entire project (run.py, modules/, models/, backend/)
COPY . /app

EXPOSE 8000
ENV PORT=8000
ENV PYTHONUNBUFFERED=1

# Start gunicorn pointing at backend/app.py
CMD ["gunicorn", "backend.app:app", \
     "--workers", "2", \
     "--timeout", "600", \
     "--bind", "0.0.0.0:8000"]
