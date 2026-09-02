# ai-server — 임베딩 API (docs/tickets/infra/pending/ai-server-deployment.md)
FROM python:3.12-slim

WORKDIR /srv/ai-server

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

# env(INTERNAL_AUTH_TOKEN 등)는 런타임 주입 — 이미지에 굽지 않는다
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
