import { experimentBucket } from '@/common/utils/experiment-bucket.util';
import {
  DRIP_BATCH_LOCAL_HOUR,
  localMinutesOf,
  utcOffsetMinutes,
} from '@/modules/drip/drip-group.policy';
import {
  buildContentDeepLink,
  DEEP_LINK_LIBRARY,
} from '@/modules/notification/notification.constant';
import { MessageLanguage } from '@/modules/user/user.enum';

import {
  AD_PUSH_ALLOWED_FROM_LOCAL_HOUR,
  AD_PUSH_ALLOWED_UNTIL_LOCAL_HOUR,
  MORNING_PUSH_LOG_TYPE_PREFIX,
  MORNING_PUSH_RULE,
} from './retention-push.constant';
import { fillTemplate, withAdNotice } from './retention-push.policy';
import { RetentionCopy } from './retention-push.types';

/**
 * 아침 알림(KAN-288 — 드립이 없는 날의 미청취 유도, 2026-10-29) 문구. 변형은 사용자·주 해시로 고정 배정한다(저녁 규칙과 같은 방식).
 * **"(광고)"·수신거부 안내는 여기에 쓰지 않는다** — `withAdNotice`가 붙인다(정보통신망법 50조, 빠뜨릴 수 없게).
 * 1편이면 그 콘텐츠로(본문 = 제목), 여러 편이면 라이브러리로 간다. 두 목록의 변형 수는 같게 둔다 — 같은 사용자가 1편·여러 편을
 * 오가도 같은 변형 글자(a·b)가 같은 말투를 가리키게.
 */
export const MORNING_PUSH_COPY: Readonly<
  Record<
    MessageLanguage,
    { single: readonly RetentionCopy[]; multiple: readonly RetentionCopy[] }
  >
> = {
  [MessageLanguage.KO]: {
    single: [
      { title: '추천받은 콘텐츠를 아직 안 들었어요', body: '{title}' },
      { title: '출근길에 이 콘텐츠 어때요?', body: '{title}' },
    ],
    multiple: [
      {
        title: '아직 안 들은 콘텐츠 {count}편이 있어요',
        body: '출근길에 한 편 들어 볼까요?',
      },
      {
        title: '추천받은 콘텐츠 {count}편이 기다리고 있어요',
        body: '오늘 아침 한 편으로 시작해 보세요',
      },
    ],
  },
  [MessageLanguage.EN]: {
    single: [{ title: "You haven't listened to this yet", body: '{title}' }],
    multiple: [
      {
        title: '{count} episodes are waiting for you',
        body: 'Start your morning with one',
      },
    ],
  },
};

/** 아침 알림 판정에 쓰는 사용자 한 명의 사실 — 집계와 콘텐츠 정보뿐이다 */
export interface MorningUserFacts {
  userId: string;
  language: MessageLanguage;
  /** 최근 받은(드립·탐험) 아직 안 들은 편 수 */
  unplayedCount: number;
  /** `unplayedCount === 1`일 때 그 편 — 여러 편이면 null */
  single: { contentId: string; title: string } | null;
  /** 오늘(현지 05:00 이후) 이미 들었다 */
  listenedRecently: boolean;
  /** 오늘 편성 배치가 이 사용자에게 적립했다(드립이 있는 날 — 도착 알림 몫) */
  placedToday: boolean;
  /** 오늘(서비스 날짜) 드립 도착 알림이 이미 `sent`다 */
  arrivalSentToday: boolean;
  /** 최근 `MORNING_PUSH_DAILY_WINDOW_HOURS` 안에 아침 알림을 이미 보냈다 */
  morningSentRecently: boolean;
  /** 사용자 현지 시각이 광고성 알림 허용 시간(08~21시) 안이다 */
  withinAdHours: boolean;
}

/** 보내지 않는 사유 — dry_run·on 로그에 건수로 남긴다(사용자 식별값 없이) */
export type MorningSkipReason =
  | 'placed_today'
  | 'arrival_sent'
  | 'already_sent'
  | 'listened'
  | 'no_unplayed'
  | 'ad_hours';

export interface MorningPushPlan {
  userId: string;
  variant: number;
  title: string;
  body: string;
  deepLink: string;
}

