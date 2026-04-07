# 🐍 Base Python Image
FROM python:3.10-slim

# 📁 Set working directory inside container
WORKDIR /app

# 📦 Install system dependencies (important for production scripts)
RUN apt-get update && apt-get install -y \
    unzip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 📁 Copy runner code into container
COPY main.py /app/main.py
COPY requirements.txt /app/requirements.txt

# 📦 Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# 🚀 Default command
CMD ["python", "-u", "main.py"]














#FROM python:3.10-slim

#WORKDIR /app

#COPY requirements.txt .
#RUN pip install --no-cache-dir -r requirements.txt || true

# install aws cli
#RUN apt-get update && apt-get install -y awscli

#COPY . .

#CMD ["python", "main.py"]

