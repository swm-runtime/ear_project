# [BE] 썸네일 업로드 시 WebP 768px로 변환 저장 + 기존 파일 재처리

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/admin/`(업로드·재발행의 썸네일 저장) · `backend/src/scripts/reprocess-thumbnails.ts` · `docs/spec/api/admin-api.md` 4.6·4.10·6장 · `docs/features/admin.md` 3.1 |
| 요청 파트 | 백엔드 |
| 요청자 | 박준현(백엔드) — iOS 사용자 피드백 조사에서 발행 |
| 발행 날짜 | 2026-09-19 |
| 반영 날짜 | 2026-09-19 (PR `feat(be)/thumbnail-resize`) |
| Jira | [KAN-79](https://runtime364.atlassian.net/browse/KAN-79) |
| 발견 시점 | iOS "이미지 로딩이 느리다" 피드백. Android 담당은 체감하지 못해 원인을 실측했다 |
| 근거 문서 | `spec/api/admin-api.md` 4.6 · `features/admin.md` 3.1(썸네일 저장 위치) |
| 중요도 | **Medium**(3일 안) — 매 콘텐츠·매 사용자에 걸리는 전송량 문제이고, 앱 수정 없이 서버만으로 끝난다 |
| 상태 | **완료** — 업로드·재발행이 WebP 768px로 저장하고, 기존 파일은 재처리 스크립트로 바꾼다 (2026-09-19) |

## 문제

실측(개발계 DB의 발행 콘텐츠 14편 — 운영과 동기화된 것, CloudFront 직접 요청):

| 항목 | 값 |
|---|---|
| 형식·크기 | 전부 PNG 1024×1024 |
| 파일 용량 | 최소 456KB · 중앙값 1.5MB · 최대 1.85MB, 합계 17.8MB |
| CDN | HTTP/2 · 캐시 히트 · TTFB 30ms — CDN은 문제가 아니다 |

앱은 폭 절반 격자 타일(약 180pt)에 이 원본을 그대로 내려받는다. 첫 화면 20장이면 30MB 안팎이라 LTE에서 수 초가 걸린다. iOS에서 더 두드러진 이유는 기본 `Image`가 PNG를 하드웨어 디코드하지 못하고 동시 디코드가 2장이라 타일이 순서대로 뜨기 때문이다(Android는 Fresco가 다운샘플링·디스크 캐시를 해서 체감이 없었다).

원인은 저장 시점에 있다 — 파이프라인 썸네일 단계가 OpenAI 이미지 API로 1024×1024 PNG를 만들고(`pipeline/apps/worker/src/stages/thumbnail.ts`), 백엔드 업로드는 리사이즈 없이 그대로 S3에 올렸다(5MB 상한, `immutable` 캐시만).

## 결정

**저장 시점(admin 업로드 API)에서 줄인다.** 파이프라인과 파트너 업로드가 모두 이 한 곳을 지나므로 출처와 무관하게 전부 잡히고, 앱은 바꿀 것이 없다. 파이프라인의 1024 PNG 원본은 파이프라인 S3에 그대로 남아 나중에 규격을 바꿔도 다시 만들 수 있다.

- 긴 변 **768px**, 비율 유지(자르지 않음), 확대 없음, EXIF 회전 굽기, **WebP 품질 82**. 768은 플레이어 아트워크(3x 약 1080px)에 무리 없고 타일에 넉넉한 값이다.
- 실측: 운영 썸네일 1666KB PNG → **18KB** WebP 768px. 육안 차이 없음(평면 일러스트).
- 이미지로 읽지 못하는 파일은 `VALIDATION_FAILED`(`field: thumbnail`) — `ADMIN_AUDIO_UNREADABLE`과 같은 종류이지만 새 코드는 두지 않았다(필드 인라인 오류로 충분).

## 범위 밖

- 앱의 이미지 컴포넌트(expo-image 교체) — FE 티켓 `tickets/frontend/pending/thumbnail-expo-image.md`(KAN-78). 재방문 시 재다운로드 방지가 목적이고 이 티켓 없이도 첫 다운로드는 해결된다.
- 파이프라인 생성 크기 축소 — 하지 않는다. 품질만 떨어지고 BE에서 한 번 줄이면 된다.

## 완료 조건

- Given 1024×1024 PNG 1.5MB 업로드 / When 발행 / Then 저장 파일이 WebP, 긴 변 768px, `thumbnail_url`이 `.webp`로 끝난다
- Given 규격 이전 발행분 / When 재처리 스크립트 실행 / Then 전부 `.webp` URL로 바뀌고 옛 파일은 지워지며 감사 로그 `content.thumbnail_reprocess`가 남는다
- Given 이미지가 아닌 파일을 `.png`로 올린다 / When 업로드 / Then 400 `VALIDATION_FAILED` field thumbnail, 저장소에 아무것도 올라가지 않는다
- Given `admin-api.md` 4.6 / When 읽는다 / Then 저장 규격(WebP 768px)과 `thumbnail_url`이 `.webp`라는 문장이 있다

## 처리 기록 (2026-09-19 — PR `feat(be)/thumbnail-resize`)

- `ThumbnailImage`(sharp) 신설 — `AudioProbe`와 같은 자리. `AdminContentService`의 업로드(4.6)·재발행(4.10)이 입력 형식 검증 뒤 이것으로 변환한 파일을 `putThumbnail(…, 'webp')`로 올리고 변환 임시 파일은 `finally`에서 지운다.
- 상수: `THUMBNAIL_MAX_EDGE_PX=768` · `THUMBNAIL_WEBP_QUALITY=82` · `THUMBNAIL_OUTPUT_EXTENSION='webp'`.
- 재처리: `npm run thumbnails:reprocess [--dry-run]`(운영 컨테이너에서는 `node dist/scripts/reprocess-thumbnails.js`). `thumbnail_url`이 `.webp`가 아닌 콘텐츠(회수분 포함)를 골라 원본을 내려받아 변환 → **새 키**로 업로드 → URL 교체 + 감사 로그(한 트랜잭션) → 옛 키 삭제. 같은 키에 덮어쓰지 않는 이유는 CloudFront·앱 캐시가 1년 `immutable`이라서다. `content_version`은 올리지 않는다(같은 그림, 새 URL 자체가 새 파일).
- 테스트: `thumbnail-image.spec.ts` 4건(1024→768 축소·비율 유지·확대 없음·비이미지 거부), 서비스 spec 2건 추가. 전체 738건 통과. 실서버 검증은 dev 머지 후 개발계에서 업로드 1건 + 재처리 dry-run으로 확인한다.
- 의존성: `sharp` 추가. Alpine 컨테이너용 `@img/sharp-linuxmusl-*` 바이너리가 lockfile에 들어 있어 `npm ci`로 설치된다.
- 문서: `admin-api.md` 4.6·4.10 표와 6장 흐름, `features/admin.md` 3.1 — `changes/archive/admin-api-thumbnail-storage-format.md`.
- **운영 반영 뒤 할 일**: `dev → main` 배포 후 운영 컨테이너에서 재처리 스크립트를 한 번 돌린다(`--dry-run` 먼저). 그 전까지 운영 목록은 종전 PNG를 본다.
