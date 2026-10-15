import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

import {
  NOTICE_BODY_MAX_LENGTH,
  NOTICE_TITLE_MAX_LENGTH,
} from '@/modules/notice/notice.constant';

import { IsNoticeTimestamp, MaxCodePoints } from './notice-field.validator';
import { UserMarket } from '@/modules/user/user.enum';

/** 공백만 있는 값은 1자로 세지 않는다 — 빈 제목·본문의 공지가 목록에 뜨는 것을 막는다 */
const NOT_BLANK = /\S/;

/**
 * admin-api.md 4.13 — 공지 작성. `published_at`을 보내지 않으면 **초안**이다.
 * 미래 시각이면 예약 발행 — 그 시각부터 사용자 목록에 보인다(판정은 조회 시 서버 시각).
 */
export class CreateNoticeRequestDto {
  @IsString()
  @Matches(NOT_BLANK)
  @MaxCodePoints(NOTICE_TITLE_MAX_LENGTH)
  readonly title: string;

  @IsString()
  @Matches(NOT_BLANK)
  @MaxCodePoints(NOTICE_BODY_MAX_LENGTH)
  readonly body: string;

  @IsOptional()
  @IsBoolean()
  readonly is_pinned?: boolean;

  @IsOptional()
  @IsNoticeTimestamp()
  readonly published_at?: string;

  /**
   * 공지의 시장(`global-api.md` 4.8, KAN-211). 선택 — 없으면 `kr`(종전 콘솔 그대로). 생성 뒤 바꾸지 않는다 —
   * 수정(`PATCH`)은 이 필드를 받지 않는다(모르는 필드는 400)
   */
  @IsOptional()
  @IsEnum(UserMarket)
  readonly market?: UserMarket;
}
