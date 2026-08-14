/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 profile-uiux.md 6장과 1:1 대조한다.
 * 내부 용어("티어"·"라이트"·"완청"·"서비스 날짜" 등)를 노출하지 않는다 — 플랜은 plan_name 표시명만 쓴다.
 * 숫자·상태 판정은 profile.format.ts가 하고 여기는 문장 조립만 한다.
 */
import type { SocialProvider } from '@/features/auth';

import {
  toListenedDayParts,
  toListenedSummaryParts,
  toMonthDayParts,
  toWeekRangeParts,
} from './profile.format';
import type { YearsOfExperience } from './profile.types';

/** 온보딩 커리어 단계와 같은 표기다(profile-uiux.md 4.5 — 라벨이 갈라지면 같은 값이 다른 말로 보인다) */
const YEARS_LABELS: Record<YearsOfExperience, string> = {
  '0-1': '0-1년',
  '2-3': '2-3년',
  '4-6': '4-6년',
  '7+': '7년+',
};

const PROVIDER_NAMES: Record<SocialProvider, string> = {
  kakao: '카카오',
  naver: '네이버',
  google: '구글',
  apple: '애플',
};

const monthDay = (iso: string): string => {
  const { month, day } = toMonthDayParts(iso);
  return `${month}월 ${day}일`;
};

/** 요일 값 표기 — 60분 미만 "N분", 이상 "N시간 N분"(버림). 말풍선(4.6 개정)과 스크린리더(7장)가 같은 형식을 쓴다 */
const listenedDayValue = (sec: number): string => {
  const { hours, minutes } = toListenedDayParts(sec);
  return hours > 0 ? `${hours}시간 ${minutes}분` : `${minutes}분`;
};

