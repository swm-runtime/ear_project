#!/usr/bin/env bash
# 운영 크론 심장박동 알람 (KAN-62 5단계 알람 · 결정 10) — 멱등.
#
#   AWS_PROFILE=isb bash backend/deploy/aws/setup-cron-alarms.sh
#
# 운영 크론 세 개(backup.sh 04:00 · sync-content-export.sh 04:10 · ebs-snapshot.sh 04:40 KST)는 성공할 때
# `ear/ops CronSuccess{Job=…}=1` 지표를 찍는다. 이 알람은 **25시간 동안 그 지표가 없으면** 기존 SNS(ear-prod-alerts,
# 서울)로 알린다 — 실패 알림(Slack 웹훅)이 못 잡는 "크론이 아예 안 돈 경우"를 잡는다. 기존 토픽을 그대로 써서
# 메일 재인증이 없다. 복구되면 OK 알림도 보낸다.
#
# 헬스체크(서버 다운)는 여기 없다 — 외부 시점이 필요해 UptimeRobot(무료, Slack 알림)으로 둔다(docs/infra/inventory.md 4장).
set -euo pipefail
REGION="${AWS_REGION:-ap-northeast-2}"
TOPIC_NAME="${TOPIC_NAME:-ear-prod-alerts}"
aws() { command aws --region "$REGION" "$@"; }
TOPIC=$(aws sns list-topics --query "Topics[?ends_with(TopicArn, ':$TOPIC_NAME')].TopicArn | [0]" --output text)
[ "$TOPIC" != "None" ] || { echo "SNS 토픽이 없다: $TOPIC_NAME"; exit 1; }
echo "알림 토픽: $TOPIC"

for job in backup content-export ebs-snapshot; do
  aws cloudwatch put-metric-alarm --alarm-name "ear-prod-cron-$job-missing" \
    --alarm-description "운영 크론 $job 이 25시간 안에 성공 지표를 찍지 않았다 — 크론 미실행 또는 실패. /var/log/ear-*.log 확인" \
    --namespace ear/ops --metric-name CronSuccess --dimensions Name=Job,Value="$job" \
    --statistic Sum --period 3600 --evaluation-periods 25 --datapoints-to-alarm 25 \
    --threshold 1 --comparison-operator LessThanThreshold --treat-missing-data breaching \
    --alarm-actions "$TOPIC" --ok-actions "$TOPIC" --tags Key=Project,Value=ear
  echo "알람: ear-prod-cron-$job-missing (1시간 × 25구간 연속 지표 없음)"
done
echo "완료. 상태: aws cloudwatch describe-alarms --alarm-name-prefix ear-prod-cron --query 'MetricAlarms[].[AlarmName,StateValue]' --output table"
