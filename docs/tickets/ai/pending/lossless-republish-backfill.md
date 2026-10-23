# [AI] 시크테이블 넣은 FLAC 190편을 제품 서버에 반영 — 무손실만 교체 재발행으로 백필

| 항목 | 값 |
|---|---|
| 대상 | `pipeline/apps/worker/src/cli/`(일회성 백필 스크립트) — 파이프라인 S3 의 교체된 `lossless.flac` → 제품 서버 `PATCH /admin/contents/:contentId`(`rendition_only=lossless`) |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현 |
| 담당 | 박수헌 |
| Jira | [KAN-265](https://runtime364.atlassian.net/browse/KAN-265) · 선행 [KAN-264](https://runtime364.atlassian.net/browse/KAN-264)(blocks) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-26 (Medium — +3일) |
| 선행 | [KAN-264](https://runtime364.atlassian.net/browse/KAN-264) BE 경로(완료 — PR #1993, 개발계 배포됨) · **운영은 다음 dev→main 릴리스 뒤**(그 전 운영에 보내면 400 `audio` — 경로가 없다) |
| 근거 문서 | `tickets/backend/archive/lossless-only-republish.md` · `changes/pending/lossless-only-republish.md`(admin-api.md 4.10 등재 예정) · `docs/ai/spec/06-audio.md` |
| 중요도 | Medium |
| 상태 | 발행 |

## 왜

iOS 는 SEEKTABLE 없는 FLAC 의 재생 위치를 비트레이트로 어림해 자막이 어긋나고 끝이 잘린다(2026-10-23). 파이프라인 S3 의 190편은 다시 만들었지만(#1973) **앱이 트는 건 제품 서버 사본**이라 그대로다. BE 가 무손실만 바꾸는 재발행 경로를 열었다(KAN-264) — 버전·재생 위치·대본을 건드리지 않는다.

## 경로 계약 (BE — `changes/pending/lossless-only-republish.md`)

- `PATCH /admin/contents/:contentId`, `multipart/form-data`: 텍스트 필드 `rendition_only=lossless` + 파일 `audio_lossless`(`audio/flac`, `.flac`) **둘만**
- 200 `AdminContentItem` — `content_version` 그대로
- 400 `VALIDATION_FAILED` `field`: `rendition_only`(다른 파트 섞임) · `audio_lossless`(파일 없음 / 길이가 지금 `duration_sec`과 ±1초 밖) · 409(발행 중 아님 — 회수·만료 편은 건너뛴다)

## 무엇을 한다

1. 백필 스크립트 — 교체된 FLAC 이 있는 발행 편을 `content_id` 별로 보낸다. `--dry-run`(대상·건수만) · `--apply` · `--only <id>` · 실패 편 목록 출력(400 `audio_lossless` 면 길이 불일치 — 그 편은 원인 확인).
2. **개발계에서 먼저** 2~3편 → 개발계 앱(iOS, 게이트 꺼진 테스트 기기 또는 Android)에서 재생·위치 유지 확인 → 개발계 전체.
3. 운영은 다음 dev→main 릴리스 뒤 — 같은 순서(`--dry-run` → 몇 편 → 전체). 04:00~05:30 · 07:00 · 17:00 KST 피한다.
4. 처리 기록에 대상·성공·실패 건수를 적는다.

## 범위 밖

- iOS 1.3.0 미만 무손실 게이트 해제(BE — 1.3.0 최소 지원 뒤) · FE 정확한 시각 옵션(KAN-256)

## 완료 조건

- Given 개발계 / When `--apply` / Then 대상 전부 200, 각 편의 `content_version`·재생 위치가 그대로다
- Given 운영 릴리스 뒤 / When `--apply` / Then 대상 전부 200(회수·만료 409 는 건너뜀으로 기록)
- Given 백필 뒤 iOS(게이트 꺼진 테스트 기기) 무손실 재생 / Then 대본 강조가 맞고 끝까지 재생된다
- Given 처리 기록 / Then 대상·성공·실패(사유) 건수가 개발계·운영 각각 적혀 있다

## 처리 기록

- 2026-10-23 발행(박준현).
