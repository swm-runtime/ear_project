import { IsBoolean, IsString, Matches, ValidateIf } from 'class-validator';

import {
  NOTICE_BODY_MAX_LENGTH,
  NOTICE_TITLE_MAX_LENGTH,
} from '@/modules/notice/notice.constant';

import { IsNoticeTimestamp, MaxCodePoints } from './notice-field.validator';

const NOT_BLANK = /\S/;

/**
 * admin-api.md 4.14 — 공지 부분 수정. 담긴 키만 바꾼다(빈 본문은 Controller가 400으로 거절한다).
 *
 * **`IsOptional`을 쓰지 않는다.** `IsOptional`은 `null`도 "안 보냄"으로 넘기는데, `title`·`body`·`is_pinned`는
 * NOT NULL 컬럼이라 그대로 저장하면 500이 된다. 그래서 "키를 뺐을 때(undefined)만 건너뛴다"로 적는다.
 * `published_at`만 `null`을 허용한다 — 발행 취소(초안으로 되돌림)다.
 */
export class UpdateNoticeRequestDto {
  @ValidateIf((dto: UpdateNoticeRequestDto) => dto.title !== undefined)
  @IsString()
  @Matches(NOT_BLANK)
  @MaxCodePoints(NOTICE_TITLE_MAX_LENGTH)
  readonly title?: string;

  @ValidateIf((dto: UpdateNoticeRequestDto) => dto.body !== undefined)
  @IsString()
  @Matches(NOT_BLANK)
  @MaxCodePoints(NOTICE_BODY_MAX_LENGTH)
  readonly body?: string;

  @ValidateIf((dto: UpdateNoticeRequestDto) => dto.is_pinned !== undefined)
  @IsBoolean()
  readonly is_pinned?: boolean;

  @ValidateIf(
    (dto: UpdateNoticeRequestDto) =>
      dto.published_at !== undefined && dto.published_at !== null,
  )
  @IsNoticeTimestamp()
  readonly published_at?: string | null;
}
