import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import type { AuthenticatedUser } from '@/common/decorators/current-user.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { YearsOfExperienceRange } from '@/modules/user/user.enum';
import { IdempotencyInterceptor } from '@/modules/idempotency/idempotency.interceptor';

import { CompleteOnboardingResponseDto } from './dto/complete-onboarding-response.dto';
import { GetFirstDripResponseDto } from './dto/get-first-drip-response.dto';
import { GetOnboardingRecommendationsResponseDto } from './dto/get-onboarding-recommendations-response.dto';
import { GetOnboardingStateResponseDto } from './dto/get-onboarding-state-response.dto';
import { GetOnboardingTopicsResponseDto } from './dto/get-onboarding-topics-response.dto';
import { PickOnboardingContentsRequestDto } from './dto/pick-onboarding-contents-request.dto';
import { PickOnboardingContentsResponseDto } from './dto/pick-onboarding-contents-response.dto';
import { ReplaceOnboardingInterestsRequestDto } from './dto/replace-onboarding-interests-request.dto';
import { ReplaceOnboardingInterestsResponseDto } from './dto/replace-onboarding-interests-response.dto';
import { UpdateOnboardingCareerRequestDto } from './dto/update-onboarding-career-request.dto';
import { UpdateOnboardingCareerResponseDto } from './dto/update-onboarding-career-response.dto';
import { OnboardingOrchestrator } from './onboarding.orchestrator';

/**
 * onboarding-api.md 3장 — 온보딩 API는 **전부 인증이 필요하다.**
 * 계정은 약관 동의 시점에 이미 생성돼 있다(`auth.md` 4.1).
 *
 * 모든 조회·변경은 토큰에서 꺼낸 `user_id`로 스코프한다. 경로에 `userId`를 받지 않는다
 * (IDOR 방지 — architecture.md 9.2).
 *
 * Controller는 try/catch 하지 않는다. 전역 Exception Filter가 변환한다(architecture.md 7.3).
 */
@Controller('onboarding')
@UseGuards(JwtAuthGuard)
export class OnboardingController {
  constructor(
    private readonly onboardingOrchestrator: OnboardingOrchestrator,
  ) {}

  @Get('state')
  async getState(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<GetOnboardingStateResponseDto> {
    return GetOnboardingStateResponseDto.from(
      await this.onboardingOrchestrator.getState(currentUser.id),
    );
  }

  @Get('topics')
  async getTopics(): Promise<GetOnboardingTopicsResponseDto> {
    return GetOnboardingTopicsResponseDto.from(
      await this.onboardingOrchestrator.getTopics(),
    );
  }

  /**
   * 전체 교체이므로 PUT이다. 같은 본문을 두 번 보내도 결과가 같아 멱등키가 필요 없고,
   * [다음] 연타나 네트워크 재시도로 관심사가 중복 저장될 여지가 없다.
   */
  @Put('interests')
  @HttpCode(HttpStatus.OK)
  async replaceInterests(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: ReplaceOnboardingInterestsRequestDto,
  ): Promise<ReplaceOnboardingInterestsResponseDto> {
    return ReplaceOnboardingInterestsResponseDto.from(
      await this.onboardingOrchestrator.replaceInterests(
        currentUser.id,
        request.topic_ids,
        new Date(),
      ),
    );
  }

  /** [다음]과 [건너뛰기](빈 본문)가 같은 경로를 쓴다 */
  @Patch('career')
  @HttpCode(HttpStatus.OK)
  async updateCareer(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: UpdateOnboardingCareerRequestDto,
  ): Promise<UpdateOnboardingCareerResponseDto> {
    return UpdateOnboardingCareerResponseDto.from(
      await this.onboardingOrchestrator.updateCareer(
        currentUser.id,
        toCareerPatch(request),
      ),
    );
  }

  @Get('recommendations')
  async getRecommendations(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<GetOnboardingRecommendationsResponseDto> {
    return GetOnboardingRecommendationsResponseDto.from(
      await this.onboardingOrchestrator.getRecommendations(
        currentUser.id,
        new Date(),
      ),
    );
  }

  /** [담기] 연타와 자동 재시도가 같은 요청을 두 번 보낼 수 있다 → 멱등키 필수 */
  @Post('picks')
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  async pickContents(
    @CurrentUser() currentUser: AuthenticatedUser,
    @Body() request: PickOnboardingContentsRequestDto,
  ): Promise<PickOnboardingContentsResponseDto> {
    return PickOnboardingContentsResponseDto.from(
      await this.onboardingOrchestrator.pickContents(
        currentUser.id,
        request.content_ids,
        new Date(),
      ),
    );
  }

  /**
   * 같은 멱등키의 재요청은 저장된 첫 응답을 반환하며 편성을 다시 트리거하지 않는다.
   * 트리거 재시도는 서버가 소유한다 — 클라이언트 재시도로 편성이 중복 실행되면
   * 하루 상한을 넘긴 적립이 생긴다.
   */
  @Post('complete')
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<CompleteOnboardingResponseDto> {
    return CompleteOnboardingResponseDto.from(
      await this.onboardingOrchestrator.complete(currentUser.id, new Date()),
    );
  }

  @Get('first-drip')
  async getFirstDrip(
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<GetFirstDripResponseDto> {
    return GetFirstDripResponseDto.from(
      await this.onboardingOrchestrator.getFirstDripState(currentUser.id),
    );
  }
}

/**
 * PATCH의 "보낸 필드만 반영"을 지키려면 **미전송(undefined)과 비우기(null)를 구분**해야 한다.
 * DTO 인스턴스에 키가 있는지로 판정하며, 전역 `ValidationPipe`의 `whitelist`가 선언되지 않은
 * 필드를 이미 잘라내므로 이 판정이 안전하다.
 */
function toCareerPatch(request: UpdateOnboardingCareerRequestDto): {
  jobCategory?: string | null;
  jobTitle?: string | null;
  yearsOfExperience?: YearsOfExperienceRange | null;
} {
  const patch: {
    jobCategory?: string | null;
    jobTitle?: string | null;
    yearsOfExperience?: YearsOfExperienceRange | null;
  } = {};

  if (Object.prototype.hasOwnProperty.call(request, 'job_category')) {
    patch.jobCategory = request.job_category ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(request, 'job_title')) {
    patch.jobTitle = request.job_title ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(request, 'years_of_experience')) {
    patch.yearsOfExperience = request.years_of_experience ?? null;
  }

  return patch;
}
