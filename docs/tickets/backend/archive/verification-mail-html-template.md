# [BE] 이메일 인증 메일을 HTML로 바꾼다 — 로고·브랜딩 없는 plain text

| 항목 | 값 |
|---|---|
| 대상 | `backend/src/modules/user/ses-mail.client.ts` · `backend/src/modules/user/ses-mail.client.spec.ts` · 신규 `backend/src/modules/user/verification-mail.template.ts` |
| 요청 파트 | 백엔드 |
| 발행 날짜 | 2026-09-07 |
| 발견 시점 | 발신자 프로필 아바타(BIMI) 도입을 검토하다 — VMC 인증서(상표 등록 + 연 $1000 이상)가 필요해 보류하고, 대신 **메일 본문**에 로고를 넣기로 결정 |
| 근거 문서 | `spec/uiux/auth-uiux.md` 4.9~4.14(카피 톤) · `backend/convention.md` 8.4(로그 금지 항목) · `features/auth.md` 4.5·421행(발송 인프라) |
| 심각도 | **낮** — 인증 동작에는 영향이 없다. 다만 지금 메일은 발신자·본문 어디에도 브랜드가 없어 피싱처럼 읽히고, 스팸함으로 가면 `auth.md` 4.5의 주소당 5회 제한이 그대로 이탈이 된다 |
| 상태 | 반영 완료 (2026-09-08) |
| 연관 | BIMI 도입은 **보류**(VMC 비용). 이 티켓은 그 대안이다 · `docs/infra/architecture.md` 114행·`docs/infra/inventory.md` 63행이 "`SesMailClient` 미구현"이라고 적고 있으나 **이미 구현돼 있다** — 문서 쪽 수정은 `changes/` 대상(이 티켓 범위 밖) |

## 배경

`ses-mail.client.ts`는 `SendEmailCommand`의 `Content.Simple.Body.**Text**`만 채운다. 받는 사람이 보는 것은 이게 전부다.

```
이어 이메일 인증 코드예요.

482913

코드는 3분 동안 유효해요.
본인이 요청하지 않았다면 이 메일을 무시해 주세요.
```

로고도, 색도, 발신 주체를 알려주는 요소도 없다. `Body`에 `Html`을 **추가**하면(Text는 유지) SES가 `multipart/alternative`로 보내고, HTML을 못 읽는 클라이언트는 지금 그대로 받는다.

## 로고를 어떻게 넣을 것인가 — 세 안과 권고

| 안 | 방식 | 단점 |
|---|---|---|
| **① 절대 URL 참조** | 랜딩에 올린 이미지를 `<img src="https://earcast.co.kr/...">`로 건다 | 이미지 기본 차단 클라이언트(Outlook 데스크톱·일부 웹메일)에서 안 보인다 → **alt 텍스트가 대신 읽혀야 한다.** 랜딩이 죽으면 로고도 죽는다. 메일이 열렸다는 사실이 랜딩 로그에 남는다(트래킹 픽셀은 아니지만 성질은 같다) |
| **② CID 첨부** | 이미지를 MIME에 동봉하고 `cid:`로 참조 | **`Content.Simple`을 못 쓴다.** `Content.Raw`로 바꿔 MIME을 직접 조립(nodemailer 등)해야 하고, 발송마다 수십 KB가 붙는다. 첨부가 있는 메일로 분류돼 오히려 스팸 점수가 오르는 경우가 있다 |
| **③ 이미지 없음** | 텍스트 워드마크만 | 어디서든 깨지지 않지만 로고를 넣자는 요청 자체를 못 만족한다 |

**① 을 권고한다.** 이유는 셋이다.

1. **새로 만들 파일이 없다.** `landing-page/src/app/icon.png`(512×512)이 이미 프로덕션에 배포돼 있다 — 2026-09-07 확인: `https://earcast.co.kr/icon.png` → `200 image/png 57,102 bytes`.
2. **그 이미지가 다크모드에 강하다.** 검은 라운드 사각형 + **흰색 마크**다. 밝은 배경에서는 검은 면이 보이고, 어두운 배경에서는 면이 배경에 녹되 **흰 마크는 그대로 남는다.** 어느 쪽에서도 사라지지 않는다.
3. `Content.Simple`을 유지하므로 코드 변경이 본문 문자열 교체 수준에서 끝난다.

