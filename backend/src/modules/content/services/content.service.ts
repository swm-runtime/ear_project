import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { ErrorCode } from '@/common/exceptions/error-code.enum';

import { ContentStatus } from '../content.enum';
import { ContentCandidateQuery, ContentTopicView } from '../content.types';
import { Content } from '../entities/content.entity';
import { ContentRepository } from '../repositories/content.repository';
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
