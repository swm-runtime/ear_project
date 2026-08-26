/**
 * `apple-callback.ts`의 **Node 런타임 / 고전 시그니처** 판본.
 *
 * 어느 시그니처를 Vercel `api/`가 받아주는지 확인하려고 함께 올린 실측용이다.
 * **둘 중 동작하는 쪽만 남기고 이 파일은 지운다.** 동작·규약은 원본과 같다.
 */

/** `@vercel/node` 의존성을 더하지 않으려고 쓰는 만큼만 구조적으로 선언한다 */
interface NodeRequest {
  method?: string;
  /** Vercel Node 런타임이 `application/x-www-form-urlencoded`를 객체로 파싱해 준다 */
  body?: Record<string, string> | string;
}

interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

const APP_RETURN_URL = 'ear://auth/apple';

function redirectToApp(
  response: NodeResponse,
  params: Record<string, string>,
): void {
  const query = new URLSearchParams(params).toString();

  response.statusCode = 302;
  response.setHeader('Location', `${APP_RETURN_URL}?${query}`);
  response.setHeader('Cache-Control', 'no-store');
  response.end();
}

function readForm(body: NodeRequest['body']): URLSearchParams {
  if (typeof body === 'string') {
    return new URLSearchParams(body);
  }

  return new URLSearchParams(body ?? {});
}

export default function handler(
  request: NodeRequest,
  response: NodeResponse,
): void {
  if (request.method === 'GET') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end('apple sign-in callback (node)\n');

    return;
  }

  if (request.method !== 'POST') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET, POST');
    response.end();

    return;
  }

  const form = readForm(request.body);
  const error = form.get('error');

  if (error) {
    redirectToApp(response, { error });

    return;
  }

  const idToken = form.get('id_token');

  if (!idToken) {
    redirectToApp(response, { error: 'missing_id_token' });

    return;
  }

  const state = form.get('state');

  redirectToApp(
    response,
    state ? { id_token: idToken, state } : { id_token: idToken },
  );
}
