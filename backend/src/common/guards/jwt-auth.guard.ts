import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { AuthenticatedRequest } from '@/common/decorators/current-user.decorator';
import { BusinessException } from '@/common/exceptions/business.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

/** access token은 stateless로 검증한다 (architecture.md 9.1) */
interface AccessTokenPayload {
  sub: string;
  role: string;
  typ: string;
}

const ACCESS_TOKEN_TYPE = 'access';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request.headers.authorization);

    if (!token) {
      throw this.unauthorized();
    }

    let payload: AccessTokenPayload;
    try {
      payload = this.jwtService.verify<AccessTokenPayload>(token);
    } catch {
      throw this.unauthorized();
    }

    // signup token 등 다른 용도의 토큰이 access token으로 통과하지 않게 막는다
    if (payload.typ !== ACCESS_TOKEN_TYPE) {
      throw this.unauthorized();
    }

    request.user = { id: payload.sub, role: payload.role };
    return true;
  }

  private extractToken(authorization: string | undefined): string | null {
    if (!authorization?.startsWith('Bearer ')) {
      return null;
    }

    return authorization.slice('Bearer '.length).trim() || null;
  }

  private unauthorized(): BusinessException {
    return new BusinessException({
      status: HttpStatus.UNAUTHORIZED,
      errorCode: ErrorCode.UNAUTHORIZED,
      message: '로그인이 필요해요',
      logLevel: 'warn',
    });
  }
}
