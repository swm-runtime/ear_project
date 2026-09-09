# [INFRA] dev에 브랜치 보호가 없다 — CI가 빨간 X여도 머지된다

| 항목 | 값 |
|---|---|
| 대상 | GitHub 저장소 설정(`swm-runtime/ear_project`의 `dev` 브랜치 보호) |
| 요청 파트 | 인프라 |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | `ci-runs-tests-before-api-deploy`(KAN-37) 완료 직후 — 검증 job은 생겼는데 **실패해도 머지를 막지 못한다**는 것을 확인 |
| 근거 문서 | `CLAUDE.md` Git 장(main·dev 직접 push 금지, PR로만 병합) · `tickets/infra/archive/ci-runs-tests-before-api-deploy.md` |
| 심각도 | **중** — 방금 만든 배포 전 관문이 **경고등일 뿐 차단기가 아니다** |
| 상태 | 진행 중 — **A안 확정**(2026-09-09, 사용자 결정). 워크플로 반영 PR 대기 → 머지 후 보호 설정 |

## 문제

`dev`에 브랜치 보호 규칙이 **하나도 없다**(`GET /branches/dev/protection` → 404, 2026-09-09 확인).

2026-09-09에 `deploy-api.yml`에 검증 job을 넣어 **배포는 막게** 됐다(`needs: verify`). 하지만
**머지 자체는 막지 못한다.** 검증이 실패한 PR도 빨간 X만 뜬 채 그대로 머지된다. 머지되면
배포 job이 안 돌 뿐이라, 깨진 코드가 `dev`에 쌓이고 그 뒤의 정상 커밋까지 배포가 막힌다.

`CLAUDE.md`는 "main·dev 직접 push 금지, PR로만 병합한다"를 규칙으로 적고 있으나 **강제되지
않는다.** 지금은 규약일 뿐이다.

## 함정 — 필수 체크를 그대로 걸면 관계없는 PR이 영구히 막힌다

검증 job의 트리거에는 경로 필터가 있다.

```yaml
pull_request:
  paths: ['backend/**', '.github/workflows/deploy-api.yml']
```

**백엔드를 건드리지 않는 PR에서는 이 job이 아예 실행되지 않는다.** GitHub의 필수 상태 체크는
"보고되지 않은 체크"를 **영원히 pending**으로 본다. 그대로 필수로 걸면 FE·문서·파이프라인 PR이
전부 머지 불가가 된다.

해법은 셋 중 하나이며 **어느 쪽을 쓸지 결정이 필요하다.**

| 안 | 방식 | 대가 |
|---|---|---|
| A | `paths` 필터를 떼고 job은 항상 돌되, 백엔드 변경이 없으면 단계들을 건너뛴다(`dorny/paths-filter` 등) | 모든 PR에서 job이 뜬다(대개 수 초) |
| B | 같은 이름으로 보고하는 no-op job을 두고 `paths-ignore`로 가른다 | job 이름 중복 관리가 필요하고 실수하기 쉽다 |
| C | 필수 체크를 걸지 않고 **rulesets**의 다른 수단(예: 리뷰 필수)으로만 막는다 | 검증 실패를 직접 막지는 못한다 |

**A가 표준적이고 오작동이 적다.** 다만 워크플로 수정이 따르므로 이 티켓의 범위에 포함된다.

## 요청 내용

1. **위 함정의 해법을 정한다**(A 권장).
2. 정한 방식대로 워크플로를 고쳐 **검증 체크가 모든 PR에서 결론을 보고하게** 만든다.
3. `dev`에 브랜치 보호를 걸고 `검증 (lint · build · 유닛 · e2e)`를 필수 상태 체크로 지정한다.
4. **범위를 최소로 둔다** — 리뷰 필수·관리자 강제 등은 팀 합의 없이 켜지 않는다. 3인 팀에서
   리뷰 필수는 서로를 막는 비용이 크다. 이 티켓은 "깨진 코드가 dev에 들어오는 것"만 막는다.
5. `main`에도 같은 보호가 필요한지 판단한다 — `main`은 `dev → main` PR로만 갱신되므로
   `dev`가 막히면 대개 따라온다.

## 완료 조건

- Given 검증이 실패하는 PR / When 머지를 시도한다 / Then **머지 버튼이 막힌다**
- Given 백엔드를 건드리지 않는 PR(FE·문서) / When CI가 끝난다 / Then 검증 체크가 **결론을 보고하고**(성공 또는 건너뜀) 머지가 가능하다
- Given 저장소 설정 / When `GET /branches/dev/protection`을 호출한다 / Then 200과 함께 필수 체크 목록에 검증 job이 있다
- Given 팀 합의가 없는 항목(리뷰 필수 등) / When 보호 설정을 본다 / Then 켜져 있지 않다

## 진행 기록

**2026-09-09 — A안 확정(사용자 결정). 요청 내용 1·2 반영, 3·4·5 대기 중이라 `pending`에 둔다.**

### 반영한 것 — 요청 1·2

`deploy-api.yml`의 **`pull_request` 트리거에서 `paths` 필터를 뗐다.** 대신 job 첫 단계에서
변경 파일 목록을 조회해 `steps.scope.outputs.backend`를 정하고, 나머지 모든 단계에 그 조건을
걸었다. 백엔드와 무관한 PR은 **단계를 전부 건너뛴 채 job이 success로 끝난다** — 필수 체크가
결론을 받는다.

