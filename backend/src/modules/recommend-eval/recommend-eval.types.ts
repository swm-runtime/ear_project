/**
 * 추천 평가 스냅샷 — `GET /admin/recommend-eval/snapshot`의 응답이자 오프라인 평가기의 입력 파일 형식이다
 * (`docs/backend/recommendation-evaluation.md` 3장). **파일 형식이라 snake_case다**(API JSON 규약).
 *
 * 사용자는 익명 키(`u001`…)로만 싣는다 — 이메일·닉네임·`users.id`는 담지 않는다. 그래도 행동 이력이라
 * **저장소에 커밋하지 않는다**(`backend/eval/`은 gitignore).
 */
export const EVAL_SNAPSHOT_SCHEMA_VERSION = 1;

export interface EvalSnapshotPlan {
  tier: string;
  daily_drip_count: number;
  daily_discovery_count: number;
}

export interface EvalSnapshotTopic {
  id: string;
  name: string;
  is_visible: boolean;
}

export interface EvalSnapshotContent {
  id: string;
  title: string;
  author_name: string | null;
  source_name: string;
  duration_sec: number;
  published_at: string;
  difficulty: string | null;
  format: string | null;
  is_evergreen: boolean | null;
  keywords: string[] | null;
  target_audiences: unknown[] | null;
  series_id: string | null;
  episode_no: number | null;
  status: string;
  license_expires_at: string | null;
  topic_ids: string[];
  play_count: number;
  complete_count: number;
  /** 현재 모델·현재 버전의 대본 임베딩. 없으면 null(임베딩 축 제외) */
  embedding: number[] | null;
}

export interface EvalSnapshotInterest {
  topic_id: string;
  source: string;
  is_active: boolean;
  is_user_removed: boolean;
  updated_at: string;
}

export interface EvalSnapshotSignal {
  content_id: string;
  action: string;
  created_at: string;
}

export interface EvalSnapshotLibraryItem {
  content_id: string;
  source: string;
  status: string;
  added_at: string;
  completed_at: string | null;
  deleted_at: string | null;
}

export interface EvalSnapshotUser {
  key: string;
  tier: string;
  job_category: string | null;
  years_of_experience: number | null;
  auto_expand_enabled: boolean;
  interests: EvalSnapshotInterest[];
  signals: EvalSnapshotSignal[];
  library: EvalSnapshotLibraryItem[];
  /** `drip_excluded_contents` — 재적립 영구 제외 */
  excluded: { content_id: string; created_at: string }[];
}

export interface EvalSnapshot {
  schema_version: number;
  exported_at: string;
  environment: string;
  embedding_model: string;
  plans: EvalSnapshotPlan[];
  topics: EvalSnapshotTopic[];
  contents: EvalSnapshotContent[];
  users: EvalSnapshotUser[];
}

// ── 평가 리포트 ─────────────────────────────────────────────────────────────

/** 순위 지표 한 벌 — 같은 후보 집합 위에서 방법끼리 비교한다 */
export interface RankingMetrics {
  /** K → 적중률(0~1) */
  hitAt: Record<string, number>;
  /** 평균 역순위. 후보에 없던 정답은 0으로 센다 */
  mrr: number;
}

export interface BacktestReport {
  /** 평가 사례 수 — 사용자가 **스스로 고르고 완청한** 콘텐츠(드립으로 받은 것은 선택 편향이라 뺀다) */
  cases: number;
  users: number;
  /** 정답이 정규 후보(관심 주제 안)에 들어 있던 사례의 비율 — 나머지는 관심 밖 주제라 애초에 추천될 수 없었다 */
  reachableShare: number;
  model: RankingMetrics;
  /** 같은 후보를 재생 수 순으로 세웠을 때 — 개인화가 인기순보다 나은지의 기준선 */
  popularity: RankingMetrics;
  /** 무작위 기대값 */
  random: RankingMetrics;
}

export interface ListMetrics {
  /** 편성 계산이 나온 사용자(또는 사용자·일) 수 */
  plans: number;
  /** 정규 편성분이 목표 편수에 못 미친 비율 */
  exhaustionRate: number;
  /** 편성분 안의 서로 다른 주제 수 / 편수 — 1에 가까울수록 하루 편성이 주제로 흩어진다 */
  topicDiversity: number;
  /** 편성분 쌍의 평균 (1 − 코사인 유사도) — 임베딩 있는 쌍만. 없으면 null */
  intraListDistance: number | null;
  /** 발행 14일 이내 콘텐츠의 비율 */
  freshShare: number;
  /** 아직 아무에게도 편성된 적 없는 콘텐츠의 비율 */
  zeroExposureShare: number;
  /** 편성된 서로 다른 콘텐츠 수 / 발행 카탈로그 크기 */
  catalogCoverage: number;
  /** 사용자 쌍의 편성분 자카드 겹침 평균 — 낮을수록 사람마다 다른 것이 간다 */
  userOverlap: number | null;
  /** 자동 확장 판정 분포 */
  autoExpand: Record<string, number>;
}

export interface PersonaReport {
  name: string;
  description: string;
  /** 카탈로그에 필요한 재료(주제 수·시리즈)가 없어 건너뛰었으면 사유 */
  skipped: string | null;
  days: number;
  picks: number;
  /** 정규 편성분 중 이 페르소나가 좋아하는 주제에 걸린 비율 — 합성 사용자의 적중률 */
  likedTopicShare: number | null;
  /** 정규 편성이 처음 목표 편수에 못 미친 날(1부터). 끝까지 채웠으면 null */
  exhaustedOnDay: number | null;
  /** 자동 슬롯이 처음 붙은 날. 없으면 null */
  autoExpandOnDay: number | null;
  checks: InvariantResult[];
}

export interface InvariantResult {
  name: string;
  passed: boolean;
  /** 위반 건수와 첫 사례 — 통과면 비어 있다 */
  detail: string;
  /**
   * `hard`(기본) — 어기면 평가 실패. `soft` — 명세의 기대 동작이지만 현 코드가 아직 못 미치는 것으로 **알고 있는**
   * 항목: 경고로 싣고 실패로 치지 않는다. 고쳐서 통과하면 `hard`로 올린다(`docs/backend/recommendation-evaluation.md` 5.2)
   */
  severity?: 'hard' | 'soft';
}

export interface EvalVerdict {
  passed: boolean;
  failures: string[];
  warnings: string[];
}

export interface EvalReport {
  generatedAt: string;
  gitSha: string | null;
  snapshot: {
    exportedAt: string;
    environment: string;
    contents: number;
    topics: number;
    users: number;
  };
  options: { simulationDays: number; autoExpandFeature: boolean };
  /** 실사용자 백테스트 — 스냅샷에 사용자 행동이 없으면(합성 카탈로그) null */
  backtest: BacktestReport | null;
  /** 실사용자의 "지금 배치를 돌리면" 편성분 지표. 사용자가 없으면 null */
  lists: ListMetrics | null;
  /** 페르소나 N일 시뮬레이션 전체의 편성분 지표 */
  simulation: ListMetrics;
  personas: PersonaReport[];
  invariants: InvariantResult[];
  verdict: EvalVerdict;
}
