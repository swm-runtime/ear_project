import { ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuthenticatedRequest } from '@/common/decorators/current-user.decorator';

import { JwtAuthGuard } from './jwt-auth.guard';

function contextOf(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard — 가입 시각 클레임(KAN-298)', () => {
  const jwtService = new JwtService({ secret: 'guard-secret' });
  const guard = new JwtAuthGuard(jwtService);

  it('signed_up_at 클레임을 요청 사용자의 signedUpAt(Date)으로 싣는다', () => {
    // given
    const signedUpAt = new Date('2026-11-05T01:00:00.000Z');
    const token = jwtService.sign({
      sub: 'user-1',
      role: 'user',
      typ: 'access',
      market: 'kr',
      signed_up_at: signedUpAt.getTime(),
    });
    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as Partial<AuthenticatedRequest>;

    // when
    guard.canActivate(contextOf(request));

    // then
    expect(request.user?.signedUpAt).toEqual(signedUpAt);
  });

  it('클레임이 없는 옛 토큰은 signedUpAt = null이다 — 코호트는 standard로 본다', () => {
    // given
    const token = jwtService.sign({
      sub: 'user-1',
      role: 'user',
      typ: 'access',
    });
    const request = {
      headers: { authorization: `Bearer ${token}` },
    } as Partial<AuthenticatedRequest>;

    // when
    guard.canActivate(contextOf(request));

    // then
    expect(request.user).toMatchObject({ market: 'kr', signedUpAt: null });
  });
});