export const PROFILE_COPY = {
  header: {
    settingsA11y: '설정 열기',
    /**
     * 제공자가 닉네임을 주지 않은 계정. 실제로 흔하다 — 카카오 닉네임은 선택 동의고
     * 온보딩도 닉네임을 받지 않는다. 닉네임 편집 진입점은 둘 수 없으므로(8장 금지)
     * 빈 자리를 남기지 않고 이 문구로 채운다
     */
    noNickname: '이름 없음',
    /** 제공자가 이메일을 주지 않은 계정 — 등록 진입점은 아래 이메일 카드가 갖는다 */
    noEmail: '이메일 미등록',
    /** 제공자 아이콘의 접근성 라벨(profile-uiux.md 4.1) */
    providerA11y: (provider: SocialProvider) => `${PROVIDER_NAMES[provider]} 계정으로 로그인`,
    providerName: (provider: SocialProvider) => PROVIDER_NAMES[provider],
  },

  /** 카드 라벨 4종 — settings.md 4.1의 항목명과 동일(profile-uiux.md 6장) */
  cardLabels: {
    plan: '현재 플랜',
    email: '이메일',
    interest: '관심 주제 관리',
    career: '커리어 정보',
  },

  plan: {
    /** N은 서버 daily_play_limit — 2를 하드코딩하지 않는다(paywall.md 5장). null은 무제한 */
    free: (dailyPlayLimit: number | null) =>
      dailyPlayLimit === null ? '무료 이용 중' : `무료 이용 중 · 하루 ${dailyPlayLimit}편`,
    freeAction: '구독 알아보기',
    renewsAt: (iso: string) => `다음 결제일 ${monthDay(iso)}`,
    /** 해지 예약 — 중립 톤. 사용자가 스스로 내린 결정이지 장애가 아니다(profile-uiux.md 4.4) */
    cancelScheduled: (iso: string) => `${monthDay(iso)}까지 이용 가능`,
    /** 결제 문제 — 경고색을 쓰는 유일한 플랜 상태 */
    paymentIssue: '결제에 문제가 있어요',
  },

  email: {
    unregistered: '등록되지 않음',
    /** 배지 — 색 + 텍스트. 색만으로 구분하지 않는다(profile-uiux.md 7장) */
    unverifiedBadge: '인증되지 않음',
    /** P3·P4 보조 문구 — 팝업·배너로 강요하지 않는다(강제 지점은 첫 결제뿐, auth.md 4.4) */
    helper: '결제하려면 인증된 이메일이 필요해요',
    register: '등록',
    verify: '인증하기',
    change: '변경',
    /** 미인증 주소는 스크린리더가 주소 뒤에 배지를 이어 읽는다(profile-uiux.md 7장) */
    unverifiedValueA11y: (email: string) => `${email}, 인증되지 않음`,
  },

  interest: {
    count: (count: number) => `${count}개 선택`,
    /** +N은 "외 N개"로 읽힌다 — "플러스 삼" 금지(profile-uiux.md 7장) */
    overflow: (n: number) => `+${n}`,
    overflowA11y: (n: number) => `외 ${n}개`,
  },

  career: {
    /** 입력된 값만 가운데점으로 잇는다 — 예: "기획 · 서비스 기획 · 4-6년"(profile-uiux.md 4.5) */
    line: (parts: {
      jobCategory: string | null;
      jobTitle: string | null;
      yearsOfExperience: YearsOfExperience | null;
    }) =>
      [
        parts.jobCategory,
        parts.jobTitle,
        parts.yearsOfExperience === null ? null : YEARS_LABELS[parts.yearsOfExperience],
      ]
        .filter((part): part is string => part !== null)
        .join(' · '),
    emptyPrompt: '입력하면 추천이 정확해져요',
    emptyAction: '입력하기',
  },

  stats: {
    /** 요약 3지표 라벨(profile-uiux.md 6장) */
    labels: { completed: '누적 청취', listened: '청취 시간', streak: '연속 청취' },
    completedValue: (count: number) => `${count}편`,
    /** 60분 미만 "N분"(초 버림) · 이상 "N시간"(분 버림) — 반올림 금지(profile-uiux.md 4.6) */
    listenedValue: (totalSec: number) => {
      const parts = toListenedSummaryParts(totalSec);
      return parts.unit === 'minutes' ? `${parts.value}분` : `${parts.value}시간`;
    },
    streakValue: (days: number) => `${days}일`,
    /** 지표 타일은 값과 라벨을 한 문장으로 읽는다 — "누적 청취 128편"(profile-uiux.md 7장) */
    tileA11y: (label: string, value: string) => `${label} ${value}`,

    weeklyTitle: '주간 청취',
    /** 주 범위 "N월 N일 – N월 N일". 경계 판정은 서버 몫, +6일은 표기 전용(profile.format.ts) */
    weekRange: (weekStart: string) => {
      const { start, end } = toWeekRangeParts(weekStart);
      return `${start.month}월 ${start.day}일 – ${end.month}월 ${end.day}일`;
    },
    /** 그래프 컨테이너 라벨 — "주간 청취, 8월 3일부터 8월 9일"(profile-uiux.md 7장) */
    weeklyA11y: (weekStart: string) => {
      const { start, end } = toWeekRangeParts(weekStart);
      return `주간 청취, ${start.month}월 ${start.day}일부터 ${end.month}월 ${end.day}일`;
    },
    prevWeekA11y: '이전 주',
    nextWeekA11y: '다음 주',
    dayNames: ['월', '화', '수', '목', '금', '토', '일'],
    /** 막대 탭 말풍선의 값(changes/pending profile-uiux 4.6 개정 — 0인 요일도 "0분") */
    dayValue: listenedDayValue,
    /** 평균 기준선 라벨 — 막대와 견줄 대상이 무엇인지 선 옆에 밝힌다 */
    averageLabel: (sec: number) => `평균 ${listenedDayValue(sec)}`,
    /** 기준선은 장식이 아니라 값이다 — 그래프 컨테이너 라벨 뒤에 이어 읽힌다 */
    averageA11y: (sec: number) => `하루 평균 ${listenedDayValue(sec)}`,
    /** 막대 개별 읽기 — "화요일, 32분", 60분 이상이면 "N시간 N분"(profile-uiux.md 7장) */
    dayBarA11y: (dayIndex: number, sec: number) => {
      const dayFull = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'][
        dayIndex
      ];
      return `${dayFull}, ${listenedDayValue(sec)}`;
    },

    distributionTitle: '주로 듣는 주제',
    othersLabel: '기타',
    /** 비율은 서버 정수 그대로 "N%"(profile-uiux.md 4.6) */
    ratioValue: (ratio: number) => `${ratio}%`,
    /** 범례가 곧 대체 텍스트 — "커리어 38%, …, 기타 6%"(profile-uiux.md 7장) */
    legendA11y: (entries: { name: string; ratio: number }[]) =>
      entries.map((entry) => `${entry.name} ${entry.ratio}%`).join(', '),

    emptyState: '청취 기록이 없어요',
    /** P10 변형 B — 통계 영역 전체를 하나의 에러 블록으로 접는다(제목 포함) */
    errorTitle: '청취 통계',
    error: '통계를 불러올 수 없어요',
  },

  /** 카드 인라인 에러(P7) — 화면 전체를 에러로 덮지 않는다 */
  cardError: '정보를 불러올 수 없어요',
  retry: '다시 시도',

  /** 카드 전체가 한 문장으로 읽힌다 — 값과 목적지를 잇는다(profile-uiux.md 7장) */
  cardA11y: (label: string, value: string, destination: string) =>
    `${label}, ${value}, ${destination}`,
  destinations: {
    plan: '구독 관리 열기',
    interest: '관심사 관리 열기',
    career: '커리어 정보 열기',
  },
} as const;
