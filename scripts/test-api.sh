#!/bin/bash

echo "=== DailyFlow Backend API ��试 ==="
echo ""

BASE_URL="http://localhost:3002"

echo "1. 测试���康检查"
curl -s $BASE_URL/health | jq .
echo ""

echo "2. 测试��取配���"
curl -s $BASE_URL/api/config | jq .
echo ""

echo "3. 测试读��日记文件"
curl -s $BASE_URL/api/files/2026-05-04 | jq '.date, .tasks | length'
echo ""

echo "4. 测试获取��务列表"
curl -s $BASE_URL/api/tasks/2026-05-04 | jq '.tasks | length'
echo ""

echo "5. 测试任务��移预��"
curl -s -X POST $BASE_URL/api/rollover/preview \
  -H "Content-Type: application/json" \
  -d '{"toDate":"2026-05-05"}' | jq .
echo ""

echo "=== 所有测��完成 ==="
