#!/usr/bin/env bash
# 운영 API EC2 루트 볼륨 일일 스냅샷 (KAN-62 5단계 · 결정 11) — 서버 크론.
#
#   40 19 * * * /opt/ear/backend/deploy/ebs-snapshot.sh >> /var/log/ear-ebs-snapshot.log 2>&1   # 04:40 KST (pg_dump 04:00 뒤)
#
# 왜 크론인가: 조직 SCP(p-5soyo0ar)가 DLM(dlm:*)을 명시 거부하고 AWS Backup 볼트 생성도 막는다(2026-09-15 실측).
# ec2:CreateSnapshot 은 허용되므로 backup.sh 와 같은 자리(서버 크론 + 인스턴스 롤)에서 직접 찍고 7일 지난 것을 지운다.
# 인스턴스 롤 정책은 deploy/aws/setup-ebs-snapshots.sh 가 붙인다(이 볼륨·이 스크립트가 만든 스냅샷만).
#
# 스냅샷은 실행 중 볼륨의 크래시 컨시스턴트 사본이다 — DB 의 일관성 백업은 backup.sh(pg_dump)가 담당하고 이건
# 서버 통째 복구(볼륨·인증서·.env.prod 포함)용이다. 복구 절차: docs/infra/runbook.md 5.4
set -euo pipefail

RETAIN_DAYS="${RETAIN_DAYS:-7}"
SOURCE_TAG="ear-daily"
REGION="${AWS_REGION:-ap-northeast-2}"
LOCK=/tmp/ear-ebs-snapshot.lock
exec 9>"$LOCK"; flock -n 9 || { echo "이전 스냅샷 작업이 아직 돌고 있다 — 건너뜀"; exit 1; }

# 자기 인스턴스·루트 볼륨 (IMDSv2)
TOKEN=$(curl -sS -X PUT -H "X-aws-ec2-metadata-token-ttl-seconds: 60" http://169.254.169.254/latest/api/token)
INSTANCE_ID=$(curl -sS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/instance-id)
VOL=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' --output text)
NAME=$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].Tags[?Key==`Name`].Value | [0]' --output text)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)

SNAP=$(aws ec2 create-snapshot --region "$REGION" --volume-id "$VOL" \
  --description "$NAME root daily $STAMP" \
  --tag-specifications "ResourceType=snapshot,Tags=[{Key=Name,Value=$NAME-$STAMP},{Key=Project,Value=ear},{Key=Source,Value=$SOURCE_TAG},{Key=Volume,Value=$VOL}]" \
  --query SnapshotId --output text)
echo "snapshot started: $SNAP ($VOL, $STAMP)"

# 보존 기간 지난 것 정리 — 이 스크립트가 만든 것(Source 태그)만, 이 볼륨만
CUTOFF=$(date -u -d "-${RETAIN_DAYS} days" +%Y-%m-%dT%H:%M:%SZ)
OLD=$(aws ec2 describe-snapshots --region "$REGION" --owner-ids self \
  --filters "Name=tag:Source,Values=$SOURCE_TAG" "Name=volume-id,Values=$VOL" "Name=status,Values=completed" \
  --query "Snapshots[?StartTime<'$CUTOFF'].SnapshotId" --output text)
for s in $OLD; do aws ec2 delete-snapshot --region "$REGION" --snapshot-id "$s" && echo "deleted old: $s"; done
COUNT=$(aws ec2 describe-snapshots --region "$REGION" --owner-ids self --filters "Name=tag:Source,Values=$SOURCE_TAG" "Name=volume-id,Values=$VOL" --query 'length(Snapshots)' --output text)
echo "snapshot ok: $SNAP · 보존 중 $COUNT 개 (${RETAIN_DAYS}일)"
