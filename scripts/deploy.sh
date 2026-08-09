#!/bin/bash

# Full deployment: API + webapp + migrations
# Usage:
#   ./scripts/deploy.sh            # Deploy everything (API + webapp + migrations)
#   ./scripts/deploy.sh --api      # API + migrations + required upload assets
#   ./scripts/deploy.sh --web      # Webapp only
#   ./scripts/deploy.sh --artifacts # Story artifact catalog images only
#   ./scripts/deploy.sh --outfits  # Pregenerated outfit plate assets only
#   ./scripts/deploy.sh --nginx    # Legacy nginx handoff check only; deploy live proxy from ../proxy
#   ./scripts/deploy.sh --migrate  # Migrations only (no rebuild/redeploy)

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DROPLET_IP="167.172.102.75"
DROPLET_USER="root"
DROPLET_PATH="/var/www/kazka"
API_IMAGE="kazka-api"
API_TAG="latest"
API_RUNTIME_DISK_RESERVE_KB=2097152
API_POST_DEPLOY_MIN_FREE_KB=2097152
DEPLOY_DRAIN_TIMEOUT_MS="${DEPLOY_DRAIN_TIMEOUT_MS:-900000}"
DEPLOY_ACTIVE_REQUEST_TTL_MS="${DEPLOY_ACTIVE_REQUEST_TTL_MS:-600000}"
DEPLOY_TELEGRAM_ENABLED="${DEPLOY_TELEGRAM_ENABLED:-true}"
DEPLOY_TELEGRAM_DRY_RUN="${DEPLOY_TELEGRAM_DRY_RUN:-false}"
DEPLOY_STARTED_AT=$(date +%s)
DEPLOY_STARTED_AT_UTC=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
DEPLOY_ID="$(date -u '+%Y%m%dT%H%M%SZ')-$$"
TELEGRAM_ALERT_HELPER="${SCRIPT_DIR}/lib/telegram-alert.js"
REMOTE_TELEGRAM_ALERT_HELPER="${DROPLET_PATH}/scripts/lib/telegram-alert.js"
DEPLOY_TELEGRAM_MESSAGE_ID=""
DEPLOY_TELEGRAM_LAST_DELIVERY=""

# SSH multiplexing: single connection + passphrase prompt for the whole script
SSH_CONTROL_PATH="/tmp/deploy-ssh-ctl-$$"
SSH_OPTS="-o ControlMaster=auto -o ControlPath=${SSH_CONTROL_PATH} -o ControlPersist=60"
CURRENT_STEP="bootstrap"
LAST_REMOTE_COMMAND=""
STEP_STARTED_AT=0

cleanup() {
  rm -f "/tmp/wondertales-story-artifacts-$$.tar.gz"
  rm -f "/tmp/wondertales-migrations-$$.tar.gz"
  ssh -O exit -o ControlPath=${SSH_CONTROL_PATH} ${DROPLET_USER}@${DROPLET_IP} 2>/dev/null || true
}

on_error() {
  local exit_code=$?
  local line_no=$1
  local command=$2
  local failed_at duration

  trap - ERR
  set +e
  failed_at=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
  duration=$(( $(date +%s) - DEPLOY_STARTED_AT ))

  echo ""
  echo "❌ Deployment failed"
  echo "   step: ${CURRENT_STEP}"
  echo "   line: ${line_no}"
  echo "   command: ${command}"
  if [[ -n "${LAST_REMOTE_COMMAND}" ]]; then
    echo "   last remote command: ${LAST_REMOTE_COMMAND}"
  fi
  echo "   exit code: ${exit_code}"
  echo ""
  echo "💡 Tip: rerun the failing remote command manually over SSH to inspect it in isolation."

  build_and_notify_deploy_telegram_best_effort \
    "failure" \
    "$(format_duration "${duration}")" \
    "${failed_at}" \
    "${CURRENT_STEP}" \
    "${exit_code}"

  exit "${exit_code}"
}

# Parse flags
DEPLOY_API=false
DEPLOY_WEB=false
DEPLOY_MIGRATE=false
DEPLOY_NGINX=false
DEPLOY_OUTFITS=false
DEPLOY_ARTIFACTS=false

if [[ $# -eq 0 ]]; then
  DEPLOY_API=true
  DEPLOY_WEB=true
  DEPLOY_MIGRATE=true
  DEPLOY_OUTFITS=true
  DEPLOY_ARTIFACTS=true
fi

for arg in "$@"; do
  case "$arg" in
    --api)     DEPLOY_API=true; DEPLOY_MIGRATE=true; DEPLOY_OUTFITS=true; DEPLOY_ARTIFACTS=true ;;
    --web)     DEPLOY_WEB=true ;;
    --artifacts) DEPLOY_ARTIFACTS=true ;;
    --outfits) DEPLOY_OUTFITS=true ;;
    --nginx)   DEPLOY_NGINX=true ;;
    --migrate) DEPLOY_MIGRATE=true ;;
    -h|--help)
      sed -n '1,10p' "$0"
      exit 0
      ;;
    *) echo "Unknown argument: $arg"; echo "Usage: $0 [--api] [--web] [--artifacts] [--outfits] [--nginx] [--migrate]"; exit 1 ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

print_step() {
  STEP_STARTED_AT=$(date +%s)
  echo ""
  echo "═══════════════════════════════════════════════"
  echo "  $1 ($(date '+%H:%M:%S'))"
  echo "═══════════════════════════════════════════════"
  CURRENT_STEP="$1"
}

print_step_done() {
  local finished_at duration
  finished_at=$(date +%s)
  duration=$((finished_at - STEP_STARTED_AT))
  echo "✅ ${CURRENT_STEP} finished in ${duration}s ($(date '+%H:%M:%S'))"
}

read_env_var() {
  local env_file="$1"
  local key="$2"
  local line value

  [[ -f "${env_file}" ]] || return 1

  line=$(grep -E "^${key}=" "${env_file}" | tail -n 1 || true)
  [[ -n "${line}" ]] || return 1

  value="${line#*=}"
  value="${value%$'\r'}"

  if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
    value="${value:1:-1}"
  elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
    value="${value:1:-1}"
  fi

  printf '%s\n' "${value}"
}

