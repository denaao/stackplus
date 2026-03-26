FROM node:20-alpine

WORKDIR /app

COPY stackplus-api/package*.json ./
RUN npm install

COPY stackplus-api/ .

RUN npx prisma generate
RUN npm run build

EXPOSE 3001

CMD npx prisma migrate deploy && node dist/server.js
