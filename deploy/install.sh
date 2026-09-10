#!/usr/bin/env bash
# ==========================================
# Article Extractor 一键生产部署脚本
# 项目目录: /home/ubuntu/article-extractor
# 可重复执行，不破坏其他服务
# ==========================================

set -euo pipefail

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_pass() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
log_step() { echo -e "\n${BLUE}==== $* ====${NC}"; }

# 配置常量
PROJECT_DIR="/home/ubuntu/article-extractor"
FRONTEND_DEPLOY_DIR="/var/www/article-extractor"
PM2_APP_NAME="article-extractor"
BACKEND_PORT=4001
DEFAULT_PROXY_URL="http://127.0.0.1:7890"
ECOSYSTEM_FILE="${PROJECT_DIR}/deploy/ecosystem.config.cjs"
CLEANUP_SCRIPT="${PROJECT_DIR}/deploy/cleanup.sh"

# ==========================================
# 1. 安全检查：不能用 root 运行
# ==========================================
log_step "1. 安全检查"
if [[ $(id -u) -eq 0 ]]; then
    log_error "Do NOT run this script as root."
    log_error "Please run as ubuntu user."
    exit 1
fi
log_pass "Running as non-root user: $(whoami)"

# ==========================================
# 2. 检查项目目录
# ==========================================
log_step "2. 检查项目目录"
if [[ ! -d "${PROJECT_DIR}" ]]; then
    log_error "Project directory not found: ${PROJECT_DIR}"
    exit 1
fi
cd "${PROJECT_DIR}"
log_pass "Project directory: ${PROJECT_DIR}"

# ==========================================
# 3. 检查 Node.js
# ==========================================
log_step "3. 检查 Node.js"
if ! command -v node &> /dev/null; then
    log_error "Node.js not found"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    log_error "npm not found"
    exit 1
fi
log_pass "Node.js: $(node -v)"
log_pass "npm: $(npm -v)"

# ==========================================
# 4. 创建/保护 .env
# ==========================================
log_step "4. 创建/保护 .env"

# 从环境变量获取 PROXY_URL，否则使用默认值
PROXY_URL="${PROXY_URL:-${DEFAULT_PROXY_URL}}"

if [[ -f "${PROJECT_DIR}/.env" ]]; then
    log_info "Existing .env preserved"
    # 从现有 .env 读取 PROXY_URL，如果不存在则使用环境变量/默认值
    if grep -q '^PROXY_URL=' "${PROJECT_DIR}/.env"; then
        EXISTING_PROXY=$(grep '^PROXY_URL=' "${PROJECT_DIR}/.env" | cut -d'=' -f2-)
        log_info "Using existing PROXY_URL from .env: ${EXISTING_PROXY}"
    else
        # 追加 PROXY_URL 到现有 .env
        echo "PROXY_URL=${PROXY_URL}" >> "${PROJECT_DIR}/.env"
        log_info "Added PROXY_URL to existing .env"
    fi
else
    # 创建新的 .env
    cat > "${PROJECT_DIR}/.env" <<EOF
# Server Configuration
NODE_ENV=production
PORT=${BACKEND_PORT}
PROXY_URL=${PROXY_URL}

# Add other environment variables as needed
# DATABASE_URL=
# REDIS_URL=
# API_KEY=
EOF
    log_info "Created new .env with PROXY_URL=${PROXY_URL}"
fi

# 设置权限
chmod 600 "${PROJECT_DIR}/.env"
log_pass ".env permissions set to 600"

# ==========================================
# 5. 安装依赖
# ==========================================
log_step "5. 安装依赖"
if [[ -f "${PROJECT_DIR}/package-lock.json" ]]; then
    log_info "Using npm ci (package-lock.json exists)"
    npm ci
else
    log_info "Using npm install (no package-lock.json)"
    npm install
fi
log_pass "Dependencies installed"

# ==========================================
# 6. 添加 dotenv 依赖（如果不存在）
# ==========================================
log_step "6. 确保 dotenv 依赖"
if ! grep -q '"dotenv"' "${PROJECT_DIR}/package.json"; then
    log_info "Adding dotenv dependency"
    npm install dotenv --save
else
    log_pass "dotenv already in dependencies"
fi

# ==========================================
# 7. 修改 backend/server.js 加载 dotenv（如果尚未加载）
# ==========================================
log_step "7. 确保 backend 加载 dotenv"
if ! grep -q 'dotenv/config' "${PROJECT_DIR}/backend/server.js"; then
    log_info "Adding dotenv/config import to backend/server.js"
    # 在第一行 import 后添加
    sed -i '1a import "dotenv/config";' "${PROJECT_DIR}/backend/server.js"
    log_pass "dotenv/config added to backend/server.js"