export_expo_public_env_vars() {
  local env_file="$1"

  [[ -f "${env_file}" ]] || return 0

  while IFS='=' read -r key value; do
    [[ "${key}" =~ ^EXPO_PUBLIC_[A-Za-z0-9_]+$ ]] || continue

    value="${value%$'\r'}"
    if [[ "${value}" == \"*\" && "${value}" == *\" ]]; then
      value="${value:1:-1}"
    elif [[ "${value}" == \'*\' && "${value}" == *\' ]]; then
      value="${value:1:-1}"
    fi

    export "${key}=${value}"
  done < <(grep -E '^EXPO_PUBLIC_[A-Za-z0-9_]+=' "${env_file}" || true)
}

format_duration() {
  local total_seconds="${1:-0}"
  local hours minutes seconds

  hours=$((total_seconds / 3600))
  minutes=$(((total_seconds % 3600) / 60))
  seconds=$((total_seconds % 60))

  if ((hours > 0)); then
    printf '%dh %dm %ds' "${hours}" "${minutes}" "${seconds}"
  elif ((minutes > 0)); then
    printf '%dm %ds' "${minutes}" "${seconds}"
  else
    printf '%ds' "${seconds}"
  fi
}

deploy_source_summary() {
  local branch revision state worktree_status

  branch=$(git symbolic-ref --quiet --short HEAD 2>/dev/null || printf 'detached')
  revision=$(git rev-parse --short=12 HEAD 2>/dev/null || printf 'unknown')
  worktree_status=$(git status --porcelain --untracked-files=normal 2>/dev/null || true)
  if [[ -n "${worktree_status}" ]]; then
    state="dirty"
  else
    state="clean"
  fi

  printf '%s@%s (%s)' "${branch}" "${revision}" "${state}"
}

deploy_drain_mode() {
  if ${DEPLOY_API}; then
    if [[ "${SKIP_DEPLOY_DRAIN:-false}" == "true" ]]; then
      printf 'skipped'
    else
      printf 'enabled'
    fi
  else
    printf 'not applicable'
  fi
}

deploy_characteristics() {
  local drain_mode
  drain_mode=$(deploy_drain_mode)

  printf 'Components: API=%s | Web=%s | Migrations=%s | Artifacts=%s | Outfits=%s | Nginx=%s\nSource: %s\nDrain: %s' \
    "${DEPLOY_API}" \
    "${DEPLOY_WEB}" \
    "${DEPLOY_MIGRATE}" \
    "${DEPLOY_ARTIFACTS}" \
    "${DEPLOY_OUTFITS}" \
    "${DEPLOY_NGINX}" \
    "$(deploy_source_summary)" \
    "${drain_mode}"
}

build_deploy_telegram_alert() {
  local phase="$1"
  local duration="${2:-}"
  local finished_at="${3:-}"
  local failed_step="${4:-}"
  local exit_code="${5:-}"

  TELEGRAM_ALERT_HELPER="${TELEGRAM_ALERT_HELPER}" \
  DEPLOY_ALERT_PHASE="${phase}" \
  DEPLOY_ALERT_ID="${DEPLOY_ID}" \
  DEPLOY_ALERT_SOURCE="$(deploy_source_summary)" \
  DEPLOY_ALERT_DRAIN="$(deploy_drain_mode)" \
  DEPLOY_ALERT_STARTED_AT="${DEPLOY_STARTED_AT_UTC}" \
  DEPLOY_ALERT_FINISHED_AT="${finished_at}" \
  DEPLOY_ALERT_DURATION="${duration}" \
  DEPLOY_ALERT_FAILED_STEP="${failed_step}" \
  DEPLOY_ALERT_EXIT_CODE="${exit_code}" \
  DEPLOY_ALERT_API="${DEPLOY_API}" \
  DEPLOY_ALERT_WEB="${DEPLOY_WEB}" \
  DEPLOY_ALERT_MIGRATIONS="${DEPLOY_MIGRATE}" \
  DEPLOY_ALERT_ARTIFACTS="${DEPLOY_ARTIFACTS}" \
  DEPLOY_ALERT_OUTFITS="${DEPLOY_OUTFITS}" \
  DEPLOY_ALERT_NGINX="${DEPLOY_NGINX}" \
  node <<'NODE'
const { buildDeployAlert } = require(process.env.TELEGRAM_ALERT_HELPER);
const enabled = (value) => value === 'true';

console.log(JSON.stringify(buildDeployAlert({
  phase: process.env.DEPLOY_ALERT_PHASE,
  deployId: process.env.DEPLOY_ALERT_ID,
  sourceSummary: process.env.DEPLOY_ALERT_SOURCE,
  drainMode: process.env.DEPLOY_ALERT_DRAIN,
  startedAt: process.env.DEPLOY_ALERT_STARTED_AT,
  finishedAt: process.env.DEPLOY_ALERT_FINISHED_AT,
  duration: process.env.DEPLOY_ALERT_DURATION,
  failedStep: process.env.DEPLOY_ALERT_FAILED_STEP,
  exitCode: process.env.DEPLOY_ALERT_EXIT_CODE,
  components: {
    api: enabled(process.env.DEPLOY_ALERT_API),
    web: enabled(process.env.DEPLOY_ALERT_WEB),
    migrations: enabled(process.env.DEPLOY_ALERT_MIGRATIONS),
    artifacts: enabled(process.env.DEPLOY_ALERT_ARTIFACTS),
    outfits: enabled(process.env.DEPLOY_ALERT_OUTFITS),
    nginx: enabled(process.env.DEPLOY_ALERT_NGINX),
  },
})));
NODE
}

sync_deploy_telegram_helper_best_effort() {
  if [[ "${DEPLOY_TELEGRAM_ENABLED}" != "true" || "${DEPLOY_TELEGRAM_DRY_RUN}" == "true" ]]; then
    return 0
  fi

  if ssh $SSH_OPTS -o BatchMode=yes "${DROPLET_USER}@${DROPLET_IP}" \
      "mkdir -p '${DROPLET_PATH}/scripts/lib'" \
    && scp -o ControlPath=${SSH_CONTROL_PATH} "${TELEGRAM_ALERT_HELPER}" \
      "${DROPLET_USER}@${DROPLET_IP}:${REMOTE_TELEGRAM_ALERT_HELPER}" \
    && ssh $SSH_OPTS -o BatchMode=yes "${DROPLET_USER}@${DROPLET_IP}" \
      "chmod 755 '${REMOTE_TELEGRAM_ALERT_HELPER}'"; then
    echo "✅ Telegram rich alert helper synced"
  else
    echo "⚠️  Telegram rich alert helper sync failed; deployment will continue" >&2
  fi

  return 0
}

send_deploy_telegram_notification() {
  local alert="$1"
  local alert_base64 delivery_result

  if [[ "${DEPLOY_TELEGRAM_ENABLED}" != "true" ]]; then
    echo "ℹ️  DEPLOY_TELEGRAM_ENABLED=${DEPLOY_TELEGRAM_ENABLED}, skipping Telegram deploy notification"
    return 0
  fi

  if [[ "${DEPLOY_TELEGRAM_DRY_RUN}" == "true" ]]; then
    echo "ℹ️  Telegram deploy rich notification dry run:"
    printf '%s' "${alert}" | node "${TELEGRAM_ALERT_HELPER}" preview
    return 0
  fi

  alert_base64=$(printf '%s' "${alert}" | base64 | tr -d '\n')
  delivery_result=$(ssh $SSH_OPTS -o BatchMode=yes "${DROPLET_USER}@${DROPLET_IP}" \
    "DEPLOY_ALERT_PAYLOAD_BASE64='${alert_base64}' DEPLOY_ALERT_MESSAGE_ID='${DEPLOY_TELEGRAM_MESSAGE_ID}' DEPLOY_ALERT_HELPER='${REMOTE_TELEGRAM_ALERT_HELPER}' bash -s" <<'REMOTE'
set -euo pipefail

for env_file in /etc/wondertales/ops-alert.env /etc/wondertales/deploy-alert.env; do
  if [[ -f "${env_file}" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "${env_file}"
    set +a
  fi
done

bot_token="${DEPLOY_ALERT_TELEGRAM_BOT_TOKEN:-${OPS_ALERT_TELEGRAM_BOT_TOKEN:-${TELEGRAM_BOT_TOKEN:-}}}"
chat_id="${DEPLOY_ALERT_TELEGRAM_CHAT_ID:-${OPS_ALERT_TELEGRAM_CHAT_ID:-${TELEGRAM_CHAT_ID:-}}}"

if [[ -z "${bot_token}" || -z "${chat_id}" ]]; then
  echo "Telegram deploy alert credentials are not configured on the droplet" >&2
  exit 3
fi

if [[ ! -f "${DEPLOY_ALERT_HELPER}" ]]; then
  echo "Telegram rich alert helper is not installed on the droplet" >&2
  exit 4
fi

TELEGRAM_ALERT_PAYLOAD_BASE64="${DEPLOY_ALERT_PAYLOAD_BASE64}" \
TELEGRAM_ALERT_MESSAGE_ID="${DEPLOY_ALERT_MESSAGE_ID}" \
TELEGRAM_BOT_TOKEN="${bot_token}" \
TELEGRAM_CHAT_ID="${chat_id}" \
node "${DEPLOY_ALERT_HELPER}" deliver
REMOTE
  )

  DEPLOY_TELEGRAM_LAST_DELIVERY=$(ALERT_DELIVERY_RESULT="${delivery_result}" node -e \
    "const result=JSON.parse(process.env.ALERT_DELIVERY_RESULT); console.log(result.mode + ' ' + result.action)")
  DEPLOY_TELEGRAM_MESSAGE_ID=$(ALERT_DELIVERY_RESULT="${delivery_result}" node -e \
    "const result=JSON.parse(process.env.ALERT_DELIVERY_RESULT); console.log(result.messageId || '')")
}

notify_deploy_telegram_best_effort() {
  local alert="$1"
  local phase="$2"

  if send_deploy_telegram_notification "${alert}"; then
    if [[ "${DEPLOY_TELEGRAM_ENABLED}" != "true" ]]; then
      echo "ℹ️  Telegram deploy ${phase} notification skipped"
    elif [[ "${DEPLOY_TELEGRAM_DRY_RUN}" == "true" ]]; then
      echo "✅ Telegram deploy ${phase} notification dry run completed"
    else
      echo "✅ Telegram deploy ${phase} notification sent (${DEPLOY_TELEGRAM_LAST_DELIVERY})"
    fi
  else
    echo "⚠️  Telegram deploy ${phase} notification failed; deployment will continue" >&2
  fi

  return 0
}

build_and_notify_deploy_telegram_best_effort() {
  local phase="$1"
  shift
  local alert

  if ! alert=$(build_deploy_telegram_alert "${phase}" "$@"); then
    echo "⚠️  Telegram deploy ${phase} notification could not be built; deployment will continue" >&2
    return 0
  fi

  notify_deploy_telegram_best_effort "${alert}" "${phase}"
}

ssh_droplet() {
  LAST_REMOTE_COMMAND="$*"
  ssh $SSH_OPTS "${DROPLET_USER}@${DROPLET_IP}" "$@"
}

upsert_remote_env_var() {
  local env_file="$1"
  local key="$2"
  local value="$3"

  ssh_droplet "if grep -q '^${key}=' '${env_file}'; then perl -0pi -e 's/^${key}=.*\$/${key}=${value}/m' '${env_file}'; else printf '\n${key}=${value}\n' >> '${env_file}'; fi"
}

create_deploy_tarball() {
  local output="$1"
  shift

  COPYFILE_DISABLE=1 tar --no-xattrs -czf "${output}" "$@"
}

upload_google_credentials() {
  local credentials_target credentials_filename local_credentials_path

  credentials_target=$(read_env_var "${PROJECT_ROOT}/.env.production" "GOOGLE_APPLICATION_CREDENTIALS" || true)
  if [[ -z "${credentials_target}" ]]; then
    echo "ℹ️  GOOGLE_APPLICATION_CREDENTIALS is not set in .env.production — skipping credential upload"
    return 0
  fi

  if [[ "${credentials_target}" != /app/secrets/* ]]; then
    echo "❌ GOOGLE_APPLICATION_CREDENTIALS must point inside /app/secrets in .env.production"
    echo "   current value: ${credentials_target}"
    exit 1
  fi

  credentials_filename="$(basename "${credentials_target}")"
  local_credentials_path="${PROJECT_ROOT}/services/api/${credentials_filename}"

  if [[ ! -f "${local_credentials_path}" ]]; then
    echo "❌ Local Google credentials file not found: ${local_credentials_path}"
    echo "   Expected a local-only file whose basename matches GOOGLE_APPLICATION_CREDENTIALS in .env.production"
    exit 1
  fi

  print_step "Uploading Google service account JSON..."
  ssh_droplet "mkdir -p ${DROPLET_PATH}/secrets && chmod 700 ${DROPLET_PATH}/secrets"
  scp -o ControlPath=${SSH_CONTROL_PATH} "${local_credentials_path}" \
    ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/secrets/${credentials_filename}
  ssh_droplet "chmod 600 ${DROPLET_PATH}/secrets/${credentials_filename}"
  print_step_done
}

sync_voice_samples() {
  local voice_samples_dir="${PROJECT_ROOT}/services/api/uploads/voice-samples"
  local voice_samples_tarball="/tmp/wondertales-voice-samples.tar.gz"
  local voice_sample_count

  if [[ ! -d "${voice_samples_dir}" ]]; then
    echo "❌ Local voice samples directory not found: ${voice_samples_dir}"
    exit 1
  fi

  voice_sample_count=$(find "${voice_samples_dir}" -mindepth 2 -maxdepth 2 -type f -name '*.mp3' | wc -l | tr -d ' ')
  if [[ -z "${voice_sample_count}" || "${voice_sample_count}" == "0" ]]; then
    echo "❌ No local voice sample mp3 files found in ${voice_samples_dir}"
    exit 1
  fi

  print_step "Syncing localized voice samples to API upload volume..."
  create_deploy_tarball "${voice_samples_tarball}" -C "${PROJECT_ROOT}/services/api/uploads" voice-samples
  scp -o ControlPath=${SSH_CONTROL_PATH} "${voice_samples_tarball}" \
    ${DROPLET_USER}@${DROPLET_IP}:/tmp/wondertales-voice-samples.tar.gz
  rm -f "${voice_samples_tarball}"

  ssh_droplet << 'EOF'
docker cp /tmp/wondertales-voice-samples.tar.gz wondertales-api-prod:/tmp/wondertales-voice-samples.tar.gz
docker exec wondertales-api-prod sh -lc '
  mkdir -p /app/services/api/uploads
  tar -xzf /tmp/wondertales-voice-samples.tar.gz -C /app/services/api/uploads
  find /app/services/api/uploads/voice-samples -type f -name "._*.mp3" -delete
  rm -f /tmp/wondertales-voice-samples.tar.gz
  for d in /app/services/api/uploads/voice-samples/*; do
    [ -d "$d" ] || continue
    printf "%s " "$(basename "$d")"
    find "$d" -maxdepth 1 -type f -name "*.mp3" | wc -l | tr -d " "
  done
'
rm -f /tmp/wondertales-voice-samples.tar.gz
EOF
  print_step_done
}

sync_story_artifact_images() {
  local artifact_dir="${PROJECT_ROOT}/services/api/uploads/story-artifacts"
  local artifact_tarball="/tmp/wondertales-story-artifacts-$$.tar.gz"
  local artifact_original_count artifact_thumbnail_count artifact_checksum remote_artifact_state

  if [[ "${SKIP_STORY_ARTIFACT_SYNC:-false}" == "true" ]]; then
    echo "⚠️  SKIP_STORY_ARTIFACT_SYNC=true, skipping story artifact image sync"
    return 0
  fi

  if [[ ! -d "${artifact_dir}" ]]; then
    echo "❌ Local story artifact image directory not found: ${artifact_dir}"
    exit 1
  fi

  artifact_original_count=$(find "${artifact_dir}" -maxdepth 1 -type f -name '[0-9][0-9][0-9].png' | wc -l | tr -d ' ')
  artifact_thumbnail_count=$(find "${artifact_dir}" -maxdepth 1 -type f -name '[0-9][0-9][0-9]_thumb.jpg' | wc -l | tr -d ' ')

  if [[ "${artifact_original_count}" == "0" ]]; then
    echo "❌ No canonical story artifact PNG files found in ${artifact_dir}"
    exit 1
  fi
  if [[ "${artifact_original_count}" != "${artifact_thumbnail_count}" ]]; then
    echo "❌ Story artifact originals/thumbnails do not match"
    echo "   Originals:  ${artifact_original_count}"
    echo "   Thumbnails: ${artifact_thumbnail_count}"
    exit 1
  fi

  local original_path thumbnail_path artifact_code
  while IFS= read -r original_path; do
    artifact_code="$(basename "${original_path}" .png)"
    thumbnail_path="${artifact_dir}/${artifact_code}_thumb.jpg"
    if [[ ! -f "${thumbnail_path}" ]]; then
      echo "❌ Missing story artifact thumbnail: ${thumbnail_path}"
      exit 1
    fi
  done < <(find "${artifact_dir}" -maxdepth 1 -type f -name '[0-9][0-9][0-9].png' | sort)

  artifact_checksum=$(
    cd "${PROJECT_ROOT}/services/api/uploads"
    while IFS= read -r artifact_path; do
      shasum -a 256 "${artifact_path}"
    done < <(
      find story-artifacts -maxdepth 1 -type f \
        \( -name '[0-9][0-9][0-9].png' -o -name '[0-9][0-9][0-9]_thumb.jpg' \) \
        -print | sort
    ) | shasum -a 256 | awk '{print $1}'
  )

  if [[ "${FORCE_STORY_ARTIFACT_SYNC:-false}" != "true" ]]; then
    remote_artifact_state=$(ssh_droplet "docker exec wondertales-api-prod sh -lc '
      artifact_dir=/app/services/api/uploads/story-artifacts
      checksum=\$(cat \"\${artifact_dir}/.deploy.sha256\" 2>/dev/null || true)
      originals=\$(find \"\${artifact_dir}\" -maxdepth 1 -type f -name \"[0-9][0-9][0-9].png\" 2>/dev/null | wc -l | tr -d \" \")
      thumbnails=\$(find \"\${artifact_dir}\" -maxdepth 1 -type f -name \"[0-9][0-9][0-9]_thumb.jpg\" 2>/dev/null | wc -l | tr -d \" \")
      printf \"%s|%s|%s\" \"\${checksum}\" \"\${originals}\" \"\${thumbnails}\"
    ' 2>/dev/null || true")
    if [[ "${remote_artifact_state}" == "${artifact_checksum}|${artifact_original_count}|${artifact_thumbnail_count}" ]]; then
      echo "ℹ️  Story artifact images already match production (${artifact_original_count} originals, ${artifact_thumbnail_count} thumbnails)"
      return 0
    fi
  fi

  print_step "Syncing story artifact images to API upload volume..."
  echo "   Originals:  ${artifact_original_count}"
  echo "   Thumbnails: ${artifact_thumbnail_count}"

  (
    cd "${PROJECT_ROOT}/services/api/uploads"
    find story-artifacts -maxdepth 1 -type f \
        \( -name '[0-9][0-9][0-9].png' -o -name '[0-9][0-9][0-9]_thumb.jpg' \) \
        -print | sort | \
      COPYFILE_DISABLE=1 tar --no-xattrs -czf "${artifact_tarball}" -T -
  )
  scp -o ControlPath=${SSH_CONTROL_PATH} "${artifact_tarball}" \
    ${DROPLET_USER}@${DROPLET_IP}:/tmp/wondertales-story-artifacts.tar.gz
  rm -f "${artifact_tarball}"

  ssh_droplet << EOF
if ! docker ps --filter name=wondertales-api-prod --filter status=running --format '{{.Names}}' | grep -q wondertales-api-prod; then
  echo "❌ wondertales-api-prod is not running; cannot sync story artifacts into the api_uploads volume"
  exit 1
fi
docker cp /tmp/wondertales-story-artifacts.tar.gz wondertales-api-prod:/tmp/wondertales-story-artifacts.tar.gz
docker exec wondertales-api-prod sh -lc '
  set -eu
  upload_root=/app/services/api/uploads
  staging_root=\${upload_root}/.story-artifacts-sync
  rm -rf "\${staging_root}"
  mkdir -p "\${staging_root}"
  tar -xzf /tmp/wondertales-story-artifacts.tar.gz -C "\${staging_root}"
  rm -f /tmp/wondertales-story-artifacts.tar.gz

  original_count=\$(find "\${staging_root}/story-artifacts" -maxdepth 1 -type f -name "[0-9][0-9][0-9].png" | wc -l | tr -d " ")
  thumbnail_count=\$(find "\${staging_root}/story-artifacts" -maxdepth 1 -type f -name "[0-9][0-9][0-9]_thumb.jpg" | wc -l | tr -d " ")
  if [ "\${original_count}" != "${artifact_original_count}" ] || [ "\${thumbnail_count}" != "${artifact_thumbnail_count}" ]; then
    echo "❌ Extracted story artifact file count mismatch"
    echo "   Originals:  \${original_count} (expected ${artifact_original_count})"
    echo "   Thumbnails: \${thumbnail_count} (expected ${artifact_thumbnail_count})"
    exit 1
  fi

  rm -rf "\${upload_root}/story-artifacts.previous"
  if [ -d "\${upload_root}/story-artifacts" ]; then
    mv "\${upload_root}/story-artifacts" "\${upload_root}/story-artifacts.previous"
  fi
  if ! mv "\${staging_root}/story-artifacts" "\${upload_root}/story-artifacts"; then
    if [ -d "\${upload_root}/story-artifacts.previous" ]; then
      mv "\${upload_root}/story-artifacts.previous" "\${upload_root}/story-artifacts"
    fi
    exit 1
  fi
  printf "%s\n" "${artifact_checksum}" > "\${upload_root}/story-artifacts/.deploy.sha256"
  rm -rf "\${upload_root}/story-artifacts.previous" "\${staging_root}"
  printf "story artifact originals: %s\n" "\${original_count}"
  printf "story artifact thumbnails: %s\n" "\${thumbnail_count}"
  du -sh "\${upload_root}/story-artifacts" || true
'
rm -f /tmp/wondertales-story-artifacts.tar.gz
EOF
  print_step_done
}

sync_outfit_plate_cache() {
  local outfit_dir="${PROJECT_ROOT}/services/api/uploads/outfit_plate_cache"
  local outfit_tarball="/tmp/wondertales-outfit-plate-cache.tar.gz"
  local outfit_count

  if [[ "${SKIP_OUTFIT_PLATE_SYNC:-false}" == "true" ]]; then
    echo "⚠️  SKIP_OUTFIT_PLATE_SYNC=true, skipping outfit plate cache sync"
    return 0
  fi

  if [[ ! -d "${outfit_dir}" ]]; then
    echo "❌ Local outfit plate cache directory not found: ${outfit_dir}"
    exit 1
  fi

  outfit_count=$(find "${outfit_dir}" -maxdepth 1 -type f \( -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.png' -o -iname '*.webp' \) ! -name '*.source.*' ! -name '._*' | wc -l | tr -d ' ')
  if [[ -z "${outfit_count}" || "${outfit_count}" == "0" ]]; then
    echo "❌ No outfit plate image files found in ${outfit_dir}"
    exit 1
  fi

  print_step "Syncing pregenerated outfit plates to API upload volume..."
  echo "   Local outfit plate files: ${outfit_count}"
  COPYFILE_DISABLE=1 tar --no-xattrs \
    --exclude='outfit_plate_cache/*.source.*' \
    --exclude='outfit_plate_cache/._*' \
    -czf "${outfit_tarball}" \
    -C "${PROJECT_ROOT}/services/api/uploads" \
    outfit_plate_cache
  scp -o ControlPath=${SSH_CONTROL_PATH} "${outfit_tarball}" \
    ${DROPLET_USER}@${DROPLET_IP}:/tmp/wondertales-outfit-plate-cache.tar.gz
  rm -f "${outfit_tarball}"

  ssh_droplet << 'EOF'
if ! docker ps --filter name=wondertales-api-prod --filter status=running --format '{{.Names}}' | grep -q wondertales-api-prod; then
  echo "❌ wondertales-api-prod is not running; cannot sync outfit plates into the api_uploads volume"
  exit 1
fi
docker cp /tmp/wondertales-outfit-plate-cache.tar.gz wondertales-api-prod:/tmp/wondertales-outfit-plate-cache.tar.gz
docker exec wondertales-api-prod sh -lc '
  mkdir -p /app/services/api/uploads
  tar -xzf /tmp/wondertales-outfit-plate-cache.tar.gz -C /app/services/api/uploads
  find /app/services/api/uploads/outfit_plate_cache -type f \( -name "._*" -o -name "*.source.*" \) -delete
  rm -f /tmp/wondertales-outfit-plate-cache.tar.gz
  printf "outfit_plate_cache files: "
  find /app/services/api/uploads/outfit_plate_cache -maxdepth 1 -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" -o -name "*.webp" \) | wc -l | tr -d " "
  printf "\n"
  du -sh /app/services/api/uploads/outfit_plate_cache || true
'
rm -f /tmp/wondertales-outfit-plate-cache.tar.gz
EOF
  print_step_done
}

cleanup_api_docker_artifacts() {
  local available_kb

  print_step "Cleaning superseded API images..."
  ssh_droplet << EOF
cd ${DROPLET_PATH}
echo "--- Before cleanup ---"
docker system df || true
echo
echo "+ docker image prune -f"
docker image prune -f
echo
echo "--- After cleanup ---"
docker system df || true
EOF

  available_kb=$(ssh_droplet "df -Pk / | awk 'NR==2 {print \$4}'" | tr -d '[:space:]')
  if [[ -z "${available_kb}" || ! "${available_kb}" =~ ^[0-9]+$ ]]; then
    echo "❌ Could not determine free disk space after Docker cleanup"
    return 1
  fi
  if (( available_kb < API_POST_DEPLOY_MIN_FREE_KB )); then
    echo "❌ Only $((available_kb / 1024))MB is free after Docker cleanup; at least $((API_POST_DEPLOY_MIN_FREE_KB / 1024))MB is required"
    return 1
  fi

  echo "✅ $((available_kb / 1024))MB free after removing superseded images"
  print_step_done
}

prepare_disk_for_api_deploy() {
  local required_kb="$1"
  local available_kb
  available_kb=$(ssh_droplet "df -Pk / | awk 'NR==2 {print \$4}'" | tr -d '[:space:]')

  if [[ -z "${available_kb}" || ! "${available_kb}" =~ ^[0-9]+$ ]]; then
    echo "❌ Could not determine free disk space before API upload"
    return 1
  fi

  if (( available_kb >= required_kb )); then
    echo "ℹ️  $((available_kb / 1024))MB free before API upload; $((required_kb / 1024))MB required"
    return 0
  fi

  print_step "Low disk space before API upload, cleaning superseded images..."
  ssh_droplet << EOF
cd ${DROPLET_PATH}
echo "--- Before pre-cleanup ---"
df -h /
docker system df || true
echo
echo "+ docker image prune -f"
docker image prune -f
echo
echo "--- After pre-cleanup ---"
df -h /
docker system df || true
EOF

  available_kb=$(ssh_droplet "df -Pk / | awk 'NR==2 {print \$4}'" | tr -d '[:space:]')
  if [[ -z "${available_kb}" || ! "${available_kb}" =~ ^[0-9]+$ ]]; then
    echo "❌ Could not determine free disk space after pre-cleanup"
    return 1
  fi
  if (( available_kb < required_kb )); then
    echo "❌ Only $((available_kb / 1024))MB is free after cleanup; API upload/load requires $((required_kb / 1024))MB"
    echo "   The running API was left untouched. Free disk space before retrying the deploy."
    return 1
  fi

  echo "✅ $((available_kb / 1024))MB free after pre-cleanup"
  print_step_done
}

sync_migration_files() {
  local migration_tarball="/tmp/wondertales-migrations-$$.tar.gz"

  print_step "Syncing SQL migration files to the running API container..."
  (
    cd "${PROJECT_ROOT}/services/api"
    COPYFILE_DISABLE=1 tar --no-xattrs -czf "${migration_tarball}" drizzle
  )
  scp -o ControlPath=${SSH_CONTROL_PATH} "${migration_tarball}" \
    ${DROPLET_USER}@${DROPLET_IP}:/tmp/wondertales-migrations.tar.gz
  rm -f "${migration_tarball}"

  ssh_droplet << 'EOF'
set -eu
docker cp /tmp/wondertales-migrations.tar.gz wondertales-api-prod:/tmp/wondertales-migrations.tar.gz
docker exec wondertales-api-prod sh -lc '
  set -eu
  mkdir -p /app/services/api/drizzle
  tar -xzf /tmp/wondertales-migrations.tar.gz -C /app/services/api
  rm -f /tmp/wondertales-migrations.tar.gz
'
rm -f /tmp/wondertales-migrations.tar.gz
EOF
  print_step_done
}

run_migrations_in_container() {
  local remote_cmd="cd ${DROPLET_PATH} && docker exec wondertales-api-prod sh -c 'cd /app/services/api && npx tsx src/scripts/runAllMigrations.ts'"

  echo "🔄 Running migrations inside API container..."
  if ! ssh_droplet "${remote_cmd}"; then
    echo "❌ Migration command failed. Collecting diagnostics..."
    ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml ps && echo '--- API logs (tail 120) ---' && docker compose -f docker-compose.prod.yml logs api --tail 120" || true
    return 1
  fi
}

sync_nginx_config() {
  print_step "Checking legacy nginx handoff state..."

  # nginx/conf.d references Let's Encrypt paths; nginx -t fails if files are missing.
  local tls_live="${DROPLET_PATH}/certbot/conf/live/wondertales.art"
  if ! ssh_droplet "test -r '${tls_live}/fullchain.pem' && test -r '${tls_live}/privkey.pem'"; then
    echo ""
    echo "❌ TLS files missing on droplet (nginx -t will fail until they exist):"
    echo "     ${tls_live}/fullchain.pem"
    echo "     ${tls_live}/privkey.pem"
    echo ""
    echo "   Issue a certificate (DNS for wondertales.art must point to this server; port 80 reachable):"
    echo "   ssh ${DROPLET_USER}@${DROPLET_IP}"
    echo "   cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml up -d nginx"
    echo "   docker run --rm \\"
    echo "     -v ${DROPLET_PATH}/certbot/conf:/etc/letsencrypt \\"
    echo "     -v ${DROPLET_PATH}/certbot/www:/var/www/certbot \\"
    echo "     certbot/certbot certonly --webroot -w /var/www/certbot -d wondertales.art --email YOUR@EMAIL --agree-tos -n"
    echo ""
    echo "   Temporary workaround: symlink an existing live/... folder to live/wondertales.art (wrong hostname in cert until replaced)."
    echo ""
    return 1
  fi

  local nginx_tarball="/tmp/kazka-nginx-config.tar.gz"

  create_deploy_tarball "${nginx_tarball}" \
    docker-compose.prod.yml \
    nginx/nginx.conf \
    nginx/conf.d \
    nginx/includes \
    apps/universal-app/nginx.conf

  ssh_droplet "mkdir -p ${DROPLET_PATH}/nginx/conf.d ${DROPLET_PATH}/nginx/includes ${DROPLET_PATH}/apps/universal-app"
  scp -o ControlPath=${SSH_CONTROL_PATH} "${nginx_tarball}" ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  rm -f "${nginx_tarball}"

  ssh_droplet << EOF
cd ${DROPLET_PATH}
tar -xzf kazka-nginx-config.tar.gz
rm -f kazka-nginx-config.tar.gz
find nginx -name '._*' -delete
EOF

  echo "🔍 Validating nginx config in temporary nginx container..."
  ssh_droplet "docker run --rm \
    --add-host api:127.0.0.1 \
    --add-host webapp:127.0.0.1 \
    -v ${DROPLET_PATH}/nginx/nginx.conf:/etc/nginx/nginx.conf:ro \
    -v ${DROPLET_PATH}/nginx/conf.d:/etc/nginx/conf.d:ro \
    -v ${DROPLET_PATH}/nginx/includes:/etc/nginx/includes:ro \
    -v ${DROPLET_PATH}/certbot/conf:/etc/letsencrypt:ro \
    -v ${DROPLET_PATH}/certbot/www:/var/www/certbot:ro \
    nginx:alpine nginx -t"

  echo "🛑 Stopping legacy story nginx; shared-nginx-proxy owns public ingress now..."
  ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml stop nginx >/dev/null 2>&1 || true"
  echo "✅ Legacy nginx config validates. Deploy live public nginx from /var/www/proxy with the proxy repo."
}

restart_shared_proxy_if_present() {
  echo "🔄 Refreshing shared public proxy upstreams..."
  ssh_droplet "docker ps --format '{{.Names}}' | grep -qx 'shared-nginx-proxy' && docker restart shared-nginx-proxy >/dev/null || true"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Run pending migrations on droplet
# ─────────────────────────────────────────────────────────────────────────────
run_migrations() {
  print_step "Running pending migrations on droplet..."

  # Check if api container is running
  if ! ssh_droplet "docker ps --filter name=wondertales-api-prod --filter status=running --format '{{.Names}}'" | grep -q "wondertales-api-prod"; then
    echo "⚠️  API container is not running — skipping migrations (will run after deploy)"
    return 0
  fi

  sync_migration_files
  run_migrations_in_container
  echo "✅ Migrations done"
}

set_remote_ops_mode() {
  local mode="$1"
  local message="${2:-}"
  local ends_at="${3:-}"

  ssh_droplet "cd ${DROPLET_PATH} && if docker ps --filter name=wondertales-api-prod --filter status=running --format '{{.Names}}' | grep -q wondertales-api-prod; then docker exec wondertales-api-prod sh -lc 'cd /app/services/api && node dist/scripts/setOpsMode.js \"${mode}\" \"${message}\" \"${ends_at}\"'; else echo 'API container is not running; cannot set ops mode'; exit 2; fi"
}

wait_for_generation_drain() {
  print_step "Draining active generation jobs before API deploy"

  local maintenance_end
  maintenance_end="$(date -u -v+15M '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '+15 minutes' '+%Y-%m-%dT%H:%M:%SZ')"

  if [[ "${SKIP_DEPLOY_DRAIN:-false}" == "true" ]]; then
    echo "⚠️  SKIP_DEPLOY_DRAIN=true, skipping generation drain"
    set_remote_ops_mode "draining" "WonderTales is being updated. New generations are paused for a few minutes." "${maintenance_end}" || true
    print_step_done
    return 0
  fi

  if ! set_remote_ops_mode "draining" "WonderTales is being updated. New generations are paused for a few minutes." "${maintenance_end}"; then
    echo "⚠️  Could not set draining mode. This is expected on the first deploy that introduces ops mode."
    print_step_done
    return 0
  fi

  ssh_droplet "cd ${DROPLET_PATH} && docker exec wondertales-api-prod sh -lc 'cd /app/services/api && if [ -f dist/scripts/expireStaleStoryRequests.js ]; then node dist/scripts/expireStaleStoryRequests.js --ttl-ms=${DEPLOY_ACTIVE_REQUEST_TTL_MS}; else echo \"expireStaleStoryRequests.js is not present yet; skipping stale cleanup\"; fi'"

  if ! ssh_droplet "cd ${DROPLET_PATH} && docker exec wondertales-api-prod sh -lc 'cd /app/services/api && node dist/scripts/waitForGenerationDrain.js --timeout-ms=${DEPLOY_DRAIN_TIMEOUT_MS} --poll-ms=5000 --active-request-window-ms=${DEPLOY_ACTIVE_REQUEST_TTL_MS}'"; then
    echo "❌ Active generation jobs did not drain within ${DEPLOY_DRAIN_TIMEOUT_MS}ms"
    echo "   Re-run with SKIP_DEPLOY_DRAIN=true only if you intentionally accept recovery/retry behavior."
    exit 1
  fi

  print_step_done
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Build and deploy API
# ─────────────────────────────────────────────────────────────────────────────
deploy_api() {
  local existing_web_build_id local_web_build_id api_tarball_kb api_image_kb required_remote_kb
  existing_web_build_id=$(ssh_droplet "if [ -f '${DROPLET_PATH}/.env.production' ]; then grep -E '^WEB_BUILD_ID=' '${DROPLET_PATH}/.env.production' | tail -n 1 | cut -d= -f2-; fi" || true)
  local_web_build_id=$(read_env_var "${PROJECT_ROOT}/.env.production" "WEB_BUILD_ID" || true)

  print_step "Building API image locally (linux/amd64)..."
  docker build --platform linux/amd64 -t ${API_IMAGE}:${API_TAG} \
    -f services/api/Dockerfile \
    --target production \
    .
  print_step_done

  print_step "Saving API image to tarball..."
  docker save ${API_IMAGE}:${API_TAG} | gzip > /tmp/${API_IMAGE}.tar.gz
  print_step_done

  api_tarball_kb=$(du -k "/tmp/${API_IMAGE}.tar.gz" | awk '{print $1}')
  api_image_kb=$(( ($(docker image inspect --format '{{.Size}}' "${API_IMAGE}:${API_TAG}") + 1023) / 1024 ))
  required_remote_kb=$((api_tarball_kb + api_image_kb + API_RUNTIME_DISK_RESERVE_KB))
  prepare_disk_for_api_deploy "${required_remote_kb}"

  # Keep production in normal mode while local build and remote disk preflight run.
  # Drain only once the artifact is ready and the deploy is certain it can upload it.
  wait_for_generation_drain

  print_step "Uploading API image to droplet..."
  scp -o ControlPath=${SSH_CONTROL_PATH} /tmp/${API_IMAGE}.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  print_step_done

  print_step "Uploading .env.production..."
  scp -o ControlPath=${SSH_CONTROL_PATH} .env.production ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  if [[ -z "${local_web_build_id}" && -n "${existing_web_build_id}" ]]; then
    upsert_remote_env_var "${DROPLET_PATH}/.env.production" "WEB_BUILD_ID" "${existing_web_build_id}"
    echo "   ✓ Preserved WEB_BUILD_ID=${existing_web_build_id}"
  fi
  print_step_done

  upload_google_credentials

  print_step "Uploading production compose file..."
  scp -o ControlPath=${SSH_CONTROL_PATH} docker-compose.prod.yml ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/docker-compose.prod.yml
  print_step_done

  print_step "Loading API image and restarting on droplet..."
  ssh_droplet << EOF
cd ${DROPLET_PATH}
echo "Starting docker load at \$(date '+%H:%M:%S')"
docker load < ${API_IMAGE}.tar.gz
echo "Finished docker load at \$(date '+%H:%M:%S')"
rm -f ${API_IMAGE}.tar.gz
echo "Starting docker compose up api at \$(date '+%H:%M:%S')"
docker compose -f docker-compose.prod.yml up -d api
echo "Finished docker compose up at \$(date '+%H:%M:%S')"
EOF
  print_step_done

  rm -f /tmp/${API_IMAGE}.tar.gz
  sync_voice_samples
  sync_story_artifact_images
  sync_outfit_plate_cache
  sync_nginx_config
  echo "✅ API deployed"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Run migrations after API is up (post-deploy)
# ─────────────────────────────────────────────────────────────────────────────
invalidate_remote_ssr_html_cache() {
  print_step "Invalidating rendered HTML cache after API deploy..."
  ssh_droplet << 'EOF'
docker exec wondertales-redis-prod sh -lc '
  set -eu
  for pattern in "ssr:pages:*" "ssr:stories:*"; do
    redis-cli --scan --pattern "$pattern" | while IFS= read -r key; do
      [ -n "$key" ] || continue
      redis-cli UNLINK "$key" >/dev/null
    done
  done
'
EOF
  print_step_done
}

run_migrations_post_deploy() {
  print_step "Running pending migrations (post-deploy)..."

  echo "⏳ Waiting for API container to be healthy..."
  local status=""
  for i in $(seq 1 20); do
    status=$(ssh_droplet "docker inspect --format='{{.State.Health.Status}}' wondertales-api-prod 2>/dev/null || docker inspect --format='{{.State.Status}}' wondertales-api-prod 2>/dev/null || echo unknown" | tr -d '[:space:]')
    echo "   Waiting... ($i/20) status: $status"
    if [[ "$status" == "healthy" ]]; then
      echo "   Container is healthy"
      break
    fi
    if [[ "$status" == "running" && $i -gt 5 ]]; then
      echo "   Container is running (no healthcheck)"
      break
    fi
    sleep 3
  done

  if [[ "$status" != "healthy" && "$status" != "running" ]]; then
    echo "❌ API container is not ready for migrations (status: ${status:-unknown})"
    exit 1
  fi

  run_migrations_in_container
  invalidate_remote_ssr_html_cache

  print_step "Starting worker container..."
  # Both api and worker use the mutable kazka-api:latest tag. `up -d worker`
  # alone may keep a running worker on the previous image, so recreate it
  # explicitly after every API image upload.
  ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml up -d --force-recreate worker"
  print_step_done

  print_step "Restoring normal ops mode..."
  if set_remote_ops_mode "normal" "" ""; then
    echo "   Ops mode is normal"
  else
    echo "⚠️  Failed to restore normal ops mode automatically; check /api/v1/ops/status"
  fi
  print_step_done

  echo "✅ Migrations done"
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Build and deploy webapp
# ─────────────────────────────────────────────────────────────────────────────
deploy_webapp() {
  print_step "Building webapp locally..."
  cd apps/universal-app
  export EXPO_PUBLIC_API_BASE_URL=https://wondertales.art
  export_expo_public_env_vars "${PROJECT_ROOT}/.env.production"

  rm -rf .expo node_modules/.cache 2>/dev/null || true
  pnpm build:web:clean
  mkdir -p dist/.well-known
  cp public/.well-known/security.txt dist/.well-known/security.txt
  cd "$PROJECT_ROOT"

  # Verify build scheme
  echo "🔍 Verifying build..."
  if grep -rq "kazka://" apps/universal-app/dist/ 2>/dev/null; then
    echo "❌ ERROR: Build contains kazka:// (stale cache). Run: cd apps/universal-app && rm -rf .expo node_modules/.cache && pnpm build:web:clean"
    exit 1
  fi
  if ! grep -rq "wondertales://" apps/universal-app/dist/ 2>/dev/null; then
    echo "❌ ERROR: Build missing wondertales:// — check linking config in App.tsx"
    exit 1
  fi
  echo "   ✓ Build verified (wondertales://)"

  local expo_bundle
  expo_bundle=$(find apps/universal-app/dist/_expo/static/js/web -maxdepth 1 -type f -name '*.js' | head -n 1)
  if [[ -z "${expo_bundle}" ]]; then
    echo "❌ ERROR: Could not find Expo web bundle in apps/universal-app/dist/_expo/static/js/web"
    exit 1
  fi

  local expo_bundle_hash expo_bundle_dir expo_bundle_name expo_bundle_hashed
  expo_bundle_hash=$(shasum -a 256 "${expo_bundle}" | awk '{print substr($1, 1, 12)}')
  expo_bundle_dir="$(dirname "${expo_bundle}")"
  expo_bundle_name="$(basename "${expo_bundle}" .js)"
  expo_bundle_hashed="${expo_bundle_dir}/${expo_bundle_name}-${expo_bundle_hash}.js"
  if [[ "${expo_bundle}" != "${expo_bundle_hashed}" ]]; then
    mv "${expo_bundle}" "${expo_bundle_hashed}"
    perl -0pi -e "s#/_expo/static/js/web/[^\"']+\\.js#/_expo/static/js/web/$(basename "${expo_bundle_hashed}")#g" apps/universal-app/dist/index.html
    expo_bundle="${expo_bundle_hashed}"
  fi
  echo "   ✓ Fingerprinted web bundle: $(basename "${expo_bundle}")"

  if ! grep -q '__WT_WEB_BUILD_ID__' apps/universal-app/dist/index.html; then
    echo "❌ ERROR: Web build is missing the build version placeholder"
    exit 1
  fi
  perl -0pi -e "s/__WT_WEB_BUILD_ID__/${expo_bundle_hash}/g" \
    apps/universal-app/dist/index.html \
    apps/universal-app/dist/build-version.json \
    apps/universal-app/dist/manifest.json
  echo "   ✓ Embedded web build version: ${expo_bundle_hash}"

  mkdir -p apps/universal-app/dist/static/js
  cp "${expo_bundle}" apps/universal-app/dist/static/js/bundle.js
  echo "   ✓ Created SSR compatibility bundle at /static/js/bundle.js"

  print_step "Uploading webapp to droplet..."
  cd apps/universal-app
  create_deploy_tarball dist.tar.gz dist/
  cd "$PROJECT_ROOT"
  scp -o ControlPath=${SSH_CONTROL_PATH} apps/universal-app/dist.tar.gz ${DROPLET_USER}@${DROPLET_IP}:${DROPLET_PATH}/
  rm apps/universal-app/dist.tar.gz

  sync_nginx_config

  print_step "Updating SSR web bundle version..."
  upsert_remote_env_var "${DROPLET_PATH}/.env.production" "WEB_BUILD_ID" "${expo_bundle_hash}"
  echo "   ✓ WEB_BUILD_ID=${expo_bundle_hash}"
  print_step_done

  print_step "Extracting and recreating webapp..."
  ssh_droplet << 'EOF'
cd /var/www/kazka
mkdir -p apps/universal-app
rm -rf apps/universal-app/dist
tar -xzf dist.tar.gz -C apps/universal-app/
rm -f dist.tar.gz
if [ -e dist ]; then
  rm -rf dist
  ln -sfn apps/universal-app/dist dist
fi
docker compose -f docker-compose.prod.yml up -d --force-recreate api webapp
EOF

  restart_shared_proxy_if_present

  echo "✅ Webapp deployed"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# Install traps before opening the master connection so connection failures also
# produce a best-effort failure notification when the droplet remains reachable.
trap cleanup EXIT
trap 'on_error "${LINENO}" "${BASH_COMMAND}"' ERR

# Open master connection once (triggers passphrase prompt if needed).
ssh $SSH_OPTS -o BatchMode=no "${DROPLET_USER}@${DROPLET_IP}" true
sync_deploy_telegram_helper_best_effort

build_and_notify_deploy_telegram_best_effort "start"

echo "Deploy started"
echo "   ID:       ${DEPLOY_ID}"
echo "   API:      $DEPLOY_API"
echo "   Webapp:   $DEPLOY_WEB"
echo "   Artifacts: $DEPLOY_ARTIFACTS"
echo "   Outfits:  $DEPLOY_OUTFITS"
echo "   Nginx:    $DEPLOY_NGINX"
echo "   Migrate:  $DEPLOY_MIGRATE"
echo "   Droplet:  ${DROPLET_USER}@${DROPLET_IP}"

# Pre-deploy: run migrations if API is already running
if $DEPLOY_MIGRATE && ! $DEPLOY_API; then
  run_migrations
fi

# Deploy API (includes image build + upload + restart)
if $DEPLOY_API; then
  deploy_api
  # Post-deploy migrations: after new image is running
  run_migrations_post_deploy
  cleanup_api_docker_artifacts
fi

# Sync pregenerated outfit assets without rebuilding API.
if $DEPLOY_OUTFITS && ! $DEPLOY_API; then
  sync_outfit_plate_cache
fi

# Sync story artifact catalog images without rebuilding API.
if $DEPLOY_ARTIFACTS && ! $DEPLOY_API; then
  sync_story_artifact_images
fi

# Deploy webapp
if $DEPLOY_WEB; then
  deploy_webapp
fi

# Validate legacy nginx handoff config without rebuilding API or webapp.
if $DEPLOY_NGINX; then
  sync_nginx_config
fi

# Final status
print_step "Deployment complete!"
ssh_droplet "cd ${DROPLET_PATH} && docker compose -f docker-compose.prod.yml ps"

echo ""
echo "🌐 API:    https://wondertales.art/health"
echo "🌐 App:    https://wondertales.art"

deploy_completed_at_utc=$(date -u '+%Y-%m-%d %H:%M:%S UTC')
deploy_duration=$(( $(date +%s) - DEPLOY_STARTED_AT ))
build_and_notify_deploy_telegram_best_effort \
  "success" \
  "$(format_duration "${deploy_duration}")" \
  "${deploy_completed_at_utc}"
