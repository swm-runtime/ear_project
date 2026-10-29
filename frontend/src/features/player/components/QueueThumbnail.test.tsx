import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

import QueueThumbnail from './QueueThumbnail';

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다.
interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
}
interface Renderer {
  root: TestNode;
  update(element: ReactNode): void;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void | Promise<void>): Promise<void>;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

// expo-image 는 네이티브 뷰라 jest 에서 그릴 수 없다 — 로드·실패 콜백을 꺼내 쓸 수 있는 호스트 노드로 바꾼다
jest.mock('@/shared/ui/RemoteImage', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    const { createElement } = jest.requireActual<typeof import('react')>('react');
    return createElement('RemoteImage', props);
  },
}));

const SKELETON_ID = 'queue-thumbnail-skeleton';

const hostNodes = (renderer: Renderer, predicate: (node: TestNode) => boolean) =>
  renderer.root.findAll((node) => typeof node.type === 'string' && predicate(node));

const skeletonCount = (renderer: Renderer) =>
  hostNodes(renderer, (node) => node.props.testID === SKELETON_ID).length;

const image = (renderer: Renderer) => {
  const [node] = hostNodes(renderer, (n) => n.type === 'RemoteImage');
  return node;
};

// 동작 줄이기 조회(비동기 — SkeletonGroup)까지 끝낸다
const render = async (element: ReactNode) => {
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(element);
  });
  return renderer;
};

/** 0.3초 지연 노출(useDelayedVisible)을 넘긴다 */
const passDelay = async () => {
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    .mockReturnValue({ remove: jest.fn() } as unknown as ReturnType<
      typeof AccessibilityInfo.addEventListener
    >);
  jest
    .spyOn(Animated, 'loop')
    .mockReturnValue({ start: jest.fn(), stop: jest.fn(), reset: jest.fn() });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('QueueThumbnail', () => {
  it('0.3초 안에 로드되면(캐시) 스켈레톤을 그리지 않는다', async () => {
    // given
    const renderer = await render(
      <QueueThumbnail uri="https://a.png" recyclingKey="c1" size={48} />,
    );

    // when
    await act(() => {
      (image(renderer).props.onLoad as () => void)();
    });
    await passDelay();

    // then
    expect(skeletonCount(renderer)).toBe(0);
  });

  it('0.3초가 지나도 로드되지 않으면 스켈레톤을 깔고, 로드되면 걷는다', async () => {
    // given
    const renderer = await render(
      <QueueThumbnail uri="https://a.png" recyclingKey="c1" size={48} />,
    );
    expect(skeletonCount(renderer)).toBe(0);

    // when
    await passDelay();

    // then
    expect(skeletonCount(renderer)).toBe(1);
    await act(() => {
      (image(renderer).props.onLoad as () => void)();
    });
    expect(skeletonCount(renderer)).toBe(0);
  });

  it('다른 줄(recyclingKey)로 바뀌면 지난 줄의 로드 완료를 이어받지 않고 다시 받는 중이 된다', async () => {
    // given — c1 은 다 받았다
    const renderer = await render(
      <QueueThumbnail uri="https://a.png" recyclingKey="c1" size={48} />,
    );
    await act(() => {
      (image(renderer).props.onLoad as () => void)();
    });

    // when — 같은 자리가 c2 로 바뀌고 0.3초가 지난다
    await act(() => {
      renderer.update(<QueueThumbnail uri="https://b.png" recyclingKey="c2" size={48} />);
    });
    await passDelay();

    // then
    expect(skeletonCount(renderer)).toBe(1);
    expect(image(renderer).props.recyclingKey).toBe('c2');
  });

  it('지난 주소의 실패가 새 주소로 따라오지 않는다', async () => {
    // given — a 는 실패해 단색 칸이다
    const renderer = await render(
      <QueueThumbnail uri="https://a.png" recyclingKey="c1" size={48} />,
    );
    await act(() => {
      (image(renderer).props.onError as () => void)();
    });
    expect(image(renderer)).toBeUndefined();

    // when
    await act(() => {
      renderer.update(<QueueThumbnail uri="https://b.png" recyclingKey="c2" size={48} />);
    });

    // then — 다시 이미지를 받는다
    expect(image(renderer).props.uri).toBe('https://b.png');
  });

  it('받기에 실패하면 반짝임을 멈추고 단색 칸으로 둔다', async () => {
    // given
    const renderer = await render(
      <QueueThumbnail uri="https://a.png" recyclingKey="c1" size={48} />,
    );
    await passDelay();
    expect(skeletonCount(renderer)).toBe(1);

    // when
    await act(() => {
      (image(renderer).props.onError as () => void)();
    });

    // then
    expect(skeletonCount(renderer)).toBe(0);
    expect(image(renderer)).toBeUndefined();
  });

  it('썸네일 주소가 없으면 반짝이지 않는다', async () => {
    // when
    const renderer = await render(<QueueThumbnail uri={null} recyclingKey="c1" size={48} />);
    await passDelay();

    // then
    expect(skeletonCount(renderer)).toBe(0);
    expect(image(renderer)).toBeUndefined();
  });
});
