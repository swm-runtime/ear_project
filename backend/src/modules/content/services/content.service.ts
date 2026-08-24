import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import {
  toPreviousFinalMonthStart,
  toPreviousFinalWeekStart,
} from '@/common/utils/service-date.util';

import {
  ALL_TIME_PERIOD_START,
  ContentStatus,
  StatsPeriodType,
} from '../content.enum';
import {
  ContentCandidateQuery,
  ContentTopicView,
  ExplorePage,
  ExplorePageQuery,
  PopularPage,
  PopularPageQuery,
} from '../content.types';
import { ContentSource } from '../entities/content-source.entity';
import { Content } from '../entities/content.entity';
import { ContentRepository } from '../repositories/content.repository';
import { ContentSourceRepository } from '../repositories/content-source.repository';
import { ContentTopicRepository } from '../repositories/content-topic.repository';

/** 담기 대상 판정 결과 — 부분 실패를 표현한다 (onboarding-api.md 4.6) */
export interface PickTargetResolution {
  available: Content[];
  failed: { contentId: string; errorCode: ErrorCode }[];
}

/**
 * `contents` · `content_topics`는 content 모듈 소유다(domain.md 2장).
 * 다른 모듈은 Repository를 직접 주입받지 않고 이 Service만 호출한다(architecture.md 4.3).
 */
@Injectable()
export class ContentService {
  constructor(
    private readonly contentRepository: ContentRepository,
    private readonly contentTopicRepository: ContentTopicRepository,
    private readonly contentSourceRepository: ContentSourceRepository,
  ) {}

  async findCandidates(
    query: ContentCandidateQuery,
    manager?: EntityManager,
  ): Promise<Content[]> {
    return this.contentRepository.findCandidates(query, manager);
  }

