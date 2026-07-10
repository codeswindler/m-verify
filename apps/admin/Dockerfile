FROM node:24-alpine AS build
ARG VITE_API_BASE_URL=http://localhost:4000
ARG VITE_DESKTOP_DOWNLOAD_URL=/downloads/M-Verify-Setup.exe
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_DESKTOP_DOWNLOAD_URL=$VITE_DESKTOP_DOWNLOAD_URL
WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter @m-verify/shared build && pnpm --filter @m-verify/admin build

FROM nginx:1.27-alpine
COPY apps/admin/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/admin/dist /usr/share/nginx/html
EXPOSE 80
