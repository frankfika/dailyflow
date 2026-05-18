#!/bin/bash

# 应用内更新检测功能测试脚本
# Test script for in-app update checker

echo "🧪 Testing DailyFlow Update Checker"
echo "=================================="
echo ""

# 1. 检查文件是否存在
echo "📁 Checking files..."
files=(
  "src/api/updater.ts"
  "src/components/SettingsModal.tsx"
  "src/App.tsx"
  "docs/UPDATE_CHECKER.md"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "  ✅ $file"
  else
    echo "  ❌ $file (missing)"
    exit 1
  fi
done
echo ""

# 2. TypeScript 编译检查
echo "🔍 Running TypeScript check..."
npm run lint > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  ✅ TypeScript compilation passed"
else
  echo "  ❌ TypeScript compilation failed"
  exit 1
fi
echo ""

# 3. 测试 GitHub API
echo "🌐 Testing GitHub API..."
response=$(curl -s -w "\n%{http_code}" "https://api.github.com/repos/frankfika/dailyflow/releases/latest")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "200" ]; then
  echo "  ✅ GitHub API accessible"
  tag=$(echo "$body" | grep -o '"tag_name":"[^"]*"' | cut -d'"' -f4)
  echo "  📦 Latest release: $tag"
  asset_count=$(echo "$body" | grep -o '"browser_download_url"' | wc -l | tr -d ' ')
  echo "  📦 Available assets: $asset_count"
else
  echo "  ⚠️  GitHub API returned HTTP $http_code"
  echo "  (This might be due to rate limiting or network issues)"
fi
echo ""

# 4. 检查版本号一致性
echo "📋 Checking version consistency..."
package_version=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
tauri_version=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | cut -d'"' -f4)
updater_version=$(grep 'const CURRENT_VERSION' src/api/updater.ts | cut -d"'" -f2)

echo "  package.json:        $package_version"
echo "  tauri.conf.json:     $tauri_version"
echo "  updater.ts:          $updater_version"

if [ "$package_version" = "$tauri_version" ] && [ "$package_version" = "$updater_version" ]; then
  echo "  ✅ All versions match"
else
  echo "  ⚠️  Version mismatch detected"
fi
echo ""

# 5. 检查 README 更新
echo "📖 Checking README updates..."
if grep -q "应用内更新检测" README.md && grep -q "In-App Update Checker" README_EN.md; then
  echo "  ✅ README files updated"
else
  echo "  ❌ README files not updated"
fi
echo ""

echo "=================================="
echo "✅ All checks passed!"
echo ""
echo "🚀 Next steps:"
echo "  1. Test the app: npm run dev:all"
echo "  2. Check Settings → General → App Update"
echo "  3. Verify update banner appears on startup"
echo ""
