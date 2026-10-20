# explore-api — 섹션 제목: 아는 종류는 앱이 표시 언어로 그린다(2026-10-19)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/explore-api.md` 4.1 필드 표(`sections[].key` · `sections[].title` 두 행) · 9장 "섹션 `key` enum의 확장" |
| 요청 파트 | 프론트엔드 — 이주호 |
| 발행 날짜 | 2026-10-19 |
| 시작 날짜 | 2026-10-19 |
| 기한 | 2026-10-24 (Low — 다음 통합 때 반영. 필드·응답 모양은 바뀌지 않는다) |
| 선행 | 없음 |
| 중요도 | Low — 서술만 고친다. 서버 동작은 바뀌지 않는다 |
| 관련 | [KAN-194](https://runtime364.atlassian.net/browse/KAN-194) · `spec/uiux/explore-uiux.md` 4.1·6장(같은 PR에서 개정) · `spec/api/global-api.md` 2.3 |

## 배경

KAN-194 실기기 확인(2026-10-19, 설정 › 언어 English): 탐색의 **"관심사에 맞는 추천" · "새로 나온 콘텐츠" · "인기 콘텐츠"** 가 한국어로 보였다. 서버 `explore.constant.ts` `EXPLORE_SECTION_TITLES` 가 한국어 고정이고, explore-api 4.1 은 "`title` 을 화면에 그대로 그린다 · `key` 는 화면 분기에 쓰지 않는다"였다. 반면 `global-api.md` 2.3 은 **"화면 문구는 클라이언트 소유 — 서버는 화면 문구를 내려주지 않는다"** 라 두 문서가 부딪쳤다.

FE는 2.3 을 따랐다 — 아는 세 종류(`interest`·`new`·`popular`)의 제목만 앱 문구(ko/en)로 고르고, `topic_group`(주제 이름 — 시장별 행)과 **앱이 모르는 종류는 서버 `title` 그대로** 그린다. 그래서 4.1 이 지키려던 "서버가 배포 없이 섹션을 더할 수 있다"는 유지된다. 대가는 하나 — 세 종류의 제목을 서버 문자열만 바꿔서는 앱에 반영되지 않는다.

## 고칠 내용

1. 4.1 `sections[].key` 행: "분석·로깅용. 화면 분기에 쓰지 않는다" → "분석·로깅용. 화면 분기(노출·순서·컨트롤)에 쓰지 않는다. **예외: 아는 종류(`interest`·`new`·`popular`)의 제목 문구만 클라이언트가 표시 언어로 고른다**(`global-api.md` 2.3)".
2. 4.1 `sections[].title` 행: "화면에 그대로 그리는 문자열…" → "`topic_group`(주제 이름)과 클라이언트가 모르는 종류의 화면 제목. 아는 세 종류에는 클라이언트 문구가 우선한다(한국어는 이 값과 같게 둔다). 섹션 구성·순서는 서버 제어다".
3. 9장 "섹션 `key` enum의 확장": 새 종류는 서버 `title` 로 그려지므로 무배포 확장은 그대로다 — "새 종류의 제목을 영어로도 보이게 하려면 앱 문구를 함께 더한다"를 덧붙인다.
4. (BE 판단) 서버 `EXPLORE_SECTION_TITLES` 는 옛 앱(1.2.x)이 그대로 그리므로 지우지 않는다.

## 완료 조건

- Given `explore-api.md` 4.1 / When 읽는다 / Then `key`·`title` 두 행이 위 1·2 문장이고 `explore-uiux.md` 4.1 과 어긋나지 않는다
- Given 9장 / Then 위 3 문장이 있다

## 처리 기록

- 2026-10-19 발행. FE 반영은 PR `fix(fe)/explore-section-titles-i18n`(같은 PR에서 `explore-uiux.md` 4.1·6장 개정).
- 2026-10-20 반영(통합 — `docs(be)/apply-explore-section-title`). `explore-api.md` 4.1 `key`·`title` 두 행과 9장 "섹션 `key` enum의 확장"에 요청 1~3 문장을 넣었다. 코드 대조: FE `explore.section-title.ts` `resolveSectionTitle`(아는 종류만 앱 문구, 나머지 서버 `title`)·BE `explore.constant.ts` `EXPLORE_SECTION_TITLES` 유지 — 요청과 같다. 4(서버 제목 유지)는 `title` 행에 "옛 앱(1.2.x)이 그대로 그리므로 서버는 세 종류의 제목도 계속 채운다"로 적었다.