**`https://earcast.co.kr/logo.png`(480×388 워드마크)는 쓰지 마라.** 검정 잉크 + 투명 배경이라 **다크모드 배경 위에서 통째로 사라진다.** `landing-page/src/components/Logo.tsx` 주석도 같은 한계를 적어 두었다("어두운 면에 올릴 일이 생기면 흰색 판본을 따로 뽑아야 한다"). 워드마크를 쓰려면 `landing-page/scripts/brand-assets.mjs`에 흰색 판본 생성을 추가하고 랜딩에 배포하는 선행 작업이 필요하다 — **이 티켓 범위 밖이고, 지금은 필요 없다.**

### 랜딩 쪽 작업 — 없다

`/icon.png`는 이미 배포돼 있으므로 **파일을 새로 두거나 복사할 필요가 없다.** `landing-page/`는 건드리지 않는다.

### 확인 필요

- 마크 이미지의 **시각적 내용**은 확인하지 않았다(파일 규격·투명도만 확인). 첫 테스트 발송에서 56px로 줄었을 때 알아볼 수 있는지 눈으로 확인해라. 뭉개지면 `icon` 대신 별도 크기를 굽는 판단이 필요하다.

## 브랜드 값 — 저장소에서 확인한 실제 값만 쓴다

색은 `landing-page/src/app/globals.css`의 토큰(앱 `frontend/src/shared/theme/index.ts`와 대응 관계가 주석으로 명시돼 있다)에서 가져왔다. **지어낸 값은 없다.**

| 용도 | 값 | 출처 |
|---|---|---|
| 본문 텍스트 | `#1A1A1E` | 앱 `textPrimary` = `--ink-900` |
| 보조 텍스트 | `#6E6E76` | 앱 `textSecondary` = `--ink-400` |
| 배경(바깥) | `#F5F5F7` | 앱 `surface` = `--paper-2` |
| 카드 배경 | `#FFFFFF` | 앱 `background` = `--paper` |
| 테두리 | `#E3E3E8` | 앱 `border` = `--line` |
| 다크 배경/면/선 | `#0A0A0C` · `#1A1A1E` · `#232329` · `#2D2D34` · `#3F3F47` · `#9A9AA3` · `#C4C4CB` | `--ink-950`~`--ink-200` |
| 라운드 | 카드 16px · 코드 박스 12px | 앱 `radius.lg`=16 / `radius.md`=12 |

**폰트는 확인 필요 없이 시스템 스택으로 간다.** 랜딩은 Pretendard·Paperlogy를 쓰지만 (1) Gmail은 `@font-face`를 제거하고, (2) 랜딩 폰트는 **랜딩에 쓰인 글자만 남긴 서브셋**이라(`landing-page/scripts/subset-fonts.sh`) 메일 문구의 글자가 빠질 수 있다. 웹폰트를 걸지 마라.

## 요청 내용

### 1. 신규 파일 — `backend/src/modules/user/verification-mail.template.ts`

본문 조립을 클라이언트에서 분리한다. SES 구현이 바뀌어도 카피가 따라다니지 않고, 단위 테스트를 붙이기 쉽다.

