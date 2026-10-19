FROM rust:1-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
COPY migrations ./migrations
COPY ocr ./ocr
COPY admin ./admin
COPY public ./public
RUN cargo build --release --locked

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
COPY ocr/requirements.txt /opt/ocr/requirements.txt
COPY ocr/install-models.py /opt/ocr/install-models.py
RUN python -m venv /opt/ocr/venv && /opt/ocr/venv/bin/pip install --no-cache-dir -r /opt/ocr/requirements.txt && /opt/ocr/venv/bin/python /opt/ocr/install-models.py /opt/ocr/models
ENV OCR_PYTHON=/opt/ocr/venv/bin/python OCR_MODELS_DIR=/opt/ocr/models
ENV PYTHONDONTWRITEBYTECODE=1 HOME=/tmp
RUN groupadd --gid 10001 poduna && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin poduna \
    && install -d -m 0700 -o 10001 -g 10001 /data
COPY --from=builder /app/target/release/shopping-list-backend /usr/local/bin/backend
COPY --from=builder /app/target/release/migrate-db /usr/local/bin/migrate-db
EXPOSE 3000
USER 10001:10001
CMD ["backend"]
