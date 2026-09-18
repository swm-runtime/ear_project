import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

import {
  NOTICE_BODY_MAX_LENGTH,
  NOTICE_TITLE_MAX_LENGTH,
} from '@/modules/notice/notice.constant';

import { IsNoticeTimestamp, MaxCodePoints } from './notice-field.validator';

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
}
