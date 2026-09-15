#!/usr/bin/env bash
# 운영 API EC2 루트 볼륨 일일 스냅샷 — 인스턴스 롤 권한 (KAN-62 5단계 · 결정 11) — 멱등.
#
#   AWS_PROFILE=isb bash backend/deploy/aws/setup-ebs-snapshots.sh
#
# 실제 스냅샷은 서버 크론 deploy/ebs-snapshot.sh 가 찍는다. 이 스크립트는 그 크론이 쓸 권한만 붙인다.
#
# 왜 이 방식인가(2026-09-15 실측): 조직 SCP(p-5soyo0ar)가 dlm:* 를 명시 거부하고, AWS Backup 볼트 생성도
# "backup-storage·KMS 권한 부족"으로 막힌다. ec2:CreateSnapshot 은 허용된다 → backup.sh 와 같은 자리(서버 크론)에서.
#
# 권한 범위: 이 인스턴스의 루트 볼륨(태그 Backup=daily)에서 스냅샷 생성 · 생성 시 태그 · Source=ear-daily 태그가 붙은
#            스냅샷만 삭제 · Describe 는 읽기라 *.
set -euo pipefail

REGION="${AWS_REGION:-ap-northeast-2}"
INSTANCE_NAME="${INSTANCE_NAME:-ear-prod}"
ROLE="${ROLE:-ear-prod-ec2}"
say() { printf '\n=== %s\n' "$*"; }
aws() { command aws --region "$REGION" "$@"; }
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)

say "대상 볼륨 — 인스턴스 $INSTANCE_NAME"
INSTANCE_ID=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$INSTANCE_NAME" "Name=instance-state-name,Values=running,stopped" --query 'Reservations[0].Instances[0].InstanceId' --output text)
[ "$INSTANCE_ID" != "None" ] || { echo "인스턴스를 못 찾았다: $INSTANCE_NAME"; exit 1; }
VOL=$(aws ec2 describe-instances --instance-ids "$INSTANCE_ID" --query 'Reservations[0].Instances[0].BlockDeviceMappings[0].Ebs.VolumeId' --output text)
echo "인스턴스 $INSTANCE_ID · 루트 볼륨 $VOL"
aws ec2 create-tags --resources "$VOL" --tags "Key=Backup,Value=daily" "Key=Name,Value=$INSTANCE_NAME" "Key=Project,Value=ear"
echo "볼륨 태그 Backup=daily"

say "인스턴스 롤 $ROLE — ebs-snapshot 정책"
aws iam put-role-policy --role-name "$ROLE" --policy-name ebs-snapshot --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Sid\":\"Describe\",\"Effect\":\"Allow\",\"Action\":[\"ec2:DescribeInstances\",\"ec2:DescribeSnapshots\",\"ec2:DescribeVolumes\"],\"Resource\":\"*\"},
  {\"Sid\":\"SnapshotThisVolume\",\"Effect\":\"Allow\",\"Action\":\"ec2:CreateSnapshot\",\"Resource\":\"arn:aws:ec2:$REGION:$ACCOUNT:volume/$VOL\"},
  {\"Sid\":\"SnapshotResource\",\"Effect\":\"Allow\",\"Action\":\"ec2:CreateSnapshot\",\"Resource\":\"arn:aws:ec2:$REGION::snapshot/*\",\"Condition\":{\"StringEquals\":{\"aws:RequestTag/Source\":\"ear-daily\"}}},
  {\"Sid\":\"TagOnCreate\",\"Effect\":\"Allow\",\"Action\":\"ec2:CreateTags\",\"Resource\":\"arn:aws:ec2:$REGION::snapshot/*\",\"Condition\":{\"StringEquals\":{\"ec2:CreateAction\":\"CreateSnapshot\"}}},
  {\"Sid\":\"DeleteOwnOld\",\"Effect\":\"Allow\",\"Action\":\"ec2:DeleteSnapshot\",\"Resource\":\"arn:aws:ec2:$REGION::snapshot/*\",\"Condition\":{\"StringEquals\":{\"aws:ResourceTag/Source\":\"ear-daily\"}}}]}"
echo "부착됨"

say "완료"
echo "다음: 서버에서 크론 등록 — (crontab -l; echo '40 19 * * * /opt/ear/backend/deploy/ebs-snapshot.sh >> /var/log/ear-ebs-snapshot.log 2>&1') | crontab -"
echo "확인: aws ec2 describe-snapshots --owner-ids $ACCOUNT --filters Name=tag:Source,Values=ear-daily --query 'Snapshots[].[StartTime,SnapshotId,State,VolumeSize]' --output table"
