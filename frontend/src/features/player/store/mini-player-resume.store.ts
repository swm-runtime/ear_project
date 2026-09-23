import { create } from 'zustand';

import type { MiniPlayerResumeFallback } from '../components/MiniPlayer';

interface MiniPlayerResumeStore {
  /** 활성 세션이 없을 때 그리는 복원 스냅샷 — 라이브러리(library.md 4.2)가 올린다 */
  fallback: MiniPlayerResumeFallback | null;
  onPlayPress: (() => void) | null;
  onExpandPress: (() => void) | null;
  onDismiss: (() => void) | null;
  set: (value: {
    fallback: MiniPlayerResumeFallback | null;
    onPlayPress: (() => void) | null;
    onExpandPress: (() => void) | null;
    onDismiss: (() => void) | null;
  }) => void;
}

/**
 * 미니플레이어가 화면 안이 아니라 **탭 바 독(CapsuleTabBar)** 에 하나만 살게 되면서(2026-09-23 — 캡슐과 같은
 * 유리 컨테이너에 있어야 물방울처럼 합쳐진다) 복원 스냅샷을 props 로 줄 수 없다. 라이브러리 화면이 여기에
 * 올리고 독의 미니플레이어가 읽는다. 노출·대상 판정은 여전히 라이브러리 소유다
 */
export const useMiniPlayerResumeStore = create<MiniPlayerResumeStore>((set) => ({
  fallback: null,
  onPlayPress: null,
  onExpandPress: null,
  onDismiss: null,
  set: (value) => set(value),
}));
