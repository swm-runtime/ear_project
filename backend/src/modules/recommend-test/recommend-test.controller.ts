import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { AdminRoleGuard } from '@/common/guards/admin-role.guard';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { GetExploreFeedResponseDto } from '@/modules/explore/dto/get-explore-feed-response.dto';

import { RecommendTestAccountResponseDto } from './dto/recommend-test-account-response.dto';
import { RecommendTestActionRequestDto } from './dto/recommend-test-action-request.dto';
import { RecommendTestActionResponseDto } from './dto/recommend-test-action-response.dto';
import { RecommendTestCareerRequestDto } from './dto/recommend-test-career-request.dto';
import { RecommendTestInterestsRequestDto } from './dto/recommend-test-interests-request.dto';
import { RecommendTestService } from './recommend-test.service';

/**
 * 추천 테스트 — admin 콘솔 "추천 검증 > 추천 테스트" 탭(admin-api.md 4.17, 요청 2026-09-29). **개발계 전용·쓰기 있음.**
 *
 * 대상은 항상 서버 env 의 테스트 계정 하나다 — 요청이 사용자를 고르지 않는다. 이메일을 받으면 관리자가 아무 사용자의
 * 라이브러리를 조작하는 도구가 되므로 막는다. 권한 판정은 다른 관리자 라우트와 같고(`users.role == 'admin'`),
 * 운영 환경·미설정은 서비스가 409 로 잠근다. 추천 결과(편성분·점수)는 편성 미리보기(4.16)를 테스트 계정으로 부른다.
 */
@Controller('admin/recommend-test')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class RecommendTestController {
  constructor(private readonly recommendTestService: RecommendTestService) {}

  @Get('account')
  @Header('Cache-Control', 'no-store')
  async account(): Promise<RecommendTestAccountResponseDto> {
    return RecommendTestAccountResponseDto.from(
      await this.recommendTestService.getAccount(new Date()),
    );
  }

  /** 앱 탐색 화면이 받는 피드와 같은 본문 — 행동 직후 다시 불러 순서 변화를 본다 */
  @Get('feed')
  @Header('Cache-Control', 'no-store')
  async feed(): Promise<GetExploreFeedResponseDto> {
    return GetExploreFeedResponseDto.from(
      await this.recommendTestService.getFeed(new Date()),
    );
  }

  @Post('actions')
  @HttpCode(HttpStatus.OK)
  async act(
    @Body() request: RecommendTestActionRequestDto,
  ): Promise<RecommendTestActionResponseDto> {
    return RecommendTestActionResponseDto.from(
      await this.recommendTestService.perform(
        request.action,
        request.content_id,
        new Date(),
      ),
    );
  }

  @Put('interests')
  @HttpCode(HttpStatus.NO_CONTENT)
  async replaceInterests(
    @Body() request: RecommendTestInterestsRequestDto,
  ): Promise<void> {
    await this.recommendTestService.replaceInterests(
      request.topic_ids,
      new Date(),
    );
  }

  @Put('career')
  @HttpCode(HttpStatus.NO_CONTENT)
  async replaceCareer(
    @Body() request: RecommendTestCareerRequestDto,
  ): Promise<void> {
    await this.recommendTestService.replaceCareer({
      jobCategory: request.job_category,
      jobTitle: request.job_title,
      yearsOfExperience: request.years_of_experience,
    });
  }

  /** 소비 이력 전부 삭제 — 관심 주제·커리어·계정은 남는다 */
  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(): Promise<void> {
    await this.recommendTestService.reset();
  }
}
