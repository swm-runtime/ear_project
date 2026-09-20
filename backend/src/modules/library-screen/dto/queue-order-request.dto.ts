import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

import { MAX_QUEUE_ORDER_SIZE } from '@/modules/library/library.constant';

/**
 * library-api.md 4.8 — 재생 목록 순서 저장. 사용자가 보고 있는 목록의 항목 id를 **위에서부터** 나열한다.
 * 목록 상한은 서버가 강제한다(architecture.md 9.3). 중복 id는 순서가 두 개가 되므로 거절한다.
 */
export class QueueOrderRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_QUEUE_ORDER_SIZE)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  readonly item_ids: string[];
}
