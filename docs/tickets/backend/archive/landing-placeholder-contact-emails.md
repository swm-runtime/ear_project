# [BE] 랜딩에 자리표시자 이메일이 라이브 노출 중 — 개인정보처리방침 연락처 포함

| 항목 | 값 |
|---|---|
| 대상 | `landing-page/src/content/site.ts` 39·41행(`contactEmail` · `privacyEmail`) |
| 요청 파트 | 백엔드 (랜딩 Vercel 프로젝트 관리 주체) |
| 발행 날짜 | 2026-08-26 |
| 반영 날짜 | 2026-08-26 |
| 발견 시점 | 2026-08-26 `SITE_URL` 폴백이 자리표시자로 프로덕션에 나가고 있는 것을 고치다, 같은 파일의 이메일도 자리표시자인 것을 확인 |
| 근거 문서 | `spec/uiux/`(사용자 노출 문구는 문서와 1:1) · 개인정보처리방침·이용약관은 법적 고지물이다 |
| 심각도 | **중** — 기능은 안 깨지지만 **개인정보처리방침의 연락처가 존재하지 않는 주소**다. 문의가 오면 아무 데도 닿지 않고, 고지 의무 관점에서도 결함이다 |
| 상태 | **완료** |

## 문제

라이브 사이트에 자리표시자 주소가 그대로 떠 있다(2026-08-26 확인).

| 경로 | 노출되는 주소 |
|---|---|
| `https://earcast.co.kr/` | `hello@ear.example.com` |
| `https://earcast.co.kr/terms/` | `hello@ear.example.com` |
| `https://earcast.co.kr/privacy/` | `hello@ear.example.com` · **`privacy@ear.example.com`** |

```ts
// landing-page/src/content/site.ts
contactEmail: "hello@ear.example.com",
privacyEmail: "privacy@ear.example.com",
```

**같은 파일의 `SITE_URL`도 같은 이유로 자리표시자가 나가고 있었다**(canonical·og:url·sitemap 전부 `ear.example.com`). 그쪽은 폴백을 실제 도메인으로 바꿔 해소했다 — 이 티켓은 **값을 정해야 풀리는 나머지 절반**이다.

## 요청 내용

1. **실제 수신 가능한 주소를 정한다.** 문의용과 개인정보용을 나눌지, 하나로 합칠지도 함께 정한다. 도메인 메일(`@earcast.co.kr`)을 쓸지 기존 계정을 쓸지는 운영 편의에 달렸다.
2. **`site.ts`의 두 값을 교체한다.** 문구가 아니라 값이므로 uiux 문서 변경은 없다.
3. **다른 자리표시자가 남아 있는지 훑는다** — `grep -rn "example.com" landing-page/src/`.
4. **범위 밖** — `SITE_URL`(해소됨), 스토어 URL(`share-universal-links-hosting.md` 미결과 공유).

## 완료 조건

- Given `https://earcast.co.kr/privacy/` / When 연락처를 확인한다 / Then 실제 수신 가능한 주소가 표시된다
- Given 그 주소로 메일을 보낸다 / When 확인한다 / Then 팀이 받는다
- Given `landing-page/src/` 전체 / When `example.com`을 검색한다 / Then 남아 있지 않다

## 보류·미결

- **주소 확정** — 팀이 정해야 한다. 이 티켓은 값을 고르지 않는다

---

## 처리 기록 (2026-08-26 — 브랜치 `chore(fe)/landing-noindex-auth`)

- **주소 확정: `runtime364@gmail.com`** (팀 결정 2026-08-26). **문의용·개인정보용을 나누지 않고 하나로 합쳤다** — 3인 팀에서 수신처를 둘로 나누면 한쪽이 방치된다. 도메인 메일(`@earcast.co.kr`)은 등록처·메일 서비스 설정이 필요해 뒤로 미뤘고, 바꿀 때는 이 파일 두 줄만 고치면 된다.
- `site.ts`의 `contactEmail`·`privacyEmail` 교체. 빌드 산출물에서 `/`·`/terms/`·`/privacy/` 전부 실주소로 나오는 것을 확인했다.
- **`landing-page/src/`·`api/`에 `example.com`이 남아 있지 않다**(요청 3).
- `SITE_URL` 자리표시자는 같은 PR에서 해소했다 — 폴백을 실제 도메인으로 바꿔 **환경 변수를 빠뜨린 배포가 조용히 성공하지 않게** 했다.

### 남은 것 — 없다. 다만 알아둘 것

**개인 gmail이 공개 페이지에 노출된다.** 수집 봇이 긁어가므로 스팸이 늘 수 있고, 서비스 문의 창구가 개인 계정이 된다. 도메인 메일로 옮길 때 이 파일 두 줄만 바꾸면 되므로 **지금 막히는 것은 없다** — 옮기고 싶어지면 새 티켓 없이 값만 교체하면 된다.
