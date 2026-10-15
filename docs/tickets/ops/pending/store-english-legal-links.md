# [OPS] 스토어 영어 리스팅에 영어 약관·처리방침 링크 넣기 · 공개 국가에서 베트남 제외

| 항목 | 값 |
|---|---|
| 대상 | App Store Connect·Google Play Console 영어 리스팅·공개 국가 |
| 요청 파트 | 운영(스토어 콘솔) |
| 요청자 | 박준현(테크리드) |
| 담당 | 박준현 |
| Jira | [KAN-214](https://runtime364.atlassian.net/browse/KAN-214) · 에픽 [KAN-186](https://runtime364.atlassian.net/browse/KAN-186) |
| 발행 날짜 | 2026-10-15 |
| 시작 날짜 | 2026-10-15 |
| 기한 | 2026-10-18 (Medium) |
| 선행 | 랜딩 영어 페이지 운영 배포(`feat(fe)/landing-english-legal`, 상태: PR 전) |
| 관련 | [KAN-198](https://runtime364.atlassian.net/browse/KAN-198)(심사 제출을 막는다) · [KAN-216](https://runtime364.atlassian.net/browse/KAN-216)(앱 안 링크) |
| 중요도 | Medium |
| 상태 | 대기 |

코드 없는 스토어 콘솔 설정이다. **랜딩 영어 페이지가 운영에 배포된 뒤에** 한다 — 먼저 넣으면 심사관이 404를 본다.

## App Store Connect
1. 앱 정보 → 언어 추가에서 영어(English) 현지화를 연다.
2. 영어 현지화의 **개인정보 처리방침 URL**: `https://earcast.co.kr/en/privacy/`
3. 영어 현지화의 **설명** 끝에 두 줄(가이드라인 3.1.2 — 구독 앱 필수):
   - Terms of Use: https://earcast.co.kr/en/terms/
   - Privacy Policy: https://earcast.co.kr/en/privacy/
4. 한국어 현지화는 지금 링크(`/terms`, `/privacy`) 그대로.

## Google Play Console
1. 기본 스토어 등록정보에 영어(en-US) 번역을 추가하고 설명 끝에 위 두 줄을 넣는다.
2. **주의 — 앱 콘텐츠의 개인정보처리방침 URL은 언어별이 아니라 하나뿐이다.** 한국어 페이지(`/privacy`)를 그대로 두고, 그 페이지에서 영어판으로 가는 링크가 있어야 한다(한국어 처리방침 상단 "English" 링크 — 랜딩 브랜치에서 같이 넣는다).

## 공개 국가 — 베트남 제외 (2026-10-15 결정)
- App Store Connect: 가격 및 사용 가능 여부 → 국가/지역에서 베트남 해제
- Play Console: 프로덕션 → 국가/지역에서 베트남 제외
- 이유: 베트남은 국외 이전 영향평가서를 공안부에 제출해야 하고(Decree 13) 분석·광고 측정에 별도 동의가 필요하다.

## 완료 조건
- Given App Store 영어 리스팅 / Then 설명에 영어 약관·처리방침 링크가 있고 개인정보 URL이 `/en/privacy/`이며 둘 다 200
- Given Play 영어 리스팅 / Then 설명에 두 링크가 있고, 개인정보 URL 페이지에서 영어판으로 갈 수 있다
- Given 두 스토어 공개 국가 / Then 베트남이 빠져 있다

## 처리 기록
- 2026-10-15 발행(마크다운 + Jira).
