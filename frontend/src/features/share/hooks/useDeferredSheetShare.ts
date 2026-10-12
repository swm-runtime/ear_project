import { useRef } from 'react';
import { Platform } from 'react-native';

import { shareContent, type ShareContentInput } from '../share.service';

/**
 * 더보기 시트 경유 공유(SH1) — "시트가 닫히고 OS 공유 시트가 열린다"(share.md 4.1)의 실행 순서
 * 보장. iOS는 Modal이 dismiss되는 동안 새 시스템 시트(UIActivityViewController) present를
 * 무시하므로, 시트 닫기(setState)와 동시에 shareContent를 부르면 아무 일도 일어나지 않는다
 * (2026-08-25 시뮬레이터 검증에서 발견 — Modal이 없는 상세 앱바 경로는 같은 shareContent로
 * 정상 동작). 공유는 시스템 시트 present 경합 때문에 이 순서가 필수다. 플레이어의 [상세 정보]도
 * 딤 퇴장과 상세 화면 전환이 겹치지 않도록 별도로 닫힘 완료를 기다린다(usePlayerScreen).
 *
 * 사용법: 시트를 닫는 조작과 함께 requestShare를 부르고, 시트 Modal의 onDismiss(iOS 전용 —
 * dismiss 완료 콜백)에 handleSheetDismiss를 연결한다. onDismiss가 오지 않는 Android는
 * 경합이 없어 requestShare가 즉시 연다.
 */
export const useDeferredSheetShare = () => {
  const pendingRef = useRef<ShareContentInput | null>(null);

  /** 시트를 닫는 setState와 함께 호출한다 — 실제 공유는 시트가 닫힌 뒤(iOS) 열린다 */
  const requestShare = (input: ShareContentInput) => {
    if (Platform.OS === 'ios') {
      pendingRef.current = input;
      return;
    }
    void shareContent(input);
  };

  /** 시트 Modal의 onDismiss에 연결한다 — 공유가 아닌 닫기에서는 보류가 없어 아무 일도 없다 */
  const handleSheetDismiss = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    void shareContent(pending);
  };

  return { requestShare, handleSheetDismiss };
};
