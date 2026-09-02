import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';

/** 업로드된 파일 — multer 버퍼에서 필요한 것만 */
export interface UploadedFileInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  size: number;
}

export interface SourceInput {
  title: string;
  author: string | null;
  url: string | null;
}

/** admin.md 3.1 — 업로드 입력. DTO(HTTP)와 분리된 Service 입력이다(convention.md 3.2) */
export interface UploadContentCommand {
  actorUserId: string;
  title: string;
  description: string;
  origin: ContentOrigin;
  authorName: string | null;
  sourceName: string;
  sourceUrl: string | null;
  partnerId: string | null;
  licenseExpiresAt: Date | null;
  seriesId: string | null;
  episodeNo: number | null;
  totalEpisodes: number | null;
  topicIds: string[];
  sources: SourceInput[];
  reviewConfirmed: boolean;
  audio: UploadedFileInput;
  thumbnail: UploadedFileInput;
}

export interface AdminContentView {
  content: Content;
  topics: { topicId: string; name: string }[];
}

export interface AdminContentPage {
  items: AdminContentView[];
  total: number;
}

export interface AdminContentListQuery {
  status?: ContentStatus;
  offset: number;
  limit: number;
}

export interface AdminTopicView {
  topic: Topic;
  contentCount: number;
}

/** 저장된 파일의 위치. `key`는 삭제용, `url`은 썸네일처럼 공개 경로가 있을 때만 */
export interface StoredObject {
  key: string;
  url: string | null;
}
