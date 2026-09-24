import { Easing } from 'react-native';

/**
 * 모션 곡선의 단일 출처(2026-09-22 PM — "전환 속도를 애플처럼"). 화면마다 `Easing.out(Easing.cubic)`·
 * 기본 스프링을 제각각 쓰면 같은 앱 안에서 전환의 결이 갈린다. 여기 값만 쓴다.
 *
 * - 베지어는 UIKit 의 표준 곡선이다. `easeInOut` = UIView 기본(0.42, 0, 0.58, 1), `easeOut` = (0, 0, 0.58, 1).
 *   길이가 정해진 짧은 전환(페이드·줄 이동·아이콘 회전)에 쓴다.
 * - 스프링은 SwiftUI `.smooth`(bounce 0)를 RN 의 stiffness·damping 으로 옮긴 값이다 —
 *   stiffness = (2π/응답)², damping = 2·√(stiffness·mass)(임계 감쇠 = 튀지 않고 한 번에 멈춤).
 *   손이 관여하는 전환(시트·손잡이·복귀)에 쓴다. 손을 뗀 속도는 호출부가 `velocity` 로 넘긴다.
 */
export const motion = {
  easing: {
    easeInOut: Easing.bezier(0.42, 0, 0.58, 1),
    easeOut: Easing.bezier(0, 0, 0.58, 1),
  },
  spring: {
    /** 응답 0.45초 — 시트·패널처럼 큰 면이 움직일 때 */
    smooth: { stiffness: 195, damping: 28, mass: 1 },
    /** 응답 0.3초 — 토글·손잡이처럼 작은 것이 자리를 잡을 때 */
    snappy: { stiffness: 440, damping: 42, mass: 1 },
    /**
     * SwiftUI `.bouncy`(bounce 0.3) 상당 — 감쇠비 ≈ 0.5 라 한 번 넘쳤다가 돌아온다(출렁임). **형태**(크기·늘어남)에만
     * 쓴다 — 위치에 쓰면 좌표 밖으로 튄다. iOS 26 탭 바 알약이 눌러 부풀고 놓으면 출렁이는 그 느낌(2026-09-24)
     */
    jelly: { stiffness: 300, damping: 17, mass: 1 },
  },
  /** 짧은 전환 길이 — 페이드·줄 이동. UIKit 기본 0.25s 보다 살짝 짧게 */
  duration: {
    fast: 160,
    normal: 240,
  },
} as const;
