# [문서] 썸네일 저장 규격을 WebP 768px로 고정 — `admin-api.md` 4.6·4.10·6장, `admin.md` 3.1

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/admin-api.md` 4.6(`thumbnail` 파트) · 4.10(재발행 `thumbnail`) · 6장 흐름 · `features/admin.md` 3.1(썸네일 저장) |
| 요청 파트 | 문서(구현은 백엔드 `feat(be)/thumbnail-resize`, KAN-79) |
| 발행 날짜 | 2026-09-19 |
| 발견 시점 | iOS 이미지 로딩 지연 피드백 조사 — 발행 썸네일이 전부 1024px PNG(중앙값 1.5MB)로 저장돼 앱 첫 화면이 30MB를 받았다(`tickets/backend/archive/thumbnail-resize-on-upload.md`) |
| 심각도 | 중 — 문서에는 입력 규격(jpg/png/webp ≤5MB)만 있고 저장 규격이 없어, 파이프라인 원본이 그대로 나가는 것이 계약상 틀린 것이 아니었다. 저장 규격을 계약에 넣는다 |

## 바꾸는 규칙

종전: `thumbnail`은 "jpg / png / webp, ≤5MB"를 받아 그대로 `thumb/<random>.<ext>`에 올린다.

개정: **입력 규격은 그대로, 저장 규격을 고정한다.**

- 서버가 EXIF 회전을 굽고 **긴 변 768px(비율 유지·확대 없음) WebP(품질 82)** 로 다시 써서 `thumb/<random>.webp`로 올린다. `thumbnail_url`은 항상 `.webp`로 끝난다.
- 업로드(4.6)·재발행(4.10) 둘 다 적용된다.
- 이미지로 읽지 못하는 파일은 `VALIDATION_FAILED`(`field: thumbnail`). 새 에러 코드는 없다.
- 규격 이전 파일은 재처리 스크립트가 새 키로 다시 써서 URL을 바꾼다. 버전은 올리지 않고 감사 로그 `content.thumbnail_reprocess`를 남긴다.

## 완료 조건

- Given `admin-api.md` 4.6 `thumbnail` 행 / When 읽는다 / Then 서버가 긴 변 768px WebP로 다시 써서 저장하고 `thumbnail_url`이 `.webp`로 끝난다는 문장이 있다
- Given `admin-api.md` 6장 흐름 / When 읽는다 / Then [저장] 단계에 썸네일 변환 규칙과 그 이유(파일 크기·iOS 디코드), 재처리 스크립트가 적혀 있다
- Given `features/admin.md` 3.1 / When 읽는다 / Then 저장 규격 확정(2026-09-19) 불릿이 있고 `admin-api.md` 4.6을 가리킨다

## 처리 기록

- **반영 날짜: 2026-09-19** — `admin-api.md` 4.6·4.10 표의 `thumbnail` 행에 저장 규격 추가, 6장 흐름에 변환 규칙·이유·재처리 불릿 추가. `features/admin.md` 3.1에 저장 규격 확정 불릿 추가. 같은 PR(`feat(be)/thumbnail-resize`, KAN-79)에서 코드와 함께 반영해 바로 archive에 둔다.
