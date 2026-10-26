import { MessageLanguage } from '@/modules/user/user.enum';

import { RetentionRuleKey } from './retention-push.enum';
import { RetentionRuleDefinition } from './retention-push.types';

/**
 * 저녁 리텐션 알림의 **규칙 표**(`notification.md` 4.6, KAN-272). 문구·기준값을 바꾸는 곳은 여기 하나다.
 *
 * - **배열 순서가 우선순위다** — 한 사용자에게 여러 규칙이 성립하면 앞의 것을 보낸다(쿨다운에 걸린 것은 건너뛴다).
 * - 문구의 `{변수}`는 판정(`retention-push.policy.ts`)이 채운다. 변수 이름을 바꾸면 판정 쪽도 함께 바꾼다 —
 *   `retention-push.policy.spec.ts`가 모든 변형의 변수가 다 채워지는지 검사한다.
 * - **"(광고)" 머리말과 수신거부 안내는 여기에 쓰지 않는다** — 렌더러가 모든 문구에 붙인다(정보통신망법 50조, 빠뜨릴 수 없게).
 * - 숫자는 실제 집계만 쓴다. 최소 인원에 못 미치면 그 규칙은 성립하지 않는다(부풀린 숫자를 보내지 않는다).
 * - 변형을 추가·삭제하면 그 주의 배정이 바뀐다(해시 % 변형 수). 반응률을 비교 중이면 주가 바뀔 때 바꾼다.
 */
export const RETENTION_RULES: readonly RetentionRuleDefinition[] = [
  {
    key: RetentionRuleKey.WEEKLY_RANK_GAP,
    enabled: true,
    cooldownHours: 72,
    copy: {
      [MessageLanguage.KO]: [
        {
          title: '이번 주 {gap}분만 더 들으면 상위 {percent}%예요',
          body: '오늘 한 편이면 충분해요',
        },
        {
          title: '상위 {percent}%까지 {gap}분 남았어요',
          body: '퇴근길에 한 편 들어 볼까요?',
        },
      ],
      [MessageLanguage.EN]: [
        {
          title: '{gap} more min puts you in the top {percent}% this week',
          body: 'One episode tonight is enough',
        },
      ],
    },
  },
  {
    key: RetentionRuleKey.STREAK_KEEP,
    enabled: true,
    cooldownHours: 48,
    copy: {
      [MessageLanguage.KO]: [
        {
          title: '{days}일 연속으로 듣고 있어요',
          body: '오늘도 이어 가면 {next}일째예요',
        },
        {
          title: '{days}일 연속 기록, 오늘 이어 갈까요?',
          body: '한 편만 들어도 이어져요',
        },
      ],
      [MessageLanguage.EN]: [
        {
          title: "You've listened {days} days in a row",
          body: 'One episode today makes it {next}',
        },
      ],
    },
  },
  {
    key: RetentionRuleKey.RESUME_CONTENT,
    enabled: true,
    cooldownHours: 48,
    copy: {
      [MessageLanguage.KO]: [
        { title: '듣던 콘텐츠, {minutes}분 남았어요', body: '{title}' },
        { title: '{minutes}분이면 끝까지 들을 수 있어요', body: '{title}' },
      ],
      [MessageLanguage.EN]: [
        { title: '{minutes} min left in your episode', body: '{title}' },
      ],
    },
  },
  {
    key: RetentionRuleKey.PEERS_LISTENING,
    enabled: true,
    cooldownHours: 72,
    copy: {
      [MessageLanguage.KO]: [
        {
          title: '지금 {count}명이 이어를 듣고 있어요',
          body: '퇴근길, 같이 들어 볼까요?',
        },
        {
          title: '오늘 저녁 {count}명이 듣는 중이에요',
          body: '오늘의 콘텐츠가 기다리고 있어요',
        },
      ],
      [MessageLanguage.EN]: [
        {
          title: '{count} people are listening on Earcast right now',
          body: "Join them with today's episode",
        },
      ],
    },
  },
];

/** 주간 순위 근접 — 목표 상위 %(작은 것부터 본다). 프로필 "상위 N%"와 같은 공식이다 */
export const WEEKLY_RANK_GAP_TARGET_PERCENTS = [10, 20, 30] as const;
/** 남은 시간이 이 안일 때만 — 멀면 동기가 되지 않는다 */
export const WEEKLY_RANK_GAP_MAX_SEC = 15 * 60;
/** 그 주 청취자가 이보다 적으면 순위가 의미 없다(몇 명 안에서의 상위 %) */
export const WEEKLY_RANK_GAP_MIN_LISTENERS = 20;

/** 연속 기록 — 이 일수부터 알린다 */
export const STREAK_KEEP_MIN_DAYS = 2;

/** 듣던 콘텐츠 — 남은 시간이 이 범위일 때만(1분 미만은 사실상 다 들었다) */
export const RESUME_CONTENT_MIN_REMAINING_SEC = 60;
export const RESUME_CONTENT_MAX_REMAINING_SEC = 20 * 60;
/** 이 일수 안에 들은 콘텐츠만 — 오래된 것은 "듣던"이 아니다 */
export const RESUME_CONTENT_RECENT_DAYS = 7;

/** 지금 듣는 사람 — 최근 이 시간(분) 안에 재생 위치를 저장한 사람 */
export const RETENTION_PEERS_WINDOW_MINUTES = 60;
/** 이보다 적으면 보내지 않는다 — "지금 3명"은 역효과다 */
export const PEERS_LISTENING_MIN_COUNT = 10;
