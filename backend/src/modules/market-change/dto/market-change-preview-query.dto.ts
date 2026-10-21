import { IsEnum } from 'class-validator';

import { PreferredLanguage } from '@/modules/user/user.enum';

/** `global-api.md` 4.11 — 클라이언트는 `market`이 아니라 고른 콘텐츠 언어를 보낸다(7장) */
export class MarketChangePreviewQueryDto {
  @IsEnum(PreferredLanguage)
  readonly preferred_language: PreferredLanguage;
}
