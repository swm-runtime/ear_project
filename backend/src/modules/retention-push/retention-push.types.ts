import { MessageLanguage, UserMarket } from '@/modules/user/user.enum';

import { RetentionRuleKey } from './retention-push.enum';

/** 규칙 판정에 쓰는 사용자 한 명의 사실 — 전부 집계값이고 이름·이메일은 없다 */
export interface RetentionUserFacts {
  userId: string;
  market: UserMarket;
  /** 오늘(현지 05:00 이후 — 발송 시각에서 `RETENTION_PUSH_LISTENED_WINDOW_HOURS`) 재생 위치를 저장한 적이 있다 */
  listenedRecently: boolean;
  /** 이번 서비스 주의 청취 시간 합(초) — 프로필 "상위 N%"와 같은 주·같은 합이다 */
  weekListenedSec: number;
  /** 어제까지 이어진 연속 청취 서비스 날짜 수 — 오늘은 세지 않는다 */
  streakDays: number;
  /** 끝까지 듣지 않은 최근 콘텐츠 하나(라이브러리에 살아 있고 같은 시장) — 남은 시간이 가장 짧은 것 */
  resume: { contentId: string; title: string; remainingSec: number } | null;
}

/** 시장 하나의 집계 — 개인을 가리키지 않는 숫자만 */
export interface RetentionMarketFacts {
  /** 이번 주가 끝나기 전에 가입한 그 시장 계정 수 — 프로필 상위 %의 모집단과 같다 */
  population: number;
  /** 이번 주 청취한 그 시장 사용자들의 주간 합(초), 큰 순 */
  weekListenedDesc: number[];
  /** 최근 `RETENTION_PEERS_WINDOW_MINUTES`분 안에 재생 위치를 저장한 그 시장 사용자 수 */
  listenersNow: number;
}

/** 최근 7일 안에 보낸 리텐션 알림 한 건 */
export interface RetentionSentRecord {
  ruleKey: RetentionRuleKey;
  sentAt: Date;
}

/** 규칙 하나가 사용자에게 성립했을 때의 값 — 문구의 `{변수}`를 채운다 */
export interface RetentionCandidate {
  ruleKey: RetentionRuleKey;
  vars: Record<string, string | number>;
  deepLink: string;
}

export interface RetentionCopy {
  title: string;
  body: string;
}

/** 규칙 표 한 줄(`retention-push.rules.ts`) */
export interface RetentionRuleDefinition {
  key: RetentionRuleKey;
  /** 끄면 후보에서 빠진다 — 문구가 나쁘다는 판정이 나면 여기서 끈다 */
  enabled: boolean;
  /** 같은 규칙을 다시 보내기까지 최소 간격(시간) */
  cooldownHours: number;
  /** 문구 변형 — 사용자·규칙·주마다 하나로 고정 배정된다(A/B). `{변수}`는 판정이 채운다 */
  copy: Record<MessageLanguage, RetentionCopy[]>;
}

/** 사용자 한 명에게 보내기로 정한 알림 */
export interface RetentionPushPlan {
  userId: string;
  ruleKey: RetentionRuleKey;
  /** 0부터 — `notification_logs.type`에 a·b… 로 남는다 */
  variant: number;
  title: string;
  body: string;
  deepLink: string;
}

export interface RetentionPushSummary {
  audience: number;
  planned: number;
  byRule: Partial<Record<RetentionRuleKey, number>>;
  sent: number;
  failed: number;
}
