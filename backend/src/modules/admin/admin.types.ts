import { ContentOrigin, ContentStatus } from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';

/** 업로드된 파일 — multer 버퍼에서 필요한 것만 */
/**
 * 업로드 파일은 **디스크 임시 경로**로 넘긴다 — 버퍼로 들고 다니면 200MB 오디오가 요청당
 * 수백 MB 램(길이 추출 + S3 전송이 동시에 보유)이 된다(`tickets/backend/.../admin-upload-disk-storage.md`).
 * 컨트롤러가 요청 종료 시 임시 파일을 지운다 — 소비자는 경로를 저장하거나 넘겨두지 않는다.
 */
export interface UploadedFileInput {
  path: string;
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
  /** 압축 음질(`compressed`) — 필수 */
  audio: UploadedFileInput;
  /** 고음질(`aac`) · 무손실(`lossless`) — 선택(admin-api.md 4.6, KAN-141). 길이가 `audio`와 ±1초 안이어야 한다 */
  audioAac: UploadedFileInput | null;
  audioLossless: UploadedFileInput | null;
  thumbnail: UploadedFileInput;
  /** 추천 메타 파일(enrichment.json) — 선택. 검증 실패는 파일만 거부한다(admin.md 3.1) */
  enrichment: UploadedFileInput | null;
  /** 대본 세그먼트 파일(`script_file`) — 선택. 검증 실패는 파일만 거부한다(KAN-71) */
  script: UploadedFileInput | null;
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
  /** `audio`와 함께만 받는다 — 오디오를 바꾸는 재발행은 3종을 한 세트로 본다(admin-api.md 4.10) */
  audioAac: UploadedFileInput | null;
  audioLossless: UploadedFileInput | null;
  thumbnail: UploadedFileInput | null;
  /**
   * 추천 메타 파일 — 파트로 인정되므로 **단독 전송을 허용**한다. 단독이면 버전을 올리지
   * 않고 메타만 반영한다(소급 부여 경로 — `metadata-pipeline-after-script-quality.md` 범위 4).
   */
  enrichment: UploadedFileInput | null;
  /**
   * 대본 세그먼트 파일 — 파트로 인정되며 단독 전송도 허용한다. 단독(또는 추천 메타와만 함께)이면
   * 버전을 올리지 않는다 — 오디오가 그대로면 시각도 그대로라 재생 위치를 폐기할 이유가 없다(KAN-71).
   */
  script: UploadedFileInput | null;
}

/** 추천 메타 파일의 처리 결과 — 요청에 파일이 있었을 때만 응답에 실린다 */
export interface EnrichmentOutcome {
  applied: boolean;
  /** 거부됐을 때만 — 콘솔이 그대로 노출하는 운영자용 문구 */
  rejectedReason: string | null;
}

/** 대본 파일의 처리 결과 — 요청에 파일이 있었을 때만 응답에 실린다(추천 메타와 같은 규칙) */
export interface ScriptOutcome {
  applied: boolean;
  rejectedReason: string | null;
}

