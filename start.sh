#!/bin/bash
echo "=== 啟動明達 ERP 系統 ==="

# Start PostgreSQL if not running
sudo service postgresql start 2>/dev/null

# Start backend
echo "啟動後端 (port 3001)..."
cd /home/ubuntu/mingtat-erp/backend
nohup npx ts-node src/main.ts > /tmp/backend.log 2>&1 &
BACKEND_PID=$!
echo "後端 PID: $BACKEND_PID"

# Wait for backend to be ready
echo "等待後端啟動..."
for i in {1..30}; do
  if curl -s http://localhost:3001/api/auth/login > /dev/null 2>&1; then
    echo "後端已就緒"
    break
  fi
  sleep 1
done

# Start frontend
echo "啟動前端 (port 3000)..."
cd /home/ubuntu/mingtat-erp/frontend
nohup pnpm start > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "前端 PID: $FRONTEND_PID"

echo ""
echo "=== 系統已啟動 ==="
echo "前端: http://localhost:3000"
echo "後端: http://localhost:3001"
echo "登入帳號: admin / admin123"
