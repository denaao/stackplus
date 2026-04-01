FROM node:20-slim

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY stackplus-api/package*.json ./
RUN npm install

COPY stackplus-api/ .

RUN echo "cache bust $(date)" && npx prisma generate
RUN npm run build

EXPOSE 8080

CMD npx prisma migrate deploy --schema prisma/schema.prisma && node dist/server.js
