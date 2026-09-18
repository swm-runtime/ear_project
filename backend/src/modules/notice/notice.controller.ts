import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { GetNoticesQueryRequestDto } from './dto/get-notices-query-request.dto';
import { NoticeDetailResponseDto } from './dto/notice-detail-response.dto';
import { NoticeListResponseDto } from './dto/notice-list-response.dto';
import { NOTICE_LIST_DEFAULT_LIMIT } from './notice.constant';
import {
  decodePublishedNoticeCursor,
  encodePublishedNoticeCursor,
} from './notice.cursor';
import { NoticeService } from './notice.service';

/**
 * settings-api.md 4.4·4.5 — 설정 > 공지사항의 조회 두 건. 인증 필요.
 *
 * "발행됨"은 **서버 시각**으로 판정한다 — 클라이언트는 받은 목록을 그대로 그린다(기기 시각으로 거르지 않는다).
 * Controller는 try/catch 하지 않는다(architecture.md 7.3).
 */
@Controller('notices')
@UseGuards(JwtAuthGuard)
export class NoticeController {
  constructor(private readonly noticeService: NoticeService) {}

  @Get()
  async getNotices(
    @Query() query: GetNoticesQueryRequestDto,
  ): Promise<NoticeListResponseDto> {
    const page = await this.noticeService.findPublishedPage(
      new Date(),
      query.cursor ? decodePublishedNoticeCursor(query.cursor) : null,
      query.limit ?? NOTICE_LIST_DEFAULT_LIMIT,
    );
    const last = page.items[page.items.length - 1];

    return NoticeListResponseDto.from(
      page.items,
      page.hasNext && last
        ? encodePublishedNoticeCursor({
            isPinned: last.isPinned,
            publishedAt: last.publishedAt as Date,
            id: last.id,
          })
        : null,
    );
  }

  @Get(':noticeId')
  async getNotice(
    // uuid 형식 검사를 파이프(400)에 맡기지 않는다 — 계약상 없는 공지는 404 다(Service 가 판정)
    @Param('noticeId') noticeId: string,
  ): Promise<NoticeDetailResponseDto> {
    return NoticeDetailResponseDto.from(
      await this.noticeService.getPublished(noticeId, new Date()),
    );
  }
}
