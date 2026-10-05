import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';

import { useShareLinkStore } from '../store/share-link.store';

/**
 * 공유 링크 착지(share.md 4.3) — **Main 안에서만** 호출한다(MainNavigator).
 *
 * 관문을 통과한 목적지(`useShareLinkGate`가 올린다)를 집어 콘텐츠 상세로 보낸다. Main 이 떴다는 것이
 * 곧 관문 통과이고, Main 안에서 이동하므로 `Main` 라우트가 없는 순간에 navigate 하지 않는다.
 * 탭 내비게이터는 마운트할 때 마지막 탭(splash.md 4-1)으로 착지하므로 상세는 **복원한 탭 위에** 얹힌다
 * (splash.md 4 5단계 — 딥링크가 이긴다). 푸시 딥링크(`usePushLinkGate`)와 같은 구조다.
 */
export const useShareLinkLanding = (): void => {
  const navigation = useNavigation();
  const landingContentId = useShareLinkStore((s) => s.landingContentId);
  const clearLanding = useShareLinkStore((s) => s.clearLanding);

  // 무엇과 동기화하나: 관문을 통과한 링크 목적지(외부 이벤트) → 내비게이션. 집는 즉시 비워 한 번만 이동한다
  useEffect(() => {
    if (landingContentId === null) return;
    clearLanding();
    navigation.navigate('Main', {
      screen: 'ContentDetail',
      params: { contentId: landingContentId, entryPoint: 'share' },
      // 탭 스택이 아직 없더라도 탭을 아래에 깔고 얹는다 — 뒤로가기가 탭으로 돌아가야 한다
      initial: false,
    });
  }, [landingContentId, clearLanding, navigation]);
};
