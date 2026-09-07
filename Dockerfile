FROM python:3.12-slim

# Install Node.js (slim has no curl, so install it first)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt backend/requirements-ml.txt ./
RUN pip install --no-cache-dir -r requirements.txt -r requirements-ml.txt

# Copy backend
COPY backend/ ./backend/

# Copy datasets for AI training data
COPY datasets/ ./datasets/

# Build frontend
COPY frontend/ ./frontend/
WORKDIR /app/frontend
RUN npm ci && npm run build

WORKDIR /app/backend

# Expose port
EXPOSE 8000

# Start the server
CMD ["sh", "-c", "python -m alembic upgrade head && exec python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"]
