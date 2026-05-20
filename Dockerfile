# Stage 1: build frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python backend with frontend static files
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./static
EXPOSE 8284
# High keep-alive for long SSE streams; tune down only after an observed failure.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8284", "--timeout-keep-alive", "300"]
