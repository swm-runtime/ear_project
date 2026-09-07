# [BE] 발신 도메인에 SPF·DMARC가 없다 — DKIM 하나로만 서 있다

| 항목 | 값 |
|---|---|
| 대상 | `earcast.co.kr` DNS(가비아 DNS 관리툴) TXT 2줄. **코드·서버 설정 변경 없음** |
| 요청 파트 | 백엔드 (인프라) |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | 2026-09-07 SES 실발송 성공 후 발신 도메인 인증 상태를 조회하다가 — 메일은 도착하는데 도메인에 SPF·DMARC가 한 줄도 없었다 |
| 근거 문서 | `tickets/frontend/pending/prod-build-env-and-eas.md`(SES 검증 기록) · `infra/inventory.md` 3장(SES 항목) · `features/auth.md`(이메일 인증) |
| 심각도 | **중** — 아래 "심각도 판단" 참조. 지금 당장 메일이 막히지는 않는다(DKIM 정렬로 최소 요건 충족, 수신함 도착 확인). 도메인 스푸핑 무방비 + 발송량 증가 시 하드 실패 |
| 상태 | 대기 — **사용자가 가비아 콘솔에서 직접 추가해야 한다**(조사·값 확정은 끝났다) |
| 연관 | `tickets/frontend/pending/prod-build-env-and-eas.md` — 이 티켓은 그 티켓의 "SES 발송 점검(2026-09-07)" 기록에서 파생됐다 |

## 문제

### 조사 결과 — 세 축 중 하나만 서 있다

2026-09-07 SES API(`sesv2 get-email-identity`)와 Google DoH로 실측한 값이다.

| 축 | 상태 | 실측 근거 |
|---|---|---|
| **DKIM** | 정상 | SES `DkimAttributes.Status=SUCCESS`, `SigningEnabled=true`, `SigningAttributesOrigin=AWS_SES`(Easy DKIM). CNAME 3개 전부 DNS에서 해석됨 |
| **SPF** | **없음** | `earcast.co.kr` TXT → NOERROR·레코드 0개 |
| **DMARC** | **없음** | `_dmarc.earcast.co.kr` TXT → NXDOMAIN |
| **MX(수신)** | **없음** | `earcast.co.kr` MX → NOERROR·레코드 0개 |

DKIM CNAME 3개는 이미 가비아에 등록돼 있다(2026-08-31 키 생성, 검증 통과).

```
a3qx3gvs4j45y3c7tyqplbcz6rpwrswn._domainkey.earcast.co.kr → a3qx3gvs4j45y3c7tyqplbcz6rpwrswn.dkim.amazonses.com.
frnmreyutceychihxawqgqa6wi5gwef5._domainkey.earcast.co.kr → frnmreyutceychihxawqgqa6wi5gwef5.dkim.amazonses.com.
4oikfsw5vytjbfdq4x27mxg47d4akh2p._domainkey.earcast.co.kr → 4oikfsw5vytjbfdq4x27mxg47d4akh2p.dkim.amazonses.com.
```

> **조사 중 한 번 잘못 판정할 뻔했다 — 기록해 둔다.** 부모 노드 `_domainkey.earcast.co.kr`를 물었더니
> **NXDOMAIN**이 떨어져 "DKIM 없음"으로 결론낼 뻔했다. 가비아 네임서버가 empty non-terminal에
> NXDOMAIN을 주는(RFC 비준수) 동작이다. **`_domainkey` 부모 노드로 DKIM 유무를 판정하지 마라.**
> 토큰 이름을 직접 물어야 한다.

### DNS 관리 주체 — 가비아

`earcast.co.kr` NS 조회 결과:

```
ns.gabia.net.   ns.gabia.co.kr.   ns1.gabia.co.kr.
```

**Route53이 아니다.** `aws route53 list-hosted-zones`는 빈 배열(`{"HostedZones": []}`)을 반환했고
(SSO 토큰이 유효한 상태에서 조회했다 — 권한 문제가 아니라 호스팅 영역이 실제로 없다),
SES가 조회한 SOA의 Primary NS도 `ns.gabia.co.kr`이다(`VerificationInfo.SOARecord`).
Vercel DNS도 아니다 — 루트 A가 Vercel IP(`216.198.79.1`)를 가리키지만 **A 레코드만 가비아에
수동 등록된 형태**다.

