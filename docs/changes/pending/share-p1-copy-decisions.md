# 공유(FR-27) 카피·아이콘 확정 — share-uiux 6·9장 반영 요청

| 항목 | 값 |
|---|---|
| 발행 날짜 | 2026-09-04 |
| 발행자 | FE (tickets/frontend/pending/share-p1-activation-next-build.md 요청 1·2 처리) |
| 대상 문서 | `spec/uiux/share-uiux.md` 6장(카피) · 9장(아이콘 미결) |
| 관련 코드 | `frontend/src/features/share/share.copy.ts` · `share.service.ts`(TODO 주석 제거됨) |

## 확정 내용

1. **공유 텍스트 형식** — 시안 SH3 그대로 확정: `제목 ⏎ 저자 · 출처 ⏎ 링크` 세 줄.
   저자가 없으면 둘째 줄은 출처만("저자 없음"으로 채우지 않음). 내부 용어·안내 문구 없음.
2. **[공유] 낭독 라벨** — `공유` 확정. 네 진입점(라이브러리·탐색·플레이어 시트, 상세 앱바)
   공통.
3. **아이콘(9장 미결)** — 플랫폼별 OS 관용 아이콘 대신 **공통 아이콘 하나**(`ShareIcon.tsx`
   현행 도형)로 확정. 유지보수 단일화가 이유.

## 수정 요청

- share-uiux.md 6장 표의 제안값 표기를 확정값으로 바꾸고, 9장 미결에서 아이콘 항목을 닫는다.

## 완료 조건 (Given/When/Then)

- Given share-uiux.md 6장을 열면, When 반영이 끝나면, Then 텍스트 형식·낭독 라벨이
  확정값으로 적혀 있고 "제안" 표기가 없다.
- Given 9장 미결 목록을 열면, When 반영이 끝나면, Then 아이콘 항목이 공통 아이콘 확정으로
  닫혀 있다.
