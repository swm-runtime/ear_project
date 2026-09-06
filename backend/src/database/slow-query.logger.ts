import { Logger as NestLogger } from '@nestjs/common';
import { Logger as TypeOrmLogger } from 'typeorm';

/**
 * 느린 쿼리만 WARN으로 남기는 TypeORM 로거 (convention.md 8.3 — 요청 로그의 짝).
 *
 * - **바인딩 파라미터는 절대 남기지 않는다** — 값에 이메일 등 개인정보가 들어간다
 *   (convention.md 8.4). SQL 문장은 `$1` 자리표시자 형태라 안전하다.
 * - WARN 레벨이라 Slack ERROR 알림(?ERROR ?FATAL 필터)을 울리지 않고, 어드민
 *   에러 모아보기의 "WARN 포함" 토글로 조회된다.
 * - 전 쿼리 로깅은 하지 않는다 — 요청당 수 줄씩 늘어 CloudWatch 비용·검색성만
 *   해친다. 집계가 필요해지면 pg_stat_statements가 맞는 도구다.
 */
export const SLOW_QUERY_MS = 1_000;

const QUERY_TEXT_MAX = 300;

export class SlowQueryLogger implements TypeOrmLogger {
  private readonly logger = new NestLogger('SlowQuery');

  logQuerySlow(time: number, query: string, parameters?: unknown[]): void {
    void parameters; // 개인정보가 담기므로 버린다 — 시그니처만 TypeORM 인터페이스와 맞춘다
    this.logger.warn('slow query', {
      duration_ms: time,
      query: query.slice(0, QUERY_TEXT_MAX),
    });
  }

  /** 쿼리 오류는 예외로 전파돼 전역 필터가 남긴다 — 여기서 중복 기록하지 않는다 */
  logQueryError(): void {}
  logQuery(): void {}
  logSchemaBuild(): void {}
  logMigration(): void {}
  log(): void {}
}
