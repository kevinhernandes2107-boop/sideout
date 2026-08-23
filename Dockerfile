FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py models.py database.py ./

# The Fly volume mounts at /data -- the database and uploaded photos live there so they
# survive restarts and redeploys instead of the container's ephemeral filesystem.
ENV DATABASE_PATH=/data/vball_app.db
ENV UPLOADS_DIR=/data/uploads
RUN mkdir -p /data/uploads

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
