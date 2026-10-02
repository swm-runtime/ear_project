#!/usr/bin/env bash
# ear-ai 서버 디스크 정리 (2026-10-02, ENOSPC — 일괄 음원 다시 변환 38편 실패).
# 사람이 실행한다(SG·서버 변경). 선행: aws sso login --profile isb
#   bash pipeline/deploy/disk-cleanup.sh        # PROFILE=<SSO 프로필> HOST=<ip> 로 변경
#   1) 내 IP 로 SG 22 열기 (끝나면 trap 으로 닫음)
#   2) 정리 전 상태: df · docker system df · /work 용량
#   3) 빌드 캐시 전부(docker builder prune -af) + 태그 없는 이미지(docker image prune -f)
#   4) 워커 캐시 중 오디오만 삭제: /work/episodes/*/audio (master.wav·dist.mp3·debug-align·.tmp) — S3 가 진실이고, TTS 만 쓰는 파일이라
#      다른 단계(초안·QA)가 도는 중이어도 안전하다. TTS 작업이 도는 중이면 멈춘다
#   5) 정리 후 df
set -euo pipefail
PROFILE="${PROFILE:-isb}"; REGION=ap-northeast-2; SG=sg-0dfc05389c325b537
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PEM="${PEM:-$ROOT/pipeline/deploy/aws/out/ear-ai-isb.pem}"
HOST="ec2-user@${HOST:-54.116.31.183}"
IP=$(curl -s https://checkip.amazonaws.com)
PERM="IpProtocol=tcp,FromPort=22,ToPort=22,IpRanges=[{CidrIp=$IP/32,Description=disk-cleanup}]"
aws ec2 authorize-security-group-ingress --profile "$PROFILE" --region $REGION --group-id $SG --ip-permissions "$PERM" >/dev/null 2>&1 || echo "(SG 22 이미 열려 있음)"
trap 'aws ec2 revoke-security-group-ingress --profile "$PROFILE" --region $REGION --group-id $SG --ip-permissions "$PERM" >/dev/null 2>&1 && echo "SG 22 닫음"' EXIT
sleep 3
ssh -i "$PEM" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "$HOST" '
  set -e; cd /opt/ear/ear_project/pipeline
  C="docker compose -f deploy/docker-compose.prod.yml --env-file deploy/env.prod"
  echo "── 정리 전"; df -h / | tail -1; docker system df
  $C exec -T worker-io sh -c "du -sh /work/* 2>/dev/null | sort -h | tail -6; du -sch /work/episodes/*/audio 2>/dev/null | tail -1"
  if [ -n "$($C exec -T worker-io sh -c "find /work/episodes -path \"*/audio/.tmp/*\" -mmin -5 2>/dev/null | head -1")" ]; then echo "⚠ 5분 안에 쓰인 TTS 임시 파일이 있음(합성 중) — 오디오 캐시는 건너뜀"; SKIP_AUDIO=1; fi
  echo "── 빌드 캐시·태그 없는 이미지 정리"; docker builder prune -af 2>&1 | tail -1; docker image prune -f 2>&1 | tail -1
  if [ -z "${SKIP_AUDIO:-}" ]; then echo "── 워커 오디오 캐시 삭제"; $C exec -T worker-io sh -c "rm -rf /work/episodes/*/audio && echo 삭제 완료"; fi
  echo "── 정리 후"; df -h / | tail -1
'
