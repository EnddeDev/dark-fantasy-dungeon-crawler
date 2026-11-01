# Игра и API в одном контейнере: собранный клиент лежит рядом с сервером,
# поэтому относительный /api работает без дополнительных настроек.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run server:build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
ENV DB_FILE=/data/sumrak.db
ENV DIST_DIR=/app/dist
COPY --from=build /app/server/.build/server.mjs ./server.mjs
COPY --from=build /app/dist ./dist
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "server.mjs"]
