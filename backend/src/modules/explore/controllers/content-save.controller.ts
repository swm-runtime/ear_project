import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { SaveContentRequestDto } from '../dto/save-content-request.dto';
import { SaveContentResponseDto } from '../dto/save-content-response.dto';
import { UnsaveContentQueryRequestDto } from '../dto/unsave-content-query-request.dto';
import { UnsaveContentResponseDto } from '../dto/unsave-content-response.dto';
import { SaveReason } from '../explore.enum';
import { ExploreOrchestrator } from '../explore.orchestrator';

/**
 * explore-api.md 3장 — 담기·해제를 **`/contents/:content_id/save`에 둔다.**
 *
 * `/users/me/library-items`에 두지 않는 이유: 탐색 행이 아는 것은 `content_id`뿐이라
 * 라이브러리 항목 id를 요구하면 **담기 전의 콘텐츠를 지목할 수 없다.** 재생
 * (`/contents/:content_id/play`)과 같은 계층이며, 탐색이 콘텐츠에 하는 행위는 콘텐츠 경로에 모인다.
 *
 * **담기와 해제를 한 엔드포인트의 토글로 만들지 않는다.** 오프라인 큐에서 순서가 뒤바뀌면
 * 토글은 최종 상태를 예측할 수 없다. 두 방향을 각각 멱등하게 두면 마지막 요청이 그대로
 * 최종 상태다.
 *
 * **`Idempotency-Key`를 쓰지 않는다.** 중복은 `uq_library_items_user_id_content_id`가 DB로
 * 막고(domain.md 6.1), 연타 순서 문제는 `client_seq`가 담당한다 — 멱등키는 "같은 요청의
 * 중복"을 막고 `client_seq`는 "다른 요청의 순서"를 판별한다.
 */
@Controller('contents')
@UseGuards(JwtAuthGuard)
export class ContentSaveController {
  constructor(private readonly exploreOrchestrator: ExploreOrchestrator) {}

  /**
   * 새로 담기면 201, 이미 담겨 있으면 200이다.
   *
   * 상태 코드를 응답 객체로 갈라야 해서 `@Res({ passthrough: true })`를 쓴다 — 상태 코드는
   * HTTP 관심사라 Controller의 몫이고(architecture.md 3.2), `passthrough`이므로 응답 본문
   * 직렬화는 그대로 Nest가 한다.
   */
  @Post(':contentId/save')
  @HttpCode(HttpStatus.OK)
  async saveContent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Body() request: SaveContentRequestDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<SaveContentResponseDto> {
    const result = await this.exploreOrchestrator.saveContent({
      userId: currentUser.id,
      contentId,
      // 기본값은 Controller가 아니라 이 자리에서 한 번만 정한다(convention.md 3.3)
      reason: request.reason ?? SaveReason.USER_SAVE,
      now: new Date(),
    });

    if (result.created) {
      response.status(HttpStatus.CREATED);
    }

    return SaveContentResponseDto.from(result, request.client_seq);
  }

  /**
   * **해제 대상이 없어도 200이다.** 오프라인 큐 재전송이 같은 해제를 다시 보낼 수 있다
   * (`common-error-handling.md` 4.5).
   *
   * 204가 아닌 이유는 `client_seq`를 되돌려야 하기 때문이다 — 본문이 없으면 클라이언트가
   * 어느 조작의 응답인지 판별할 수 없어 연타 방어가 성립하지 않는다.
   */
  @Delete(':contentId/save')
  @HttpCode(HttpStatus.OK)
  async unsaveContent(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Param('contentId', ParseUUIDPipe) contentId: string,
    @Query() query: UnsaveContentQueryRequestDto,
  ): Promise<UnsaveContentResponseDto> {
    await this.exploreOrchestrator.unsaveContent(
      currentUser.id,
      contentId,
      new Date(),
    );

    return UnsaveContentResponseDto.from(query.client_seq);
  }
}