**추가 화면:** 가비아 로그인 → **My가비아 → 서비스 관리 → 도메인 → `earcast.co.kr`** →
**DNS 관리툴 → DNS 설정 → 레코드 수정**. `타입 / 호스트 / 값 / TTL` 표에 줄을 추가하고
마지막에 **[확인]/[저장]** 을 눌러야 반영된다(줄만 추가하고 저장을 안 하면 들어가지 않는다).

### 심각도 판단 — 발주 전제를 한 군데 정정한다

이 티켓의 발주 근거는 *"구글 2024 발신자 요건(SPF+DKIM+DMARC 미충족 시 스팸·거부) 때문에 이메일
인증 기능 전체가 위험하다"* 였다. **절반만 맞다.** 구글 요건은 발송량으로 두 단계다.

| 구분 | 요건 | 이어의 현재 상태 |
|---|---|---|
| **모든 발신자** | SPF **또는** DKIM 중 **하나** + 정방향/역방향 DNS + TLS + 스팸률 0.3% 미만 | **충족** — DKIM이 `d=earcast.co.kr`로 서명되고 From과 정렬된다 |
| **대량 발신자**(Gmail 수신자 5,000통/일 이상) | SPF **와** DKIM **와** DMARC(최소 `p=none`) + 정렬 | 해당 없음 — SES `SentLast24Hours=1`, 신청서상 월 1,000통 미만 |

그래서 **"이메일 인증이 지금 막혀 있다"는 사실이 아니다.** 2026-09-07 실발송이 정상 수신함에
도착한 것이 그 증거다. 심각도를 **높음이 아니라 중**으로 둔 이유다.

그럼에도 지금 해야 하는 이유는 셋이다.

1. **스푸핑 무방비.** SPF·DMARC가 없으면 누구나 `@earcast.co.kr`을 발신자로 위조해도 수신 서버가
   기댈 정책이 없다. 이어는 **인증 코드**를 보내는 도메인이라 피싱 표적 가치가 있다.
2. **가시성 0.** DMARC `rua`가 없으면 우리 도메인 이름으로 누가 무엇을 보내는지 알 방법이 없다.
   `p=quarantine` 이상으로 올리려면 먼저 `p=none` 리포트를 쌓아야 한다 — **오늘 넣어야 2주 뒤에
   올릴 수 있다.**
3. **비용이 사실상 0.** TXT 2줄, 코드 변경 없음, 롤백은 줄 삭제. 미뤄서 얻는 이득이 없다.

### MX 부재 — 발주 전제를 하나 더 좁힌다

*"답장·바운스가 유실된다"* 중 **바운스는 유실되지 않는다.** SES가 기본 Return-Path
(`...@ap-northeast-2.amazonses.com`)로 바운스·불만을 받아 처리하고,
`FeedbackForwardingStatus=true`라 계정 등록 주소로 전달한다. 억제 목록도
`BOUNCE`·`COMPLAINT` 둘 다 켜져 있다.

**실제로 유실되는 것은 사람이 `no-reply@earcast.co.kr`로 보내는 답장 하나뿐이다.**
문의 창구는 이미 `runtime364@gmail.com`으로 확정돼 있으므로
(`tickets/backend/archive/landing-placeholder-contact-emails.md`, 팀 결정 2026-08-26)
영향은 "실수로 답장한 사용자가 조용히 무시당한다"에 그친다.

## 요청 내용

### 1. SPF — TXT 1줄 추가

| 필드 | 값 |
|---|---|
| 타입 | `TXT` |
| 호스트 | `@` (가비아 표기. 루트 `earcast.co.kr`) |
| 값 | `v=spf1 include:amazonses.com ~all` |
| TTL | `3600` |

**값의 근거**

- **`include:amazonses.com`이 맞다. 리전별 include는 필요 없다.** 실측으로 확인했다 —
  `amazonses.com` TXT가 전 리전 IP 대역을 직접 나열한 단일 SPF이고
  (`ip4:199.255.192.0/22 ... ip4:98.77.0.0/16 -all`),
  `ap-northeast-2.amazonses.com` TXT는 `v=spf1 include:amazonses.com -all`로 그것을 다시 가리킬
  뿐이다. 즉 서울 리전 발송도 `amazonses.com` 하나로 덮인다.
- **`~all`(softfail)로 시작하고 `-all`(hardfail)은 나중에.** 지금은 이 도메인에서 SES 말고 무엇이
  나가는지 확증이 없다(랜딩은 Vercel이고 메일을 안 보내지만, 확인된 적은 없다). `-all`을 먼저 넣고
  누락된 발송원이 있으면 그 메일이 **즉시 거부**된다. `~all`은 같은 상황에서 통과시키되 표시만 한다.
  아래 3번 DMARC 리포트를 **2주 이상** 받아 `earcast.co.kr`을 쓰는 발송원이 SES뿐임을 확인한 뒤
  `-all`로 바꾼다.

