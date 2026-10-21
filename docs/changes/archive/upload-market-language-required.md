# 업로드 `market`·`language` 필수 전환(KAN-190 2단계) — 계약 문서 반영 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/global-api.md` 4.9(payload 문단 "1단계는 선택" · 제목 · 221행 주제 필드) · 3장 표 10행 · `spec/api/admin-api.md` 4.6 업로드 payload 예시의 `market` 주석(178행 부근) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 다음 통합 때 |
| 선행 | 없음 — 코드 반영 PR `feat(be)/upload-market-language-required` |
| 관련 | [KAN-190](https://runtime364.atlassian.net/browse/KAN-190) · AI [KAN-202](https://runtime364.atlassian.net/browse/KAN-202)(파이프라인 송신 #1748) |

## 배경

`POST /admin/contents`의 payload `market`·`language`는 1단계에서 선택이었다(없으면 `kr`·`ko`). 그동안 파이프라인이 두 필드를 보내지 않아서였다. #1748(2026-10-19)부터 파이프라인 업로드(`uploadEarContent`, 유일한 호출 지점)가 콘솔 시장에 맞춰 두 필드를 늘 보낸다. 그래서 2단계(필수)로 올렸다.

기본값을 남겨 두면 문제가 생긴다. GLOBAL 콘솔이 값을 빠뜨려도 영어 콘텐츠가 KR 카탈로그에 조용히 섞이기 때문이다.

## 수정 내용

- `global-api.md` 4.9의 "**1단계는 선택**(없으면 `kr`·`ko`) … 필수로 올린다(KAN-190 2단계)"를 다음으로 바꾼다. "**필수**(2026-10-19 — KAN-190 2단계). 빠지면 400 `VALIDATION_FAILED`(`field: "market"` 또는 `"language"`). 조합은 `kr`+`ko` · `global`+`en`".
- 3장 표 10행 "파이프라인이 두 트랙을 만들기 시작하면" 칸에 완료 날짜(2026-10-19)를 적는다.
- `admin-api.md` 4.6 예시 주석 "1단계 선택(없으면 kr)"을 "필수(2026-10-19)"로 바꾼다.
- 재발행(`PATCH /admin/contents/:id`)은 그대로다. 시장은 바뀌지 않고 payload에 `market`을 받지 않는다.
- 주제 생성(`POST /admin/topics`)의 `market`도 그대로 선택이다. 바꿀 대상이 아니다.

**추가(2026-10-20 i18n 검증)**

- **재발행 경로 정정** — `global-api.md` 3장 표 10행 "메서드·경로" 칸과 4.9 제목이 `POST /admin/contents/:id/republish`로 적혀 있다. 실제 경로는 **`PATCH /admin/contents/:contentId`** 다(`backend/src/modules/admin/admin.controller.ts` 442행 `@Patch('contents/:contentId')` · `republishContent`). 두 곳을 `PATCH /admin/contents/:contentId`(재발행)로 바꾼다. 재발행 payload(`RepublishContentRequestDto` — `title`·`description`·`source_name`·`topic_ids`·`sources`)는 `market`·`language`를 받지 않는다. 그러므로 10행 "변경" 칸의 "payload `market`·`language` **필수**"는 **업로드(`POST /admin/contents`)에만** 걸린다고 적는다.
- **주제 필드 필수 전환 문장 삭제** — `global-api.md` 221행 "두 필드(주제 `market`·`slug`)의 필수 전환은 발행 계약 필수 전환(KAN-190 2단계)과 같은 때 한다"를 지운다. 이 요청 자체가 "주제 생성의 `market`은 그대로 선택"으로 정했고(위 줄), 코드도 선택이다(`admin/dto/create-topic-request.dto.ts` 37행 `market?`). 221행 앞부분의 "`market`(1단계 선택 — 없으면 `kr`)"도 "`market`(선택 — 없으면 `kr`)"로 줄인다.

## 완료 조건

- Given `global-api.md` 4.9·`admin-api.md` 4.6 / When 업로드 payload 설명을 읽는다 / Then `market`·`language`가 필수이고 누락 시 400(`field`)이라고 적혀 있다
- Given `global-api.md` 3장 10행·4.9 제목 / Then 재발행 경로가 `PATCH /admin/contents/:contentId`이고, "필수"가 업로드에만 걸린다
- Given `global-api.md` 4.9 주제 생성 줄 / Then 주제 `market`·`slug`의 필수 전환 언급이 없다

## 처리 기록

- 2026-10-19 발행. 코드: `UploadContentRequestDto`에서 `@IsOptional`을 없앴고, 컨트롤러의 `?? kr/ko` 기본값도 없앴다. 단위 테스트(누락 시 해당 필드 거부)와 E2E(`series.e2e-spec.ts` — 누락 시 400 `field: market`/`language`)로 확인했다.
- 2026-10-20 i18n 검증으로 대상 추가/정정 — 재발행 경로(`PATCH /admin/contents/:contentId`, market·language 받지 않음)와 4.9 221행 주제 필수 전환 문장 삭제를 더했다(BE — 브랜치 `docs(be)/i18n-audit-change-requests`).
- 2026-10-20 반영(통합 — `docs(be)/apply-global-change-requests`). `global-api.md` 4.9 payload 문단(필수 · 누락 400 `field` · 조합 · 재발행은 받지 않음)·제목·3장 10행(경로 `PATCH /admin/contents/:contentId`(재발행) · "필수"는 업로드에만 · 완료 날짜 2026-10-19)·주제 생성 줄(`market`(선택) · 필수 전환 문장 삭제), `admin-api.md` 4.6 예시 주석 두 줄을 반영했다. 코드 대조: `UploadContentRequestDto` `market`·`language`에 `@IsOptional` 없음 · `RepublishContentRequestDto`에 두 필드 없음 · `CreateTopicRequestDto` `market?` · `admin.controller.ts` `@Patch('contents/:contentId')` — 요청과 같다. 요청 밖 한 곳 더: 완료 조건 1("admin-api 4.6에 필수·누락 400")을 지키려고 `admin-api.md` 4.6 본문 `market`·`language` 항목의 "1단계는 선택" 문장도 필수로 바꿨다.
