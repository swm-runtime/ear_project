import { EMAIL_VERIFICATION_CODE_TTL_SEC } from './user.constant';

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
