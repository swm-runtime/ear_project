import {
  ContentLanguage,
  ContentLengthProfile,
  ContentOrigin,
  ContentStatus,
} from '@/modules/content/content.enum';
import { Content } from '@/modules/content/entities/content.entity';
import { Topic } from '@/modules/interest/entities/topic.entity';
import { UserMarket } from '@/modules/user/user.enum';

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
  /** 시장·언어(`global-api.md` 4.9). 컨트롤러가 기본값(kr·ko)을 채워 넘긴다 */
  market: UserMarket;
  language: ContentLanguage;
  /**
   * 길이 프로필(KAN-298). null = 보내지 않음 — 시리즈 편이면 시리즈의 값, 단편이면 `standard`다
   */
  lengthProfile: ContentLengthProfile | null;
  /** 짧은 판의 원본 콘텐츠 — short 단편이면 필수, 짧은 시리즈 편이면 선택, standard면 없어야 한다 */
  variantOfContentId: string | null;
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
  /**
   * `lossless`면 **무손실 파일만 교체**한다(KAN-264) — 같은 마스터에서 다시 만든 FLAC(시크테이블 추가 등)을 갈아끼우는
   * 경로라 버전을 올리지 않고 재생 위치도 지우지 않는다. 이때 `audioLossless` 말고 다른 파트는 받지 않는다
   */
  renditionOnly: 'lossless' | null;
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
  /**
   * 스코어링에 쓰이는 임베딩이 있는가 — 현재 모델이고 `content_version`이 일치하는 행. false면 임베딩이 없거나
   * 오디오 재발행 뒤 미갱신이라 추천의 임베딩 축에서 빠진다. 메타 형식 버전(`enrichment_schema_version`)과는
   * 별개다 — 형식은 최신인데 임베딩만 낡을 수 있다(2026-10-13 운영 56편 전부)
   */
  hasCurrentEmbedding: boolean;
  enrichment?: EnrichmentOutcome;
  script?: ScriptOutcome;
}

export interface AdminContentPage {
  items: AdminContentView[];
  total: number;
}

export interface AdminContentListQuery {
  status?: ContentStatus;
  /** 시장 필터(`global-api.md` 4.10). 없으면 전 시장 */
  market?: UserMarket;
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
  /**
   * 실결제를 **한 번이라도 한** 현재 계정 수(`subscriptions` production · 환불 아님 — 해지·만료 포함, 2026-10-26). 유료 전환
   * 성공지표의 분자다. 탈퇴자의 결제 이력은 법정 보존용 아카이브에만 있어 지표에 쓰지 않는다(목적 외 이용) — 분모도 현재 가입자다
   */
  paidEver: number;
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
  /**
   * 현재 계정을 기기 플랫폼으로 나눈 수(2026-10-29) — 사용자마다 가장 최근에 갱신된 `device_tokens` 행의 `platform`.
   * 기기 행이 없으면 `unknown`(앱에서 토큰 등록 전·웹 가입 등). 탈퇴자는 기기 행이 지워져 셀 수 없다
   */
  byPlatform: { platform: string; count: number }[];
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
  /**
   * 그날 접속자(그날 `sessions.issued_at`이 있는 사용자 수). 지난날은 저장 표(`daily_active_users`), 오늘과 표에 없는 최근 날은
   * 세션에서 바로 센다. 원천이 지워져 셀 수 없는 날(첫 신뢰 날짜 앞)은 `null`
   */
  activeUsers: number | null;
}

/**
 * 요일별 평균(KST) — 창 안의 **온전한 하루**만 센다. 첫날(`since`가 걸친 날)은 청취가 그 시각 뒤만 잡혀 있고, 오늘은 끝나지
 * 않아 둘 다 뺀다. 평균은 그 요일의 실제 날짜 수로 나눈다.
 */
