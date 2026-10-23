# [BE] 무손실(FLAC)만 교체하는 재발행 — 버전·재생 위치 유지

| 항목 | 값 |
|---|---|
| 대상 | `PATCH /admin/contents/:contentId`(재발행, `spec/api/admin-api.md` 4.10) — 무손실 파일만 바꾸는 경로 신설 · `content_renditions`(`domain.md` 5.1-1) |
| 요청 파트 | 백엔드 |
| 요청자 | 박수헌(AI 파이프라인) |
| 담당 | 백엔드 |
| Jira | [KAN-264](https://runtime364.atlassian.net/browse/KAN-264) · 관련 [KAN-256](https://runtime364.atlassian.net/browse/KAN-256) |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 2026-10-26 (Medium +3일) |
| 선행 | 없음 · 관련 FE [KAN-256](https://runtime364.atlassian.net/browse/KAN-256)(iOS 정확한 시각 옵션 — 1.3.0 빌드) · BE 게이트(iOS 1.3.0 미만 무손실 대신 AAC, PR #1975·#1898 운영 반영) |
| 근거 문서 | `spec/api/admin-api.md` 4.10 · `docs/ai/spec/06-audio.md`(FLAC SEEKTABLE, 2026-10-23) · `backend/domain.md` 5.1-1 |
| 중요도 | Medium |
| 상태 | 반영 — BE 경로 완료(파이프라인 190편 전송은 AI 몫) |

## 문제

- 2026-10-23 운영 장애: iOS 에서 무손실(FLAC) 재생 시 타임라인이 어긋나고 끝이 잘렸다. 원인은 파이프라인이 ffmpeg 로 만든 FLAC 에 **SEEKTABLE 이 없어** iOS AVPlayer 가 스트리밍 중 위치를 비트레이트로 추정한 것(로시 AAC·Android 는 정상).
- 파이프라인은 고쳤다(새 FLAC 은 1초 간격 시크테이블 포함, PR #1973) 그리고 **파이프라인 S3 의 기존 190편 FLAC 도 전부 교체했다**(2026-10-23 밤, 오디오 내용·길이 동일). 그러나 **앱이 트는 파일은 발행 때 제품 서버로 올라간 사본**이라 서버 쪽 190편은 여전히 시크테이블이 없다.
- 지금의 재발행(4.10)은 "오디오를 바꾸면 3종 한 세트 + `content_version` +1 + 재생 위치 폐기"다. 무손실 파일만 같은 내용으로 갈아끼우는 데 쓰면 압축본까지 다시 보내야 하고, 버전이 올라 청취자의 재생 위치가 지워진다 — 같은 초가 같은 내용인데도.
- 운영 긴급 조치(iOS 1.3.0 미만 → AAC 게이트)와 FE 수정(KAN-256)으로 사용자 영향은 막혀 있다. 이 티켓은 **서버 사본을 바로잡는 정리 작업**이라 Medium.

## 요청 내용

1. **무손실만 교체하는 재발행 경로**를 4.10 에 추가한다. 제안: `PATCH /admin/contents/:contentId` 에 `audio_lossless` 파트만 보내고 폼 필드 `rendition_only=lossless`(이름은 BE 재량)를 함께 보내면,
   - `lossless` 렌디션 파일만 새 파일로 바꾼다. `audio`(압축)·`aac` 행은 건드리지 않는다(현행 "3종 한 세트" 삭제 규칙 적용 안 함).
   - **`content_version` 을 올리지 않고, 재생 위치를 폐기하지 않는다.** 근거: 오디오 내용·길이가 같다(아래 검증으로 보장).
   - 검증: 새 파일 길이가 현재 `duration_sec` 과 ±1초 안(4.6 의 음질 간 길이 조건과 같은 값). 벗어나면 400 `VALIDATION_FAILED`(`details.field = "audio_lossless"`) — 내용이 다른 파일은 이 경로로 못 들어오게.
   - `status` 가 `published` 가 아니면 409(현행과 같음).
   - `audit_logs` 에 `republish` 행위, 바뀐 파트 `["audio_lossless"]`, 버전 변동 없음으로 기록.
   - 이전 파일은 새 파일 저장·트랜잭션 성공 뒤 삭제(현행 흐름과 같음).
2. `spec/api/admin-api.md` 4.10 에 이 경로를 등재한다(`changes/` 경유는 BE 판단).

## 파이프라인 쪽(AI, 이 티켓 밖 — 우리가 한다)

- 경로가 열리면 파이프라인 S3 의 교체된 `lossless.flac` 190편을 `content_id` 별로 이 경로에 보내는 스크립트(`apps/worker/src/cli/`)를 만들어 돌린다. 콘솔 버튼은 두지 않는다(일회성).
- 이후 발행되는 편은 새 FLAC 이라 해당 없음.

## 범위 밖

- 압축본(AAC)·썸네일·대본 교체는 현행 4.10 그대로.
- FE 의 정확한 시각 옵션(KAN-256)·iOS 게이트 해제 시점(1.3.0 공개 뒤) — 각각 FE·BE 운영 전환 티켓.

## 완료 조건

- Given 발행된 콘텐츠 C(`content_version` = n, 청취자 A 의 재생 위치 t), When `audio_lossless`(길이 ±1초 안) + `rendition_only=lossless` 로 PATCH, Then 200 · `lossless` 렌디션 파일만 바뀌고 · `content_version` = n 그대로 · A 의 재생 위치 t 유지 · `audio`·`aac` 렌디션 행 그대로 · `audit_logs` 에 `republish`(파트 `audio_lossless`, 버전 n→n).
- Given 길이가 ±1초를 벗어난 FLAC, When 같은 요청, Then 400 `VALIDATION_FAILED`(`details.field = "audio_lossless"`) 이고 아무것도 바뀌지 않는다.
- Given `rendition_only=lossless` 없이 `audio_lossless` 만 보냄, When PATCH, Then 현행대로 400(`details.field = "audio"`).
- Given 경로 반영 뒤, When 파이프라인이 190편을 보냄, Then iOS(1.3.0 미만 게이트를 끈 테스트 기기)에서 무손실 재생의 타임라인·끝맺음이 정상이고 기존 재생 위치가 남아 있다.

## 처리 기록

- 2026-10-23 작성(박수헌 결정 "백엔드 무손실 전용 재발행으로") · 같은 날 Jira KAN-264 발행(Slack 알림 없음 — 박수헌 지시). 파이프라인 S3 190편 교체는 같은 날 완료.
- 2026-10-23 **BE 반영**(박준현, `feat(be)/lossless-only-republish`). `PATCH /admin/contents/:contentId` 에 텍스트 필드 `rendition_only=lossless` + `audio_lossless` 하나 → `lossless` 행만 교체(`ContentService.replaceAudioRendition`), `content_version`·재생 위치·대본·압축/AAC 행 그대로. 검증: 다른 파트가 섞이면 400 `rendition_only` · 파일 없으면 400 `audio_lossless` · 길이 ±1초 밖이면 400 `audio_lossless`(올리기 전·행 잠근 뒤 두 번) · 발행 중 아니면 409. `audit_logs` `content.republish`(버전 n→n, `changed_parts: ["audio_lossless"]`, `rendition_only: "lossless"`). 옛 무손실 파일은 트랜잭션 성공 뒤 삭제. 테스트: 단위 7건 · E2E 1건(실DB — 버전 1 유지·위치 120초 유지·대본 유지·압축 경로 그대로·무손실 경로만 바뀜·섞으면 400·플래그 없이 400 `audio`). 문서는 `changes/pending/lossless-only-republish.md`(admin-api.md 4.10 · domain.md 5.8). 완료 조건 4번째(190편 전송 뒤 iOS 확인)는 파이프라인 스크립트 몫이다. 반영 날짜 2026-10-23.
