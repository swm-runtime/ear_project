import { AdminContentView } from '../admin.types';

export class AdminContentTopicDto {
  readonly topic_id: string;
  readonly name: string;
}

/** admin.md 5장 콘텐츠 목록·업로드 성공 응답의 한 항목. `audio_path`는 싣지 않는다(domain.md 5.1) */
export class AdminContentItemDto {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly origin: string;
  readonly status: string;
  readonly author_name: string | null;
  readonly source_name: string;
  readonly source_url: string | null;
  readonly partner_id: string | null;
  readonly series_id: string | null;
  readonly episode_no: number | null;
  readonly total_episodes: number | null;
  readonly duration_sec: number;
  readonly thumbnail_url: string;
  readonly content_version: number;
  readonly license_expires_at: string | null;
  readonly published_at: string;
  readonly withdrawn_at: string | null;
  readonly topics: AdminContentTopicDto[];
  /**
   * 마지막으로 적용된 추천 메타 파일의 형식 버전과 시각(admin-api.md 8장). null이면 메타를 받은 적이
   * 없다. 현재 형식(`CURRENT_ENRICHMENT_SCHEMA_VERSION`)보다 낮으면 구형 메타 — 다시 뽑을 대상이다
   */
  readonly enrichment_schema_version: number | null;
  readonly enriched_at: string | null;
  /** 요청에 `enrichment_file`이 있었을 때만 — 거부여도 콘텐츠 처리 자체는 성공이다(admin.md 3.1) */
  readonly enrichment_applied?: boolean;
  /** 거부됐을 때만 — 콘솔이 그대로 노출하는 사유 */
  readonly enrichment_rejected_reason?: string;

  static from(view: AdminContentView): AdminContentItemDto {
    const { content, topics } = view;
    return {
      id: content.id,
      title: content.title,
      description: content.description,
      origin: content.origin,
      status: content.status,
      author_name: content.authorName,
      source_name: content.sourceName,
      source_url: content.sourceUrl,
      partner_id: content.partnerId,
      series_id: content.seriesId,
      episode_no: content.episodeNo,
      total_episodes: content.totalEpisodes,
      duration_sec: content.durationSec,
      thumbnail_url: content.thumbnailUrl,
      content_version: content.contentVersion,
      license_expires_at: content.licenseExpiresAt?.toISOString() ?? null,
      published_at: content.publishedAt.toISOString(),
      withdrawn_at: content.withdrawnAt?.toISOString() ?? null,
      topics: topics.map((topic) => ({
        topic_id: topic.topicId,
        name: topic.name,
      })),
      enrichment_schema_version: content.enrichmentSchemaVersion,
      enriched_at: content.enrichedAt?.toISOString() ?? null,
      ...(view.enrichment && {
        enrichment_applied: view.enrichment.applied,
        ...(view.enrichment.rejectedReason !== null && {
          enrichment_rejected_reason: view.enrichment.rejectedReason,
        }),
      }),
    };
  }
}