export interface InsightsWeekday {
  /** ISO 요일 — 1 = 월 … 7 = 일 */
  weekday: number;
  label: string;
  /** 창 안에 있는 그 요일의 온전한 날 수 */
  days: number;
  /** 그중 접속자 기록이 있는 날 수 — 첫 신뢰 날짜 앞은 빠진다 */
  activeDays: number;
  /** `activeDays`로 나눈 평균 접속자. 0일이면 null */
  avgActiveUsers: number | null;
  /** `days`로 나눈 평균 청취자. 0일이면 null */
  avgListeners: number | null;
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

/** 알림 종류 하나의 반응 — `type`은 `drip_arrival` 또는 `retention.<규칙>.<변형>` */
export interface InsightsPushReaction {
  type: string;
  sent: number;
  /** 보낸 뒤 2시간 안에 재생한 건 */
  reacted: number;
}

export interface InsightsRetention {
  /** 가입 뒤 일수(1·7·30) */
  day: number;
  /** 가입한 지 `day`일이 지난 현재 계정 수 — 기회가 있었던 사람만 */
  cohortSize: number;
  /** 그중 가입 `day`일 뒤에도 앱을 쓴(토큰 갱신 또는 재생) 사람 수 — 언바운디드(그날 이후 아무 때나) */
  returned: number;
}

/** 코호트 리텐션 집계 원본(Repository) — 묶음 시작일(`YYYY-MM-DD`)별 가입자 수와 구간별 돌아온 사람 수. 빈 묶음·구간은 행이 없다 */
export interface InsightsCohortCounts {
  sizes: { start: string; users: number }[];
  hits: { start: string; offset: number; returned: number }[];
}

/** 코호트 표의 한 칸 — 끝나지 않은 구간은 칸 자체가 `null`이다 */
export interface InsightsCohortCell {
  /** 그 구간에 앱을 쓴(접속 또는 재생) 사람 수 */
  returned: number;
  /**
   * 구간이 접속 기록을 믿을 수 있는 첫 날(`InsightsCohortTable.reliableSince`)보다 앞에서 시작한다 — 그 앞은 세션이 지워져 **재생만** 잡혀
   * 실제보다 낮게 나온다
   */
  partial: boolean;
}

export interface InsightsCohortRow {
  /** 묶음 시작일(KST) — 일별은 가입일, 주별은 가입 주의 월요일 */
  start: string;
  /** 그 묶음의 현재 계정 수 */
  users: number;
  /** `offsets` 순서와 같다 */
  cells: (InsightsCohortCell | null)[];
}

export interface InsightsCohortTable {
  /** 구간 길이(일) — 1 = 일별(D), 7 = 주별(W) */
  span: number;
  /** 가입 뒤 몇 번째 구간을 보는가 — 일별 `[1, 7]`(D1·D7), 주별 `[1, 2, 3, 4]`(W1~W4) */
  offsets: number[];
  /** 접속 기록을 믿을 수 있는 첫 날(KST) — 이보다 앞에서 시작하는 칸이 `partial` */
  reliableSince: string;
  /** 최근 묶음 먼저 */
  rows: InsightsCohortRow[];
}

/**
 * 주제별 수요·공급 — 관심 사용자 수 대비 아직 줄 수 있는 콘텐츠가 얼마나 남았는가(2026-10-13 추천 검증).
 * 제작 우선순위의 근거다: 관심은 많은데 남은 편수가 적은 주제부터 만든다.
 */
export interface InsightsTopicSupply {
  topicId: string;
  name: string;
  isVisible: boolean;
  /** 노출 중(발행·라이선스 유효)인 콘텐츠 수 */
  published: number;
  /** 그중 창(`since`) 안에 발행된 수 */
  publishedInWindow: number;
  /** 이 주제를 활성 관심 주제로 둔 온보딩 완료 사용자 수 */
  interestedUsers: number;
  /** 관심 사용자별 "아직 받을 수 있는 편수"(라이브러리·드립 영구 제외에 없는 것)의 중앙값 */
  medianRemaining: number;
  /** 남은 편수 0편인 관심 사용자 수 — 이 주제로는 더 줄 것이 없다 */
  exhaustedUsers: number;
  /** 남은 편수 2편 이하인 관심 사용자 수 — 하루 정규 2편 기준 하루치 이하 */
  lowUsers: number;
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
  /** 저장 표(`daily_active_users`)의 날짜별 접속자(시장 합) */
  activeUsersStored: { date: string; count: number }[];
  /** 세션에서 바로 센 날짜별 접속자 — 오늘과, 최근 `INSIGHTS_LIVE_ACTIVE_DAYS` 안에서 표에 없는 날을 메운다 */
  activeUsersLive: { date: string; count: number }[];
}

/**
 * 시장별 집계(`global-api.md` 4.10, KAN-190) — 가입·활성·청취·결제를 시장마다 나눠 본다. PoC 성과를 읽으려면 어느 트랙이
 * 움직였는지가 보여야 한다. 전부 **현재 계정** 기준이다 — 탈퇴 기록(`withdrawal_logs`)에는 시장이 없다.
 */
export interface InsightsMarketTotals {
  market: UserMarket;
  /** 현재 계정 수 */
  users: number;
  /** 그중 창(`since`) 안에 가입한 수 */
  signupsInWindow: number;
  onboardingCompleted: number;
  /** 앱 사용(토큰 갱신) 기준 WAU — `users.active_7d`와 같은 정의 */
  active7d: number;
  /** 재생 기준 7일 — `users.listeners_7d`와 같은 정의 */
  listeners7d: number;
  /** 창 안 청취 시간·재생 수 — `listening.window`와 같은 정의 */
  listenSec: number;
  plays: number;
  /** 결제 중인 사용자 — `users.paid_active`와 같은 정의 */
  paidActive: number;
}

/**
 * 나라별 같은 지표(2026-10-29, 글로벌 탭 맨 위) — 나라는 기기 시간대(`users.timezone`)에서 추정한 ISO 3166-1 alpha-2
 * (`timezone-country.ts`). 시간대가 없으면 `unknown`, 표에 없는 시간대는 시간대 이름 그대로
 */
export type InsightsRegionTotals = Omit<InsightsMarketTotals, 'market'> & {
  region: string;
};

export interface InsightsSummary {
  /** 고른 시장 — null 이면 통합 */
  market: UserMarket | null;
  since: Date;
  generatedAt: Date;
  users: InsightsUserTotals;
  listening: {
    allTime: InsightsListeningTotals;
    window: InsightsListeningTotals;
  };
  daily: InsightsDaily[];
  /** 요일별 평균 — 월~일 7칸 */
  weekday: InsightsWeekday[];
  /** 접속자를 믿을 수 있는 첫 날(`YYYY-MM-DD`, KST) — 저장 표의 가장 이른 날과 세션으로 셀 수 있는 첫 날 중 이른 쪽 */
  activeUsersSince: string;
  hourly: InsightsHourly[];
  topUsers: InsightsTopUser[];
  topContents: InsightsTopContent[];
  /** 최근 24시간 인기 콘텐츠 — 그 창 안의 재생·완청·담기만, 청취자 수 순 */
  recentTopContents: InsightsTopContent[];
  /** `recentTopContents`의 창 시작 시각 */
  recentSince: Date;
  withdrawalReasons: InsightsWithdrawalReason[];
  /** 창 안에 보낸 알림의 종류별 반응(보낸 뒤 2시간 안 재생) — 드립 도착은 비교 기준선 */
  pushReactions: InsightsPushReaction[];
  retention: InsightsRetention[];
  /** 바운디드 N일 리텐션(정확히 가입 N일째 하루) — `retention`과 같은 일수 순서. 벤치마크와 비교하는 값(2026-10-26) */
  boundedRetention: InsightsRetention[];
  /** 코호트 리텐션 — 가입일·가입 주로 묶은 D1·D7 · W1~W4 */
  retentionCohorts: { daily: InsightsCohortTable; weekly: InsightsCohortTable };
  topicSupply: InsightsTopicSupply[];
  byMarket: InsightsMarketTotals[];
  /** 나라별 — 글로벌을 골랐을 때만 채운다(그 밖은 빈 배열). 가입자 많은 나라 먼저 */
  byRegion: InsightsRegionTotals[];
}

/** 초대 코드(프로모션) 묶음 하나의 지표(2026-10-28) — 집계값만, 개인 식별값 없음 */
export interface InsightsInviteCodeCohort {
  code: string;
  name: string;
  tier: string;
  grantDays: number | null;
  grantUntilDate: string | null;
  isActive: boolean;
  /** 지금까지 입력한 계정 수(탈퇴해도 줄지 않는다 — `invite_codes.redeemed_count`) */
  redeemed: number;
  /** 그중 지금 남은 계정 — 탈퇴하면 입력 기록이 함께 지워진다 */
  current: number;
  /** 지급 중인 계정 */
  activeGrants: number;
  /** 지급이 끝난 계정 */
  endedGrants: number;
  active7d: number;
  listeners7d: number;
  /** 창 안 청취 시간 합(초) */
  listenSec: number;
  /** 코드를 입력한 뒤 실결제를 시작한 계정(환불·시험 결제 제외) */
  paidAfterStart: number;
}

/** 코드를 입력한 적 없는 현재 계정 — 비교 기준선 */
export interface InsightsInviteCodeBaseline {
  current: number;
  active7d: number;
  listeners7d: number;
  listenSec: number;
  paidEver: number;
}

/* ───────────── 가입 퍼널 (`GET /admin/insights/funnel`, 2026-10-28) ───────────── */

/** 가입 주 묶음 퍼널 원본(Repository) — 사람 수만. 성숙 판정은 Service 가 한다 */
export interface InsightsFunnelCohortCounts {
  weekStart: string;
  signups: number;
  onboardingCompleted: number;
  firstPlay24h: number;
  firstPlayEver: number;
  firstComplete: number;
  w1Return: number;
  habit14d: number;
  paidEver: number;
}

/** 퍼널 단계 — 순서가 곧 퍼널 순서다(첫 재생 전체 `firstPlayEver`는 단계가 아니라 참고 값) */
export type InsightsFunnelStepKey =
  | 'signups'
  | 'onboarding_completed'
  | 'first_play_24h'
  | 'first_complete'
  | 'w1_return'
  | 'habit_14d'
  | 'paid_ever';

export interface InsightsFunnelCohort {
  weekStart: string;
  /** 가입 주가 아직 끝나지 않았다 — 가입자가 계속 는다 */
  inProgress: boolean;
  signups: number;
  onboardingCompleted: number;
  /** 묶음의 마지막 가입자까지 24시간이 지나지 않았으면 null */
  firstPlay24h: number | null;
  firstPlayEver: number;
  firstComplete: number;
  /** 묶음의 마지막 가입자의 가입 7~13일째(KST)가 다 지나지 않았으면 null */
  w1Return: number | null;
  /** W1 구간이 접속 기록을 믿을 수 있는 첫 날 앞에서 시작한다 — 재생만 잡혀 낮다 */
  w1Partial: boolean;
  /** 묶음의 마지막 가입자의 가입 뒤 14일이 지나지 않았으면 null */
  habit14d: number | null;
  paidEver: number;
}

export interface InsightsFunnelStep {
  key: InsightsFunnelStepKey;
  /** 이 단계를 판정할 수 있었던(성숙한) 묶음 수 */
  matureCohorts: number;
  /** 성숙한 묶음을 합쳐 `이 단계 / 앞 단계` — 첫 단계는 null */
  rate: number | null;
  /** 같은 성숙 묶음의 `이 단계 / 가입` — 첫 단계는 null */
  rateOfSignups: number | null;
  /** `1 - rate`(0 아래는 0) — 첫 단계·판정 묶음 없음은 null */
  drop: number | null;
}

export interface InsightsFunnel {
  market: UserMarket | null;
  weeks: number;
  generatedAt: Date;
  reliableSince: string;
  /** 최근 묶음 먼저 */
  cohorts: InsightsFunnelCohort[];
  steps: InsightsFunnelStep[];
  /** 가장 많이 새는 단계 — 판정할 단계가 없으면 null */
  largestDropStep: InsightsFunnelStepKey | null;
}

/* ───────────── 길이별 완청률 (`GET /admin/insights/completion-by-length`, 2026-10-28) ───────────── */

/** 편 하나의 원본(Repository) — 시작한 사람·완청한 사람 수(사용자 × 편 단위) */
export interface InsightsCompletionContentRow {
  contentId: string;
  title: string;
  durationSec: number;
  starters: number;
  completers: number;
}

export interface InsightsCompletionContentPoint extends InsightsCompletionContentRow {
  /** `completers / starters` — 시작한 사람이 적으면 흔들린다 */
  rawRate: number;
  /** 경험적 베이즈 축소값 — `(completers + k·p0) / (starters + k)` */
  shrunkRate: number;
}

/** 추세 방향 — 기울기 95% 구간이 1(변화 없음)을 넘지 않으면 down/up, 걸치면 flat */
export type InsightsCompletionTrendDirection = 'down' | 'up' | 'flat';

export interface InsightsCompletionTrend {
  /** `COMPLETION_LENGTH_SLOPE_STEP_MIN`분 길어질 때 완청 오즈의 배수와 95% 구간 */
  oddsRatioPerStep: number;
  oddsRatioLow: number;
  oddsRatioHigh: number;
  direction: InsightsCompletionTrendDirection;
  /** 과분산 보정 계수(피어슨 χ² / 자유도, 1 아래는 1) — 편끼리 주제·품질이 달라 생기는 흔들림만큼 구간을 넓힌다 */
  dispersion: number;
  /** 분 단위 예측 완청률과 95% 구간 */
  curve: { minute: number; rate: number; low: number; high: number }[];
}

export interface InsightsCompletionByLength {
  generatedAt: Date;
  /** 전체 완청률 p0 — 축소의 기준점 */
  overallRate: number | null;
  /** 축소 강도 k(가상의 시작자 수) — 편별 비율의 실제 퍼짐에서 추정한다 */
  priorStrength: number | null;
  starters: number;
  completers: number;
  contents: InsightsCompletionContentPoint[];
  /** 편이 적거나 길이가 다 같으면 null */
  trend: InsightsCompletionTrend | null;
}

/* ───────────── 시리즈 편별 완청·이탈 (`GET /admin/insights/series-episodes`, KAN-293, 2026-10-29) ───────────── */

/**
 * 편 하나의 원본(Repository) — (시리즈, 편 번호) 단위. 같은 편 번호에 콘텐츠 행이 여럿이면(철회 뒤 다시 올림) 사람을 합쳐 센다.
 * 사용자는 수로만 들어 있다.
 */
export interface InsightsSeriesEpisodeRow {
  seriesId: string;
  seriesTitle: string;
  totalEpisodes: number;
  episodeNo: number;
  /** 대표 콘텐츠 — 발행 중인 행, 없으면 가장 최근 행 */
  contentId: string;
  title: string;
  durationSec: number;
  market: string;
  status: string;
  /** 이 시리즈에서 이 편 다음으로 있는 편 번호 — 없으면 null(마지막 편) */
  nextEpisodeNo: number | null;
  starters: number;
  completers: number;
  /** 이 편을 시작한 사람 중 다음 편을 시작한 사람 */
  nextStartedOfStarters: number;
  /** 이 편을 완청한 사람 중 다음 편을 시작한 사람 */
  nextStartedOfCompleters: number;
}

export interface InsightsSeriesEpisode extends InsightsSeriesEpisodeRow {
  /** `completers / starters` — 시작자 0이면 null */
  completionRate: number | null;
  /** `nextStartedOfStarters / starters` — 다음 편이 없거나 시작자 0이면 null */
  nextRateOfStarters: number | null;
  /** `nextStartedOfCompleters / completers` — 다음 편이 없거나 완청자 0이면 null */
  nextRateOfCompleters: number | null;
}

export interface InsightsSeriesEpisodesSeries {
  seriesId: string;
  title: string;
  market: string;
  totalEpisodes: number;
  /** 가장 앞 편의 시작자 — 시리즈 정렬 기준 */
  firstEpisodeStarters: number;
  /** 편 번호 순 */
  episodes: InsightsSeriesEpisode[];
}

export interface InsightsSeriesEpisodes {
  generatedAt: Date;
  market: UserMarket | null;
  series: InsightsSeriesEpisodesSeries[];
}
