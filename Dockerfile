FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production WEB_PORT=8080 COOKIE_SECURE=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/next.config.mjs ./apps/web/next.config.mjs
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY server ./server
COPY scripts/start.mjs ./scripts/start.mjs
USER node
EXPOSE 8080
CMD ["node", "scripts/start.mjs"]
