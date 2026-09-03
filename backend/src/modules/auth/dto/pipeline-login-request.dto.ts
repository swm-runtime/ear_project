import { IsString, MaxLength } from 'class-validator';

/**
 * 파이프라인 웹 SSO (changes/pending/pipeline-sso-login.md).
 * `assertion`은 파이프라인 웹 **서버**만 만들 수 있는 서명 토큰이다 — 브라우저 입력값이 아니다.
 */
export class PipelineLoginRequestDto {
  @IsString()
  @MaxLength(2000)
  readonly assertion: string;

  @IsString()
  @MaxLength(200)
  readonly device_id: string;
}
