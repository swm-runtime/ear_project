import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';

import { ApiError } from '@/shared/api/api-error';
import { ERROR_CODES } from '@/shared/api/error-codes';

import {
  dismissDripFeedback,
  muteDripFeedback,
  submitDripFeedback,
} from '../api/drip-feedback.api';
import { DRIP_FEEDBACK_REVEAL_DELAY_MS } from '../hooks/useDripFeedbackDialog';
import { LIBRARY_COPY } from '../library.copy';
import type { DripFeedbackPrompt as Prompt } from '../library.types';
import DripFeedbackPrompt from './DripFeedbackPrompt';
import { resetDripFeedbackServiceForTest } from '../services/drip-feedback.service';
import { useDripFeedbackStore } from '../store/drip-feedback.store';

jest.mock('@/features/auth', () => ({
  useSessionStore: (selector: (state: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'user-1' } }),
}));
jest.mock('../api/drip-feedback.api', () => ({
  fetchDripFeedbackPrompt: jest.fn(),
  submitDripFeedback: jest.fn(),
  dismissDripFeedback: jest.fn(),
  muteDripFeedback: jest.fn(),
}));
const mockMemory = new Map<string, string>();
jest.mock('@/shared/storage/secure-storage', () => ({
  secureStorage: {
    get: async (key: string) => mockMemory.get(key) ?? null,
    set: async (key: string, value: string) => {
      mockMemory.set(key, value);
    },
    remove: async (key: string) => {
      mockMemory.delete(key);
    },
  },
}));
jest.mock('@/shared/lib/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// 렌더러는 jest-expo의 의존성이다. 검증에 필요한 공개 API만 선언한다(ConfirmDialog.test.tsx 와 같은 방식)
interface TestNode {
  type: unknown;
  props: Record<string, unknown>;
  findAll(predicate: (node: TestNode) => boolean): TestNode[];
}
interface Renderer {
  root: TestNode;
  unmount(): void;
}
const { act, create } = jest.requireActual<{
  act(callback: () => void | Promise<void>): Promise<void>;
  create(element: ReactNode): Renderer;
}>('react-test-renderer');

const submitMock = jest.mocked(submitDripFeedback);
const dismissMock = jest.mocked(dismissDripFeedback);
const muteMock = jest.mocked(muteDripFeedback);

const COPY = LIBRARY_COPY.dripFeedback;

const PROMPT: Prompt = {
  show: true,
  placedDate: '2026-10-16',
  mutedUntil: null,
  items: [
    {
      contentId: 'c1',
      title: '관세는 외국이 내는 세금이 아니다',
      thumbnailUrl: 'https://example.com/1.jpg',
      language: 'ko',
      source: 'drip',
      placedDate: '2026-10-16',
      libraryStatus: 'unplayed',
    },
    {
      contentId: 'c2',
      title: '금리가 내려도 대출 이자가 안 내리는 이유',
      thumbnailUrl: 'https://example.com/2.jpg',
      language: 'ko',
      source: 'drip',
      placedDate: '2026-10-16',
      libraryStatus: 'completed',
    },
  ],
};

const pressables = (renderer: Renderer, predicate: (props: Record<string, unknown>) => boolean) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type !== 'string' &&
      typeof node.props.onPress === 'function' &&
      predicate(node.props),
  );
const press = async (
  renderer: Renderer,
  predicate: (props: Record<string, unknown>) => boolean,
) => {
  const [node] = pressables(renderer, predicate);
  if (node === undefined) throw new Error('버튼을 찾지 못했다');
  await act(async () => {
    (node.props.onPress as () => void)();
  });
};
const byLabel = (label: string) => (props: Record<string, unknown>) =>
  props.accessibilityLabel === label;
const byTestId = (testID: string) => (props: Record<string, unknown>) => props.testID === testID;
const texts = (renderer: Renderer): string[] =>
  renderer.root
    .findAll((node) => typeof node.props.children === 'string')
    .map((node) => node.props.children as string);

/** 띄울 차례로 두고 그린 뒤 한 박자(reveal 지연)를 흘린다 */
const renderRevealed = async (isReady = true): Promise<Renderer> => {
  useDripFeedbackStore.getState().hold(PROMPT);
  let renderer!: Renderer;
  await act(async () => {
    renderer = create(<DripFeedbackPrompt isReady={isReady} />);
  });
  await act(async () => {
    jest.advanceTimersByTime(DRIP_FEEDBACK_REVEAL_DELAY_MS);
  });
  return renderer;
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockMemory.clear();
  resetDripFeedbackServiceForTest();
  useDripFeedbackStore.getState().reset();
  submitMock.mockResolvedValue(undefined);
  dismissMock.mockResolvedValue(undefined);
  muteMock.mockResolvedValue({ mutedUntil: '2026-10-19' });
});
afterEach(() => {
  jest.useRealTimers();
});

