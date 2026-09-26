import * as Sentry from '@sentry/react-native';
import type { ReactNode } from 'react';

import FullScreenError from '@/shared/ui/FullScreenError';

import { MONITORING_COPY } from './monitoring.copy';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

/**
 * 전역 렌더 오류 경계(KAN-92) — 렌더 트리 어디서든 던져진 오류를 잡아 Sentry 로 보내고,
 * **흰 화면 대신 복구 화면**을 띄운다. 종전에는 ErrorBoundary 가 하나도 없어서 오류가 나면
 * 앱이 빈 화면으로 멈추고 그 사실이 어디에도 닿지 않았다.
 *
 * [다시 시도]는 경계를 리셋해 트리를 다시 그린다 — 일시적 상태(깨진 캐시 등)면 그걸로 풀리고,
 * 같은 오류가 반복되면 다시 잡혀 같은 화면이 뜬다. 내비게이션 밖에 있어 "홈으로"는 둘 수 없다
 * (경계가 NavigationContainer 를 감싸므로 내비게이션 자체가 죽었을 수 있다).
 */
export default function AppErrorBoundary({ children }: AppErrorBoundaryProps) {
  return (
    <Sentry.ErrorBoundary
      fallback={({ resetError }) => (
        <FullScreenError
          title={MONITORING_COPY.crash.title}
          description={MONITORING_COPY.crash.description}
          retryLabel={MONITORING_COPY.crash.retry}
          onRetry={resetError}
        />
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
