import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { DataSource } from 'typeorm';

import { CheckHealthResponseDto } from './dto/check-health-response.dto';

/** DB 핑 대기 상한 — 배포·모니터링의 핑 주기보다 충분히 짧아야 한다 */
const DB_PING_TIMEOUT_MS = 2_000;

/**
 * 배포·로드밸런서용 생존 확인. 도메인 로직이 없으므로 Service를 두지 않는다.
 *
 * **DB 연결까지 본다**(감사 하 #7 결정). 프로세스만 살아 있고 DB에 못 붙는 상태를 200으로
 * 답하면 배포의 헬스 확인이 통과하고 모니터링도 정상으로 그린다 — 실제로는 모든 요청이
 * 실패하는 중이다. `SELECT 1` 한 번이라 비용은 없다. 못 붙으면 503 + `status: 'degraded'`.
 *
 * 레이트 리밋 제외(architecture.md 9.6) — 헬스체크·모니터링이 한도에 걸리면 안 된다.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async checkHealth(
    @Res({ passthrough: true }) response: Response,
  ): Promise<CheckHealthResponseDto> {
    const isDatabaseReachable = await this.pingDatabase();

    if (!isDatabaseReachable) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return CheckHealthResponseDto.degraded();
    }

    return CheckHealthResponseDto.ok();
  }

  private async pingDatabase(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), DB_PING_TIMEOUT_MS);
    });

    try {
      return await Promise.race([
        this.dataSource.query('SELECT 1').then(() => true),
        timeout,
      ]);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
