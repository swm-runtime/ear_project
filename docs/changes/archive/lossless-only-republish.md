# 재발행 4.10 — 무손실만 교체하는 경로(`rendition_only=lossless`) 등재(KAN-264)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 4.10(파트 표 · 버전 규칙 목록) · `backend/domain.md` 5.8(`content_audio_renditions` — 한 음질 행만 바뀌는 경우) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-23 |
| 시작 날짜 | 2026-10-23 |
| 기한 | 다음 통합 |
| 선행 | 없음 · 코드 `feat(be)/lossless-only-republish` |
| 중요도 | Low — 코드는 반영됨. 문서가 코드를 따라간다 |

## 배경

파이프라인이 기존 FLAC 190편을 같은 마스터에서 다시 만들었다(1초 간격 SEEKTABLE — iOS 스트리밍 위치 어긋남, PR #1973). 앱이 트는 서버 사본을 바꾸려면 재발행이 필요한데, 4.10 은 "오디오를 바꾸면 3종 한 세트 + 버전 +1 + 재생 위치 폐기"라 같은 내용의 파일을 갈아끼우는 데 쓰면 청취자의 재생 위치가 지워진다. 그래서 무손실만 바꾸는 경로를 두었다(`tickets/backend/archive/lossless-only-republish.md`).

## 고칠 내용

1. `admin-api.md` 4.10 파트 표에 행 추가:
   > | `rendition_only` | 텍스트 필드. 값 `lossless` 하나 — **무손실 파일만 교체**(2026-10-23, KAN-264). `audio_lossless` 하나만 함께 보낸다. 다른 파트(`audio`·`audio_aac`·`thumbnail`·`payload`·`enrichment_file`·`script_file`)가 섞이면 400 `VALIDATION_FAILED`(`details.field = "rendition_only"`), `audio_lossless`가 없으면 400(`audio_lossless`) | 선택 |
2. 같은 절 버전 규칙 목록에 한 줄:
   > - **무손실만 교체(`rendition_only=lossless`)는 버전을 올리지 않고 재생 위치·대본을 그대로 둔다** — 같은 마스터에서 다시 만든 파일(예: SEEKTABLE 추가)이라 같은 초가 같은 내용이다. 새 파일 길이가 지금 `duration_sec`과 ±1초 안이어야 한다(아니면 400 `audio_lossless` — 다른 내용의 파일은 이 경로로 못 들어온다). `lossless` 행만 바뀌고 `contents.audio_path`·다른 음질 행은 그대로다. 옛 무손실 파일은 트랜잭션 성공 뒤 지운다. `audit_logs`는 `content.republish`(이전·이후 버전 같음, `changed_parts: ["audio_lossless"]`, `rendition_only: "lossless"`).
3. `domain.md` 5.8 끝에 한 줄:
   > - **한 음질 행만 바뀌는 경우가 있다** — 무손실만 교체하는 재발행(admin-api.md 4.10 `rendition_only`, 2026-10-23). 그때도 `duration_sec`은 압축 음질과 ±1초 안이다(같은 검증).

## 완료 조건

- Given 위 두 문서 / Then `rendition_only=lossless` 경로(다른 파트 거부 · ±1초 · 버전·위치 유지 · 감사 기록)가 적혀 있고 코드 `republishLosslessOnly`와 같다

## 처리 기록

- 2026-10-23 발행(박준현).
- 2026-10-24 **반영**(박준현, `docs(be)/apply-lossless-changes`) — 고칠 내용 전부를 대상 문서에 그대로 넣었다. 반영 날짜 2026-10-24.