/**
 * 한 사용자의 아침 알림을 정한다. 하루 한 건 — **드립이 있는 날은 도착 알림만**(07:30/08:00 A/B — KAN-289), 없는 날은 이 알림.
 * 저녁 리텐션의 20시간·주 3건 상한과 공유하지 않고, 아침 알림 자체의 주간 상한도 두지 않는다(결정 2026-10-29).
 * 먼저 걸린 사유를 돌려준다.
 */
export function planMorningPush(
  user: MorningUserFacts,
  weekStart: string,
): MorningPushPlan | MorningSkipReason {
  if (user.placedToday) {
    return 'placed_today';
  }
  if (user.arrivalSentToday) {
    return 'arrival_sent';
  }
  if (user.morningSentRecently) {
    return 'already_sent';
  }
  if (user.listenedRecently) {
    return 'listened';
  }
  if (user.unplayedCount <= 0) {
    return 'no_unplayed';
  }
  if (!user.withinAdHours) {
    return 'ad_hours';
  }

  const copies = MORNING_PUSH_COPY[user.language];
  const isSingle = user.unplayedCount === 1 && user.single !== null;
  const variants = isSingle ? copies.single : copies.multiple;
  const variant = experimentBucket(
    user.userId,
    `${MORNING_PUSH_LOG_TYPE_PREFIX}${weekStart}`,
    variants.length,
  );
  const vars = {
    count: user.unplayedCount,
    title: user.single?.title ?? '',
  };
  const copy = withAdNotice(
    {
      title: fillTemplate(variants[variant].title, vars),
      body: fillTemplate(variants[variant].body, vars),
    },
    user.language,
  );

  return {
    userId: user.userId,
    variant,
    title: copy.title,
    body: copy.body,
    deepLink:
      isSingle && user.single
        ? buildContentDeepLink(user.single.contentId)
        : DEEP_LINK_LIBRARY,
  };
}

export function morningLogType(variant: number): `retention.${string}` {
  return `retention.${MORNING_PUSH_RULE}.${String.fromCharCode(97 + variant)}`;
}

/**
 * 광고성 앱 푸시의 야간 금지(21~08시 — 정보통신망법 50조 3항)를 **사용자 현지 시각**으로 지킨다. 크론은 그룹 기준 시간대
 * 08:00에 돌지만 같은 그룹 안에도 시차가 있다(동남아 그룹의 +7 나라는 07:00, americas 의 서부는 06:00). 시간대를 모르면
 * 그룹 기준 시간대로 본다(KR·구 앱 — 기준 시간대 08:00이라 허용).
 */
export function isWithinAdHours(
  timezone: string | null,
  fallbackTimeZone: string,
  now: Date,
): boolean {
  const offset =
    (timezone !== null ? utcOffsetMinutes(timezone, now) : null) ??
    utcOffsetMinutes(fallbackTimeZone, now) ??
    0;
  const localMinutes =
    (((now.getUTCHours() * 60 + now.getUTCMinutes() + offset) % 1440) + 1440) %
    1440;

  return (
    localMinutes >= AD_PUSH_ALLOWED_FROM_LOCAL_HOUR * 60 &&
    localMinutes < AD_PUSH_ALLOWED_UNTIL_LOCAL_HOUR * 60
  );
}

/**
 * "오늘 이미 들었다"를 세기 시작하는 시각 — **그룹 기준 시간대의 오늘 05:00**(편성 시각 · 서비스 날짜 경계). 08:00 크론이면 3시간
 * 전이지만, 편성 배치가 08:00 뒤에 끝나 그 자리에서 보낼 때(예: 11:00)도 같은 05:00을 본다 — 종전 "보내는 시각 − 3시간"은 늦은
 * 배치에서 06:30에 들은 사용자를 "안 들음"으로 셌다. 05:00 전이면 전날 05:00이다(아침 알림은 08시 전에 보내지 않아 실제로는 없다).
 */
export function morningListenedSince(now: Date, timeZone: string): Date {
  const minutesSinceDayStart =
    localMinutesOf(timeZone, now) - DRIP_BATCH_LOCAL_HOUR * 60;
  const minutes =
    minutesSinceDayStart >= 0
      ? minutesSinceDayStart
      : minutesSinceDayStart + 24 * 60;

  return new Date(now.getTime() - minutes * 60_000 - (now.getTime() % 60_000));
}
