import { IsEnum, IsOptional } from 'class-validator';

import { GetNoticesQueryRequestDto } from '@/modules/notice/dto/get-notices-query-request.dto';
import { UserMarket } from '@/modules/user/user.enum';

/** admin-api.md 4.12 — 관리자 공지 목록. 사용자 목록 쿼리에 시장 필터를 더한다(KAN-211) */
export class AdminNoticeQueryRequestDto extends GetNoticesQueryRequestDto {
  /** 없으면 전 시장 */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
