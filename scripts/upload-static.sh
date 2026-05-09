#!/bin/bash
# =============================================================================
# Upload static assets (CSS/JS/images/fonts) to S3 for CloudFront CDN serving.
#
# EKS version — shares the same S3 bucket + CloudFront distribution as the
# Application SPA. Static assets are uploaded under the
# `<bucket>/<service-name>/...` prefix; the resulting CDN URL is
# `https://<application-cloudfront-domain>/<service-name>/...`.
#
# Prerequisites:
#   - AWS CLI authenticated (IAM user / SSO / role — any credential source)
#   - StaticSites CDK stack already deployed
#     (exports ApplicationSiteBucketName / ApplicationSiteDistributionId /
#      ApplicationSiteDomain)
#
# Usage:
#   ./scripts/upload-static.sh <service-name> <source-dir> [--region REGION] [--profile PROFILE] [--invalidate]
#
# Examples:
#   # Upload an SSR service's static/ directory
#   ./scripts/upload-static.sh <service> \
#     services/application-services/application/microservices/<service>/src/main/resources/static
#
#   # Upload, then invalidate the CloudFront cache for the prefix
#   ./scripts/upload-static.sh <service> <path> --invalidate
#
# After upload:
#   Static resources are reachable at https://<cloudfront>/<service>/css/...
#   Declaring `"CDN_URL": "<APP_SITE_URL>/<service>"` under the
#   `environment` map in services-template.json / services.json makes
#   CodeBuild inject the same URL into every Pod automatically.
# =============================================================================

set -euo pipefail

# ---- Parse arguments ----
if [ $# -lt 2 ]; then
  cat <<EOF
Usage: $0 <service-name> <source-dir> [--region REGION] [--profile PROFILE] [--invalidate]

  service-name  First segment of the S3 prefix and URL path. Adjust so
                Kotlin/Thymeleaf \${cdnUrl} references resolve to
                "https://<cloudfront>/<service>/...".
  source-dir    Local static-asset directory. Absolute path, or relative
                to the project root. Every file underneath is synced.

Examples:
  $0 <service> services/application-services/application/microservices/<service>/src/main/resources/static
  $0 <service> <path> --invalidate
EOF
  exit 1
fi

SERVICE_NAME="$1"
SOURCE_PATH="$2"
shift 2

REGION="ap-northeast-2"
PROFILE=""
INVALIDATE=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="--profile $2"; shift 2 ;;
    --invalidate) INVALIDATE=true; shift ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

AWS_CMD="aws --region $REGION $PROFILE"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---- Resolve source directory ----
RESOLVED_PATH="$SOURCE_PATH"
if [ ! -d "$RESOLVED_PATH" ]; then
  RESOLVED_PATH="$PROJECT_ROOT/$SOURCE_PATH"
fi
if [ ! -d "$RESOLVED_PATH" ]; then
  echo "ERROR: static asset directory not found: $SOURCE_PATH" >&2
  echo "       (project root: $PROJECT_ROOT)" >&2
  exit 1
fi
STATIC_BASE="$RESOLVED_PATH"

echo "======================================================"
echo " Upload static assets — $SERVICE_NAME"
echo " Source:  $STATIC_BASE"
echo " Region:  $REGION"
echo "======================================================"

# ---- Read StaticSites stack outputs ----
echo ""
echo "[1/3] Resolving StaticSites stack outputs..."

fetch_output() {
  local key="$1"
  $AWS_CMD cloudformation describe-stacks \
    --stack-name StaticSites \
    --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" \
    --output text
}

S3_BUCKET="$(fetch_output ApplicationSiteBucketName)"
DIST_ID="$(fetch_output ApplicationSiteDistributionId)"
CLOUDFRONT_DOMAIN="$(fetch_output ApplicationSiteDomain)"

if [ -z "$S3_BUCKET" ] || [ "$S3_BUCKET" = "None" ]; then
  echo "ERROR: StaticSites stack output 'ApplicationSiteBucketName' not found." >&2
  echo "       Deploy the StaticSites stack first (./scripts/install.sh)." >&2
  exit 1
fi

echo "  S3 bucket:   $S3_BUCKET"
echo "  CloudFront:  $CLOUDFRONT_DOMAIN  (dist $DIST_ID)"

# ---- Content-type specific sync ----
echo ""
echo "[2/3] Uploading to s3://$S3_BUCKET/$SERVICE_NAME/ ..."

# Explicit content-type — without this, some files default to text/html
# and get blocked by the browser's ORB (Opaque Response Blocking).
CONTENT_TYPES=(
  "*.css:text/css"
  "*.js:application/javascript"
  "*.mjs:application/javascript"
  "*.png:image/png"
  "*.jpg:image/jpeg"
  "*.jpeg:image/jpeg"
  "*.gif:image/gif"
  "*.svg:image/svg+xml"
  "*.webp:image/webp"
  "*.woff:font/woff"
  "*.woff2:font/woff2"
  "*.ttf:font/ttf"
  "*.eot:application/vnd.ms-fontobject"
  "*.ico:image/x-icon"
  "*.json:application/json"
  "*.map:application/json"
  "*.txt:text/plain"
)

for entry in "${CONTENT_TYPES[@]}"; do
  PATTERN="${entry%%:*}"
  CTYPE="${entry##*:}"
  $AWS_CMD s3 sync "$STATIC_BASE" "s3://$S3_BUCKET/$SERVICE_NAME/" \
    --cache-control "max-age=86400" \
    --metadata-directive REPLACE \
    --exclude "*" --include "$PATTERN" \
    --content-type "$CTYPE" \
    --only-show-errors
done

# Catch-all pass for any file whose extension is not in the content-type
# mapping above.
$AWS_CMD s3 sync "$STATIC_BASE" "s3://$S3_BUCKET/$SERVICE_NAME/" \
  --cache-control "max-age=86400" \
  --only-show-errors

# ---- CloudFront cache invalidation (opt-in) ----
if [ "$INVALIDATE" = true ]; then
  echo ""
  echo "[3/3] Creating CloudFront invalidation for /$SERVICE_NAME/* ..."
  $AWS_CMD cloudfront create-invalidation \
    --distribution-id "$DIST_ID" \
    --paths "/$SERVICE_NAME/*" \
    --query 'Invalidation.Id' \
    --output text
else
  echo ""
  echo "[3/3] Skipping CloudFront invalidation (--invalidate not specified)."
fi

# ---- Summary ----
CDN_URL="https://$CLOUDFRONT_DOMAIN/$SERVICE_NAME"

cat <<EOF

======================================================
 Upload complete — $SERVICE_NAME
======================================================

 CDN base URL:
   $CDN_URL/

 Sample URLs:
   $CDN_URL/css/<stylesheet>
   $CDN_URL/js/<script>

 Add the following entry to the \`environment\` map in
 services-template.json / services.json to have the same URL
 automatically injected into every Pod:
   "CDN_URL": "<APP_SITE_URL>/$SERVICE_NAME"
 (The <APP_SITE_URL> placeholder is substituted in the CodeBuild
  pre_build step from the StaticSites stack's ApplicationSiteUrl
  output.)

EOF
