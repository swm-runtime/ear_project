import { randomBytes } from 'node:crypto';

import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { User } from '@/modules/user/entities/user.entity';
import { SocialProvider } from '@/modules/user/user.enum';

import {
  ACCESS_TOKEN_TTL_SEC,
  ACCESS_TOKEN_TYPE,
  PIPELINE_ASSERTION_TYPE,
  REFRESH_TOKEN_TTL_SEC,
  SIGNUP_TOKEN_TTL_SEC,
  SIGNUP_TOKEN_TYPE,
} from '../auth.constant';
import { SocialProfile } from '../auth.types';

interface SignupTokenPayload {
  typ: string;
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  isEmailVerified: boolean;
  nickname: string | null;
}

export interface IssuedToken {
  token: string;
  expiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  /** access token은 저장하지 않고 stateless로 검증한다 (architecture.md 9.1) */
  issueAccessToken(user: User, now: Date): IssuedToken {
    const token = this.jwtService.sign(
      { sub: user.id, role: user.role, typ: ACCESS_TOKEN_TYPE },
      { expiresIn: ACCESS_TOKEN_TTL_SEC },
    );

    return {
      token,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_SEC * 1000),
    };
  }

  /**
   * refresh token은 서명 토큰이 아니라 **불투명 난수**다.
   * DB에는 해시만 저장하므로(domain.md 3.3) 토큰 자체에 정보를 담을 이유가 없다.
   */
  issueRefreshToken(now: Date): IssuedToken {
    return {
      token: randomBytes(48).toString('base64url'),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000),
    };
  }

  /**
   * 검증된 제공자 신원을 담은 단기 토큰.
   * 클라이언트가 `provider_user_id`를 들고 다니게 하지 않는다 (auth-api.md 4.1).
   */
  issueSignupToken(
    provider: SocialProvider,
    profile: SocialProfile,
    now: Date,
  ): IssuedToken {
    const payload: SignupTokenPayload = {
      typ: SIGNUP_TOKEN_TYPE,
      provider,
      providerUserId: profile.providerUserId,
      email: profile.email,
      isEmailVerified: profile.isEmailVerified,
      nickname: profile.nickname,
    };

    return {
      token: this.jwtService.sign(payload, { expiresIn: SIGNUP_TOKEN_TTL_SEC }),
      expiresAt: new Date(now.getTime() + SIGNUP_TOKEN_TTL_SEC * 1000),
    };
  }

  verifySignupToken(token: string): SignupTokenPayload {
    let payload: SignupTokenPayload;

    try {
      payload = this.jwtService.verify<SignupTokenPayload>(token);
    } catch {
      throw this.signupTokenExpired();
    }

    if (payload.typ !== SIGNUP_TOKEN_TYPE) {
      throw this.signupTokenExpired();
    }

    return payload;
  }

  /**
   * 파이프라인 웹 SSO 어서션(HS256) 검증 — 파이프라인 웹 **서버**가 `PIPELINE_SSO_SECRET`으로
   * 서명한다. 모듈 JwtService에는 JWT_SECRET이 박혀 있어 다른 키 검증에 쓸 수 없으므로
   * (google.client.ts와 같은 이유 — 모듈 secret이 호출별 키보다 우선한다) 전용 인스턴스를 쓴다.
   */
  verifyPipelineAssertion(assertion: string): { email: string } {
    const secret = process.env.PIPELINE_SSO_SECRET;
    if (!secret) {
      throw new BusinessException({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        errorCode: ErrorCode.AUTH_PROVIDER_UNAVAILABLE,
        message: '파이프라인 로그인이 설정되지 않았어요',
      });
    }

    let payload: { typ?: string; email?: string };
    try {
      payload = this.assertionJwtService.verify(assertion, {
        secret,
        algorithms: ['HS256'],
      });
    } catch {
      throw this.assertionInvalid();
    }

    if (payload.typ !== PIPELINE_ASSERTION_TYPE || typeof payload.email !== 'string') {
      throw this.assertionInvalid();
    }

    return { email: payload.email };
  }

  private readonly assertionJwtService = new JwtService({});

  private assertionInvalid(): BusinessException {
    return new BusinessException({
      status: HttpStatus.UNAUTHORIZED,
      errorCode: ErrorCode.AUTH_PROVIDER_TOKEN_INVALID,
      message: '어서션이 유효하지 않아요',
    });
  }

  private signupTokenExpired(): BusinessException {
    return new BusinessException({
      status: HttpStatus.UNAUTHORIZED,
      errorCode: ErrorCode.AUTH_SIGNUP_TOKEN_EXPIRED,
      message: '로그인이 만료되었어요. 다시 시도해주세요',
    });
  }
}
