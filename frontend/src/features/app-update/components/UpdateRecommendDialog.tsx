import { Linking } from 'react-native';

import { logger } from '@/shared/lib/logger';
import { STORE_URL } from '@/shared/lib/store-url';
import ConfirmDialog from '@/shared/ui/ConfirmDialog';

import { APP_UPDATE_COPY } from '../app-update.copy';
import { useAppUpdateStore } from '../store/app-update.store';

/**
 * 권장 업데이트 안내(`splash.md` 4.1 — 최소 이상·최신 미만, 닫기 가능). 설정 화면에 배지가 이미 있어 형태는 가볍게 —
 * 공용 다이얼로그 하나(KAN-99 할 일 3). 관문 통과 뒤 어느 화면 위에서든 뜨고, [나중에]·딤 탭·뒤로가기로 닫으면
 * 그 자리에서 계속한다. 앱 수명당 한 번(스토어 `hasShownRecommend`)
 */
export default function UpdateRecommendDialog() {
  const isVisible = useAppUpdateStore((s) => s.isRecommendVisible);
  const dismiss = useAppUpdateStore((s) => s.dismissRecommend);

  const openStore = (): void => {
    dismiss();
    Linking.openURL(STORE_URL).catch((error) => logger.warn('[app-update] open store failed', error));
  };

  return (
    <ConfirmDialog
      isVisible={isVisible}
      title={APP_UPDATE_COPY.recommend.title}
      body={APP_UPDATE_COPY.recommend.body}
      secondaryAction={{ label: APP_UPDATE_COPY.recommend.later, onPress: dismiss }}
      primaryAction={{ label: APP_UPDATE_COPY.recommend.action, onPress: openStore }}
      onCloseRequest={dismiss}
    />
  );
}