> **주의 — 이 줄을 넣어도 오늘의 인증 결과는 바뀌지 않는다.** SPF는 From 헤더가 아니라
> **Return-Path(envelope MAIL FROM)** 를 검사한다. 지금 SES에는 커스텀 MAIL FROM이 설정돼 있지
> 않아서(`MailFromAttributes`에 `MailFromDomain` 없음) Return-Path가
> `...@ap-northeast-2.amazonses.com`이고, **검사 대상 도메인이 amazonses.com이지 earcast.co.kr이
> 아니다.** 그래서 수신 서버 헤더에는 지금도 `spf=pass`가 찍히지만 `earcast.co.kr` 기준으로는
> **정렬되지 않은 pass**다. 이 줄의 값어치는 (a) 정책 공표 — 우리 이름으로 누가 보낼 수 있는지를
> 선언하는 것, (b) 아래 4번을 적용하면 그때 정렬된 pass가 된다는 것이다.
> **DMARC는 SPF·DKIM 중 하나만 정렬되면 통과하므로 DKIM만으로 이미 충분하다** — 4번은 선택이다.

### 2. SPF는 도메인당 1줄이다 — 나중에 합칠 때 주의

`earcast.co.kr` TXT는 현재 **0개**다. 그러므로 **병합할 기존 SPF가 없다.** 새로 한 줄 추가하면 된다.
다만 나중에 다른 서비스(예: 5번의 메일 포워딩)를 붙일 때 **두 번째 `v=spf1` 줄을 추가하지 말고**
기존 줄에 `include:`를 덧붙여야 한다. 두 줄이면 `permerror`가 나서 **둘 다 무효**가 된다.

### 3. DMARC — TXT 1줄 추가

| 필드 | 값 |
|---|---|
| 타입 | `TXT` |
| 호스트 | `_dmarc` (가비아 표기. 전체 이름 `_dmarc.earcast.co.kr`) |
| 값 | `v=DMARC1; p=none; rua=mailto:soheeandjuho@gmail.com` |
| TTL | `3600` |

**태그별 판단 — 넣을 것 2개, 뺄 것 6개**

| 태그 | 결정 | 근거 |
|---|---|---|
| `p=none` | **넣는다** | 관측 전용. 지금 올리면 정렬 안 된 정상 메일까지 격리될 수 있다. 리포트 2주 뒤 `quarantine` → 안정되면 `reject` |
| `rua` | **넣는다** | 집계 리포트 수집처. 이게 없으면 `p=none`은 아무 의미가 없다 |
| `sp` | **뺀다** | 생략하면 서브도메인이 `p` 값을 그대로 상속한다. `p=none`인 지금 `sp=none`은 같은 말의 반복이다. `p`를 `reject`로 올릴 때 미사용 서브도메인 보호용으로 `sp=reject`를 함께 검토한다 |
| `pct` | **뺀다** | `pct`는 `quarantine`/`reject`에서 적용 비율을 정하는 태그다. `p=none`에서는 **아무 동작도 하지 않는다**(기본 100). 노이즈일 뿐이다 |
| `adkim` | **뺀다** | 기본값이 relaxed(`r`)이고 그게 맞다. 지금 DKIM은 `d=earcast.co.kr`로 From과 완전히 일치해 `s`(strict)여도 통과하지만, 조여서 얻는 것이 없다 |
| `aspf` | **뺀다** | 기본 relaxed. `s`로 조이면 4번(커스텀 MAIL FROM `mail.earcast.co.kr`) 적용 시 서브도메인이라 **정렬이 깨진다.** relaxed여야 조직 도메인 기준으로 정렬된다 |
| `ruf` | **뺀다** | 실패 리포트는 사용자 메일 원문 일부를 포함해 개인정보 문제가 있고, 실제로 보내는 수신자도 드물다 |
| `fo` | **뺀다** | `ruf`가 있어야 의미가 있는 태그다. `ruf` 없이 `fo`만 넣으면 무효다 |

