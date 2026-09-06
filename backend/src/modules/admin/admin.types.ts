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

// --- 서버 자원·DB 부하 스냅샷 (admin-system-stats.service.ts) ---

export interface HostStats {
  loadOne: number;
  loadFive: number;
  loadFifteen: number;
  cpuCount: number;
  /** /proc/stat 구간 샘플 — 못 읽는 환경(비 Linux)이면 null */
  cpuUsedPercent: number | null;
  memTotalBytes: number;
  memAvailableBytes: number;
  uptimeSec: number;
}

export interface DbConnectionStats {
  total: number;
  active: number;
  idle: number;
  idleInTransaction: number;
  waiting: number;
  longestActiveSec: number;
  max: number;
}

export interface SlowQueryEntry {
  pid: number;
  state: string;
  durationSec: number;
  /** 길이 제한된 쿼리 텍스트 — 바인딩 파라미터($1)라 원문 데이터는 없다 */
  query: string;
}

export interface DbStats {
  connections: DbConnectionStats;
  slowQueries: SlowQueryEntry[];
  /** 통계 누적 기준 buffer cache 적중률. 집계 전(블록 0)이면 null */
  cacheHitRatio: number | null;
  xactCommit: number;
  xactRollback: number;
  deadlocks: number;
  sizeBytes: number;
}

export interface SystemStats {
  host: HostStats;
  db: DbStats;
  measuredAt: Date;
}
