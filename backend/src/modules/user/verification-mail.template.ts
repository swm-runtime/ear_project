import { EMAIL_VERIFICATION_CODE_TTL_SEC } from './user.constant';
import { MessageLanguage } from './user.enum';

/**
 * 인증 메일 본문 조립 (`tickets/backend/pending/verification-mail-html-template.md`).
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

/** 언어별 문구. 마크업은 하나다 — 언어마다 HTML을 따로 두면 다크모드 보정 같은 수정이 한쪽에만 들어간다 */
interface MailCopy {
  htmlLang: string;
  brand: string;
  subject: (code: string) => string;
  title: string;
  heading: string;
  /** plain text 본문 첫 줄 */
  textIntro: string;
  instruction: string;
  /** "코드는 [3분] 동안 유효해요." — 가운데가 강조된다 */
  validity: { before: string; strong: string; after: string };
  warnings: [string, string];
  footer: [string, string];
}

/** GLOBAL 영어 앱 이름은 PM 확정 전이다(KAN-198) — 확정되면 이 값만 바꾼다 */
const EN_BRAND = 'Ear';

const COPY: Record<MessageLanguage, MailCopy> = {
  [MessageLanguage.KO]: {
    htmlLang: 'ko',
    brand: '이어',
    subject: (code) => `[이어] 이메일 인증 코드 ${code}`,
    title: '이어 이메일 인증 코드',
    heading: '이메일 인증 코드예요',
    textIntro: '이어 이메일 인증 코드예요.',
    instruction: '아래 6자리 코드를 앱에 입력하면 인증이 끝나요.',
    validity: {
      before: '코드는 ',
      strong: `${TTL_MIN}분`,
      after: ' 동안 유효해요.',
    },
    warnings: [
      '코드는 누구에게도 알려주지 마세요.',
      '본인이 요청하지 않았다면 이 메일을 무시해 주세요.',
    ],
    footer: ['이어 · earcast.co.kr', '이 메일은 발신 전용이에요.'],
  },
  [MessageLanguage.EN]: {
    htmlLang: 'en',
    brand: EN_BRAND,
    subject: (code) => `[${EN_BRAND}] Your verification code is ${code}`,
    title: `${EN_BRAND} verification code`,
    heading: 'Your verification code',
    textIntro: `Here is your ${EN_BRAND} verification code.`,
    instruction: 'Enter the 6-digit code below in the app to finish verifying.',
    validity: {
      before: 'This code is valid for ',
      strong: `${TTL_MIN} minutes`,
      after: '.',
    },
    warnings: [
      "Don't share this code with anyone.",
      "If you didn't request this, you can ignore this email.",
    ],
    footer: [
      `${EN_BRAND} · earcast.co.kr`,
      'This is an automated message. Please do not reply.',
    ],
  },
};

export function renderVerificationMail(
  code: string,
  language: MessageLanguage,
): VerificationMailBody {
  // 코드는 `EmailVerificationService#generateCode`가 만든 숫자 6자리다. 그 전제가 깨지면
  // 본문에 임의 문자열이 그대로 들어가므로, 조립 전에 막는다(이스케이프가 필요 없어지는 이유).
  if (!/^[0-9]+$/.test(code)) {
    throw new Error('verification code must contain digits only');
  }

  const copy = COPY[language];

  return {
    subject: copy.subject(code),
    html: renderHtml(code, copy),
    text: renderText(code, copy),
  };
}

/** 기존 본문 그대로다 — HTML을 못 읽는 클라이언트가 받는 대체본이다. 임의로 줄이지 마라. */
function renderText(code: string, copy: MailCopy): string {
  const { before, strong, after } = copy.validity;

  return [
    copy.textIntro,
    '',
    code,
    '',
    `${before}${strong}${after}`,
    copy.warnings[1],
  ].join('\n');
}

function renderHtml(code: string, copy: MailCopy): string {
  const { before, strong, after } = copy.validity;

  return `<!DOCTYPE html>
<html lang="${copy.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${copy.title}</title>
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
<div style="display:none;font-size:1px;color:#F5F5F7;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${before}${strong}${after}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="ec-page" style="background-color:#F5F5F7;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:480px;">
        <tr>
          <td align="center" style="padding:0 0 24px 0;">
            <img src="${LOGO_URL}" width="56" height="56" alt="${copy.brand}" style="display:block;width:56px;height:56px;border:0;outline:none;text-decoration:none;">
          </td>
        </tr>
        <tr>
          <td class="ec-card" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #E3E3E8;border-radius:16px;padding:32px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" class="ec-title" style="font-family:${FONT_STACK};font-size:20px;line-height:28px;font-weight:700;color:#1A1A1E;padding:0 0 8px 0;">${copy.heading}</td>
              </tr>
              <tr>
                <td align="center" class="ec-body" style="font-family:${FONT_STACK};font-size:15px;line-height:22px;color:#6E6E76;padding:0 0 24px 0;">${copy.instruction}</td>
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
                <td align="center" class="ec-body" style="font-family:${FONT_STACK};font-size:14px;line-height:20px;color:#6E6E76;padding:0 0 24px 0;">${before}<span class="ec-strong" style="color:#1A1A1E;font-weight:700;">${strong}</span>${after}</td>
              </tr>
              <tr>
                <td class="ec-rule" style="border-top:1px solid #E3E3E8;font-size:0;line-height:0;">&nbsp;</td>
              </tr>
              <tr>
                <td align="center" class="ec-muted" style="font-family:${FONT_STACK};font-size:13px;line-height:20px;color:#6E6E76;padding:20px 0 0 0;">
                  ${copy.warnings[0]}<br>
                  ${copy.warnings[1]}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" class="ec-footer" style="font-family:${FONT_STACK};font-size:12px;line-height:18px;color:#6E6E76;padding:24px 0 0 0;">
            ${copy.footer[0]}<br>
            ${copy.footer[1]}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
