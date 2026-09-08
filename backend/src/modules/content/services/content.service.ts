import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessForbiddenException } from '@/common/exceptions/business-forbidden.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';

import {
  toPreviousFinalMonthStart,
  toPreviousFinalWeekStart,
} from '@/common/utils/service-date.util';

import { WITHDRAWN_SYNC_MAX_LIMIT } from '../content.constant';
import {
  ALL_TIME_PERIOD_START,
  ContentStatus,
  StatsPeriodType,
} from '../content.enum';
import {
  AdminContentPageQuery,
  ContentCandidateQuery,
  ContentTopicView,
  EnrichmentInput,
  ExplorePage,
  ExplorePageQuery,
  PopularPage,
  PopularPageQuery,
  PublishContentCommand,
  RepublishContentCommand,
  SearchPage,
  SearchPageQuery,
} from '../content.types';
import { EMBEDDING_MODEL_ID } from '../content.constant';
import { ContentSource } from '../entities/content-source.entity';
import { Content } from '../entities/content.entity';
import { ContentRepository } from '../repositories/content.repository';
import { ContentEmbeddingRepository } from '../repositories/content-embedding.repository';
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
    private readonly contentEmbeddingRepository: ContentEmbeddingRepository,
  ) {}

  /** 회수 동기화(`partner-control.md` 4.3) — 그 시각 이후 회수된 콘텐츠 id 목록 */
  /**
   * 회수 동기화 한 페이지(`partner-control.md` 4.3).
   *
   * **상한을 서버가 강제한다.** `since`가 클라이언트 값이라 상한이 없으면 오래된 값 하나로
   * 전 구간을 긁어 갈 수 있다(architecture.md 9.3). 잘렸을 때는 마지막 항목의 회수 시각을
   * 함께 돌려주어, 클라이언트가 그 값을 다음 `since`로 써서 이어 받게 한다.
   */
  async findWithdrawnSince(
    since: Date,
    manager?: EntityManager,
  ): Promise<{ contentIds: string[]; nextSince: string | null }> {
    const rows = await this.contentRepository.findWithdrawnSince(
      since,
      WITHDRAWN_SYNC_MAX_LIMIT,
      manager,
    );
    const hasNext = rows.length > WITHDRAWN_SYNC_MAX_LIMIT;
    const page = hasNext ? rows.slice(0, WITHDRAWN_SYNC_MAX_LIMIT) : rows;

    return {
      contentIds: page.map((row) => row.id),
      // 이어 받을 자리가 없으면 커서를 발급하지 않는다 — 있으면 계속 부르게 된다
      nextSince: hasNext
        ? page[page.length - 1].withdrawnAt.toISOString()
        : null,
    };
  }

  /**
   * 검증된 추천 메타(`EnrichmentInput`)를 저장한다 — `contents` 메타 4종은 넘어온 키만
   * 갱신하고, 임베딩은 **현재 `content_version`으로** 콘텐츠당 1행 전체 교체 upsert 한다
   * (domain.md 5.6 — 재발행·모델 교체의 재생성이 같은 경로를 쓴다).
   *
   * 형식·enum 검증은 호출자(관리자 업로드)의 몫이다 — 여기 오는 값은 이미 통과한 값이다.
   */
  async applyEnrichment(
    content: Content,
    enrichment: EnrichmentInput,
    manager: EntityManager,
  ): Promise<void> {
    if (enrichment.difficulty !== undefined) {
      content.difficulty = enrichment.difficulty;
    }
    if (enrichment.format !== undefined) {
      content.format = enrichment.format;
    }
    if (enrichment.isEvergreen !== undefined) {
      content.isEvergreen = enrichment.isEvergreen;
    }
    if (enrichment.keywords !== undefined) {
      content.keywords = enrichment.keywords;
    }
    await this.contentRepository.saveAll([content], manager);

    if (enrichment.embedding !== undefined) {
      await this.contentEmbeddingRepository.upsert(
        {
          contentId: content.id,
          embedding: enrichment.embedding.vector,
          model: enrichment.embedding.model,
          contentVersion: content.contentVersion,
        },
        manager,
      );
    }
  }

  /**
   * 스코어링에 쓸 수 있는 임베딩만 — 현재 모델(`EMBEDDING_MODEL_ID`)이고 대본 버전이
   * 현재와 일치하는 행. 조건에서 걸러진 콘텐츠는 맵에 없고, 스코어링은 임베딩 축을
   * 중립 처리한다(`drip-scheduling.md` 4.2 — 결여 축 재정규화).
   */
  async findScorableEmbeddings(
    contentIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number[]>> {
    const embeddings =
      await this.contentEmbeddingRepository.findAllScorableByContentIds(
        contentIds,
        EMBEDDING_MODEL_ID,
        manager,
      );

    return new Map(
      embeddings.map((embedding) => [embedding.contentId, embedding.embedding]),
    );
  }

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
   * 키워드 검색 한 페이지(`explore.md` 4.5-5 — pg_trgm 부분 일치 + 필드 가중 랭킹).
   *
   * **동점 해소의 인기 구간(직전 확정 월 — domain.md 5.4)을 `period_start`로 환산하는 것은
   * 이 Service의 몫이다** — 인기 목록(`findPopularPage`)과 같은 이유로, 04시 경계 계산은
   * `service-date.util` 한 곳에만 둔다(domain.md 1.2).
   *
   * Repository가 한 건 더 읽어 오므로 **여기서 잘라내고 다음 페이지 여부를 판정한다.**
   * 질의 정규화(NFC·소문자)는 호출부(탐색 Orchestrator)가 커서 지문과 함께 한 번만 한다.
   */
  async findSearchPage(
    query: SearchPageQuery,
    manager?: EntityManager,
  ): Promise<SearchPage> {
    const rows = await this.contentRepository.findSearchPage(
      query,
      toPreviousFinalMonthStart(query.now),
      manager,
    );
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

  /**
   * admin.md 4.2 — 업로드 = 즉시 발행. `draft`가 없으므로 생성과 동시에 `published`다.
   * 저장소 업로드는 호출부(admin)가 끝내고 `audioPath`를 넘긴다 — 이 Service는 DB만 만진다.
   * 같은 `manager` 안에서 topics·sources를 함께 만들어 "콘텐츠만 있고 주제가 없는" 행을
   * 남기지 않는다.
   */
  async publish(
    command: PublishContentCommand,
    now: Date,
    manager: EntityManager,
  ): Promise<Content> {
    const content = this.contentRepository.create({
      title: command.title,
      description: command.description,
      origin: command.origin,
      authorName: command.authorName,
      sourceName: command.sourceName,
      sourceUrl: command.sourceUrl,
      partnerId: command.partnerId,
      licenseExpiresAt: command.licenseExpiresAt,
      seriesId: command.seriesId,
      episodeNo: command.episodeNo,
      totalEpisodes: command.totalEpisodes,
      audioPath: command.audioPath,
      durationSec: command.durationSec,
      thumbnailUrl: command.thumbnailUrl,
      contentVersion: 1,
      status: ContentStatus.PUBLISHED,
      publishedAt: now,
      withdrawnAt: null,
    });
    const [saved] = await this.contentRepository.saveAll([content], manager);

    await this.contentTopicRepository.saveAll(
      command.topicIds.map((topicId) =>
        this.contentTopicRepository.create({ contentId: saved.id, topicId }),
      ),
      manager,
    );

    if (command.sources.length > 0) {
      await this.contentSourceRepository.saveAll(
        command.sources.map((source, index) =>
          this.contentSourceRepository.create({
            contentId: saved.id,
            position: index + 1,
            title: source.title,
            author: source.author,
            url: source.url,
          }),
        ),
        manager,
      );
    }

    return saved;
  }

  /**
   * admin.md 4.3 · admin-api.md 4.10 — 재발행. **새 행을 만들지 않고 같은 행을 갈아끼운다.**
   * `content_id`가 유지돼야 `library_items` · `playback_progresses` · `content_stats`의
   * 참조가 끊기지 않는다(회수 후 재업로드로는 이걸 지킬 수 없다).
   *
   * `content_version`은 **바뀐 파트와 무관하게 1 오른다.** 메타만 바꿔도 올리는 이유는
   * 클라이언트의 재발행 판정(`player.md` 7 · `player-api.md` 4.2)이 이 값 하나만 보기
   * 때문이다 — 어떤 파트가 바뀌었는지는 클라이언트가 알 수 없고 알 필요도 없다.
   *
   * 저장소 업로드는 호출부(admin)가 트랜잭션 밖에서 끝내고 `audioPath`를 넘긴다(`publish`와 같다).
   */
  async republish(
    content: Content,
    command: RepublishContentCommand,
    manager: EntityManager,
  ): Promise<Content> {
    if (command.title !== undefined) {
      content.title = command.title;
    }
    if (command.description !== undefined) {
      content.description = command.description;
    }
    if (command.sourceName !== undefined) {
      content.sourceName = command.sourceName;
    }
    if (command.audioPath !== undefined) {
      content.audioPath = command.audioPath;
    }
    if (command.durationSec !== undefined) {
      content.durationSec = command.durationSec;
    }
    if (command.thumbnailUrl !== undefined) {
      content.thumbnailUrl = command.thumbnailUrl;
    }
    content.contentVersion += 1;

    const [saved] = await this.contentRepository.saveAll([content], manager);

    // 넘어온 목록은 **전체 교체**다. 지우고 다시 넣어야 빠진 항목이 남지 않는다
    if (command.topicIds !== undefined) {
      await this.contentTopicRepository.deleteAllByContentId(saved.id, manager);
      await this.contentTopicRepository.saveAll(
        command.topicIds.map((topicId) =>
          this.contentTopicRepository.create({ contentId: saved.id, topicId }),
        ),
        manager,
      );
    }

    if (command.sources !== undefined) {
      await this.contentSourceRepository.deleteAllByContentId(
        saved.id,
        manager,
      );
      if (command.sources.length > 0) {
        await this.contentSourceRepository.saveAll(
          command.sources.map((source, index) =>
            this.contentSourceRepository.create({
              contentId: saved.id,
              position: index + 1,
              title: source.title,
              author: source.author,
              url: source.url,
            }),
          ),
          manager,
        );
      }
    }

    return saved;
  }

  /**
   * 회수(FR-32, partner-control.md 4.3-1) — 상태 전환만 담당한다. 노출면 반영(라이브러리
   * 삭제 등)은 호출부(admin)가 같은 트랜잭션에서 조립한다.
   */
  async withdraw(
    content: Content,
    now: Date,
    manager: EntityManager,
  ): Promise<Content> {
    content.status = ContentStatus.WITHDRAWN;
    content.withdrawnAt = now;
    const [saved] = await this.contentRepository.saveAll([content], manager);

    return saved;
  }

  /**
   * 회수 복구(partner-control.md 4.3 "되돌리기") — `published`로 되돌린다.
   * `published_at`은 유지한다(재발행이 아니다 — content_version도 그대로).
   */
  async restoreWithdrawn(
    content: Content,
    manager: EntityManager,
  ): Promise<Content> {
    content.status = ContentStatus.PUBLISHED;
    content.withdrawnAt = null;
    const [saved] = await this.contentRepository.saveAll([content], manager);

    return saved;
  }

  /** admin.md 5장 — 관리자 콘텐츠 목록. 상태를 가리지 않는다 */
  async findAdminPage(
    query: AdminContentPageQuery,
    manager?: EntityManager,
  ): Promise<{ items: Content[]; total: number }> {
    return this.contentRepository.findAdminPage(query, manager);
  }

  /** admin.md 4.5 — 주제 삭제 판정·주제 목록의 건수 집계 */
  async countByTopicIds(
    topicIds: string[],
    manager?: EntityManager,
  ): Promise<Map<string, number>> {
    return this.contentTopicRepository.countByTopicIds(topicIds, manager);
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
