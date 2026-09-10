export class CheckHealthResponseDto {
  readonly status: string;

  static ok(): CheckHealthResponseDto {
    return { status: 'ok' };
  }

  /** DB에 못 붙는 상태 — 503과 함께 나간다 */
  static degraded(): CheckHealthResponseDto {
    return { status: 'degraded' };
  }
}
