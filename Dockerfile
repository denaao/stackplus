FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY stackplus-api/package*.json ./
RUN npm install

COPY stackplus-api/ .

RUN npx prisma generate
RUN npm run build

EXPOSE 8080

CMD npx prisma db push && node dist/server.js
