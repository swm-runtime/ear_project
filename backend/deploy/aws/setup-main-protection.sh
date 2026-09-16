#!/usr/bin/env bash
# main 브랜치 보호 (KAN-62 7단계) — 초안. **8단계 전환 직전에 사람이 실행한다.** 멱등.
#
#   bash backend/deploy/aws/setup-main-protection.sh            # 적용
#   DRY_RUN=1 bash backend/deploy/aws/setup-main-protection.sh  # 보낼 JSON 만 출력
#
# 규칙(티켓 결정 5·6): dev→main PR 만 · 검증 통과 · 리뷰 1명 승인 · 관리자도 예외 없음 · force push·삭제 금지.
#
# 필수 상태 체크 두 개는 **deploy-api.yml 의 job name 그대로**다. 이름을 바꾸면 모든 PR 이 pending 에 걸린다.
#   - "검증 (lint · build · 유닛 · e2e)"  : 지금 있는 verify job
#   - "원본 브랜치 확인 (dev)"            : 6단계에서 추가할 job — PR base 가 main 인데 head 가 dev 가 아니면 실패.
#     ⚠ 이 job 이 워크플로에 **먼저** 들어가 있어야 한다. 없는 체크를 필수로 걸면 GitHub 이 영원히 기다린다.
#     아직 없으면 REQUIRE_SOURCE_CHECK=0 으로 실행해 검증만 걸고, job 추가 후 다시 실행한다.
#
# dev 보호(현행)는 검증 체크만 있고 리뷰 필수는 아니다 — 개발 속도를 위해 그대로 둔다. 리뷰 1명은 운영으로 가는 main 에만.
set -euo pipefail
REPO="${GH_REPO:-swm-runtime/ear_project}"
BRANCH="${BRANCH:-main}"
REQUIRE_SOURCE_CHECK="${REQUIRE_SOURCE_CHECK:-1}"

CHECKS='"검증 (lint · build · 유닛 · e2e)"'
[ "$REQUIRE_SOURCE_CHECK" = "1" ] && CHECKS="$CHECKS, \"원본 브랜치 확인 (dev)\""

BODY=$(cat <<JSON
{
  "required_status_checks": { "strict": true, "contexts": [ $CHECKS ] },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": false,
  "required_conversation_resolution": false
}
JSON
)
# strict=true: PR 브랜치가 main 최신을 포함해야 머지 가능 — dev→main 이라 항상 참이고, 누가 main 에 먼저 넣었으면 다시 검증하게 한다.
# required_linear_history=false: 머지 커밋을 허용한다(dev→main 은 머지 커밋으로 남겨 어느 dev 시점인지 추적).

if [ -n "${DRY_RUN:-}" ]; then echo "$BODY"; exit 0; fi
echo "$BODY" | gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" --input - >/dev/null
echo "보호 적용됨 — $REPO $BRANCH"
gh api "repos/$REPO/branches/$BRANCH/protection" \
  --jq '{checks: .required_status_checks.contexts, reviews: .required_pull_request_reviews.required_approving_review_count, admins: .enforce_admins.enabled, force_push: .allow_force_pushes.enabled}'
