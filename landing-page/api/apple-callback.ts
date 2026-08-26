/**
 * 애플 로그인 콜백 (안드로이드 웹 OAuth 전용).
 *
 * 안드로이드에는 애플 네이티브 SDK가 없어 브라우저를 한 번 거친다. 애플은 등록된 HTTPS
 * Return URL로만 결과를 보내고, `scope`에 name·email이 있으면 **`form_post`(POST)를
 * 강제**하므로 정적 파일로는 받을 수 없다 — 이 함수가 그 POST를 받는 유일한 이유다.
 *
 * **여기는 중계기다. 토큰을 검증하지 않고 비밀값도 갖지 않는다.**
 * 검증은 API 서버(`apple.client.ts`)가 identity token의 서명·`iss`·`aud`·`exp`·nonce를
 * 대조해서 한다. 앱이 받은 `id_token`을 `POST /auth/social-login`에 실어 보내면
 * 그때 판정된다.
 *
 * **이 중계기가 탈취돼 다른 사람의 유효한 애플 토큰으로 바꿔치기해도 로그인은 성립하지
 * 않는다.** 원본 nonce는 앱이 만들어 앱이 보관하고 `/auth/social-login`에 직접 싣는다 —
 * 중계기는 원본을 본 적이 없어 짝이 맞는 토큰을 만들 수 없다.
 *
 * 근거: `docs/tickets/backend/pending/apple-android-web-oauth-callback.md`
 */

/** 복귀 주소는 상수다 — 요청 값으로 만들지 않는다(오픈 리다이렉트 차단) */
const APP_RETURN_URL = 'ear://auth/apple';

/**
 * 프래그먼트(`#`)가 아니라 쿼리로 넘긴다.
 *
 * 커스텀 스킴 URL은 HTTP 요청이 되지 않아 어느 서버에도 남지 않으므로 둘의 노출 차이가
 * 없는 반면, **일부 안드로이드 브라우저가 앱 인텐트로 넘길 때 프래그먼트를 떨어뜨린다.**
 * 앱에서 파싱하기도 쿼리 쪽이 단순하다(`Linking.parse`의 `queryParams`).
 */
function redirectToApp(params: Record<string, string>): Response {
  const query = new URLSearchParams(params).toString();

  return new Response(null, {
    status: 302,
    headers: {
      Location: `${APP_RETURN_URL}?${query}`,
      // 토큰이 실린 응답이다. 중간 캐시에 남기지 않는다
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  let form: URLSearchParams;

  try {
    form = new URLSearchParams(await request.text());
  } catch {
    return redirectToApp({ error: 'invalid_response' });
  }

  // 사용자가 애플 화면에서 취소하면 `user_cancelled_authorize`가 온다.
  // 성공과 같은 경로로 앱에 돌려보내고, 문구 판단은 앱이 한다
  const error = form.get('error');

  if (error) {
    return redirectToApp({ error });
  }

  const idToken = form.get('id_token');

  if (!idToken) {
    return redirectToApp({ error: 'missing_id_token' });
  }

  const state = form.get('state');

  return redirectToApp(state ? { id_token: idToken, state } : { id_token: idToken });
}

/**
 * 애플은 POST로만 온다. 사람이 주소창에 직접 열어본 경우이며, **라우팅이 살아 있는지
 * 확인하는 용도로도 쓴다** — 정적 내보내기와 함수가 공존하는지 실측하는 지점이다.
 */
export function GET(): Response {
  return new Response('apple sign-in callback\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
