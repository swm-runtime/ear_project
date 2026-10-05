/**
 * 이메일 등록·인증 화면을 여는 함수 — 페이월 시트는 내비게이터 밖(앱 루트)에 있어 useNavigation 을 쓸 수 없다.
 * app 이 내비게이션 ref 로 구현을 주입한다(subscription 이 라우트 구성을 알지 않는다 — architecture.md 4.3).
 */
let opener: () => void = () => undefined;

export const registerEmailVerificationOpener = (open: () => void): void => {
  opener = open;
};

export const openEmailVerification = (): void => opener();
