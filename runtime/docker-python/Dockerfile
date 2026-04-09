# 🐍 Use lightweight Python image
# FROM python:3.11-slim

# 📁 Working directory inside container
# WORKDIR /app

# ⚡ Install basic system dependencies (future safe)
# RUN apt-get update && apt-get install -y \
#     build-essential \
#     && rm -rf /var/lib/apt/lists/*

# 📦 Pre-install common Python libs (optimization)
# RUN pip install --no-cache-dir \
#     pandas \
#     requests \
#     numpy \
#     openpyxl

# 🚀 Default command (will be overridden dynamically)
# CMD ["python", "-u", "/app/script/main.py"]


# 🐍 Base image
FROM python:3.11-slim

# 📁 Working directory
WORKDIR /app

# ⚡ System dependencies (REQUIRED for your flow)
RUN apt-get update && apt-get install -y \
    curl \
    unzip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 📦 Pre-install common Python libraries
RUN pip install --no-cache-dir \
    pandas \
    requests \
    numpy \
    openpyxl

# 🔥 Ensure logs are real-time (VERY IMPORTANT)
ENV PYTHONUNBUFFERED=1

# 🚀 Keep container alive-friendly default
CMD ["bash"]
