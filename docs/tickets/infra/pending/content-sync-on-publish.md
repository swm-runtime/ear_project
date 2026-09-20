# [INFRA] 콘텐츠 반영을 하루 한 번 → 발행 즉시로 바꾼다 (운영이 개발계에 알림)

| 항목 | 값 |
|---|---|
| 대상 | `backend/deploy/sync-content-export.sh` · `sync-content-import.sh` · `backend/deploy/aws/setup-content-sync-notify.sh`(신설) · 운영·개발계 크론 · 개발계 SG · `docs/infra/runbook.md` · `docs/infra/inventory.md` |
| 요청 파트 | 인프라 (담당 박준현) |
| 발행 날짜 | 2026-09-20 |
| Jira | [KAN-84](https://runtime364.atlassian.net/browse/KAN-84) |
| 발견 시점 | 2026-09-20 — 운영에 발행한 콘텐츠가 개발계에 다음 날 04:30에야 보여 개발계 확인이 하루 밀린다 |
| 근거 문서 | `tickets/infra/archive/dev-environment-and-main-deploy.md` 결정 7(콘텐츠 계층 한 방향 복사) · `docs/infra/runbook.md` 4장 |
| 심각도 | 중 — 장애는 아니지만 개발계 검증이 하루 지연된다 |
| 우선순위 | Medium(3일 안) |

## 문제

콘텐츠는 **운영에서만 발행**하고 개발계는 사본을 받는다(결정 7 — 이중 발행 금지). 그 복사가 지금은 **하루 한 번**이다.

- 운영 크론 04:10 내보내기 → S3 → 개발계 크론 04:30 들여오기
- 그래서 낮에 발행한 콘텐츠로 개발계에서 확인하려면 **다음 날 새벽까지 기다려야 한다**
- 주기만 줄이면 바뀐 게 없어도 매번 콘텐츠 표 전체를 덤프·업로드·upsert 한다. 지금은 15KB라 티가 안 나지만 `content_embeddings`는 한 행이 수십 KB라(1536차원) 콘텐츠가 늘면 그대로 비용이 된다

## 요청 내용

**운영이 발행 직후 개발계에 알리고, 개발계가 받아서 검증한다.**

1. **내보내기(운영)** — 바뀐 게 있을 때만 실제로 일한다
   - 먼저 지문(표별 `count(*)` + `max(updated_at)`)을 재서 지난번과 같으면 덤프·업로드를 건너뛴다(심장박동 지표는 그대로 남긴다 — 미실행 알람 오탐 방지)
   - 바뀌었으면 덤프 → 표별 행 수 매니페스트와 함께 업로드 → **개발계에 SSH 로 알린다**
   - 크론 주기는 `*/1`(건너뛰는 실행은 조회 한 번으로 끝난다)
2. **알림 경로** — 알림 전용 SSH 키를 만들고 개발계 `authorized_keys` 에서 **`command="…/sync-content-import.sh"`** 로 묶는다(포트 포워딩·PTY 금지). 그 키로 할 수 있는 일은 들여오기 실행 하나뿐이다. 개발계 SG 22번은 **운영 SG 에서만** 연다(사설 IP·같은 VPC, 공개 노출 없음)
3. **들여오기(개발계)** — 같은 덤프면 아무것도 하지 않는다
   - S3 객체 ETag 를 지난번과 비교해 같으면 즉시 종료(연속 발행으로 알림이 몰려도 DB 를 다시 쓰지 않는다)
   - 받으면 기존대로 stage 적재 → upsert
   - **검증**: 매니페스트의 표별 행 수보다 개발계가 적으면 실패로 끝내고 ETag 를 적지 않는다(다음 알림·크론이 같은 덤프로 재시도). 개발계가 더 많은 것은 정상이다 — 운영에서 하드 삭제된 옛 행이 남는다
4. **안전망 유지** — 개발계 크론(하루 1회)은 그대로 둔다. 알림이 유실돼도(개발계 정지·네트워크) 하루 안에 맞춰진다
5. 문서 — `runbook.md` 크론 목록·절차, `inventory.md` 개발계 SG·크론 항목 갱신

## 하지 않는 것

- **백엔드 애플리케이션에 훅을 넣지 않는다.** 지문 비교는 DB 상태만 보므로 관리자 API·수동 SQL·배치 어느 경로로 바뀌어도 잡힌다. 앱에 훅을 넣으면 경로마다 빠뜨릴 수 있다
- 개발계 → 운영 방향은 열지 않는다. 지금처럼 운영 밖으로 나가는 것은 콘텐츠 표뿐이다
- 이중 발행(운영·개발 동시 발행)은 여전히 하지 않는다

## 완료 조건

- Given 운영에서 콘텐츠를 발행한다 / When 1~2분 기다린다 / Then 개발계 `/api/v1/...`에서 그 콘텐츠가 보이고 `/var/log/ear-content-sync.log` 에 `notify ok` · `import ok` 가 남는다
- Given 콘텐츠에 아무 변화가 없다 / When 내보내기 크론이 돈다 / Then `content export skip` 만 남고 S3 업로드·개발계 DB 쓰기가 없다
- Given 같은 덤프로 알림이 두 번 온다 / When 두 번째 들여오기가 돈다 / Then `content import skip` 으로 끝난다
- Given 덤프가 중간에 잘려 행이 모자란다 / When 들여오기가 돈다 / Then 실패로 끝나고 ETag 가 갱신되지 않아 다음 실행이 다시 시도한다
- Given 개발계가 꺼져 있어 알림이 실패한다 / When 내보내기가 끝난다 / Then 내보내기는 성공으로 끝나고 경고만 남으며, 다음 날 안전망 크론이 받아 간다
- Given 알림 키 / When 그 키로 다른 명령을 시도한다 / Then 들여오기 스크립트만 실행된다

## 처리 기록

- 2026-09-20 발행. 스크립트·셋업 스크립트는 같은 PR 에서 함께 올린다(서버 적용은 `setup-content-sync-notify.sh` 실행이 필요하다 — SSO 로그인·pem 필요).
- 2026-09-20 코드 반영(같은 PR). **남은 것**: ① `bash backend/deploy/aws/setup-content-sync-notify.sh` 로 알림 키·SG·운영 크론을 깐다(SSO 로그인 + 운영·개발계 pem 필요) ② dev·main 배포로 양쪽 스크립트가 서버에 깔린 뒤 운영에서 콘텐츠를 한 번 발행해 `notify ok` · `import ok` 를 확인한다. 확인되면 archive 로 옮긴다.
- **KAN-83(대본 포함)을 같은 PR에 담았다** — 같은 두 스크립트를 고치는 작업이라 나눠 올리면 충돌한다.
- 2026-09-20 **알림 키 설치 경로 변경** — 개발계 키페어(`ear-dev-isb.pem`)가 이 PC 에 없고, EC2 Instance Connect 는 조직 SCP 가 막고(`explicit deny`), 인스턴스 역할에 SSM 을 붙여도 에이전트가 등록되지 않았다. 그래서 **CI 가 이미 가진 두 환경 SSH 키로** 설치한다: `.github/workflows/content-sync-notify-key.yml`(수동 실행). main 에서 실행하면 운영에 키페어·개인키·크론을, 그 로그의 공개키를 입력으로 dev 에서 실행하면 개발계 `authorized_keys` 에 등록한다. 로컬 `setup-content-sync-notify.sh` 는 개발계 pem 이 있을 때의 경로로 남긴다.

