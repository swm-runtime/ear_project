import { requireOptionalNativeModule } from 'expo';

interface ExpoNetworkNative {
  getNetworkStateAsync?: () => Promise<{ type?: string }>;
}

/**
 * 지금 셀룰러로 붙어 있는가 — 모르면 null(망 모듈이 없는 빌드·웹·조회 실패·`UNKNOWN`).
 * expo-network 의 JS 진입점은 네이티브 모듈이 없으면 불러오는 순간 예외를 던져서, 모듈을 직접 찾아 부른다
 * (rt 32 첫 개발계 빌드에는 없다 — 다음 빌드부터 실린다). 표시 판단(데이터 안내)에만 쓴다
 */
export const isOnCellular = async (): Promise<boolean | null> => {
  const native = requireOptionalNativeModule<ExpoNetworkNative>('ExpoNetwork');
  if (!native?.getNetworkStateAsync) return null;
  try {
    const { type } = await native.getNetworkStateAsync();
    if (type === undefined || type === 'UNKNOWN') return null;
    return type === 'CELLULAR';
  } catch {
    return null;
  }
};