describe('DripFeedbackPrompt — "최근 추천 어떠셨나요?" 팝업(KAN-224)', () => {
  it('show=true 두 편이면 제목 한 문구 아래 두 편이 썸네일·제목·별 1~5 목록으로 나열된다', async () => {
    // given / when
    const renderer = await renderRevealed();
    // then
    expect(useDripFeedbackStore.getState().phase).toBe('visible');
    const shown = texts(renderer);
    expect(shown).toContain(COPY.title);
    expect(shown).toContain(PROMPT.items[0].title);
    expect(shown).toContain(PROMPT.items[1].title);
    // items 순서 그대로
    expect(shown.indexOf(PROMPT.items[0].title)).toBeLessThan(shown.indexOf(PROMPT.items[1].title));
    for (const item of PROMPT.items) {
      for (const stars of [1, 2, 3, 4, 5]) {
        expect(
          pressables(renderer, byTestId(`drip-feedback-star-${item.contentId}-${stars}`)),
        ).toHaveLength(1);
      }
    }
    act(() => renderer.unmount());
  });

  it('앞선 팝업이 있으면(isReady=false) 띄우지 않고 기다린다', async () => {
    const renderer = await renderRevealed(false);
    expect(useDripFeedbackStore.getState().phase).toBe('pending');
    act(() => renderer.unmount());
  });

  it('한 편만 별 4를 매기고 [보내기]하면 그 한 편만 전송되고 닫히며, 이 세션에는 다시 뜨지 않는다', async () => {
    const renderer = await renderRevealed();
    // when
    await press(renderer, byTestId('drip-feedback-star-c1-4'));
    await press(renderer, byLabel(COPY.send));
    // then
    expect(submitMock).toHaveBeenCalledTimes(1);
    expect(submitMock).toHaveBeenCalledWith({ ratings: [{ contentId: 'c1', stars: 4 }] });
    expect(useDripFeedbackStore.getState().phase).toBe('done');
    expect(dismissMock).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it('별을 하나도 안 매기면 [보내기]가 비활성이다', async () => {
    const renderer = await renderRevealed();
    const [send] = pressables(renderer, byLabel(COPY.send));
    expect((send.props.accessibilityState as { disabled: boolean }).disabled).toBe(true);
    act(() => renderer.unmount());
  });

  it('[닫기]는 응답의 placed_date 로 dismiss 를 보내고 닫힌다', async () => {
    const renderer = await renderRevealed();
    await press(renderer, byLabel(COPY.close));
    expect(dismissMock).toHaveBeenCalledWith({ placedDate: '2026-10-16' });
    expect(useDripFeedbackStore.getState().phase).toBe('done');
    act(() => renderer.unmount());
  });

  it('[이번 주 그만 보기]는 mute 를 보내고 즉시 닫힌다 — 저장이 실패해도 닫혀 있다', async () => {
    muteMock.mockRejectedValue(
      new ApiError(ERROR_CODES.INTERNAL_ERROR, 'x', true, null, null, 500),
    );
    const renderer = await renderRevealed();
    await press(renderer, byLabel(COPY.muteThisWeek));
    expect(muteMock).toHaveBeenCalledTimes(1);
    expect(useDripFeedbackStore.getState().phase).toBe('done');
    expect(dismissMock).not.toHaveBeenCalled();
    act(() => renderer.unmount());
  });

  it('DRIP_FEEDBACK_NOT_RATEABLE 이면 에러 없이 조용히 닫힌다', async () => {
    submitMock.mockRejectedValue(
      new ApiError(ERROR_CODES.DRIP_FEEDBACK_NOT_RATEABLE, 'x', false, null, null, 400),
    );
    const renderer = await renderRevealed();
    await press(renderer, byTestId('drip-feedback-star-c2-2'));
    await press(renderer, byLabel(COPY.send));
    expect(useDripFeedbackStore.getState().phase).toBe('done');
    expect(texts(renderer)).not.toContain(COPY.sendFailed);
    act(() => renderer.unmount());
  });

  it('서버 오류면 인라인 에러와 [다시 시도]를 보이고 팝업은 남는다', async () => {
    submitMock.mockRejectedValueOnce(
      new ApiError(ERROR_CODES.INTERNAL_ERROR, 'x', true, null, null, 500),
    );
    const renderer = await renderRevealed();
    await press(renderer, byTestId('drip-feedback-star-c1-5'));
    await press(renderer, byLabel(COPY.send));
    expect(useDripFeedbackStore.getState().phase).toBe('visible');
    expect(texts(renderer)).toContain(COPY.sendFailed);
    // 다시 시도 — 같은 별점이 다시 나가고 닫힌다
    await press(renderer, byLabel(COPY.retry));
    expect(submitMock).toHaveBeenLastCalledWith({ ratings: [{ contentId: 'c1', stars: 5 }] });
    expect(useDripFeedbackStore.getState().phase).toBe('done');
    act(() => renderer.unmount());
  });

  it('오프라인에서 [보내기]하면 보관하고 닫는다 — 다음 기회에 다시 보낸다', async () => {
    submitMock.mockRejectedValue(
      new ApiError(ERROR_CODES.NETWORK_ERROR, 'x', true, null, null, null),
    );
    const renderer = await renderRevealed();
    await press(renderer, byTestId('drip-feedback-star-c1-3'));
    await press(renderer, byLabel(COPY.send));
    expect(useDripFeedbackStore.getState().phase).toBe('done');
    expect([...mockMemory.values()]).toEqual([
      JSON.stringify([{ type: 'ratings', ratings: [{ contentId: 'c1', stars: 3 }] }]),
    ]);
    act(() => renderer.unmount());
  });
});
