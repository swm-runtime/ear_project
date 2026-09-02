#!/bin/sh
# 기동 전에 마이그레이션을 먼저 돌린다. 실패하면 서버를 띄우지 않는다 —
# 스키마가 코드보다 뒤처진 채로 트래픽을 받는 것보다 안 뜨는 편이 낫다.
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] running migrations"
  npm run migration:run:prod
fi
exec "$@"