  async findAllByIds(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<Content[]> {
    return this.contentRepository.findAllByIds(contentIds, manager);
  }

  /** 탐색 피드의 "새로 나온 콘텐츠" 섹션 (`explore.md` 4.1) */
  async findRecent(
    limit: number,
    now: Date,
    manager?: EntityManager,
  ): Promise<Content[]> {
    return this.contentRepository.findRecent(limit, now, manager);
  }

  /**
   * 탐색 인기 콘텐츠 한 페이지(`explore.md` 4.1-1). 피드의 인기 섹션과 구간 토글이 함께 쓴다.
   *
   * **구간을 `period_start`로 환산하는 것은 이 Service의 몫이다.** 어느 구간이 "직전 확정"인지는
   * `content_stats`를 읽는 규칙이라(domain.md 5.4) 화면이 알아야 할 값이 아니고, 04시 경계
   * 계산은 `service-date.util` 한 곳에만 둔다(domain.md 1.2).
   *
   * Repository가 한 건 더 읽어 오므로 **여기서 잘라내고 다음 페이지 여부를 판정한다.**
   */
  async findPopularPage(
    query: PopularPageQuery,
    manager?: EntityManager,
  ): Promise<PopularPage> {
    const rows = await this.contentRepository.findPopularPage(
      query,
      toPeriodStart(query.periodType, query.now),
      manager,
    );
    const hasNext = rows.length > query.limit;

    return { items: hasNext ? rows.slice(0, query.limit) : rows, hasNext };
  }

  /**
   * 탐색 주제 필터의 단일 목록 한 페이지(explore-api.md 4.2).
   *
   * Repository가 한 건 더 읽어 오므로 **여기서 잘라내고 다음 페이지 여부를 판정한다.**
   * `has_next`가 `false`일 때 커서를 발급하지 않는 것은 호출부(응답 조립) 책임이다.
   */
  async findExplorePage(
    query: ExplorePageQuery,
    manager?: EntityManager,
  ): Promise<ExplorePage> {
    const rows = await this.contentRepository.findExplorePage(query, manager);
    const hasNext = rows.length > query.limit;

    return { items: hasNext ? rows.slice(0, query.limit) : rows, hasNext };
  }

  /**
   * 존재 여부만 확인하는 단건 조회. **회수 여부를 판정하지 않는다.**
   *
   * 담기 해제(explore-api.md 4.4)가 이 경로를 쓴다 — 회수된 콘텐츠도 라이브러리에서 뺄 수
   * 있어야 한다. 회수를 이유로 막으면 사용자는 목록에 남은 항목을 영영 치울 수 없다.
   * 노출·재생 경로는 `getPublishedById`를 쓴다.
   */
  async getById(contentId: string, manager?: EntityManager): Promise<Content> {
    const content = await this.contentRepository.findById(contentId, manager);

    if (!content) {
      throw new BusinessNotFoundException({
        errorCode: ErrorCode.CONTENT_NOT_FOUND,
        message: '콘텐츠를 찾을 수 없어요',
      });
    }

    return content;
  }

  /**
   * 노출·재생 대상 단건 조회. **없음과 회수를 다른 코드로 가른다** —
   * 클라이언트가 "찾을 수 없어요"가 아니라 "제공이 종료된 콘텐츠예요"로 안내하고 목록에서
   * 제거해야 하기 때문이다(convention.md 5.5 · library-api.md 4.4).
   *
   * 회수를 404가 아니라 403으로 응답하는 것도 같은 이유다.
   */
  async getPublishedById(
    contentId: string,
    manager?: EntityManager,
  ): Promise<Content> {
    const content = await this.contentRepository.findById(contentId, manager);

    if (!content) {
      throw new BusinessNotFoundException({
        errorCode: ErrorCode.CONTENT_NOT_FOUND,
        message: '콘텐츠를 찾을 수 없어요',
      });
    }

    if (content.status !== ContentStatus.PUBLISHED) {
      throw new BusinessForbiddenException({
        errorCode: ErrorCode.CONTENT_WITHDRAWN,
        message: '제공이 종료된 콘텐츠예요',
        logLevel: 'info',
      });
    }

    return content;
  }

  /**
   * `ai_generated` 콘텐츠의 참고 소스 목록(domain.md 5.5) — 서버가 정한 표시
   * 순서(position)대로 반환한다. 클라이언트는 재배열하지 않는다(`content-detail.md` 4.3).
   *
   * `partner` 콘텐츠는 행이 없어 빈 배열이다 — 응답에서 `null`로 표현하는 것은
   * 조립부(상세 조회) 몫이다(`content-detail-api.md` 4.1).
   */
  async findSourcesByContentId(
    contentId: string,
    manager?: EntityManager,
  ): Promise<ContentSource[]> {
    return this.contentSourceRepository.findAllByContentId(contentId, manager);
  }

  async findTopicViews(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<ContentTopicView[]> {
    return this.contentTopicRepository.findViewsByContentIds(
      contentIds,
      manager,
    );
  }

  /**
   * 담기 요청을 **적립 가능한 것과 실패한 것으로 가른다.**
   *
   * 전체를 실패시키지 않는 이유: 회수된 콘텐츠 한 건 때문에 온보딩 마지막 단계에서
   * 이탈한다(onboarding.md 7 — 성공한 건만 적립하고 진행을 막지 않는다).
   *
   * **노출 조건은 `status = published` 하나로 통일한다**(domain.md 5.1).
   * `withdrawn`과 `expired`를 클라이언트에게 구분해 주지 않는 이유는 두 경우의 화면 동작이
   * 같기 때문이다(카드 제거 + 안내 토스트).
   */
  async resolvePickTargets(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<PickTargetResolution> {
    const contents = await this.findAllByIds(contentIds, manager);
    const byId = new Map(contents.map((content) => [content.id, content]));

    const available: Content[] = [];
    const failed: { contentId: string; errorCode: ErrorCode }[] = [];

    for (const contentId of contentIds) {
      const content = byId.get(contentId);

      if (!content) {
        failed.push({ contentId, errorCode: ErrorCode.CONTENT_NOT_FOUND });
        continue;
      }

      if (content.status !== ContentStatus.PUBLISHED) {
        failed.push({ contentId, errorCode: ErrorCode.CONTENT_WITHDRAWN });
        continue;
      }

      available.push(content);
    }

    return { available, failed };
  }
}

/**
 * 집계 구간 → `content_stats.period_start` (domain.md 5.4).
 *
 * **`all`은 경계 계산이 아니라 고정값이다** — `period_start`를 NULL로 두면 유니크가 중복을
 * 막지 못하므로 `1970-01-01`로 못박혀 있다. 주간·월간만 04시 경계 계산을 거친다.
 */
function toPeriodStart(periodType: StatsPeriodType, now: Date): string {
  switch (periodType) {
    case StatsPeriodType.WEEK:
      return toPreviousFinalWeekStart(now);
    case StatsPeriodType.MONTH:
      return toPreviousFinalMonthStart(now);
    case StatsPeriodType.ALL:
      return ALL_TIME_PERIOD_START;
  }
}
