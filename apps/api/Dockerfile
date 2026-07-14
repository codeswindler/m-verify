FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @m-verify/shared build && pnpm --filter @m-verify/api build

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY database database
RUN pnpm install --filter @m-verify/api... --prod --frozen-lockfile=false
EXPOSE 4000
CMD ["sh", "-c", "node apps/api/dist/scripts/migrate.js && pnpm --filter @m-verify/api start"]