```ts
import { EMAIL_VERIFICATION_CODE_TTL_SEC } from './user.constant';

/**
 * 인증 메일 본문 조립.
 *
 * - **HTML과 plain text를 함께 만든다.** SES `Content.Simple.Body`에 둘 다 넣으면
 *   multipart/alternative로 나가고, HTML을 못 읽는 클라이언트는 text를 받는다.
 * - 로고는 랜딩에 이미 배포된 절대 URL을 참조한다(CID 첨부는 `Content.Raw`를 요구해서 쓰지 않는다).
 *   이미지가 차단돼도 alt "이어"가 읽히도록 두었다.
 * - **코드 외에 어떤 값도 본문에 넣지 않는다.** 수신 주소를 본문에 반사하지 않으며,
 *   코드는 숫자만 허용해 HTML 주입 경로를 원천 차단한다(아래 가드).
 */

/**
 * 검은 라운드 사각형 + 흰 마크. 밝은 배경에서는 면이, 어두운 배경에서는 흰 마크가 보여
 * 양쪽에서 사라지지 않는다. `landing-page/src/app/icon.png`가 원본이며 랜딩에 배포돼 있다.
 * **`/logo.png`(검정 투명 워드마크)를 쓰지 마라 — 다크모드에서 통째로 사라진다.**
 */
const LOGO_URL = 'https://earcast.co.kr/icon.png';

/** 웹폰트를 걸지 않는다 — Gmail이 @font-face를 제거하고, 랜딩 폰트는 서브셋이라 글자가 빠진다. */
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', Arial, sans-serif";
const MONO_STACK =
  "'SF Mono', SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";

const TTL_MIN = Math.floor(EMAIL_VERIFICATION_CODE_TTL_SEC / 60);

export interface VerificationMailBody {
  subject: string;
  html: string;
  text: string;
}

export function renderVerificationMail(code: string): VerificationMailBody {
  // 코드는 `EmailVerificationService#generateCode`가 만든 숫자 6자리다. 그 전제가 깨지면
  // 본문에 임의 문자열이 그대로 들어가므로, 조립 전에 막는다(이스케이프가 필요 없어지는 이유).
  if (!/^[0-9]+$/.test(code)) {
    throw new Error('verification code must contain digits only');
  }

  return {
    subject: `[이어] 이메일 인증 코드 ${code}`,
    html: renderHtml(code),
    text: renderText(code),
  };
}

/** 기존 본문 그대로다 — HTML을 못 읽는 클라이언트가 받는 대체본이다. 임의로 줄이지 마라. */
function renderText(code: string): string {
  return [
    '이어 이메일 인증 코드예요.',
    '',
    code,
    '',
    `코드는 ${TTL_MIN}분 동안 유효해요.`,
    '본인이 요청하지 않았다면 이 메일을 무시해 주세요.',
  ].join('\n');
}