> **`rua`를 gmail.com으로 두는 것의 한계 — 확인했고, 그래도 이 값으로 간다.**
> RFC 7489 §7.1은 `rua` 도메인이 정책 도메인과 다르면 수신 측이
> `earcast.co.kr._report._dmarc.gmail.com` TXT로 승인해야 한다고 정한다. 실측 결과 그 이름은
> **NXDOMAIN**이고 gmail.com은 와일드카드 승인도 공표하지 않는다. 규격을 엄격히 지키는 리포터는
> 우리 리포트를 안 보낼 수 있다. 다만 구글·야후 등 주요 리포터는 실제로 gmail 주소로 보내며,
> 대안(도메인 메일함 신설 / DMARC 리포트 SaaS 가입)은 지금 단계에 과하다.
> **리포트는 매일 XML 첨부로 온다** — Gmail에 `_dmarc` 라벨 + 필터를 만들어 받은편지함 밖으로
> 빼 두는 것을 권한다. 2주 뒤 리포트가 한 통도 안 오면 위 승인 레코드 문제를 다시 본다.

### 4. (선택·후순위) 정렬된 SPF가 필요해지면 — 커스텀 MAIL FROM

Return-Path까지 `earcast.co.kr` 계열로 맞추려면 SES에 커스텀 MAIL FROM 서브도메인을 붙인다.
**지금은 필요 없다**(DMARC는 DKIM 정렬만으로 통과한다). 대량 발신자 구간에 들어가거나
수신 서버가 SPF 정렬을 별도로 요구할 때 검토한다.

- SES: 도메인 identity → MAIL FROM 도메인 = `mail.earcast.co.kr`
- 가비아 DNS 2줄:
  - `MX` / 호스트 `mail` / 우선순위 `10` / 값 `feedback-smtp.ap-northeast-2.amazonses.com`
  - `TXT` / 호스트 `mail` / 값 `v=spf1 include:amazonses.com ~all`
- 위 `feedback-smtp.ap-northeast-2.amazonses.com`은 서울 리전 값이며 실제로 해석된다(A 3개 확인).
- 이 MX는 **바운스 수신 전용**이다. 아래 5번의 루트 MX와 목적이 다르고 서로 간섭하지 않는다.

### 5. MX 부재 — 선택지와 권고

| 안 | 하는 일 | 비용 | 난이도 | 얻는 것 / 잃는 것 |
|---|---|---|---|---|
| **A. 그대로 둔다** | 아무것도 안 함 | 0 | 없음 | 바운스는 이미 SES가 처리한다. **사람 답장만 조용히 사라진다.** 도메인이 "수신 불가"로 보여 일부 필터가 감점할 수 있다(감점 정도는 확인 필요) |
| **B. 메일 포워딩** ★ | 루트에 포워딩 서비스 MX 등록, `no-reply@`·`hello@` → `runtime364@gmail.com` | 0~저가 (가비아 포워딩 요금 **실값 확인 필요**) | 낮음 — DNS 2~3줄 | 답장이 팀 지메일로 들어온다. 메일함 신설·계정 관리 없음 |
| **C. Google Workspace** | 정식 도메인 메일함 | 사용자당 월 과금 (**실값 확인 필요**) | 중 — 도메인 소유 확인 + 계정 생성 + MX 등록 | 제대로 된 메일함. 3인 팀·답장 거의 없는 `no-reply@` 하나 때문에 도입하기엔 과하다 |
| *(SES 수신 규칙)* | S3/Lambda로 인바운드 처리 | 저가 | 높음 | **ap-northeast-2 지원 여부 확인 필요**(SES 인바운드는 일부 리전만 제공). 규칙셋·S3·Lambda 구성이 필요해 답장 몇 통에 붙일 구조가 아니다 — **후보에서 제외** |

**★ B를 권한다. 그중에서도 가비아 자체 메일 포워딩.**

- DNS가 이미 가비아에 있어 **한 화면에서 끝난다.** 네임서버를 옮길 필요가 없다.
  (Cloudflare Email Routing은 무료지만 NS를 Cloudflare로 이전해야 한다 — 랜딩·API·DKIM이 전부
  걸린 운영 도메인을 건드리게 되므로, 이 건의 이득 대비 위험이 크다.)
- 팀은 **2026-08-26에 연락처를 `runtime364@gmail.com` 하나로 합치기로 이미 결정했다.** 새 메일함을
  만드는 C안은 그 결정과 어긋난다. 포워딩은 그 결정을 그대로 따른다.
- **포워딩은 수신이라 SPF에 영향이 없다.** 1번 SPF 줄을 그대로 두면 된다. 다만 포워딩 업체가
  "SPF에 우리 include를 넣으라"고 안내하면 **새 TXT 줄을 만들지 말고** 기존 줄 안에 `include:`를
  덧붙인다(2번).
