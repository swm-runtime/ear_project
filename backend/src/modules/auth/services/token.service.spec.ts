import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as jwt from 'jsonwebtoken';

import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { EnvironmentVariables } from '@/config/env.validation';

import { PIPELINE_ASSERTION_TYPE } from '../auth.constant';
import { TokenService } from './token.service';

const SSO_SECRET = 'pipeline-sso-secret-0123456789-0123456789';
const EMAIL = 'admin@example.com';

/** 파이프라인 웹 서버가 서명하는 것과 같은 모양으로 만든다(`api/ear/sso/route.ts`) */
function signAssertion(
  claims: Record<string, unknown>,
  options: jwt.SignOptions = {},
): string {
  return jwt.sign(claims, SSO_SECRET, { algorithm: 'HS256', ...options });
}

/** `undefined`를 명시적으로 넘길 수 있어야 한다 — 기본값 인자를 쓰면 그 경로를 못 만든다 */
function buildService(secret: string | undefined): TokenService {
  const configService = {
    get: jest.fn(() => secret),
  } as unknown as ConfigService<EnvironmentVariables, true>;

  return new TokenService(new JwtService({}), configService);
}

describe('TokenService', () => {
  describe('verifyPipelineAssertion', () => {
    it('서명·타입·유효 기간이 맞으면 이메일을 돌려준다', () => {
      // given
      const assertion = signAssertion({
        typ: PIPELINE_ASSERTION_TYPE,
        email: EMAIL,
      });

      // when
      const result =
        buildService(SSO_SECRET).verifyPipelineAssertion(assertion);

      // then
      expect(result).toEqual({ email: EMAIL });
    });

    it('만료 클레임이 없는 어서션을 거부한다 — 없으면 만료 없는 관리자 자격증명이 된다', () => {
      // given — 서명하는 쪽은 다른 배포다. `exp`를 빠뜨려도 우리는 막아야 한다
      const assertion = signAssertion(
        { typ: PIPELINE_ASSERTION_TYPE, email: EMAIL },
        { noTimestamp: true },
      );

      // when
      const verify = () =>
        buildService(SSO_SECRET).verifyPipelineAssertion(assertion);

      // then
      expect(verify).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.AUTH_PROVIDER_TOKEN_INVALID,
        }) as Error,
      );
    });

    it('허용 나이를 넘긴 어서션을 거부한다', () => {
      // given — 서명자는 60초를 쓴다. 그보다 훨씬 오래된 것은 재사용 시도로 본다
      const assertion = signAssertion({
        typ: PIPELINE_ASSERTION_TYPE,
        email: EMAIL,
        iat: Math.floor(Date.now() / 1000) - 600,
      });

      // when
      const verify = () =>
        buildService(SSO_SECRET).verifyPipelineAssertion(assertion);

      // then
      expect(verify).toThrow();
    });

    it('다른 용도의 토큰을 어서션으로 쓰지 못한다', () => {
      // given — 같은 키로 서명됐더라도 typ이 다르면 거부한다
      const assertion = signAssertion({ typ: 'access', email: EMAIL });

      // when
      const verify = () =>
        buildService(SSO_SECRET).verifyPipelineAssertion(assertion);

      // then
      expect(verify).toThrow();
    });

    it('다른 키로 서명된 어서션을 거부한다', () => {
      // given
      const assertion = jwt.sign(
        { typ: PIPELINE_ASSERTION_TYPE, email: EMAIL },
        'another-secret-0123456789-0123456789',
        { algorithm: 'HS256' },
      );

      // when
      const verify = () =>
        buildService(SSO_SECRET).verifyPipelineAssertion(assertion);

      // then
      expect(verify).toThrow();
    });

    it('키가 설정되지 않았으면 503으로 닫는다 — 기동을 막지 않는다', () => {
      // given — `.env.example`이 빈 값으로 배포된다(auth-api.md 4.12)
      const assertion = signAssertion({
        typ: PIPELINE_ASSERTION_TYPE,
        email: EMAIL,
      });

      // when
      const verify = () =>
        buildService(undefined).verifyPipelineAssertion(assertion);

      // then
      expect(verify).toThrow(
        expect.objectContaining({
          errorCode: ErrorCode.AUTH_PROVIDER_UNAVAILABLE,
        }) as Error,
      );
    });
  });
});
