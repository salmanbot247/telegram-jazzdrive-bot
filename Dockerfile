FROM node:20-slim

RUN apt-get update && apt-get install -y \
    curl aria2 \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["node", "index.js"]
