FROM ghcr.io/astral-sh/uv:0.11.21 AS uv
FROM python:3.13.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NLTK_DATA=/usr/local/share/nltk_data \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

WORKDIR /app
COPY --from=uv /uv /usr/local/bin/uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev \
    && cd /tmp \
    && /app/.venv/bin/python -P -m nltk.downloader -d "${NLTK_DATA}" punkt_tab
COPY bot.py review_client.py ./

RUN useradd --create-home --uid 10001 worker
USER worker
EXPOSE 7860
CMD ["sh", "-c", "cd /tmp && exec env PYTHONPATH=/app /app/.venv/bin/python -P /app/bot.py --host 0.0.0.0 --port 7860 -t \"${PIPECAT_TRANSPORT:-webrtc}\""]
