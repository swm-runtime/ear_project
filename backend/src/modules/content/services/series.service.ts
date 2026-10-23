import { HttpStatus, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { BusinessException } from '@/common/exceptions/business.exception';
import { BusinessNotFoundException } from '@/common/exceptions/business-not-found.exception';
import { ErrorCode } from '@/common/exceptions/error-code.enum';
import { normalizeStoredText } from '@/common/utils/search-text.util';
import { UserMarket } from '@/modules/user/user.enum';

import {
  ContentSeriesRef,
  CreateSeriesCommand,
  SeriesEpisodeCounts,
  SeriesEpisodeUpload,
  UpdateSeriesCommand,
} from '../content.types';
import { Content } from '../entities/content.entity';
import { Series } from '../entities/series.entity';
import { ContentRepository } from '../repositories/content.repository';
import { ContentTopicRepository } from '../repositories/content-topic.repository';
import { SeriesRepository } from '../repositories/series.repository';

/** 관리자 시리즈 목록의 한 행 */
export interface SeriesWithCounts {
  series: Series;
  counts: SeriesEpisodeCounts;
}

/** 탐색 시리즈 카드(KAN-134 확정 설계 4번)의 재료 — 사용자 시장에 노출 중인 편 기준 */
export interface SeriesCardView {
  series: Series;
  /** 표지 — 시리즈 표지(`cover_url`)가 있으면 그것, 없으면 노출 중인 가장 앞 편(보통 1화)의 썸네일(`resolveSeriesCover`) */
  coverThumbnailUrl: string;
  /** 노출 중인 편 수 — 계획 편수(`series.totalEpisodes`)보다 적을 수 있다 */
  episodeCount: number;
  /** 노출 중인 편들의 주제 합집합(처음 나온 순서) */
  topicIds: string[];
}

/** 시리즈 화면(`GET /series/:id`)의 재료 — 노출 중인 편만, 편 번호순 */
export interface VisibleSeries {
  series: Series;
  episodes: Content[];
}

const EMPTY_COUNTS: SeriesEpisodeCounts = {
  published: 0,
  withdrawn: 0,
  expired: 0,
  maxPublishedEpisodeNo: null,
};

/**
 * `series`는 content 모듈 소유다(KAN-134 — 시리즈는 편(`contents`)의 묶음이고 `contents.series_id`가 FK로 가리킨다).
 * 다른 모듈은 이 Service만 호출한다(architecture.md 4.3).
 *
 * 시리즈를 아는 것은 **표시와 발행 검증, 드립 순서 판정**뿐이다. 담기·재생 위치·완청·통계·페이월 차감은 편 단위로 남는다
 * (확정 설계 원칙 — 그 테이블들이 시리즈를 알게 하면 손댈 곳이 지나치게 넓어진다).
 */
@Injectable()
export class SeriesService {
  constructor(
    private readonly seriesRepository: SeriesRepository,
    private readonly contentRepository: ContentRepository,
    private readonly contentTopicRepository: ContentTopicRepository,
  ) {}

  async create(
    command: CreateSeriesCommand,
    manager: EntityManager,
  ): Promise<Series> {
    return this.seriesRepository.save(
      this.seriesRepository.create({
        title: normalizeStoredText(command.title),
        description: normalizeStoredText(command.description),
        totalEpisodes: command.totalEpisodes,
        status: command.status,
        publisherName: command.publisherName,
      }),
      manager,
    );
  }

  /** 잠그지 않는 존재 확인 — 표지 업로드가 저장소에 올리기 전에 없는 시리즈를 빨리 거절한다(최종 판정은 잠근 재확인) */
  async getById(seriesId: string, manager?: EntityManager): Promise<Series> {
    const series = await this.seriesRepository.findById(seriesId, manager);

    if (!series) {
      throw seriesNotFound();
    }

    return series;
  }

  /** 관리자 수정 경로 — 업로드 검증과 같은 잠금으로 직렬화한다(편수 하한 판정이 동시 업로드와 엇갈리지 않게) */
  async getByIdForUpdate(
    seriesId: string,
    manager: EntityManager,
  ): Promise<Series> {
    const series = await this.seriesRepository.findByIdForUpdate(
      seriesId,
      manager,
    );

    if (!series) {
      throw seriesNotFound();
    }

    return series;
  }

  /**
   * 담긴 키만 바꾼다. **총 편수는 발행 중인 가장 큰 편 번호보다 작게 줄일 수 없다**(확정 설계 1번) — 줄이면 그 편이
   * "N부작 중 M화"에서 M > N이 된다. 늘리는 것은 언제나 된다(진행 중 시리즈의 편 추가). 상한은 없다.
   *
   * `contents.total_episodes`(편마다 들고 있는 사본)는 고치지 않는다 — 응답의 총 편수는 이 행에서 읽고, 사본은
   * 업로드 계약 호환으로만 남는다. 편 사본을 고치면 그 편의 `updated_at`이 바뀌어 동기화·재발행 판정이 흔들린다.
   */
  async update(
    series: Series,
    command: UpdateSeriesCommand,
    manager: EntityManager,
  ): Promise<Series> {
    if (command.totalEpisodes !== undefined) {
      const [counts] = await this.contentRepository.countEpisodesBySeries(
        [series.id],
        manager,
      );
      const maxPublished = counts?.maxPublishedEpisodeNo ?? null;
      assertTotalNotBelowPublished(command.totalEpisodes, maxPublished);
      series.totalEpisodes = command.totalEpisodes;
    }
    if (command.title !== undefined) {
      series.title = normalizeStoredText(command.title);
    }
    if (command.description !== undefined) {
      series.description = normalizeStoredText(command.description);
    }
    if (command.status !== undefined) {
      series.status = command.status;
    }
    if (command.publisherName !== undefined) {
      series.publisherName = command.publisherName;
    }

    return this.seriesRepository.save(series, manager);
  }

  /**
   * 표지 교체(KAN-234) — `getByIdForUpdate`로 잠근 행에 새 공개 URL을 넣는다. 저장소 업로드·옛 객체 정리는 호출부
   * (`AdminSeriesService.replaceCover`) 몫이다 — 이 모듈은 저장소를 모른다. `updated_at`이 올라가 운영 → 개발계
   * 콘텐츠 동기화의 지문(표별 `max(updated_at)`)이 바뀜을 알아챈다
   */
  async updateCover(
    series: Series,
    coverUrl: string,
    manager: EntityManager,
  ): Promise<Series> {
    series.coverUrl = coverUrl;
    return this.seriesRepository.save(series, manager);
  }

  /** 관리자 목록 — 시리즈마다 상태별 편 수를 붙인다(한 번의 집계 조회) */
  async findAllWithCounts(
    manager?: EntityManager,
  ): Promise<SeriesWithCounts[]> {
    const all = await this.seriesRepository.findAll(manager);
    const counts = await this.contentRepository.countEpisodesBySeries(
      all.map((series) => series.id),
      manager,
    );
    const countsBySeriesId = new Map(
      counts.map(({ seriesId, ...rest }) => [seriesId, rest]),
    );

    return all.map((series) => ({
      series,
      counts: countsBySeriesId.get(series.id) ?? EMPTY_COUNTS,
    }));
  }

  async getCounts(
    seriesId: string,
    manager?: EntityManager,
  ): Promise<SeriesEpisodeCounts> {
    const [counts] = await this.contentRepository.countEpisodesBySeries(
      [seriesId],
      manager,
    );
    return counts
      ? {
          published: counts.published,
          withdrawn: counts.withdrawn,
          expired: counts.expired,
          maxPublishedEpisodeNo: counts.maxPublishedEpisodeNo,
        }
      : EMPTY_COUNTS;
  }

  /**
   * 업로드할 편의 시리즈 필드를 검증한다(`admin-api.md` 4.6 — 확정 설계 1·2번). 전부 400 `VALIDATION_FAILED`이고
   * `details.field`로 어느 칸인지 알린다(관리자 콘솔이 필드별 인라인 에러로 그린다).
   *
   * 1. 시리즈가 있어야 한다(`series_id`) — 시리즈를 먼저 만들고(`POST /admin/series`) 그 id만 보낸다.
   * 2. `total_episodes`가 `series.total_episodes`와 같아야 한다 — 편마다 다른 총 편수를 막는다.
   * 3. `episode_no`가 1..총 편수 안이어야 한다.
   * 4. 같은 `(series_id, episode_no)`로 발행 중인 편이 없어야 한다 — 부분 유니크의 사전 확인. 동시 업로드는
   *    `manager`가 있을 때 시리즈 행 잠금이 직렬화하고, 그래도 남는 경합은 유니크 인덱스가 막는다.
   * 5. 시리즈에 이미 올라간 편과 시장이 같아야 한다 — 시리즈는 편의 시장을 따르므로 섞이면 격리가 샌다.
   *
   * `manager`를 주면(발행 트랜잭션 안) 시리즈 행을 잠그고 본다. 없으면 잠그지 않는 사전 확인이다 — 저장소 업로드
   * 전에 빨리 거절하려는 것이고, 최종 판정은 트랜잭션 안의 재확인이 한다.
   */
  async assertEpisodeUploadable(
    upload: SeriesEpisodeUpload,
    manager?: EntityManager,
  ): Promise<Series> {
    const series = manager
      ? await this.seriesRepository.findByIdForUpdate(upload.seriesId, manager)
      : await this.seriesRepository.findById(upload.seriesId);

    if (!series) {
      throw validationFailed('series_id', '존재하지 않는 시리즈예요');
    }
    if (upload.totalEpisodes !== series.totalEpisodes) {
      throw validationFailed(
        'total_episodes',
        `총 편수가 시리즈의 편수(${series.totalEpisodes}편)와 달라요`,
      );
    }
    if (upload.episodeNo < 1 || upload.episodeNo > series.totalEpisodes) {
      throw validationFailed(
        'episode_no',
        `편 번호는 1~${series.totalEpisodes} 사이여야 해요`,
      );
    }

    const [duplicated, markets] = await Promise.all([
      this.contentRepository.existsPublishedEpisode(
        series.id,
        upload.episodeNo,
        null,
        manager,
      ),
      this.contentRepository.findMarketsBySeriesId(series.id, manager),
    ]);
    if (duplicated) {
      throw validationFailed(
        'episode_no',
        '이 시리즈에 같은 번호로 발행된 편이 이미 있어요',
      );
    }
    if (markets.some((market) => market !== upload.market)) {
      throw validationFailed('series_id', '다른 시장의 편이 있는 시리즈예요');
    }

    return series;
  }

  /**
   * 회수 복구가 발행 편 번호 유일성을 깨지 않는가(`restore`) — 회수된 사이에 같은 번호로 새 편이 발행됐으면
   * 되돌리면 같은 번호가 둘이 된다. 409 `CONFLICT`(종전 복구의 상태 충돌과 같은 코드). 단일 콘텐츠는 통과
   */
  async assertRestorable(
    content: Pick<Content, 'id' | 'seriesId' | 'episodeNo'>,
    manager: EntityManager,
  ): Promise<void> {
    if (content.seriesId === null || content.episodeNo === null) {
      return;
    }

    const series = await this.seriesRepository.findByIdForUpdate(
      content.seriesId,
      manager,
    );
    const duplicated = await this.contentRepository.existsPublishedEpisode(
      content.seriesId,
      content.episodeNo,
      content.id,
      manager,
    );

    if (duplicated || (series && content.episodeNo > series.totalEpisodes)) {
      throw new BusinessException({
        status: HttpStatus.CONFLICT,
        errorCode: ErrorCode.CONFLICT,
        message: duplicated
          ? '같은 번호로 발행된 편이 있어 되돌릴 수 없어요'
          : '시리즈 편수보다 큰 번호라 되돌릴 수 없어요',
      });
    }
  }

  /**
   * 응답의 `series` 객체 재료 — 콘텐츠 id → 시리즈 표시값. 단일 콘텐츠·편 번호 없는 행은 맵에 없다(응답 `null`).
   * 시리즈 행은 한 번에 읽는다(카드 수만큼 조회하지 않는다)
   */
  async findRefs(
    contents: Pick<Content, 'id' | 'seriesId' | 'episodeNo'>[],
    manager?: EntityManager,
  ): Promise<Map<string, ContentSeriesRef>> {
    const seriesIds = [
      ...new Set(
        contents
          .map((content) => content.seriesId)
          .filter((seriesId): seriesId is string => seriesId !== null),
      ),
    ];
    const seriesById = new Map(
      (await this.seriesRepository.findAllByIds(seriesIds, manager)).map(
        (series) => [series.id, series],
      ),
    );
    const refs = new Map<string, ContentSeriesRef>();

    for (const content of contents) {
      const series =
        content.seriesId === null
          ? undefined
          : seriesById.get(content.seriesId);
      if (series && content.episodeNo !== null) {
        refs.set(content.id, toSeriesRef(series, content.episodeNo));
      }
    }

    return refs;
  }

  /**
   * 탐색 시리즈 카드의 재료(시리즈 id → 카드). 노출 중인 편이 사용자 시장에 없는 시리즈는 맵에 없다 — 호출부는 그 시리즈를
   * 카드로 접지 않는다. 시리즈·편·주제를 각각 한 번에 읽는다
   */
  async findCards(
    seriesIds: string[],
    now: Date,
    market: UserMarket,
    manager?: EntityManager,
  ): Promise<Map<string, SeriesCardView>> {
    const ids = [...new Set(seriesIds)];
    const [allSeries, episodes] = await Promise.all([
      this.seriesRepository.findAllByIds(ids, manager),
      this.contentRepository.findVisibleBySeriesIds(ids, now, market, manager),
    ]);
    const topicViews = await this.contentTopicRepository.findViewsByContentIds(
      episodes.map((episode) => episode.id),
      manager,
    );
    const topicIdsByContentId = new Map<string, string[]>();
    for (const view of topicViews) {
      const topicIds = topicIdsByContentId.get(view.contentId) ?? [];
      topicIds.push(view.topicId);
      topicIdsByContentId.set(view.contentId, topicIds);
    }
    const seriesById = new Map(allSeries.map((series) => [series.id, series]));
    const cards = new Map<string, SeriesCardView>();

    for (const episode of episodes) {
      const series =
        episode.seriesId === null
          ? undefined
          : seriesById.get(episode.seriesId);
      if (!series) {
        continue;
      }
      const card = cards.get(series.id) ?? {
        series,
        // 편 번호순으로 읽었으므로 처음 만나는 편이 가장 앞 편이다 — 시리즈 표지가 없을 때의 대체값
        coverThumbnailUrl: resolveSeriesCover(series, episode.thumbnailUrl),
        episodeCount: 0,
        topicIds: [],
      };
      card.episodeCount += 1;
      for (const topicId of topicIdsByContentId.get(episode.id) ?? []) {
        if (!card.topicIds.includes(topicId)) {
          card.topicIds.push(topicId);
        }
      }
      cards.set(series.id, card);
    }

    return cards;
  }

  /**
   * 같은 간행물의 다른 시리즈(`GET /series/:id/publisher-series` — 애플 뮤직 "○○의 다른 앨범" 자리, 2026-10-22 PM).
   * 기준 시리즈가 사용자에게 보이지 않으면 시리즈 화면과 같은 404다. 발행 이름이 없으면 빈 목록이다. 카드는 탐색 시리즈 카드와
   * 같은 재료이고, 노출 편이 사용자 시장에 없는 시리즈는 빠진다(`findCards`). 순서는 만든 순
   */
  async findPublisherSiblingCards(
    seriesId: string,
    now: Date,
    market: UserMarket,
    manager?: EntityManager,
  ): Promise<{ publisherName: string | null; cards: SeriesCardView[] }> {
    const { series } = await this.getVisibleForUser(
      seriesId,
      now,
      market,
      manager,
    );
    if (!series.publisherName) {
      return { publisherName: null, cards: [] };
    }

    const siblings = (
      await this.seriesRepository.findByPublisherName(
        series.publisherName,
        manager,
      )
    ).filter((sibling) => sibling.id !== series.id);
    const cardById = await this.findCards(
      siblings.map((sibling) => sibling.id),
      now,
      market,
      manager,
    );

    return {
      publisherName: series.publisherName,
      cards: siblings
        .map((sibling) => cardById.get(sibling.id))
        .filter((card): card is SeriesCardView => card !== undefined),
    };
  }

  /**
   * 사용자 시리즈 화면(`GET /series/:id`). **노출 중인 편이 사용자 시장에 하나도 없으면 없는 시리즈다(404)** —
   * 시리즈는 편의 시장을 따르므로, 다른 시장 시리즈는 id로 직접 와도 존재를 드러내지 않는다(콘텐츠 상세와 같은 규칙).
   * 전 편이 회수된 시리즈도 같은 404다 — 보여 줄 편이 없다.
   */
  async getVisibleForUser(
    seriesId: string,
    now: Date,
    market: UserMarket,
    manager?: EntityManager,
  ): Promise<VisibleSeries> {
    const series = await this.seriesRepository.findById(seriesId, manager);
    const episodes = series
      ? await this.contentRepository.findVisibleBySeriesId(
          seriesId,
          now,
          market,
          manager,
        )
      : [];

    if (!series || episodes.length === 0) {
      throw seriesNotFound();
    }

    return { series, episodes };
  }
}

/**
 * 시리즈 표지(KAN-234) — 올린 표지(`series.cover_url`)가 있으면 그것, 없으면 노출 중인 가장 앞 편의 썸네일이다
 * (종전 규칙 · 결정 2026-10-09). 탐색 시리즈 카드와 시리즈 화면이 같은 규칙을 쓰도록 한 곳에 둔다.
 * 빈 문자열은 없는 것으로 본다 — 저장소가 URL을 못 준 경우(`stored.url ?? ''`)에 빈 표지가 내려가지 않게
 */
export function resolveSeriesCover(
  series: Pick<Series, 'coverUrl'>,
  firstEpisodeThumbnailUrl: string,
): string {
  return series.coverUrl || firstEpisodeThumbnailUrl;
}

export function toSeriesRef(
  series: Pick<Series, 'id' | 'title' | 'totalEpisodes'>,
  episodeNo: number,
): ContentSeriesRef {
  return {
    id: series.id,
    title: series.title,
    episodeNo,
    totalEpisodes: series.totalEpisodes,
  };
}

/** 총 편수 하한 — 발행 중인 가장 큰 편 번호보다 작으면 400(`details.field = "total_episodes"`) */
export function assertTotalNotBelowPublished(
  totalEpisodes: number,
  maxPublishedEpisodeNo: number | null,
): void {
  if (maxPublishedEpisodeNo !== null && totalEpisodes < maxPublishedEpisodeNo) {
    throw validationFailed(
      'total_episodes',
      `이미 ${maxPublishedEpisodeNo}화까지 발행돼 그보다 작게 줄일 수 없어요`,
    );
  }
}

function validationFailed(field: string, message: string): BusinessException {
  return new BusinessException({
    status: HttpStatus.BAD_REQUEST,
    errorCode: ErrorCode.VALIDATION_FAILED,
    message,
    details: { field },
  });
}

function seriesNotFound(): BusinessNotFoundException {
  return new BusinessNotFoundException({
    errorCode: ErrorCode.NOT_FOUND,
    message: '시리즈를 찾을 수 없어요',
  });
}
