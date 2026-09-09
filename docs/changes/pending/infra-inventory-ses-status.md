# [문서] `infra/inventory.md`의 SES 항목이 낡았다 — 셋 다 완료됐는데 대기로 적혀 있다

| 항목 | 값 |
|---|---|
| 대상 문서 | `docs/infra/inventory.md` 2장(DNS 레코드 표) · 3장(외부 서비스 표) |
| 요청 파트 | 문서(인프라) |
| 발행 날짜 | 2026-09-09 |
| 발견 시점 | `tickets/backend/pending/email-spf-dmarc-records.md`(KAN-31)가 "부수 사실"로 지적해 둔 것을 확인 — 그 티켓이 `changes/`로 올리라고 명시했는데 누락돼 있었다 |
| 심각도 | **하** — 동작에 영향 없다. 다만 **읽는 사람이 SES가 아직 못 쓰는 상태로 오해한다** |

## 문제

세 항목이 전부 대기·미구현으로 적혀 있는데 셋 다 끝났다.

| 위치 | 현재 문구 | 실제 |
|---|---|---|
| 2장 DNS 표 | `SES DKIM (⏳ 등록 대기 — 값은 SES 콘솔·memory 참조)` | **DKIM 검증 완료** |
| 3장 외부 서비스 | `도메인 identity earcast.co.kr (DKIM ⏳ 대기) + 테스트 주소 2개, 프로덕션 액세스 ⏳ 심사 중` | **DKIM 완료 · 프로덕션 액세스 승인** |
| 3장 외부 서비스 | `서버 코드(SesMailClient)는 미구현 — 별건` | **구현됨** |

## 근거 (2026-09-09 실측)

```
aws sesv2 get-account
  ProductionAccess: true · Enforcement: HEALTHY · Max24HourSend: 50,000 · MaxSendRate: 14

aws sesv2 get-email-identity --email-identity earcast.co.kr
  VerifiedForSendingStatus: true · DkimAttributes.Status: SUCCESS · SigningEnabled: true
```

코드: `backend/src/modules/user/ses-mail.client.ts` (스펙 `ses-mail.client.spec.ts` 동반).

실사용으로도 확인돼 있다 — 이메일 인증 메일이 Gmail에 `dkim=pass header.d=earcast.co.kr`로 도착한다(2026-09-08 헤더 확인).

## 수정 내용

1. **2장 DNS 표** — `<token>._domainkey` CNAME ×3 행의 `⏳ 등록 대기`를 걷는다. 값의 소재 안내(`SES 콘솔·memory 참조`)는 유지한다.
2. **3장 외부 서비스** — SES 행을 현행화한다.
   - `DKIM ⏳ 대기` → 검증 완료
   - `프로덕션 액세스 ⏳ 심사 중` → **승인됨**(발송 상한 50,000통/일 · 14tps). 샌드박스가 아님을 명시한다 — 이 오해가 실제로 한 번 조사를 낭비시켰다
   - `서버 코드(SesMailClient)는 미구현 — 별건` → 구현 위치(`backend/src/modules/user/ses-mail.client.ts`)로 교체
3. **SPF·DMARC 행을 2장에 추가한다.** 2026-09-07에 반영됐는데 표에 없다.
   - `@` TXT — `v=spf1 include:amazonses.com ~all`
   - `_dmarc` TXT — `v=DMARC1; p=none; rua=mailto:runtime364@gmail.com`
   - **`p=none`은 관찰 단계 값이다.** 2주 리포트 확인 후 상향 예정이라는 점을 함께 적어 KAN-31과 연결한다

## 함께 적어둘 것 — SPF TXT의 앞 공백

2026-09-07에 SPF 첫 저장이 **앞 공백 하나** 때문에 무효였다. RFC 7208은 레코드가 `v=spf1`로
시작할 것을 요구하는데, **DNS 조회 결과를 눈으로 보면 공백이 안 보여 정상처럼 읽힌다.**
2장 표 근처에 "TXT 저장 후 `repr()`로 확인하라"는 주의를 남긴다.

## 완료 조건

- Given `infra/inventory.md` 3장 / When SES 행을 읽는다 / Then 프로덕션 액세스 승인·DKIM 완료·`SesMailClient` 구현 위치가 적혀 있다
- Given 같은 문서 2장 / When DNS 표를 읽는다 / Then SPF·DMARC 행이 있고 `p=none`이 관찰 단계임이 적혀 있다
- Given 같은 문서 / When TXT 관련 주의를 찾는다 / Then 앞 공백 함정과 `repr()` 확인이 적혀 있다
