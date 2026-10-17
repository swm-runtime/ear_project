# 상세 화면 출처 영역 제거(KAN-221)에 맞춰 다른 문서의 "상세가 출처를 나열한다" 서술 정리

| 항목 | 값 |
|---|---|
| 대상 문서 | `features/player.md` 103행(출처 고지 담당 서술) · `features/admin.md` 3.1(59행 — 소스 구조화 입력의 이유) · `backend/domain.md` 5.5 도입부(725행)·606행 · `spec/api/content-detail-api.md` 4.1 필드 표(`content.origin`·`content.sources` 행) |
| 요청 파트 | 프론트엔드 |
| 발행 날짜 | 2026-10-17 |
| 반영 날짜 | 2026-10-17 |
| 시작 날짜 | 2026-10-17 |
| 기한 | 2026-10-24 (Low — 이번 주 통합 때) |
| 선행 | KAN-221 (`tickets/frontend/archive/content-detail-hide-sources.md`) — 완료 |
| 중요도 | Low |
| 상태 | **반영 완료** (2026-10-17) |

## 배경

KAN-221로 콘텐츠 상세 화면의 출처 영역(ai_generated "참고한 소스" 목록 · partner 저자·제공·[원문 보기])을 뺐다. `features/content-detail.md` 4.3 · `spec/uiux/content-detail-uiux.md` 4.5 · `wireframe/content-detail.html`은 같은 PR에서 고쳤다. **데이터(`content_sources`·응답 `sources`)는 그대로다.**

그런데 아래 문서는 여전히 "상세 화면이 소스를 전수 나열한다"를 근거·서술로 쓰고 있다. 동작 규칙은 `content-detail.md`가 기준이라 충돌 시 그쪽이 이기지만, 읽는 사람이 옛 규칙을 사실로 받아들인다.

## 수정 내용

1. **`features/player.md` 103행** — "출처 고지는 서비스 화면과 메타데이터가 담당한다 … 화면 노출 규칙은 `content-detail.md` 4.3(origin 분기 — partner는 저자·제공·[원문 보기], ai_generated는 `content_sources` 전수 나열)". → 상세 화면은 출처를 표시하지 않는다(2026-10-17)로 고치고, **출처 고지(FR-12)의 담당이 무엇인지 다시 적는다.** KAN-221 티켓은 "오디오 안의 소스 소개가 맡는다"고 했고, 이 줄은 "오디오에는 출처·저자 멘트를 넣지 않는다 · 귀속은 축 소스 소개 한 번뿐"이라고 한다 — "축 소스 소개 한 번"이 FR-12 고지로 충분한지 AI 파트(`ai/spec/04` 4장)와 함께 확인해 한 문장으로 맞춘다.
2. **`features/admin.md` 59행** — 소스를 구조화해 받는 이유가 "상세 화면이 전수 나열하고 링크를 연다"로 적혀 있다. 이유를 "저장·추후 노출 대비(상세 화면 표시는 2026-10-17 중단)"로 바꾸거나, 구조화 입력 자체를 유지할지 결정한다(입력 규칙 변경은 이 요청 범위 밖 — 서술만).
3. **`backend/domain.md` 5.5 도입부·606행** — "상세 화면이 소스마다 제목·저자를 전수 나열하고 … 표시용 데이터다". → 테이블은 유지, 화면 표시는 중단됐다는 한 줄을 덧붙인다(백엔드 파트 담당 문서 — 백엔드가 반영).
4. **`spec/api/content-detail-api.md` 4.1** — `content.origin` "출처 영역 분기"·`content.sources` 설명. → 계약은 그대로 두고, "FE는 2026-10-17부터 이 필드를 읽지 않는다(표시 중단 — KAN-221). 응답에서 빠져도 FE는 깨지지 않는다"를 비고로 단다.

## 완료 조건

- Given 위 네 문서 / When "상세 화면"과 "소스 나열"·"[원문 보기]"를 함께 검색한다 / Then 상세 화면이 출처를 표시한다는 현재형 서술이 없고, 표시 중단 날짜(2026-10-17)와 데이터 유지가 적혀 있다
- Given `features/player.md`의 출처 고지 서술 / When FR-12 담당을 찾는다 / Then 오디오 안의 소스 소개(또는 AI 파트와 합의한 담당)가 한 곳에 적혀 있고 `content-detail.md` 4.3과 어긋나지 않는다

## 처리 기록

- 2026-10-17 발행 — KAN-221 처리 중 교차 참조 점검에서 발견.
- 2026-10-17 반영 — `features/player.md` 4.5 첫 항목(상세 화면 출처 표시 중단 · FR-12 담당 = 오디오 안의 축 소스 소개 한 번, `content-detail.md` 4.3과 같은 기준) · `features/admin.md` 3.1 59행(구조화 입력 이유 → 저장·추후 노출 대비, 입력 규칙 유지)과 같은 근거를 쓴 43·106행 괄호 · `backend/domain.md` 5.1 `content_sources` 승격 항목(606행)·5.5 도입부·5.5 "`source_name`을 대체하지 않는다" 항목 · `spec/api/content-detail-api.md` 1장 경계 표 [원문 보기] 행·4.1 `content.origin`·`author_name`/`source_name`/`source_url`·`content.sources[]` 비고·액션 표 [원문 보기]·소스 항목 탭 행(제거 표시). FE 코드(`content-detail.api.ts`·`content-detail.types.ts`·`content-detail.dto.ts`)와 대조함 — `sources`는 DTO 선택 필드이고 매핑하지 않는다(일치). `origin`은 DTO 필수 필드로 화면 모델에 옮기기만 하고 화면 분기에는 쓰지 않는다 — 그래서 "응답에서 빠져도 깨지지 않는다"는 `sources`에만 적었다.
- 남은 것: FR-12 담당 문장은 AI 파트 확인 없이 `content-detail.md` 4.3 기준으로 맞췄다. `ai/spec/04` 4장은 아직 "출처 고지는 서비스 화면·메타데이터가 담당"이라고 적고 있어(124·130·184행) AI 파트 문서의 정리가 필요하다(`player.md` 4.5에 메모).
