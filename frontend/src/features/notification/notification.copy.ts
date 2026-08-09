/**
 * 알림 사전 안내(프리퍼미션) 문구 — 소유는 notification.md 5장이다.
 * 온보딩 O10과 설정의 유도 배너·사전 안내가 같은 문자열을 쓴다(settings-uiux.md 4.3 —
 * 배너와 사전 안내가 다른 말을 쓰면 탭했을 때 다른 곳에 온 것처럼 읽힌다).
 * "드립"은 내부 용어라 카피에 쓰지 않는다(합의 2026-08-06).
 */
export const NOTIFICATION_COPY = {
  prePrompt: {
    title: '새 콘텐츠가 도착하면 알려드릴까요?',
    /** 발송 빈도를 문구에 명시한다 — 상한을 먼저 말하는 것이 허용률에 작용한다(onboarding-uiux.md 4.7) */
    description: '새 콘텐츠가 도착하면 알림 한 번만 보내드려요. 하루 1회를 넘지 않습니다',
    allow: '알림 받기',
    later: '나중에',
  },
} as const;
