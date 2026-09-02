export class CheckHealthResponseDto {
  readonly status: string;

  static ok(): CheckHealthResponseDto {
    return { status: 'ok' };
  }
}
