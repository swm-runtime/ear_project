import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';

import { track } from '@/shared/analytics';

import { IS_SHARE_ENABLED } from '../share.constants';
import { parseShareLink } from '../share.link';
import { useShareLinkStore, type ShareLinkGate } from '../store/share-link.store';

/**
 * 공유 링크 수신 게이트(share.md 4.3) — 링크로 앱이 열리면 `/contents/:id`를 파싱해 관문 판정에
 * 맡긴다. RootNavigator(내비게이션 컨테이너 안)에서 한 번, 루트 분기에서 뽑은 관문 상태와 함께 호출한다.
 * 실제 이동은 Main 안의 `useShareLinkLanding`이 한다 — Main 이 떠 있어야 상세를 얹을 자리가 있다.
 *
 * - **관문을 우회하지 않는다** — 관문을 전부 통과한(`open` — Main 이 뜬) 사용자만 상세로 이동한다.
 * - **관문 판정 중에 온 링크는 기다렸다가 판정이 끝나는 순간 한 번 평가한다.** 콜드 스타트의
 *   `getInitialURL()`은 마운트 직후 — 세션 복원·버전 확인·로고 모션이 끝나기 전 — 에 도착해서,
 *   그 자리에서 평가하면 로그인 사용자도 "아직 미로그인"으로 읽혀 목적지가 버려졌다(2026-10-05 PM 실기기).
 *   스플래시 도중 앱이 복귀하며 받은 `url` 이벤트도 같다.
 * - **미로그인·재동의·온보딩 미완이면 목적지를 버린다** — 보류·복원 없음(디퍼드 딥링크 금지,
 *   share.md 4.3). 판정은 한 번뿐이라 이후 로그인·온보딩을 마쳐도 상세로 가지 않는다. 사용자는 정상
 *   진입 분기를 따를 뿐 별도 안내도 없다(share-uiux.md 4.4).
 */
export const useShareLinkGate = (gate: ShareLinkGate): void => {
  // 수신 리스너는 앱 수명에 한 번만 건다 — 관문이 바뀔 때마다 다시 걸면 getInitialURL 을 다시 읽어 같은 링크를 또 받는다
  const gateRef = useRef(gate);

  // 무엇과 동기화하나: 관문 판정 결과 → 기다리던 목적지. 판정이 끝나면 한 번 가른다
  useEffect(() => {
    gateRef.current = gate;
    useShareLinkStore.getState().settle(gate);
  }, [gate]);

  useEffect(() => {
    // MVP 빌드에서는 수신 라우팅도 하지 않는다 — 링크로 열려도 정상 진입 분기뿐이다(share.md 2)
    if (!IS_SHARE_ENABLED) return;

    const handleUrl = (url: string) => {
      const contentId = parseShareLink(url);
      if (contentId === null) return;
      // 관문에서 버려지는 진입도 "링크로 들어왔다"다 — 앱 안에서 보는 이상 installed 는 늘 true
      track('share_receive', { content_id: contentId, installed: true });
      useShareLinkStore.getState().receive(contentId, gateRef.current);
    };

    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const subscription = Linking.addEventListener('url', (event) => handleUrl(event.url));
    return () => subscription.remove();
  }, []);
};
