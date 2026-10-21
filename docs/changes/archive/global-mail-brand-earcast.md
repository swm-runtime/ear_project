# 영어 인증 메일 브랜드명 `Earcast` 반영 — `global-api.md` 문구 정리 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/global-api.md` 인증 메일 행(68행 부근) |
| 요청 파트 | 백엔드 — 박준현 |
| 발행 날짜 | 2026-10-18 |
| 관련 | KAN-198(PM 확정 2026-10-18) · 브랜치 `fix(be)/en-mail-brand-earcast` |

## 배경

`global-api.md`의 인증 메일 행은 "서버 메일 템플릿(`verification-mail.template.ts` `EN_BRAND`)은 BE 반영 대상이다"라고 적혀 있다. 이번에 `EN_BRAND = 'Earcast'`로 반영했으므로 이 문구는 사실과 맞지 않게 된다.

## 수정 내용

`global-api.md` 인증 메일 행의 마지막 문장을 다음으로 바꾼다.

> 서버 메일 템플릿(`verification-mail.template.ts` `EN_BRAND`)도 `Earcast`다(반영 2026-10-18)

## 완료 조건

- Given `global-api.md` / When 인증 메일 행을 읽는다 / Then 서버 메일의 영어 브랜드명이 `Earcast`로 반영됐다고 적혀 있고, "BE 반영 대상" 문구가 없다

## 처리 기록

- 2026-10-18 발행. 코드 반영 결과: 영어 메일 제목은 `[Earcast] Your verification code is 123456`이고, 본문은 "Earcast verification code"다(`verification-mail.template.spec.ts`).
- 2026-10-19 **반영**(PR `docs(be)/apply-pending-changes-1019`). 반영 날짜 2026-10-19. `global-api.md` 2.3 인증 메일 행의 마지막 문장을 바꿨다. "BE 반영 대상" 문구를 없앴다.