export interface AdminContentView {
  content: Content;
  topics: { topicId: string; name: string }[];
  /** 대본 적재 여부 — 콘솔이 목록에서 "자막 있음"을 표시한다(KAN-71) */
  hasScript: boolean;
  enrichment?: EnrichmentOutcome;
  script?: ScriptOutcome;
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
  /** 연결 행 전체 — 삭제 판정 기준(회수·만료 포함) */
  contentCount: number;
  /** 노출 가능한 콘텐츠만 — 노출 켜기 판정 기준(admin.md 4.5, KAN-58) */
  visibleContentCount: number;
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

// ── 서비스 지표 요약 (admin-api.md 4.22 — 로그 콘솔 "서비스 지표" 탭) ──
// 전부 집계값과 `user_id`뿐이다 — 이름·이메일은 어떤 항목에도 싣지 않는다(루트 CLAUDE.md 개인정보 원칙).

export interface InsightsUserTotals {
  /** 현재 계정 수 + 탈퇴 기록 수 — 탈퇴는 행을 지우므로(domain.md 12.3) 둘을 더해야 "가입한 적 있는 사람"이 된다 */
  totalSignups: number;
  /** 현재 계정 수(`users` 행 수 — 탈퇴 행은 지워져 없다) */
  current: number;
  withdrawals: number;
  onboardingCompleted: number;
  /** 가입 체험 진행 중(`trial_ends_at > now`) */
  trialActive: number;
  /** `users.tier` 캐시 기준 분포 */
  tiers: { light: number; daily: number; pro: number };
  /** `tiers` 중 초대 코드 이벤트로 그 티어인 계정 수(같은 티어 이상 결제 중이면 결제로 센다) */
  tierEvents: { daily: number; pro: number };
  /** 실결제 구독이 유효한 사용자 수(`subscriptions` active·grace·cancelled(해지 예약, 만료일까지 유효) · production · 미만료) */
  paidActive: number;
  /** 재생을 한 번이라도 한 사용자 수 — 활성화(activation) */
  activated: number;
  /**
   * 최근 1·7·30일 안에 **앱을 쓴** 사용자 수(DAU·WAU·MAU) — `sessions.issued_at` 기준. 액세스 토큰이 30분짜리라
   * 앱을 열면 거의 매번 토큰 갱신(세션 행 신규 발급)이 일어나, 서버가 가진 신호 중 "앱 실행"에 가장 가깝다.
   * 30분 안의 재실행은 잡히지 않고, 세션 행 보존이 30일이라 30일 창이 상한이다
   */
  active1d: number;
  active7d: number;
  active30d: number;
  /** 최근 1·7·30일 안에 **재생**한 사용자 수 — 활성 사용자 중 청취까지 간 사람 */
  listeners1d: number;
  listeners7d: number;
  listeners30d: number;
  byProvider: { provider: string; count: number }[];
}

export interface InsightsListeningTotals {
  listenSec: number;
  plays: number;
  /** 완청 신호 수(`user_signals.action = complete`) — 삭제된 라이브러리 항목의 완청도 남는다 */
  completes: number;
  listeners: number;
  /** 담기 수(`library_items.source = save`, 삭제분 포함 — 담은 사실이 지표다) */
  saves: number;
}

/** 일별 추이 한 칸 — `date`는 KST 달력일(검색 로그 요약과 같은 기준) */
export interface InsightsDaily {
  date: string;
  signups: number;
  withdrawals: number;
  plays: number;
  listeners: number;
  listenSec: number;
  completes: number;
}

export interface InsightsHourly {
  /** KST 0~23시 */
  hour: number;
  plays: number;
  listenSec: number;
}

export interface InsightsTopUser {
  userId: string;
  listenSec: number;
  plays: number;
  completes: number;
  tier: string;
  signedUpAt: Date;
  lastPlayedAt: Date;
}

export interface InsightsTopContent {
  contentId: string;
  title: string;
  durationSec: number;
  listenSec: number;
  plays: number;
  listeners: number;
  completes: number;
  saves: number;
}

export interface InsightsWithdrawalReason {
  /** `withdrawal_logs.reason_code` — null 은 사유 미선택 */
  reasonCode: string | null;
  count: number;
}

export interface InsightsRetention {
  /** 가입 뒤 일수(1·7·30) */
  day: number;
  /** 가입한 지 `day`일이 지난 현재 계정 수 — 기회가 있었던 사람만 */
  cohortSize: number;
  /** 그중 가입 `day`일 뒤에도 앱을 쓴(토큰 갱신 또는 재생) 사람 수 — 언바운디드(그날 이후 아무 때나) */
  returned: number;
}

export interface InsightsDailyRows {
  signups: { date: string; count: number }[];
  withdrawals: { date: string; count: number }[];
  plays: {
    date: string;
    plays: number;
    listeners: number;
    listenSec: number;
  }[];
  completes: { date: string; count: number }[];
}

export interface InsightsSummary {
  since: Date;
  generatedAt: Date;
  users: InsightsUserTotals;
  listening: {
    allTime: InsightsListeningTotals;
    window: InsightsListeningTotals;
  };
  daily: InsightsDaily[];
  hourly: InsightsHourly[];
  topUsers: InsightsTopUser[];
  topContents: InsightsTopContent[];
  withdrawalReasons: InsightsWithdrawalReason[];
  retention: InsightsRetention[];
}
