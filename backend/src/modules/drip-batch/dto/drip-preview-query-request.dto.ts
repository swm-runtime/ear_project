import { IsUUID } from 'class-validator';

/**
 * `GET /admin/drip/preview?user_id=` — 대상 사용자는 가명(`user_id`)으로 고른다(2026-10-22, changes/pending/drip-preview-user-id.md).
 * 종전의 `email` 키는 받지 않는다 — 실사용자를 이메일로 고르면 이메일이 콘솔 입력·URL·접근 로그·세션에 남는다(루트 CLAUDE.md
 * 개인정보 원칙). `email`을 보내면 전역 `forbidNonWhitelisted`가 400으로 막는다.
 */
export class DripPreviewQueryRequestDto {
  @IsUUID()
  readonly user_id: string;
}
