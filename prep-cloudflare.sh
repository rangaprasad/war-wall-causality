#!/usr/bin/env bash
set -e

echo "== Preparing repo for Cloudflare Pages deployment =="

# 1) Ensure public/ folder exists
echo "→ Ensuring ./public exists"
mkdir -p public

# 2) Create SPA routing fallback
echo "→ Creating public/_redirects (SPA routing)"
cat > public/_redirects << 'EOF'
/*  /index.html  200
EOF

# 3) Create recommended security headers
echo "→ Creating public/_headers (security headers)"
cat > public/_headers << 'EOF'
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Cache-Control: public, max-age=600
EOF

# 4) Ensure package.json has correct build entries
echo "→ Verifying package.json contains Vite build scripts"
if ! grep -q "\"build\"" package.json; then
  echo "⚠️  No build script found in package.json. Adding..."
  npx json -I -f package.json -e 'this.scripts.build="vite build"'
fi

if ! grep -q "\"dev\"" package.json; then
  echo "⚠️  No dev script found in package.json. Adding..."
  npx json -I -f package.json -e 'this.scripts.dev="vite"'
fi

# 5) Confirm vite.config exists
if [ ! -f vite.config.ts ] && [ ! -f vite.config.js ]; then
  echo "⚠️  No vite.config found. Creating a minimal vite.config.ts"
  cat > vite.config.ts << 'EOF'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" }
});
EOF
fi

# 6) Install deps and build
echo "→ Installing dependencies"
npm install

echo "→ Running production build (verifying Cloudflare compatibility)"
npm run build

echo ""
echo "✅ Prep complete."
echo ""
echo "Next Step:"
echo "1) Commit these changes:"
echo "     git add . && git commit -m \"Prep for Cloudflare Pages deployment\""
echo ""
echo "2) Push your branch:"
echo "     git push"
echo ""
echo "3) Open Cloudflare Pages and link this repo:"
echo "     https://dash.cloudflare.com → Pages → Create Project"
echo ""
echo "Use these settings:"
echo "   Build command: npm run build"
echo "   Output directory: dist"
echo "   Framework preset: Vite"
echo ""
echo "If deploying at a subdomain (recommended):"
echo "   e.g., war.rangaprasad.work"
echo "   Cloudflare will prompt you to add a DNS CNAME automatically."
echo ""
echo "Done 🎯"

