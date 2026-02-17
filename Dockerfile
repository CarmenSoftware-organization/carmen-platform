FROM node:20-slim AS builder
WORKDIR /app

COPY package.json package-lock.json* bun.lock* ./
RUN if [ -f bun.lock ]; then npm install -g bun && bun install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

COPY . .

ENV NODE_ENV=production
RUN npm run build

# ─── Serve with nginx ────────────────────────────────────────────────────────
FROM nginx:stable-alpine AS runner

# Copy built files to nginx
COPY --from=builder /app/build /usr/share/nginx/html

# SPA routing: redirect all requests to index.html
RUN echo 'server { \
    listen 3001; \
    server_name _; \
    root /usr/share/nginx/html; \
    index index.html; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /static/ { \
        expires 1y; \
        add_header Cache-Control "public, immutable"; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3001

CMD ["nginx", "-g", "daemon off;"]
