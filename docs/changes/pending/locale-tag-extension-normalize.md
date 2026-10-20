# api 문서 — `language_code` 유니코드 확장 태그 처리 문구 (BE)

| 항목 | 값 |
|---|---|
| 대상 문서 | `spec/api/auth-api.md` 4.1 요청 표·규칙(117·122행) · `spec/api/onboarding-api.md` 4.9(515·525행) · `spec/api/settings-api.md` 4.2(197·233행) · `spec/api/global-api.md` 7장(351행) |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-10-20 |
| 관련 | i18n 검증 2026-10-20 V3 · 서버 구현 브랜치 `fix(be)/locale-tag-normalize` · `backend/src/modules/user/policies/market.policy.ts` `normalizeLanguageCode` |

## 배경

앱 1.3.0은 `Intl.DateTimeFormat().resolvedOptions().locale`을 가공 없이 `language_code`로 보낸다(`frontend/src/shared/i18n/locale.ts`). 달력·숫자 설정이 있는 기기는 BCP 47 유니코드 확장이 붙은 태그를 낸다 — `ja-JP-u-ca-japanese`(19자) · `th-TH-u-nu-thai` 등. 종전 서버는

- DTO `@MaxLength(16)`이라 로그인·가입·기기 등록이 400 `VALIDATION_FAILED`로 막혔고(그 기기에서 로그인 불가),
- 16자 이하 확장 태그도 형식 정규식이 한 글자 singleton(`-u-`·`-x-`)을 받지 않아 버려졌으며, 설정 PATCH("기기 언어 따르기")는 400이었다.

서버를 이렇게 고쳤다(같은 브랜치).

- `normalizeLanguageCode`가 `_`를 `-`로 바꾸고 **첫 singleton subtag(`-u-…`·`-x-…` 등)부터 잘라낸 뒤** 종전 형식 검사·16자 제한을 적용한다(`ja-JP-u-ca-japanese` → `ja-JP`). 그래도 형식이 아니거나 16자를 넘으면 종전대로 버린다(null).
- 세 요청 DTO의 `language_code` 입력 길이 제한을 16 → **64자**로 넓혔다. 저장 컬럼은 그대로 `varchar(16)`이다.

구 앱(1.1.0·1.2.x)은 로케일을 보내지 않아 하위 호환 영향은 없다. 문서는 아직 "16자 초과 → 400"으로 적혀 있어 코드와 어긋난다.

## 수정 내용

1. `auth-api.md` 117행 `locale.language_code` 형식 칸: `BCP 47 (≤16자)` → `BCP 47 (입력 ≤64자)`. 설명 끝에 "확장 subtag(`-u-…`·`-x-…`)는 잘라 저장한다(`ja-JP-u-ca-japanese` → `ja-JP`)" 추가.
2. `auth-api.md` 122행: DTO 400 목록의 "`language_code` 16자 초과"를 "`language_code` 64자 초과"로 바꾸고, 다음 문장을 덧붙인다 — "`language_code`는 `_`를 `-`로 바꾸고 확장 subtag(`-u-…`·`-x-…`, 첫 한 글자 subtag부터)를 잘라낸 뒤 판정한다. 그 뒤에도 형식이 아니거나 16자를 넘는 값은 버린다(가입·로그인을 막지 않는다)."
3. `onboarding-api.md` 515행 형식 칸: `string (BCP 47, ≤16자)` → `string (BCP 47, 입력 ≤64자)`. 525행 "형식이 아닌 값은 버리고" 앞에 "확장 subtag는 잘라 저장하고(`auth-api.md` 4.1과 같은 규칙)" 추가.
4. `settings-api.md` 197행 형식 칸: `string (BCP 47, ≤16자)` → `string (BCP 47, 입력 ≤64자)`. 설명의 "형식이 아니면 400" 앞에 "확장 subtag를 잘라낸 뒤(`auth-api.md` 4.1과 같은 규칙 — '기기 언어 따르기'가 확장 태그를 보내도 통과한다)" 추가. 233행 `VALIDATION_FAILED` 사유 "`language_code` 형식 위반"은 그대로 둔다(자른 뒤 형식 위반·64자 초과가 400).
5. `global-api.md` 351행: "`locale.*`·헤더 값은 저장 전 형식 검증(…)" 뒤에 "`language_code`는 확장 subtag(`-u-`·`-x-` 이후)를 잘라 언어·문자·지역만 저장한다(입력 ≤64자, 저장 ≤16자)" 추가.

## 완료 조건 (Given/When/Then)

- Given `auth-api.md` 4.1 / When `language_code` 규칙을 본다 / Then 확장 subtag를 잘라 저장하고, 그 뒤에도 무효·16자 초과면 버리며(가입·로그인 비차단), 입력 한도가 64자라고 적혀 있다
- Given `onboarding-api.md` 4.9 · `settings-api.md` 4.2 / When `language_code` 행을 본다 / Then 형식 칸이 "입력 ≤64자"이고 확장 subtag 처리가 auth-api 4.1을 가리킨다
- Given `global-api.md` 7장 / When 검증 규칙을 본다 / Then `language_code` 확장 subtag 처리 문장이 있다
- Given 네 문서 / When `language_code`의 요청 400 사유를 본다 / Then "16자 초과"가 남아 있지 않다

## 처리 기록

- 2026-10-20 발행(BE — 서버 구현과 같은 PR).
