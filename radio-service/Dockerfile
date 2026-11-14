# syntax=docker/dockerfile:1
FROM python:3.13-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641 AS dependencies
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
COPY requirements.lock .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --require-hashes -r requirements.lock

FROM python:3.13-slim-bookworm@sha256:a1165e272e578941b84abc79e4ab38a0305cd12803a5c4247979ac7655f4d641 AS application
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
RUN groupadd --gid 10001 app \
    && useradd --uid 10001 --gid app --create-home app
WORKDIR /app
COPY --from=dependencies /opt/venv /opt/venv
COPY --chown=app:app radio_service ./radio_service
USER 10001:10001
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "radio_service.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]

FROM application AS test
USER 0
COPY requirements-dev.lock .
RUN pip install --no-cache-dir --require-hashes -r requirements-dev.lock
COPY --chown=app:app tests ./tests
COPY --chown=app:app pyproject.toml .
USER 10001:10001
CMD ["sh", "-c", "ruff check --no-cache . && python -m pytest -q -p no:cacheprovider"]

FROM application AS runtime