- A안도 합리적 선택이다 — 답장이 실제로 오는지 모르는 상태다. **B를 못 하겠으면 A로 두고 이
  항목만 따로 남겨라.** 1·3번(SPF·DMARC)은 어느 쪽이든 그대로 진행한다.

### 6. 범위 밖

- **BIMI(발신자 로고)** — VMC 인증서에 상표 등록 + 연 $1,000 이상이 들고, 선행 조건인 DMARC
  `p=quarantine` 이상도 아직 아니다. **보류**(`default._bimi.earcast.co.kr` NXDOMAIN 확인).
- 코드·서버 설정 변경 없음. `.env.prod`의 `MAIL_FROM_ADDRESS`는 그대로 둔다.

## 검증 절차

### DNS 반영 확인 — DoH 스크립트

레코드 저장 후 실행한다. 가비아 반영에 보통 수 분~수십 분이 걸리므로 바로 안 나오면 잠시 뒤
재실행한다. (이 환경의 `nslookup`은 출력 인코딩이 깨진다. 아래를 쓸 것.)

```python
# check-email-dns.py  —  python check-email-dns.py
import json, urllib.request

DOMAIN = "earcast.co.kr"
DKIM_TOKENS = [
    "a3qx3gvs4j45y3c7tyqplbcz6rpwrswn",
    "frnmreyutceychihxawqgqa6wi5gwef5",
    "4oikfsw5vytjbfdq4x27mxg47d4akh2p",
]

def q(name, rtype):
    url = "https://dns.google/resolve?name=" + name + "&type=" + rtype
    req = urllib.request.Request(url, headers={"accept": "application/dns-json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.load(r)
    return [a.get("data", "").strip('"') for a in d.get("Answer", [])]

ok = True
def check(label, cond, detail):
    global ok
    ok = ok and cond
    print(("[PASS] " if cond else "[FAIL] ") + label + ": " + str(detail))

spf = [v for v in q(DOMAIN, "TXT") if v.startswith("v=spf1")]
check("SPF 1개만 존재", len(spf) == 1, spf or "없음")
check("SPF에 amazonses include", any("include:amazonses.com" in v for v in spf), spf)

dmarc = [v for v in q("_dmarc." + DOMAIN, "TXT") if v.startswith("v=DMARC1")]
check("DMARC 존재", len(dmarc) == 1, dmarc or "없음")
check("DMARC rua 지정", any("rua=mailto:" in v for v in dmarc), dmarc)

# DKIM은 부모 노드(_domainkey)로 물으면 가비아가 NXDOMAIN을 준다. 토큰 이름을 직접 물을 것.
for t in DKIM_TOKENS:
    ans = q(t + "._domainkey." + DOMAIN, "CNAME")
    check("DKIM " + t[:8], any("dkim.amazonses.com" in v for v in ans), ans or "없음")

print("=> 전체 통과" if ok else "=> 미반영 항목 있음")
```

### SES 쪽 확인 (AWS CLI, `aws sso login` 필요)

```bash
aws sesv2 get-email-identity --email-identity earcast.co.kr --region ap-northeast-2 \
  --query '{DKIM:DkimAttributes.Status, Verified:VerifiedForSendingStatus, MailFrom:MailFromAttributes}'

aws sesv2 get-account --region ap-northeast-2 \
  --query '{Prod:ProductionAccessEnabled, Enforcement:EnforcementStatus, Quota:SendQuota}'
```

> 운영 EC2에서는 조회되지 않는다. 인스턴스 롤 `ear-prod-ec2`에 SES **읽기** 권한이 없어
> `ses:GetSendQuota`·`ses:ListIdentities` 전부 AccessDenied다. 로컬에서 SSO로 조회할 것.

### 메일 원본 헤더 확인 — 최종 판정

DNS만 맞아서는 부족하다. **실제로 한 통 보내서 수신 측이 어떻게 판정했는지**를 봐야 한다.

1. 실기기 앱에서 설정 → 이메일 등록 → **[인증 코드 받기]** (또는 운영 EC2에서 SES 직접 발송)
2. **Gmail 웹**에서 그 메일을 연다 → 우측 **⋮(더보기) → [원본 보기]**(Show original)
3. 상단 요약 박스에 `SPF` / `DKIM` / `DMARC` 세 줄이 보인다. 모두 **PASS**여야 한다.
4. 요약 박스만 믿지 말고 원문의 `Authentication-Results:` 줄을 직접 읽는다:

