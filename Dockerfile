# ---- build ----
FROM node:22-alpine AS build
RUN npm install -g pnpm@10
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: el postinstall (prisma generate) necesita el schema; se corre explícito abajo
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm exec prisma generate && pnpm build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# Se copia node_modules completo porque `prisma migrate deploy` usa el CLI al arrancar.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1
# Aplica migraciones pendientes y arranca
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/server.js"]
