/**
 * 기기 동기화 mock — 백엔드가 준비되기 전 화면 테스트용 대역이다(onboarding mock에서 이관).
 */
const RESPONSE_DELAY_MS = 600;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const mockSyncDevice = async (): Promise<void> => {
  await delay(RESPONSE_DELAY_MS);
};
