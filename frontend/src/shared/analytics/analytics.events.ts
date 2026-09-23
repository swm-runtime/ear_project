/**
 * GA4 이벤트 사전 — `docs/features/analytics.md` 3장과 1:1. 이름·파라미터를 타입으로 고정해
 * 오타를 컴파일에서 잡는다. **여기 없는 이벤트는 보낼 수 없다** — 추가하려면 문서부터 고친다.
 *
 * 규칙: 이름은 snake_case 40자 이내, 파라미터 25개 이내, 값은 문자열·숫자·불리언만.
 * **사용자 식별 정보·제목 텍스트·검색어 원문은 넣지 않는다**(7장).
 */

type ProgressPercent = 25 | 50 | 75;
type OnboardingStep = 'topic' | 'career' | 'pick' | 'tutorial' | 'notification';
type StepAction = 'next' | 'skip';
type PermissionResult = 'granted' | 'denied';
type PushTarget = 'library' | 'content';
type Period = 'week' | 'month' | 'all';
type AuthMethod = 'google' | 'kakao' | 'naver' | 'apple' | 'email';
type ContentOrigin = 'ai_generated' | 'partner';
/**
 * shared 는 features 를 import 하지 않는다(architecture.md 4.3) — 진입점 유니온은 원본
 * (player.types 의 PlayEntryPoint · content-detail.types 의 ContentDetailEntryPoint)과 같은 값을
 * 여기 다시 적는다. 원본이 바뀌면 호출부 타입 오류로 드러난다.
 */
type PlayEntry = 'library' | 'explore' | 'miniplayer' | 'push' | 'player' | 'share';
type DetailEntry = 'library' | 'explore' | 'player' | 'share';

export interface AnalyticsEvents {
  // 온보딩
  onboarding_step: { step: OnboardingStep; action: StepAction };
  onboarding_complete: {
    topic_count: number;
    career_filled: boolean;
    picked_count: number;
    elapsed_sec: number;
  };
  // 알림
  push_permission: { result: PermissionResult; source: 'onboarding' | 'settings' };
  push_open: { target: PushTarget; app_state: 'background' | 'killed' };
  push_foreground_banner: { action: 'view' | 'tap' };
  // 드립
  drip_arrival_view: { count: number; hours_since_arrival: number };
  drip_play: { content_id: string; slot: 'regular' | 'discovery'; hours_since_arrival: number };
  // 재생
  play_start: {
    content_id: string;
    entry: PlayEntry;
    origin: ContentOrigin;
    resumed: boolean;
  };
  play_progress: { content_id: string; percent: ProgressPercent };
  play_complete: { content_id: string; listen_sec: number };
  play_abandon: {
    content_id: string;
    percent: number;
    reason: 'pause_timeout' | 'switch' | 'background';
  };
  play_rate_change: { from: number; to: number };
  play_limit_hit: { remaining: 0 };
  paywall_view: { entry: PlayEntry };
  play_confirm: { action: 'confirm' | 'cancel' | 'suppress_today'; remaining: number };
  // 탐색·검색
  explore_period_change: { period: Period };
  search: { query_length: number; result_count: number };
  content_save: { content_id: string; entry: string };
  content_remove: { content_id: string; entry: string; undone: boolean };
  content_detail_view: { content_id: string; entry: DetailEntry };
  source_link_click: { content_id: string };
  // 공유
  share: { content_id: string; entry: string };
  share_receive: { content_id: string; installed: boolean };
  // 계정·설정
  login: { method: AuthMethod };
  sign_up: { method: AuthMethod };
  logout: Record<string, never>;
  withdrawal: { reason: string };
  settings_toggle: { key: 'drip_notification' | 'marketing_consent'; value: boolean };
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** 사용자 속성(3.2) — 로그인·티어 변경·온보딩 완료·권한 결과에서 갱신 */
export interface AnalyticsUserProperties {
  tier: string;
  topic_count: number;
  push_permission: 'granted' | 'denied' | 'undetermined';
}
