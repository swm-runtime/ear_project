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
    };
  }
}
