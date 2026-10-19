# [INFRA] 랜딩 배포 훅 secret 등록 — `LANDING_VERCEL_DEPLOY_HOOK` (매일 재빌드 복구 · 토글 커밋 배포 종료)

| 항목 | 값 |
|---|---|
| 대상 | GitHub repo secret `LANDING_VERCEL_DEPLOY_HOOK` · Vercel 랜딩 프로젝트 Deploy Hooks(콘솔 작업, 코드 변경 없음) |
| 요청 파트 | 인프라 |
| 요청자 | 이주호(PM) |
| 담당 | Vercel 프로젝트 접근자 — 2026-10-19 랜딩을 토글 커밋으로 배포한 팀원(GitHub `Juyear009`) |
| Jira | [KAN-231](https://runtime364.atlassian.net/browse/KAN-231) |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 없음 (Lowest) |
| 선행 | 없음(티켓). 사람 손: Vercel 프로젝트 접근 권한(상태: 담당자 보유) |
| 근거 문서 | `landing-page/README.md` 배포 절(2026-10-08 "배포는 GitHub Actions만 시작한다") · `.github/workflows/landing-daily-rebuild.yml` · `landing-page/vercel.json` |
| 중요도 | Lowest — 랜딩 코드는 토글 커밋으로 어떻게든 나가고, 주제 데이터 반영 지연은 사용자 기능이 아니다. 다만 10-08부터 조용히 틀려 있는 상태라 한 번은 닫아야 한다 |
| 상태 | 반영 — 2026-10-19 |

## 왜

2026-10-08에 Vercel git 자동 배포를 껐다(`landing-page/vercel.json` `git.deploymentEnabled: false` — 커밋마다 배포돼 하루 한도에 걸림). 대신 `landing-daily-rebuild.yml`이 ① dev에 `landing-page/**` 변경이 들어오면 ② 매일 05:30 KST에 Vercel **배포 훅**을 불러 다시 빌드하도록 했다. 그런데 그 훅 URL을 담는 repo secret **`LANDING_VERCEL_DEPLOY_HOOK`이 등록된 적이 없다** — 워크플로는 매일 돌지만 "미설정 — 재빌드를 건너뜁니다"로 끝난다(2026-10-19 07:31 KST run 로그에서 `HOOK:` 빈 값 확인, `gh secret list`에도 없음).

결과 두 가지:
- **관리자에서 주제를 바꿔도 랜딩에 반영되지 않는다** — 매일 재빌드가 그걸 위한 건데 10-08부터 죽어 있다(README "관리자에서 바꾼 주제는 다시 빌드해야 반영된다").
- 랜딩 코드가 바뀔 때마다 `deploymentEnabled`를 켰다 끄는 **커밋 2개를 손으로** 해야 나간다(10-15 `86d2c859`/`f72658eb` · 10-19 `dd1a5081`/`230951a9`). README의 "배포는 Actions만" 규칙을 매번 깬다.

## 무엇을 한다(사람 손 — Vercel 프로젝트 접근자)

1. Vercel 대시보드 → 랜딩 프로젝트 → **Settings → Git → Deploy Hooks** → 이름 `landing-daily-rebuild`, 브랜치는 **운영이 따르는 브랜치**(Production Branch 설정과 같은 값 — 10-15·10-19 배포가 dev에서 나갔으니 dev로 추정, 설정에서 확인) → 생성 → URL 복사.
2. 터미널에서 `gh secret set LANDING_VERCEL_DEPLOY_HOOK`(URL 붙여넣기). **URL은 비밀값** — 채팅·티켓·커밋에 적지 않는다.
3. `gh workflow run landing-daily-rebuild.yml`로 한 번 수동 실행 → run 로그에 "건너뜁니다" 대신 훅 호출 응답 코드가 찍히고 Vercel Deployments에 새 배포가 생기는지 확인.

코드 변경 없음. `vercel.json`·워크플로는 그대로다. 이후 랜딩 변경은 dev 머지만으로 나간다(워크플로 push 트리거) — 토글 커밋을 더 만들지 않는다.

## 범위 밖

Vercel git 자동 배포를 다시 켜는 것(10-08에 한도 문제로 끈 결정 유지) · 랜딩을 다른 호스팅으로 옮기는 것.

## 완료 조건

- Given `gh secret list` / Then `LANDING_VERCEL_DEPLOY_HOOK`이 보인다
- Given `gh workflow run landing-daily-rebuild.yml` / When 완료 / Then 로그에 "미설정" 문구가 없고 Vercel에 그 시각의 배포가 생긴다
- Given 다음 날 05:30 KST 스케줄 run / Then 같은 결과(건너뜀 없음)

## 처리 기록
- 2026-10-19 발행(마크다운 + Jira KAN-231). KAN-199(랜딩 영어 페이지) 완료 처리 중 발견 — 199는 운영 반영 확인으로 닫았고 배포 경로 문제는 범위 밖이라 이 티켓으로 분리(PM 결정 2026-10-19 "티켓으로 넘겨").
- 2026-10-19 **반영 → archive**(박준현). 반영 날짜 2026-10-19.
  - Vercel Deploy Hook(브랜치 `dev`)을 만들어 repo secret `LANDING_VERCEL_DEPLOY_HOOK`에 넣었다. 처음 `!` 실행으로 넣은 값은 비어 있었다(입력 프롬프트가 뜨지 않음). 그래서 웹 Settings에서 다시 저장했다.
  - **원인이 하나 더 있었다**: Vercel Production 브랜치가 `main`이라 dev 훅은 Preview만 만들었다. 운영 도메인이 갱신되지 않았고, `should-build`도 Preview에서는 주제 변경 빌드를 건너뛴다. 그동안 운영 반영은 dev 배포를 손으로 Promote해서 했다. → **Production 브랜치를 `dev`로 바꿨다**(사용자 결정 — "dev 커밋이 곧 운영 배포"). `vercel.json`·워크플로는 바꾸지 않았다.
  - 확인한 것:
    - `gh secret list`에 있다 ✅
    - 수동 실행 로그 `Vercel 응답: 201`, "미설정" 문구 없음 ✅
    - Vercel에 배포가 생겼다가 취소됐다. 랜딩·주제가 그대로라 `should-build`가 건너뛴 것으로, 정상이다 ✅
  - 남은 확인(Jira 완료 뒤 사후 관찰): 2026-10-20 05:30 스케줄 실행 결과, 다음 랜딩 변경이 dev 머지 시 실제 빌드돼 운영에 나가는지. `landing-page/README.md` 배포 절에 "Production 브랜치 = dev"를 적었다.