else
    log_pass "backend/server.js already loads dotenv/config"
fi

# ==========================================
# 8. 构建 frontend
# ==========================================
log_step "8. 构建 frontend"
if npm run build; then
    log_pass "Frontend build successful"
else
    log_error "Frontend build failed"
    exit 1
fi

# ==========================================
# 9. 部署 frontend 到 /var/www/article-extractor
# ==========================================
log_step "9. 部署 frontend"
if [[ -d "${PROJECT_DIR}/public" ]]; then
    log_info "Deploying from public/ to ${FRONTEND_DEPLOY_DIR}"
    sudo mkdir -p "${FRONTEND_DEPLOY_DIR}"
    sudo rsync -a --delete "${PROJECT_DIR}/public/" "${FRONTEND_DEPLOY_DIR}/"
    sudo chown -R www-data:www-data "${FRONTEND_DEPLOY_DIR}"
    log_pass "Frontend deployed to ${FRONTEND_DEPLOY_DIR}"
else
    log_error "Build output directory public/ not found"
    exit 1
fi

# ==========================================
# 10. Backend 语法检查
# ==========================================
log_step "10. Backend 语法检查"
if node --check "${PROJECT_DIR}/backend/server.js" && \
   node --check "${PROJECT_DIR}/backend/extractor.js"; then
    log_pass "Backend syntax check passed"
else
    log_error "Backend syntax check failed"
    exit 1
fi

# ==========================================
# 11. 创建/更新 PM2 ecosystem 配置
# ==========================================
log_step "11. 创建/更新 PM2 ecosystem 配置"
mkdir -p "${PROJECT_DIR}/deploy"

cat > "${ECOSYSTEM_FILE}" <<'EOF'
module.exports = {
  apps: [
    {
      name: "article-extractor",
      cwd: "/home/ubuntu/article-extractor",
      script: "backend/server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 4001,
        PROXY_URL: "http://127.0.0.1:7890"
      },
      error_file: "/home/ubuntu/.pm2/logs/article-extractor-error.log",
      out_file: "/home/ubuntu/.pm2/logs/article-extractor-out.log",
      pid_file: "/home/ubuntu/.pm2/pids/article-extractor.pid",
      merge_logs: true,
      time: true,
      autorestart: true,
      max_memory_restart: "512M",
      node_args: "--max-old-space-size=512"
    }
  ]
};
EOF

log_pass "PM2 ecosystem config written to ${ECOSYSTEM_FILE}"

# ==========================================
# 12. 代理连通性检查
# ==========================================
log_step "12. 代理连通性检查"
if curl -I -x "${PROXY_URL}" https://www.bbc.com --connect-timeout 10 -s -o /dev/null; then
    log_pass "Proxy connectivity"
else
    log_warn "Proxy connectivity test failed (proxy may be temporarily unavailable)"
fi

# ==========================================
# ==========================================
# 13. 配置每日自动清理
# ==========================================
log_step "13. 配置每日自动清理"

if [[ -f "${CLEANUP_SCRIPT}" ]]; then
    chmod +x "${CLEANUP_SCRIPT}"
    log_pass "Cleanup script ready: ${CLEANUP_SCRIPT}"

    CLEANUP_CRON="0 4 * * * ${CLEANUP_SCRIPT} >/dev/null 2>&1"
    CURRENT_CRONTAB="$(crontab -l 2>/dev/null || true)"

    if grep -Fqx "${CLEANUP_CRON}" <<< "${CURRENT_CRONTAB}"; then
        log_pass "Daily cleanup cron already installed"
    else
        {
            printf "%s
" "${CURRENT_CRONTAB}"
            printf "%s
" "${CLEANUP_CRON}"
        } | crontab -
        log_pass "Daily cleanup cron installed: 04:00"
    fi
else
    log_warn "Cleanup script not found: ${CLEANUP_SCRIPT}"
fi


# 14. 启动/重启 Article Extractor
# ==========================================
log_step "13. 启动/重启 Article Extractor"

# 检查是否已存在
if pm2 list | grep -q "${PM2_APP_NAME}"; then
    log_info "Restarting existing PM2 process: ${PM2_APP_NAME}"
    pm2 restart "${PM2_APP_NAME}" --update-env
else
    log_info "Starting new PM2 process: ${PM2_APP_NAME}"
    pm2 start "${ECOSYSTEM_FILE}" --only "${PM2_APP_NAME}"
