# Hangar MNG — imagem de produção (site + API num só container)
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
WORKDIR /app/server
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
