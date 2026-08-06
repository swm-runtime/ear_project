import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { DEFAULT_LIBRARY_PAGE_SIZE } from '@/modules/library/library.constant';
import {
  LibraryItemFilter,
  LibraryItemSort,
} from '@/modules/library/library.enum';

import { CompleteLibraryItemResponseDto } from './dto/complete-library-item-response.dto';
import { GetLibraryResumeResponseDto } from './dto/get-library-resume-response.dto';
import { LibraryItemListResponseDto } from './dto/library-item-list-response.dto';
import { LibraryItemQueryRequestDto } from './dto/library-item-query-request.dto';
import { LibraryTopicListResponseDto } from './dto/library-topic-list-response.dto';
import { RestoreLibraryItemResponseDto } from './dto/restore-library-item-response.dto';
import { LibraryScreenOrchestrator } from './library-screen.orchestrator';

/**
 * library-api.md 3장 — 라이브러리 화면의 엔드포인트를 `/users/me/library-items` 아래에 모은다.
 *
 * **경로에 `userId`를 받지 않고 `me`를 쓴다**(IDOR 방지 — architecture.md 9.2).
 * 변경 엔드포인트도 같은 스코프 아래 둔다 — 소유권 스코프가 경로에 드러나야 목록과 단건이
 * 서로 다른 계층에 놓이지 않는다.
 *
 * **삭제와 복구를 한 엔드포인트의 토글로 만들지 않는다.** 오프라인 큐에서 순서가 뒤바뀌면
 * 토글은 최종 상태를 예측할 수 없다. 두 방향을 각각 멱등하게 두면 마지막 요청이 그대로
 * 최종 상태가 된다.
 *
 * Controller는 try/catch 하지 않는다. 전역 Exception Filter가 변환한다(architecture.md 7.3).
 */
@Controller('users/me/library-items')
@UseGuards(JwtAuthGuard)
export class LibraryScreenController {
  constructor(
    private readonly libraryScreenOrchestrator: LibraryScreenOrchestrator,
  ) {}

  @Get()
  async getItems(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Query() query: LibraryItemQueryRequestDto,
  ): Promise<LibraryItemListResponseDto> {
    return LibraryItemListResponseDto.from(
      await this.libraryScreenOrchestrator.getItems(
        currentUser.id,
        {
          filter: query.filter ?? LibraryItemFilter.ALL,
          topicIds: query.topic_filter ?? [],
          sort: query.sort ?? LibraryItemSort.ADDED_DESC,
          cursor: query.cursor ?? null,
          limit: query.limit ?? DEFAULT_LIBRARY_PAGE_SIZE,
        },
        new Date(),
      ),
    );
  }

  @Get('topics')
  async getTopics(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<LibraryTopicListResponseDto> {
    return LibraryTopicListResponseDto.from(
      await this.libraryScreenOrchestrator.getTopics(currentUser.id),
    );
  }

  @Get('resume')
  async getResumeTarget(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<GetLibraryResumeResponseDto> {
    return GetLibraryResumeResponseDto.from(
      await this.libraryScreenOrchestrator.getResumeTarget(
        currentUser.id,
        new Date(),
      ),
    );
  }

  /** 본문이 없다 — 완청 여부는 클라이언트의 선언이 아니라 서버가 다시 판정한다 */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async completeItem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CompleteLibraryItemResponseDto> {
    return CompleteLibraryItemResponseDto.from(
      await this.libraryScreenOrchestrator.completeItem(
        currentUser.id,
        id,
        new Date(),
      ),
    );
  }

  /**
   * 클라이언트는 [실행 취소] 스낵바가 사라진 뒤에 이 요청을 보낸다
   * (`common-error-handling.md` 4.4). 5초 안에 취소하면 서버 호출 자체가 발생하지 않는다.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteItem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.libraryScreenOrchestrator.deleteItem(
      currentUser.id,
      id,
      new Date(),
    );
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restoreItem(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RestoreLibraryItemResponseDto> {
    return RestoreLibraryItemResponseDto.from(
      await this.libraryScreenOrchestrator.restoreItem(currentUser.id, id),
    );
  }
}
