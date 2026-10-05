import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { useNavigation } from '@react-navigation/native';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';

import { track } from '@/shared/analytics';

import { useShareLinkGate, useShareLinkLanding } from '@/features/share';

import { selectRootRoute, toShareLinkGate, type RootRouteInput } from './root-route';

jest.mock('@react-navigation/native', () => ({ useNavigation: jest.fn() }));
jest.mock('@/shared/analytics', () => ({ track: jest.fn() }));

interface Renderer {
  update(node: ReactNode): void;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => Promise<void> | void): Promise<void>;
  create(node: ReactNode): Renderer;
}>('react-test-renderer');

const SHARE_URL = 'https://earcast.co.kr/contents/c-42';

/** 콜드 스타트 직후 — 버전 확인·세션 복원·로고 모션·마지막 탭 읽기가 전부 진행 중이다 */
const LAUNCHING: RootRouteInput = {
  versionGate: 'pending',
  sessionStatus: 'restoring',
  hasPendingConsents: false,
  isOnboardingCompleted: false,
  isMotionDone: false,
  isTabPrimed: false,
};
/** 관문 판정 완료 — 로그인·온보딩 완료 사용자(Main) */
const SIGNED_IN: RootRouteInput = {
  versionGate: 'passed',
  sessionStatus: 'authenticated',
  hasPendingConsents: false,
  isOnboardingCompleted: true,
  isMotionDone: true,
  isTabPrimed: true,
};

/** Main 은 관문을 통과해야만 마운트된다 — RootNavigator 와 같은 조건 렌더링 */
function MainProbe() {
  useShareLinkLanding();
  return null;
}
function Root({ input }: { input: RootRouteInput }) {
  const route = selectRootRoute(input);
  useShareLinkGate(toShareLinkGate(route));
  return route === 'Main' ? <MainProbe /> : null;
}

const navigate = jest.fn();
let urlListener: ((event: { url: string }) => void) | null = null;
let renderer: Renderer;

const mount = async (input: RootRouteInput) => {
  await act(async () => {
    renderer = create(<Root input={input} />);
  });
};
const rerender = async (input: RootRouteInput) => {
  await act(async () => {
    renderer.update(<Root input={input} />);
  });
};
const receiveWarm = async (url: string) => {
  await act(async () => {
    urlListener?.({ url });
  });
};

const toDetail = (contentId: string) => [
  'Main',
  {
    screen: 'ContentDetail',
    params: { contentId, entryPoint: 'share' },
    initial: false,
  },
];

beforeEach(async () => {
  jest.clearAllMocks();
  jest.mocked(useNavigation).mockReturnValue({ navigate } as unknown as ReturnType<typeof useNavigation>);
  jest.spyOn(Linking, 'getInitialURL').mockResolvedValue(null);
  jest.spyOn(Linking, 'addEventListener').mockImplementation(((
    _type: string,
    handler: (event: { url: string }) => void,
  ) => {
    urlListener = handler;
    return { remove: jest.fn() };
  }) as unknown as typeof Linking.addEventListener);
  // 앞 테스트가 남긴 목적지를 비운다 — 관문에서 걸린 상태(시작 화면)로 한 번 띄우면 기다리던 것까지 버려진다
  await mount({ ...SIGNED_IN, sessionStatus: 'unauthenticated' });
  await act(async () => {
    renderer.unmount();
  });
  jest.clearAllMocks();
});

afterEach(async () => {
  await act(async () => {
    renderer.unmount();
  });
  urlListener = null;
  jest.restoreAllMocks();
});

describe('공유 링크 콜드 스타트 — 관문 판정이 끝난 뒤 한 번 평가한다', () => {
  it('세션 복원 중에 받은 링크는 관문을 통과한 뒤 콘텐츠 상세로 이동한다', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue(SHARE_URL);
    await mount(LAUNCHING);

    // 스플래시 동안에는 이동하지도 버리지도 않는다
    expect(navigate).not.toHaveBeenCalled();

    // 버전 통과 → 세션 복원(로그인·온보딩 완료)까지 끝났지만 로고 모션이 남았다 — 아직 스플래시다
    await rerender({ ...SIGNED_IN, isMotionDone: false });
    expect(navigate).not.toHaveBeenCalled();

    await rerender(SIGNED_IN);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(...toDetail('c-42'));
  });

  it('미로그인으로 판정되면 버리고, 그 뒤 로그인해도 상세로 복원하지 않는다', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue(SHARE_URL);
    await mount(LAUNCHING);

    await rerender({ ...SIGNED_IN, sessionStatus: 'unauthenticated', isOnboardingCompleted: false });
    expect(navigate).not.toHaveBeenCalled();

    // 로그인 완료 → Main — 디퍼드 딥링크 금지(share.md 4.3)
    await rerender(SIGNED_IN);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('온보딩 미완으로 판정되면 버리고, 온보딩을 마쳐도 상세로 가지 않는다', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue(SHARE_URL);
    await mount(LAUNCHING);

    await rerender({ ...SIGNED_IN, isOnboardingCompleted: false });
    await rerender(SIGNED_IN);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('재동의가 남아 있으면 버린다 — 재동의는 온보딩보다 앞 관문이다', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue(SHARE_URL);
    await mount(LAUNCHING);

    await rerender({ ...SIGNED_IN, hasPendingConsents: true });
    await rerender(SIGNED_IN);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('한 번만 평가한다 — 통과 후 로그아웃·재로그인해도 다시 이동하지 않는다', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue(SHARE_URL);
    await mount(LAUNCHING);
    await rerender(SIGNED_IN);
    await rerender(SIGNED_IN);
    await rerender({ ...SIGNED_IN, sessionStatus: 'unauthenticated' });
    await rerender(SIGNED_IN);

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledTimes(1);
  });

  it('받은 링크마다 share_receive 를 한 번 남긴다 — 관문에서 버려지는 링크도 포함이다', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue(SHARE_URL);
    await mount(LAUNCHING);
    await rerender({ ...SIGNED_IN, sessionStatus: 'unauthenticated' });

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('share_receive', { content_id: 'c-42', installed: true });
  });

  it('공유 링크가 아닌 URL 로 열리면 아무것도 하지 않는다', async () => {
    jest.mocked(Linking.getInitialURL).mockResolvedValue('https://earcast.co.kr/about');
    await mount(LAUNCHING);
    await rerender(SIGNED_IN);

    expect(navigate).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});

describe('공유 링크 실행 중 수신(url 이벤트)', () => {
  it('관문을 통과한 상태에서 받으면 바로 콘텐츠 상세로 이동한다', async () => {
    await mount(SIGNED_IN);
    await receiveWarm('ear://contents/c-7');

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(...toDetail('c-7'));
  });

  it('스플래시 도중에 받으면 콜드 스타트처럼 판정이 끝난 뒤 이동한다', async () => {
    await mount(LAUNCHING);
    await receiveWarm(SHARE_URL);
    expect(navigate).not.toHaveBeenCalled();

    await rerender(SIGNED_IN);
    expect(navigate).toHaveBeenCalledWith(...toDetail('c-42'));
  });

  it('시작 화면(미로그인)에서 받으면 버린다', async () => {
    await mount({ ...SIGNED_IN, sessionStatus: 'unauthenticated' });
    await receiveWarm(SHARE_URL);
    await rerender(SIGNED_IN);

    expect(navigate).not.toHaveBeenCalled();
  });
});
