# [FE] 콘텐츠 상세 화면에서 출처 영역 제거 — 데이터는 그대로 두고 화면 표시만

| 항목 | 값 |
|---|---|
| 대상 | 콘텐츠 상세 화면(CD1·CD2) 출처 영역 — `src/features/content-detail/components/ContentDetailSourceSection.tsx` · `screens/ContentDetailScreen.tsx` · 관련 카피·핸들러 |
| 요청 파트 | 프론트엔드 |
| 요청자 | 박수헌 |
| 담당 | 프론트엔드 |
| 발행 날짜 | 2026-10-16 |
| Jira | [KAN-221](https://runtime364.atlassian.net/browse/KAN-221) |
| 시작 날짜 | 2026-10-16 |
| 기한 | 2026-10-19 (Medium — 3일 안) |
| 선행 | 없음 |
| 근거 문서 | `features/content-detail.md` 4.2·4.3·4.3-1·완료 조건 · `spec/uiux/content-detail-uiux.md` 4.5·4.6·6장 카피 · `wireframe/content-detail.html` · PRD FR-12 |
| 중요도 | Medium |
| 상태 | 대기 |

## 문제

콘텐츠 상세 화면 맨 아래에 출처 영역이 있다. AI 생성편에는 "참고한 소스" 목록이 전부 나열되고(제목·저자, 링크가 있으면 탭하면 인앱 브라우저), 파트너편에는 저자·제공·[원문 보기]가 나온다. 제작에 참고한 소스를 사용자에게 그대로 드러내는 것이 부담이다.

## 무엇을 한다

- 상세 화면에서 **출처 영역을 통째로 뺀다** — AI 생성편의 "참고한 소스" 목록과 파트너편의 저자·제공·[원문 보기] 모두. 영역이 빠지면서 남는 구분선도 함께 정리한다(헤더+소개 / 메타 두 영역만 남는다).
- 출처 영역에서만 쓰던 코드는 정리한다 — `ContentDetailSourceSection`, 소스 항목 탭·[원문 보기] 핸들러(`openSourceLink`·`openSourceItemLink`), 출처 카피(한국어·영어).
- **데이터는 건드리지 않는다.** 서버의 소스 목록(`content_sources`)과 상세 API 응답의 `sources` 필드는 그대로 둔다. 앱은 표시만 하지 않는다 — DTO에서 필드를 지우지 않고 읽지 않는 선택 필드로 남겨, 서버 응답이 바뀌어도 깨지지 않게 한다.
- **문서를 같은 PR에서 고친다** — `features/content-detail.md`(4.2 구성·4.3 출처 표시·4.3-1 소스 행·FR-12 노출면 서술·출처 관련 완료 조건), `spec/uiux/content-detail-uiux.md`(4.5·4.6 삭제, 구성·카피 표 정리), `wireframe/content-detail.html`. 출처 고지(FR-12)는 오디오 안의 소스 소개가 맡는다는 것을 4.3 자리에 남긴다.

## 범위 밖

- 라이브러리·탐색·플레이어 더보기 시트의 [원문 보기] — 파트너편(`source_url`이 있는 콘텐츠)에만 나오는 항목이라 지금 화면에는 보이지 않는다. 이번에는 손대지 않는다.
- 서버·파이프라인의 출처 저장과 발행 시 출처 필수 규칙.

## 확인할 것

- 파트너편이 들어오면 파트너 계약에 화면 표시 의무(저자·제공 표기)가 있는지 다시 본다. 있으면 파트너편에만 출처 표시를 되살린다.

## 완료 조건

- Given `origin = ai_generated` 콘텐츠의 상세 / When 화면을 끝까지 스크롤한다 / Then "참고한 소스" 영역과 소스 항목이 없고, 메타 아래에 구분선만 남지 않는다
- Given `origin = partner` 콘텐츠의 상세 / When 화면을 본다 / Then 저자·제공·[원문 보기]가 없다
- Given 상세 API 응답에 `sources`가 있다 / When 화면을 그린다 / Then 오류 없이 표시만 생략되고, 서버 응답·DB의 소스 데이터는 그대로다
- Given 상세 API 응답에 `sources`가 없다(필드 누락) / When 화면을 그린다 / Then 오류 없이 열린다
- Given 코드베이스 / When `ContentDetailSourceSection`을 검색한다 / Then 사용처가 0건이다
- Given `features/content-detail.md`·`spec/uiux/content-detail-uiux.md` / When 출처 영역 규칙을 찾는다 / Then 제거됐다는 기록과 FR-12를 오디오 안의 소개가 맡는다는 서술만 남아 있다

## 처리 기록

- 2026-10-16 발행.
