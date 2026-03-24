FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for WeasyPrint, trimesh, and OpenCASCADE
RUN apt-get update && apt-get install -y \
    build-essential \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    libcairo2 \
    libgirepository1.0-dev \
    gir1.2-pango-1.0 \
    fonts-liberation \
    curl \
    libocct-data-exchange-dev \
    libocct-draw-dev \
    occt-misc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create uploads directory
RUN mkdir -p /app/uploads

# Expose port
EXPOSE 8000

# Run migrations before starting the API server
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
