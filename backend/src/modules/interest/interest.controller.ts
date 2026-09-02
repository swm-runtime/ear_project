import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';

import { GetUserInterestsResponseDto } from './dto/get-user-interests-response.dto';
import { ReplaceUserInterestsRequestDto } from './dto/replace-user-interests-request.dto';
import { ReplaceUserInterestsResponseDto } from './dto/replace-user-interests-response.dto';
import { UserInterestService } from './services/user-interest.service';

/**
 * interest-management-api.md — 관심사 관리 화면의 조회·일괄 저장.
 *
 * 조회와 저장을 **같은 경로의 GET/PUT**으로 둔다 — 같은 리소스(사용자의 관심 주제 집합)의
 * 읽기와 교체다(3장 설계 메모). 주제 목록은 온보딩과 공용(`GET /onboarding/topics`)이고,
 * 자동 확장 토글(P1)은 설정과 공용(`PATCH /users/me/settings`)이라 여기에 없다.
 *
 * 모든 조회·변경은 토큰에서 꺼낸 `user_id`로 스코프한다(IDOR 방지 — architecture.md 9.2).
 * Controller는 try/catch 하지 않는다. 전역 Exception Filter가 변환한다(architecture.md 7.3).
 */
@Controller('users/me/interests')
@UseGuards(JwtAuthGuard)
export class InterestController {
  constructor(private readonly userInterestService: UserInterestService) {}

  @Get()
  async getInterests(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<GetUserInterestsResponseDto> {
    return GetUserInterestsResponseDto.from(
      await this.userInterestService.findEditableSelection(currentUser.id),
    );
  }

  /**
   * 전체 교체이므로 PUT이다. 같은 본문의 재전송·재시도가 결과를 바꾸지 않아 멱등키가 없다
   * (interest-management-api.md 2장). `onboarding_step`은 건드리지 않는다 — 온보딩 저장과
   * 이 저장이 분리된 이유가 그 부수 효과다(4.3).
   */
  @Put()
  @HttpCode(HttpStatus.OK)
  async replaceInterests(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: ReplaceUserInterestsRequestDto,
  ): Promise<ReplaceUserInterestsResponseDto> {
    return ReplaceUserInterestsResponseDto.from(
      await this.userInterestService.replaceManagedSelection(
        currentUser.id,
        request.topic_ids,
        new Date(),
      ),
    );
  }
}