- 판정 대상 경로는 종전 `paths` 필터와 같다: `backend/**` · `.github/workflows/deploy-api.yml`.
- 변경 파일 목록은 `gh api repos/{repo}/pulls/{n}/files`로 받는다. 서드파티 액션(`dorny/paths-filter`)을
  쓰지 않았다 — **배포 파이프라인에 외부 의존을 늘리지 않기 위해서다.** 필요한 권한은
  `pull-requests: read`뿐이고 verify job에만 준다.
- **`push` 트리거의 `paths`는 그대로 뒀다.** 그건 검증 조건이 아니라 **배포 조건**이다. 떼면
  FE·문서 머지마다 EC2 배포가 돈다.
- **`push`·`workflow_dispatch`에서는 판정하지 않고 무조건 `backend=true`다.** push 트리거의
  `paths` 필터가 이미 걸러 주고, 여기서 `false`가 나오면 단계가 건너뛰어지는 게 아니라
  `needs: verify`인 배포 job이 함께 죽을 여지를 만든다. dev push 경로를 건드리지 않는 쪽을 택했다.
- `checkout`은 판정보다 앞에 둔다 — `defaults.run.working-directory: backend`가 그 시점에
  존재해야 한다.

### 확인 결과

| 확인 항목 | 결과 |
|---|---|
| 백엔드 변경이 있는 PR에서 전 단계가 돈다 | **확인** — 이 워크플로 수정 PR 자체가 `.github/workflows/deploy-api.yml`을 건드리므로 `backend=true`로 판정돼 lint·build·유닛·e2e가 전부 돌았다 |
| 백엔드 무관 PR에서 건너뛰고 success로 보고한다 | **확인** — 문서 1개만 바꾼 임시 PR을 이 브랜치를 base로 열어 실측했다(아래) |
| `needs: verify`인 배포 job이 죽지 않는다 | **구조 확인** — verify는 단계가 전부 건너뛰어져도 job 결론이 `success`다(`skipped`가 아니다). 게다가 배포가 도는 `push`·`workflow_dispatch` 경로에서는 판정 자체를 건너뛰고 `backend=true`로 고정한다 |
| `push` 트리거의 배포 조건 불변 | **확인** — `push.paths`·`branches`·`deploy` job의 단계와 조건 모두 이 변경에서 손대지 않았다 |

### 남은 것 — 요청 3·4·5 (저장소 설정, 인프라 담당 몫)

**필수 상태 체크 이름은 `검증 (lint · build · 유닛 · e2e)`다** — job의 `name` 값 그대로이고,
PR의 status check rollup에서 확인했다. 워크플로 수정이 `dev`에 머지돼 이 이름이 한 번 이상
보고된 뒤에 걸어야 GitHub 설정 목록에 뜬다.

```bash
gh api -X PUT repos/swm-runtime/ear_project/branches/dev/protection --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "checks": [{ "context": "검증 (lint · build · 유닛 · e2e)" }]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
JSON
```

- `strict: false` — "머지 전 브랜치를 최신으로" 요구하지 않는다. 켜면 3인 팀에서 머지가 몰릴
  때마다 서로 rebase를 강요하게 된다. 막으려는 것은 **테스트 실패**지 브랜치 신선도가 아니다.
- `enforce_admins: false` · `required_pull_request_reviews: null` · `restrictions: null` — 요청 4의
  "범위 최소". 리뷰 필수·관리자 강제·선형 히스토리는 켜지 않는다.
- `required_status_checks`를 걸면 **직접 push도 함께 막힌다**(체크를 통과한 커밋이 아니면 거부).
  `CLAUDE.md`의 "dev 직접 push 금지"가 그만큼 강제된다 — 의도한 효과다.
- 설정 직후 **이미 열려 있는 PR들은 체크를 보고한 적이 없어 pending으로 뜬다.** 각 PR에
  커밋을 하나 올리거나 재실행하면 풀린다.

**`main` 판단(요청 5) — 지금은 걸지 않기를 권한다.** `main`은 `dev → main` PR로만 갱신되고
(`CLAUDE.md` Git 장), `dev`가 막히면 깨진 코드는 그 앞에서 걸러진다. 그런데 `main`에 같은
체크를 필수로 걸면 **릴리즈 PR(`dev → main`)이 `backend/**` 변경을 포함할 때마다 전체 검증을
다시 돌려야 머지된다** — 방금 `dev`에서 통과한 것과 같은 커밋을 한 번 더 돌리는 비용이다.
게다가 `main`은 랜딩 Vercel 프로덕션의 추적 대상이라 릴리즈가 막히는 비용이 더 크다.
**필요해지면 그때 `dev`와 같은 방식으로 건다.**

### 완료 조건 현황

| 완료 조건 | 상태 |
|---|---|
| 검증 실패 PR의 머지 버튼이 막힌다 | **미충족** — 보호 설정 전 |
| 백엔드 무관 PR에서 검증 체크가 결론을 보고하고 머지 가능하다 | **충족**(워크플로 머지 후 발효) |
| `GET /branches/dev/protection`이 200 + 필수 체크 목록 | **미충족** — 보호 설정 전 |
| 팀 합의 없는 항목이 켜져 있지 않다 | **명령에 반영** — 설정 후 재확인 |
