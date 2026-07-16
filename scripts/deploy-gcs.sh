#!/usr/bin/env bash
# Deploy SPA ไป Google Cloud Storage (+ invalidate Cloud CDN ถ้าระบุ URL map)
# Usage: scripts/deploy-gcs.sh <gcs-bucket> [cdn-url-map]
#   <gcs-bucket>   ชื่อ bucket (ไม่ต้องมี gs:// นำหน้า)
#   [cdn-url-map]  (optional) ชื่อ URL map ของ HTTPS LB — ถ้าให้มา จะ invalidate /index.html
# หมายเหตุ: ต่างจาก carmen-web, แอปนี้ bake ค่า REACT_APP_* เข้า bundle ตอน build (ไม่มี
# runtime config.json) — `build:prod` = `vite build --mode prod` โหลด .env.prod (ไม่ใช่
# .env.production) ดังนั้นต้องมี .env.prod ที่ถูกต้องอยู่ก่อนรันสคริปต์นี้
set -euo pipefail

BUCKET="${1:?Usage: deploy-gcs.sh <bucket> [cdn-url-map]}"
URL_MAP="${2:-}"

bun run build:prod

# Sync ทุกอย่างยกเว้น index.html (upload แยกด้านล่างเพื่อคุม cache-control)
gcloud storage rsync build "gs://${BUCKET}" \
  --recursive \
  --delete-unmatched-destination-objects \
  --exclude="^index\.html$"

# Hashed assets — cache ยาว (immutable; ชื่อไฟล์มี hash เปลี่ยนทุก build อยู่แล้ว)
gcloud storage objects update "gs://${BUCKET}/assets/**" \
  --cache-control="public,max-age=31536000,immutable"

# index.html — no-cache เพื่อให้ deploy ใหม่มีผลทันที
gcloud storage cp build/index.html "gs://${BUCKET}/index.html" \
  --cache-control="no-cache"

# Invalidate Cloud CDN เฉพาะเมื่อ deploy อยู่หลัง HTTPS LB + Cloud CDN
if [ -n "${URL_MAP}" ]; then
  gcloud compute url-maps invalidate-cdn-cache "${URL_MAP}" --path "/index.html"
  echo "Deployed to gs://${BUCKET} and invalidated /index.html on ${URL_MAP}"
else
  echo "Deployed to gs://${BUCKET} (no CDN invalidation — index.html is no-cache)"
fi
