FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends fonts-nanum ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package*.json ./
COPY migrations ./migrations
RUN mkdir /app/.data && chown node:node /app/.data
ENV NODE_ENV=production APP_ENV=production HOST=0.0.0.0 PORT=3000 PDF_FONT_PATH=/usr/share/fonts/truetype/nanum/NanumGothic.ttf
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
