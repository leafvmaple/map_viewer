# map_viewer — static-frontend image. Only the built app is baked in; the game
# data (res/, ROM-ripped) is mounted read-only from the NAS at runtime, mirroring
# vn-resource-vault. Gitea Actions builds + pushes to the registry; the NAS pulls.

# ── build stage: compile the Vite app ──────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run test                  # unit tests gate the image build
RUN npm run build                 # → dist/ (app code only; res/ is git/docker-ignored)

# ── serve stage: nginx over the static bundle ──────────────────
FROM nginx:alpine
# The mounted /data comes from the NAS with foreign ownership/permissions (SMB
# writes), so run the nginx workers as root to always read it (read-only static).
RUN sed -i 's/^user .*/user root;/' /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