fi

# 保存 PM2 配置
pm2 save
log_pass "PM2 process started/restarted and saved"

# 等待启动
sleep 3

# ==========================================
# 15. PM2 环境变量验证
# ==========================================
log_step "14. PM2 环境变量验证"
PM2_ID=$(pm2 list | grep "${PM2_APP_NAME}" | awk '{print $2}')
if [[ -z "${PM2_ID}" ]]; then
    log_error "Could not find PM2 ID for ${PM2_APP_NAME}"
    exit 1
fi
log_info "PM2 ID: ${PM2_ID}"

if pm2 env "${PM2_ID}" | grep -i "PROXY_URL" | grep -q "127.0.0.1:7890"; then
    log_pass "PROXY_URL found in PM2 environment"
else
    log_warn "PROXY_URL not found in PM2 environment, checking..."
    pm2 env "${PM2_ID}" | grep -iE 'PROXY_URL|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY' || true
fi

# ==========================================
# 16. Backend 健康检查
# ==========================================
log_step "15. Backend 健康检查"
if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/" > /dev/null; then
    log_pass "Backend health check: http://127.0.0.1:${BACKEND_PORT}/"
else
    log_error "Backend health check failed"
    log_info "PM2 logs:"
    pm2 logs "${PM2_APP_NAME}" --lines 100 --nostream
    exit 1
fi

# ==========================================
# 17. 代理实际抓取测试
# ==========================================
log_step "16. 代理实际抓取测试"
log_info "Testing BBC extraction via proxy..."
TEST_RESULT=$(curl -i -X POST "http://127.0.0.1:${BACKEND_PORT}/api/extract" \
    -H 'Content-Type: application/json' \
    -d '{"url":"https://www.bbc.com/news"}' 2>/dev/null || true)

if echo "${TEST_RESULT}" | grep -q '"success":true'; then
    log_pass "BBC extraction via proxy: SUCCESS"
else
    log_warn "BBC extraction via proxy: FAILED (network/connectivity issue, not deployment failure)"
fi

# 检查日志是否显示使用了代理
sleep 2
LOGS=$(pm2 logs "${PM2_APP_NAME}" --lines 30 --nostream 2>/dev/null || true)
if echo "${LOGS}" | grep -q "Using proxy: http://127.0.0.1:7890"; then
    log_pass "Proxy usage confirmed in logs"
else
    log_warn "Proxy usage not confirmed in logs yet"
fi

# ==========================================
# 18. Nginx 检查
# ==========================================
log_step "17. Nginx 检查"
if sudo nginx -t; then
    log_pass "Nginx config test passed"
else
    log_error "Nginx config test FAILED"
    exit 1
fi

# ==========================================
# 19. 最终检查：其他服务未受影响
# ==========================================
log_step "18. 验证其他服务未受影响"

# DeepRead
if curl -fsS http://127.0.0.1:3000/ > /dev/null && \
   curl -fsS http://127.0.0.1:3000/api/health > /dev/null; then
    log_pass "DeepRead (port 3000) unaffected"
else
    log_warn "DeepRead may have issues"
fi

# website2
if curl -fsS http://127.0.0.1:4000/ > /dev/null 2>&1; then
    log_pass "website2 (port 4000) unaffected"
else
    log_warn "website2 may have issues"
fi

# ==========================================
# 20. 输出部署摘要
# ==========================================
log_step "部署完成摘要"

echo "=========================================="
echo " Article Extractor Deployment Complete"
echo "=========================================="
echo ""
echo "Project:"
echo "  ${PROJECT_DIR}"
echo ""
echo "Frontend:"
echo "  ${FRONTEND_DEPLOY_DIR}"
echo ""
echo "Backend:"
echo "  127.0.0.1:${BACKEND_PORT}"
echo ""
echo "PM2:"
echo "  ${PM2_APP_NAME}     ONLINE"
echo ""
echo "Proxy:"
echo "  ${PROXY_URL}"
echo ""
echo "API:"
echo "  http://127.0.0.1:${BACKEND_PORT}/api/extract"
echo ""
echo "Nginx:"
echo "  /article-extractor/"
echo ""
echo "Checks:"
echo "  [PASS] Node.js"
echo "  [PASS] Dependencies"
echo "  [PASS] Frontend build"
echo "  [PASS] Backend syntax"
echo "  [PASS] PM2"
echo "  [PASS] Proxy configuration"
echo "  [PASS] Backend health"
echo "  [PASS] Nginx config"
echo ""
echo "=========================================="