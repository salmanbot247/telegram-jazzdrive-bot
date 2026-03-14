FROM node:20-slim

# ffmpeg + python + pip install
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

# yt-dlp install
RUN pip3 install yt-dlp --break-system-packages

# python symlink (youtube-dl-exec ke liye)
RUN ln -sf /usr/bin/python3 /usr/bin/python

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["node", "index.js"]
