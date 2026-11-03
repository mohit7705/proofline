FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install FFmpeg and FFprobe for video validation.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install uv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install dependencies from the committed lockfile.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy the application and database migrations.
COPY app/ ./app/
COPY migrations/ ./migrations/
COPY alembic.ini ./alembic.ini
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Verify core dependencies and video tools.
RUN python -c "import fastapi, uvicorn, sqlalchemy, psycopg; print('ALL CORE IMPORTS: OK')" \
    && ffmpeg -version \
    && ffprobe -version

EXPOSE 8000

RUN useradd --system --no-create-home --shell /usr/sbin/nologin proofline \
    && chmod +x ./docker-entrypoint.sh \
    && mkdir -p /var/lib/proofline/evidence \
    && chown -R proofline:proofline /var/lib/proofline

USER proofline

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]



