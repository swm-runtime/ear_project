# [문서] 글로벌 4 — 발행 계약 `market`·`language`, 태그 규칙 완화, 주제 생성 `market`, 관리자 목록 시장 필터

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/spec/api/admin-api.md` 4.5(주제 생성)·4.6(업로드)·4.10(재발행)·콘텐츠 목록 · `docs/ai/metadata-pipeline.md` 4.4(`tags`) · `docs/backend/domain.md` 5.1(`tags` 설명) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-14 |
| 발견 시점 | KAN-190(글로벌 4 — 발행 계약) 1단계 구현. 확정 계약은 `docs/spec/api/global-api.md` 4.9·4.10 |
| 관련 | [KAN-190](https://runtime364.atlassian.net/browse/KAN-190) `tickets/backend/pending/global-publish-contract.md` |

## 수정 내용

### `admin-api.md` 4.6 업로드 payload

- `market`(`kr` | `global`) · `language`(`ko` | `en`) 추가. **1단계는 선택**(없으면 `kr`·`ko`) — 파이프라인이 보내기 시작하면 필수로 올린다(`global-api.md` 4.9는 "필수"가 최종 상태).
- 검증: 조합 `kr↔ko` · `global↔en` 아니면 400 `VALIDATION_FAILED`(`details.field = "language"`). `topic_ids`가 전부 같은 시장이 아니면 400 `VALIDATION_FAILED`(`details.field = "topic_ids"`). `market=global`인데 `enrichment.json`에 `target_audiences`가 있으면 400(`details.field = "target_audiences"`).

### `admin-api.md` 4.10 재발행

- 시장은 바꾸지 않는다(바꾸려면 회수 후 새로 올린다). `topic_ids`를 교체하면 대상 콘텐츠의 시장과 같은 주제만 받는다(아니면 400).

### `admin-api.md` 4.5 주제 생성 · 콘텐츠 목록

- `POST /admin/topics`에 `market`(선택, 없으면 `kr`).
- `GET /admin/contents?market=` 필터. 항목에 `market`·`language`.

### 태그 규칙 (`metadata-pipeline.md` 4.4 · `domain.md` 5.1)

`^[가-힣A-Za-z0-9]{2,10}$` → **`^[가-힣A-Za-z0-9][가-힣A-Za-z0-9 ]{0,18}[가-힣A-Za-z0-9]$`** — '#' 없는 한글·영문·숫자 2~20자, 안쪽 공백 허용, 앞뒤 공백 금지. 종전 규칙의 상위 집합이라 기존 KR 태그는 전부 통과. 이유: "Stray Kids"·"Squid Game" 같은 영어 고유명사가 공백 때문에 막혔다.

## 미반영(이 티켓 남은 범위)
- `topics.slug`·GLOBAL 주제 시드 → KAN-189. `GET /admin/insights/summary` `by_market` → 데이터 생긴 뒤.

## 완료 조건
- Given `admin-api.md` 4.5·4.6·4.10·목록 / Then 위 필드·검증·400 사유가 있다
- Given `metadata-pipeline.md` 4.4 / Then 새 태그 규칙과 이유가 있다

## 처리 기록
- 2026-10-14 발행. 코드는 KAN-190 PR에 반영.
- 2026-10-15 반영 — `admin-api.md` 4.2(주제 생성 — 기록의 "4.5"는 4.2의 오기)·4.5(목록 `market`)·4.6(업로드 `market`·`language`·태그 규칙)·4.10(재발행 시장)·8장 항목 · `ai/metadata-pipeline.md` 4.2 `tags` 행(기록의 "4.4"는 4.2의 오기) · `backend/domain.md` 5.1 `tags`. 반영 전 코드와 대조함.