function renderHtml(code: string): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>이어 이메일 인증 코드</title>
<style>
  /* 인라인 스타일이 기본값이고, 이 블록은 다크모드 보정만 한다.
     <style>을 지우는 클라이언트에서는 밝은 팔레트로 그대로 렌더된다. */
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  @media (prefers-color-scheme: dark) {
    .ec-page { background-color: #0A0A0C !important; }
    .ec-card { background-color: #1A1A1E !important; border-color: #2D2D34 !important; }
    .ec-codebox { background-color: #232329 !important; border-color: #3F3F47 !important; }
    .ec-title, .ec-code, .ec-strong { color: #FFFFFF !important; }
    .ec-body { color: #C4C4CB !important; }
    .ec-muted, .ec-footer { color: #9A9AA3 !important; }
    .ec-rule { border-color: #2D2D34 !important; }
  }
</style>
</head>
<body class="ec-page" bgcolor="#F5F5F7" style="margin:0;padding:0;background-color:#F5F5F7;">
<div style="display:none;font-size:1px;color:#F5F5F7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">코드는 ${TTL_MIN}분 동안 유효해요.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ec-page" style="background-color:#F5F5F7;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;">
        <tr>
          <td align="center" style="padding:0 0 24px 0;">
            <img src="${LOGO_URL}" width="56" height="56" alt="이어" style="display:block;width:56px;height:56px;border:0;outline:none;text-decoration:none;">
          </td>
        </tr>
        <tr>
          <td class="ec-card" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #E3E3E8;border-radius:16px;padding:32px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" class="ec-title" style="font-family:${FONT_STACK};font-size:20px;line-height:28px;font-weight:700;color:#1A1A1E;padding:0 0 8px 0;">이메일 인증 코드예요</td>
              </tr>
              <tr>
                <td align="center" class="ec-body" style="font-family:${FONT_STACK};font-size:15px;line-height:22px;color:#6E6E76;padding:0 0 24px 0;">아래 6자리 코드를 앱에 입력하면 인증이 끝나요.</td>
              </tr>
              <tr>
                <td align="center" style="padding:0 0 20px 0;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                    <tr>
                      <!-- letter-spacing은 마지막 글자 뒤에도 붙어 가운데가 왼쪽으로 밀린다.
                           text-indent로 절반(4px)을 되민다. 무시하는 클라이언트에서도 4px 차이라 티나지 않는다. -->
                      <td class="ec-codebox" bgcolor="#F5F5F7" align="center" style="background-color:#F5F5F7;border:1px solid #E3E3E8;border-radius:12px;padding:16px 28px;text-indent:4px;">
                        <span class="ec-code" style="font-family:${MONO_STACK};font-size:32px;line-height:40px;font-weight:700;letter-spacing:8px;color:#1A1A1E;">${code}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td align="center" class="ec-body" style="font-family:${FONT_STACK};font-size:14px;line-height:20px;color:#6E6E76;padding:0 0 24px 0;">코드는 <span class="ec-strong" style="color:#1A1A1E;font-weight:700;">${TTL_MIN}분</span> 동안 유효해요.</td>
              </tr>
              <tr>
                <td class="ec-rule" style="border-top:1px solid #E3E3E8;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
              <tr>
                <td align="center" class="ec-muted" style="font-family:${FONT_STACK};font-size:13px;line-height:20px;color:#6E6E76;padding:20px 0 0 0;">
                  코드는 누구에게도 알려주지 마세요.<br>
                  본인이 요청하지 않았다면 이 메일을 무시해 주세요.
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" class="ec-footer" style="font-family:${FONT_STACK};font-size:12px;line-height:18px;color:#6E6E76;padding:24px 0 0 0;">
            이어 · earcast.co.kr<br>
            이 메일은 발신 전용이에요.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
```

### 2. `ses-mail.client.ts` 변경

`Body`에 `Html`을 **추가**한다. `Text`는 그대로 둔다 — 지우면 HTML 미지원 클라이언트가 빈 메일을 받는다.

```ts
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { MailClient } from './mail.client';
import { renderVerificationMail } from './verification-mail.template';
// EMAIL_VERIFICATION_CODE_TTL_SEC import는 제거한다 — 템플릿으로 옮겼다.

/**
 * SES 발송 구현 (`MAIL_DELIVERY=ses` — auth.md 미결이던 발송 인프라를 SES로 확정, 2026-08-31).
 *
 * - 자격증명은 SDK 기본 체인(EC2 인스턴스 롤의 `ses-send`)이 준다. env에 키를 두지 않는다.
 * - 발신 주소(`MAIL_FROM_ADDRESS`)는 SES에서 검증된 도메인/주소여야 한다. 미검증이면 SES가
 *   거부하고, 그 실패는 그대로 던진다 — 호출부(EmailVerificationService)가 행을 지우고
 *   `EMAIL_SEND_FAILED`(횟수 미차감)로 변환한다(auth-api.md 4.8).
 * - 본문은 HTML + plain text를 함께 보낸다(`verification-mail.template.ts`).
 * - **코드·수신 주소 원문을 로그에 남기지 않는다**(convention.md 8.4) — LoggingMailClient와
 *   같은 기준. 실패 사유도 SES 에러 이름까지만. **본문(HTML·text)도 로그에 남기지 않는다** —
 *   코드가 그 안에 있다.
 */
@Injectable()
export class SesMailClient extends MailClient {
  private readonly logger = new Logger(SesMailClient.name);
  private readonly ses: SESv2Client;
  private readonly fromAddress: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    super();
    this.ses = new SESv2Client({
      region: configService.get('AWS_REGION', { infer: true }),
    });
    this.fromAddress = configService.get('MAIL_FROM_ADDRESS', { infer: true });
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const { subject, html, text } = renderVerificationMail(code);

    await this.ses.send(
      new SendEmailCommand({
        FromEmailAddress: this.fromAddress,
        Destination: { ToAddresses: [email] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: html, Charset: 'UTF-8' },
              Text: { Data: text, Charset: 'UTF-8' },
            },
          },
        },
      }),
    );

    this.logger.log('verification mail dispatched', {
      email_domain: email.slice(email.indexOf('@') + 1),
    });
  }
}
```

### 3. 카피 — 어느 문서도 소유하지 않는다

메일 본문 문구는 `spec/uiux/auth-uiux.md`에 없다(그 문서는 앱 화면만 다룬다). 위 문구는 **기존 text 본문 + auth-uiux 5장의 톤 규칙**(존댓말 `~해요`체, 사용자를 탓하지 않는다)에 맞춰 쓴 신규 카피다. 새로 추가된 문장은 둘이다.

| 문장 | 이유 |
|---|---|
| "아래 6자리 코드를 앱에 입력하면 인증이 끝나요." | 무엇을 하라는 지시가 본문에 없었다 |
| "코드는 누구에게도 알려주지 마세요." | 코드 탈취 유도(비싱)에 대한 표준 방어 문구 |

**문구를 확정으로 고정하고 싶으면 `changes/`로 `auth-uiux.md`에 메일 본문 절을 추가하는 요청을 따로 발행해라.** 이 티켓은 구현만 다룬다.

## 보안·규칙 확인

- **`convention.md` 8.4는 깨지지 않는다.** 로그 호출은 한 줄(`email_domain`만)이고 변경이 없다. 코드·수신 주소·본문 어느 것도 새로 로그에 들어가지 않는다.
- **본문을 로그에 남기지 마라.** 디버깅한다고 `this.logger.debug(html)`을 넣는 순간 인증 코드가 로그에 남는다. 클라이언트 주석에 그 금지를 명시해 두었다.
- **HTML 주입 경로가 없다.** 본문에 들어가는 유일한 외부 값이 `code`이고, 템플릿이 숫자만 허용한다. **수신 이메일 주소를 본문에 반사하지 않는다** — 넣으려면 이스케이프가 선행돼야 하므로 지금은 넣지 않았다.
- 실패 경로는 그대로다. `renderVerificationMail`이 던지는 경우(코드가 숫자가 아님)도 `EmailVerificationService`의 try/catch 밖이 아니라 **안**이므로, 행을 지우고 `EMAIL_SEND_FAILED`로 변환된다(횟수 미차감) — 계약이 유지된다.
- 이미지가 랜딩에서 로드되므로 **메일 열람 시점이 랜딩 액세스 로그에 남는다.** 개인정보와 결합되지 않지만(쿼리스트링·식별자 없음) 사실로 인지해 두라.

## 기존 테스트에 미치는 영향

`ses-mail.client.spec.ts`는 **깨지지 않는다.** 두 케이스가 검사하는 것이 `Body.Text.Data`에 `123456`과 `3분`이 들어 있는지인데, text 대체본을 그대로 유지하므로 통과한다. `SentEmailInput` 인터페이스에 `Html`이 없어도 컴파일은 통과한다 — 그 타입은 테스트가 mock 호출을 읽을 때만 쓰이고, 커맨드 객체는 소스에서 만들어지므로 초과 프로퍼티 검사 대상이 아니다.

**그래도 다음을 추가해라.** 지금 상태로 두면 HTML을 통째로 지워도 테스트가 초록이다.

```ts
// 1) 타입에 Html을 추가한다
interface SentEmailInput {
  FromEmailAddress: string;
  Destination: { ToAddresses: string[] };
  Content: {
    Simple: {
      Subject: { Data: string };
      Body: { Html: { Data: string }; Text: { Data: string } };
    };
  };
}

// 2) 케이스를 추가한다
it('HTML 본문과 텍스트 대체본을 함께 보낸다', async () => {
  // given
  const client = buildClient();

  // when
  await client.sendVerificationCode('user@example.com', '123456');

  // then
  const [command] = sendMock.mock.calls[0];
  const { Html, Text } = command.input.Content.Simple.Body;
  expect(Html.Data).toContain('123456');
  expect(Html.Data).toContain('https://earcast.co.kr/icon.png');
  expect(Text.Data).toContain('123456');
});

it('수신 주소를 본문에 넣지 않는다', async () => {
  // given
  const client = buildClient();

  // when
  await client.sendVerificationCode('user@example.com', '123456');

  // then
  const { Html, Text } = sendMock.mock.calls[0][0].input.Content.Simple.Body;
  expect(Html.Data).not.toContain('user@example.com');
  expect(Text.Data).not.toContain('user@example.com');
});
```

그리고 신규 `verification-mail.template.spec.ts`에 최소 한 건을 둔다.

```ts
it('숫자가 아닌 코드는 조립하지 않는다', () => {
  expect(() => renderVerificationMail('<img src=x>')).toThrow();
});
```

## 완료 조건

- Given `MAIL_DELIVERY=ses` 환경 / When 인증 코드를 발송한다 / Then SES 커맨드의 `Content.Simple.Body`에 `Html`과 `Text`가 **둘 다** 들어 있다
- Given 실제 수신함(Gmail 웹 · Gmail 앱 · Apple Mail 중 최소 2곳) / When 메일을 연다 / Then 상단에 이어 마크가 보이고, 6자리 코드가 큰 글씨로 한 덩어리로 보이며, 드래그하면 숫자 6자리만 복사된다
- Given 다크모드로 설정한 클라이언트 / When 같은 메일을 연다 / Then 로고가 배경에 묻혀 사라지지 않고, 코드와 본문 텍스트의 대비가 유지된다
- Given 이미지를 차단한 클라이언트 / When 메일을 연다 / Then 로고 자리에 "이어"가 읽히고, 코드·유효 시간·"본인이 요청하지 않았다면 무시" 문구가 모두 보인다
- Given HTML을 렌더하지 않는 클라이언트(또는 원문 보기) / When 텍스트 파트를 본다 / Then 변경 전 본문과 같은 4줄이 그대로 있다
- Given 코드 발송이 SES 오류로 실패한다 / When 응답을 본다 / Then 이전과 같이 `EMAIL_SEND_FAILED`이고 발송 횟수가 차감되지 않는다(회귀 없음)
- Given 발송 로그 / When `verification mail dispatched` 항목을 본다 / Then 필드가 `email_domain` 하나뿐이고, 코드·수신 주소 원문·본문이 어디에도 없다
- Given `npm test` / When `ses-mail.client.spec.ts`와 `verification-mail.template.spec.ts`를 돌린다 / Then 기존 2건이 그대로 통과하고 추가 3건도 통과한다

## 진행 기록 (2026-09-08 — 구현 완료, 실수신함 확인 남음)

티켓 명세 그대로 구현했다(`feat(be)/new-ticket-batch`) — `verification-mail.template.ts` 신설
(숫자 외 코드 거부 가드 포함), `ses-mail.client.ts`가 HTML+Text를 함께 발송, 테스트 5건
(HTML+Text 동봉·로고 URL·수신 주소 비반사·주입 거부·텍스트 대체본 불변) 통과. 로그는 종전
그대로 `email_domain` 하나다.

**남은 것**: 완료 조건의 실수신함 확인(Gmail 웹·앱·다크모드·이미지 차단)은 배포 후 사람이
실제 메일로 본다. 제목의 코드 노출 여부는 별도 판단 대상 그대로.

## 처리 기록 (반영 날짜: 2026-09-08 — 실수신 확인 완료)

구현(PR #211)·배포 후 BE 담당이 실기기에서 확인했다 — **인증 메일 수신과 코드 인증 완료까지
정상 동작.** 단위 테스트 5건(HTML+Text 동봉·로고 URL·수신 주소 비반사·숫자 외 코드 거부·
텍스트 대체본 불변) + 실수신 확인으로 완료 조건을 닫는다.

남겨 두는 것 (티켓 완료와 별개 축):
- **제목의 코드 노출 여부** — 잠금화면 미리보기 편의 vs 스팸 필터 민감도의 교환. 별도 판단
  대상 그대로(`email-spf-dmarc-records.md` 헤더 분석 참조).
- 스팸함 배치·도메인 평판은 발송 이력이 쌓여야 움직인다 — `email-spf-dmarc-records.md`의
  관찰 항목(9/21 이후)과 함께 본다.
