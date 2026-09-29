import type { PropsWithChildren } from 'react';

/** iOS·웹은 시스템 글꼴을 그대로 사용한다. */
export default function FontProvider({ children }: PropsWithChildren) {
  return children;
}
