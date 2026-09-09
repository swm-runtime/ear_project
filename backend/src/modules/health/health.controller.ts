import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

import { CheckHealthResponseDto } from './dto/check-health-response.dto';

/**
 * 배포·로드밸런서용 생존 확인. 도메인 로직이 없으므로 Service를 두지 않는다.
 * 레이트 리밋 제외(architecture.md 9.6) — 헬스체크·모니터링이 한도에 걸리면 안 된다.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  @Get()
  checkHealth(): CheckHealthResponseDto {
    return CheckHealthResponseDto.ok();
  }
}
