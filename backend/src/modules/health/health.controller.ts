import { Controller, Get } from '@nestjs/common';

import { CheckHealthResponseDto } from './dto/check-health-response.dto';

/** 배포·로드밸런서용 생존 확인. 도메인 로직이 없으므로 Service를 두지 않는다. */
@Controller('health')
export class HealthController {
  @Get()
  checkHealth(): CheckHealthResponseDto {
    return CheckHealthResponseDto.ok();
  }
}