```
Authentication-Results: mx.google.com;
       dkim=pass header.i=@earcast.co.kr header.s=<토큰> header.b=...;
       spf=pass (google.com: domain of 0100...@ap-northeast-2.amazonses.com designates ...)
            smtp.mailfrom=...amazonses.com;
       dmarc=pass (p=NONE sp=NONE dis=NONE) header.from=earcast.co.kr
```

**읽는 법 — 여기가 이 티켓의 핵심이다.**

| 보이는 것 | 뜻 |
|---|---|
| `dkim=pass header.i=@earcast.co.kr` | **정렬된 DKIM.** `header.i`가 `earcast.co.kr`이어야 한다. `@amazonses.com`이면 정렬 실패다 |
| `smtp.mailfrom=...amazonses.com` | 정상이지만 **정렬은 아니다.** 4번(커스텀 MAIL FROM)을 적용하면 `mail.earcast.co.kr`로 바뀐다 |
| `dmarc=pass (p=NONE ...)` | DMARC 레코드가 읽혔고 DKIM 정렬로 통과했다. **이 줄이 나오면 3번이 반영된 것이다** |
| `dmarc=`가 아예 없음 | `_dmarc` TXT 미반영. DNS부터 다시 확인한다 |

`Received-SPF:` 줄도 함께 확인한다 — `pass`이되 괄호 안 도메인이 amazonses 계열인 것이
**지금은 정상**이다.

## 완료 조건

- Given 가비아 DNS 관리툴에서 SPF TXT를 저장했다 / When 위 `check-email-dns.py`를 실행한다 / Then `SPF 1개만 존재`와 `SPF에 amazonses include`가 모두 PASS다
- Given 가비아 DNS 관리툴에서 `_dmarc` TXT를 저장했다 / When 같은 스크립트를 실행한다 / Then `DMARC 존재`와 `DMARC rua 지정`이 PASS다
- Given SPF·DMARC가 반영된 상태 / When 앱에서 이메일 인증 코드를 요청해 Gmail로 받는다 / Then [원본 보기]의 `Authentication-Results:`에 `dkim=pass header.i=@earcast.co.kr`과 `dmarc=pass`가 함께 찍힌다
- Given DMARC `rua`가 `soheeandjuho@gmail.com`이다 / When 레코드 반영 후 최대 2주를 기다린다 / Then 집계 리포트(XML 첨부)가 최소 1통 도착하고, 그 안에 `earcast.co.kr`을 발신에 쓰는 소스가 SES 외에 없음을 확인한다
- Given 위 리포트로 SES 외 발송원이 없음을 확인했다 / When SPF를 `~all`에서 `-all`로 바꾼다 / Then 이메일 인증 메일이 여전히 `spf=pass`로 도착한다
- Given MX 안을 B로 정했다 / When 외부에서 `no-reply@earcast.co.kr`로 메일을 한 통 보낸다 / Then `runtime364@gmail.com`에 도착한다 *(A안을 택하면 이 조건을 제외하고 그 결정을 이 문서에 기록한다)*

## 참고 — 조사 중 확인된 부수 사실

- **SES 프로덕션 액세스는 이미 승인됐다.** `ProductionAccessEnabled=true`,
  `EnforcementStatus=HEALTHY`, `Max24HourSend=50,000` / `MaxSendRate=14`,
  심사 `Status=GRANTED`(CaseId `178814185700335`). 샌드박스가 아니다.
- **`docs/infra/inventory.md` 3장 SES 항목이 낡았다** — *"DKIM 대기 … 프로덕션 액세스 심사 중,
  서버 코드(`SesMailClient`)는 미구현"* 으로 적혀 있으나 셋 다 완료됐다. **문서 수정이라
  `changes/` 소관**이다. 이 티켓과 별개로 `changes/pending/`에 올릴 것.
- SES identity 목록에 `soheeandjuho@gmail.com`이 `VerificationStatus=FAILED`로 남아 있다. 이 티켓의
  DMARC `rua`와는 **무관하다**(리포트 수신에 SES identity가 필요 없다). 다만 그 주소를 **발신
  테스트용**으로 쓰려 하면 실패한다.
- 루트 `earcast.co.kr` A는 Vercel(`216.198.79.1`), `api.earcast.co.kr` A는 EC2(`43.203.57.240`).
  이 티켓의 레코드 추가는 둘 다 건드리지 않는다.
