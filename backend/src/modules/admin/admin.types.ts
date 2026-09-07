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
  /** 추천 메타 파일(enrichment.json) — 선택. 검증 실패는 파일만 거부한다(admin.md 3.1) */
  enrichment: UploadedFileInput | null;
}

/**
 * admin-api.md 4.10 재발행 — **모든 파트가 선택**이되 최소 하나는 있어야 한다.
 * `undefined`는 "안 바꾼다"이고, 목록(`topicIds` · `sources`)은 넘기면 전체 교체다.
 */
export interface RepublishContentCommand {
  actorUserId: string;
  contentId: string;
  title?: string;
  description?: string;
  sourceName?: string;
  topicIds?: string[];
  sources?: SourceInput[];
  audio: UploadedFileInput | null;
  thumbnail: UploadedFileInput | null;
  /**
   * 추천 메타 파일 — 파트로 인정되므로 **단독 전송을 허용**한다. 단독이면 버전을 올리지
   * 않고 메타만 반영한다(소급 부여 경로 — `metadata-pipeline-after-script-quality.md` 범위 4).
   */
  enrichment: UploadedFileInput | null;
}

/** 추천 메타 파일의 처리 결과 — 요청에 파일이 있었을 때만 응답에 실린다 */
export interface EnrichmentOutcome {
  applied: boolean;
  /** 거부됐을 때만 — 콘솔이 그대로 노출하는 운영자용 문구 */
  rejectedReason: string | null;
}

export interface AdminContentView {
  content: Content;
  topics: { topicId: string; name: string }[];
  enrichment?: EnrichmentOutcome;
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
