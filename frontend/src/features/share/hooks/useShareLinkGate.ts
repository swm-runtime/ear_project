import { useNavigation } from '@react-navigation/native';
import { useEffect } from 'react';
import { Linking } from 'react-native';

import { useSessionStore } from '@/features/auth';

import { IS_SHARE_ENABLED } from '../share.constants';
import { parseShareLink } from '../share.link';

/**
 * 공유 링크 수신 게이트(share.md 4.3) — 링크로 앱이 열리면 `/contents/:id`를 파싱해
 * 콘텐츠 상세로 보낸다. RootNavigator(내비게이션 컨테이너 안)에서 한 번 호출한다.
 *
 * - **관문을 우회하지 않는다** — 온보딩 완료(관문 통과) 상태의 사용자만 상세로 이동한다.
 * - **미로그인·온보딩 미완이면 목적지를 버린다** — 보류·복원 없음(디퍼드 딥링크 금지,
 *   share.md 4.3). 사용자는 정상 진입 분기를 따를 뿐 별도 안내도 없다(share-uiux.md 2장).
 * - TODO(SplashGate): 실행 관문(splash.md) 구현 시 콜드 스타트 판정을 관문 판정 완료 후
 *   1회 평가로 옮긴다. 현재는 세션 복원이 미구현이라 콜드 스타트 = 미로그인 → 폐기가
 *   곧 정상 분기다(RootNavigator TODO와 같은 전제).
 */
export const useShareLinkGate = (): void => {
  const navigation = useNavigation();

  useEffect(() => {
    // MVP 빌드에서는 수신 라우팅도 하지 않는다 — 링크로 열려도 정상 진입 분기뿐이다(share.md 2)
    if (!IS_SHARE_ENABLED) return;

    const handleUrl = (url: string) => {
      const contentId = parseShareLink(url);
      if (contentId === null) return;
      // 관문 판정 — 스냅샷 1회 평가다. 이후 로그인·온보딩 완료에 반응해 복원하지 않는다
      const { status, user } = useSessionStore.getState();
      if (status !== 'authenticated' || user?.onboardingCompleted !== true) return;
      navigation.navigate('Main', {
        screen: 'ContentDetail',
        params: { contentId, entryPoint: 'share' },
      });
    };

    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, [navigation]);
};
