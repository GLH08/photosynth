#!/bin/sh
# 启动顺序（DESIGN 6.1）：alembic upgrade head → 种子（SEED_DEMO=true 且 works 为空）→ uvicorn
set -e
cd /app
alembic upgrade head
python -m app.seed
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
