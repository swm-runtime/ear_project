import { PushMessage, PushReceipt, PushTicket } from '../notification.types';

/**
 * 푸시 발송 수단. 배포 설정(`PUSH_DELIVERY`)이 구현을 고른다 — `expo`면 Expo Push API,
 * `log`면 보내지 않고 로그만 남긴다(로컬·테스트·개발계 기본).
 *
 * 대상 판정·하루 1건·기록은 전부 호출부(`DripArrivalNotificationService`)의 몫이고, 여기는 "보낸다"만 한다.
 */
export abstract class PushClient {
  /**
   * 메시지를 접수시킨다. **돌려주는 ticket은 `messages`와 같은 순서·같은 길이다.**
   * 요청 자체가 실패하면(네트워크·5xx) 던진다 — 어느 메시지가 나갔는지 알 수 없으므로 부분 결과를 만들지 않는다.
   */
  abstract send(messages: PushMessage[]): Promise<PushTicket[]>;

  /** 접수된 ticket id의 최종 전달 결과. 아직 준비되지 않았거나 만료된 id는 결과에 없다 */
  abstract getReceipts(ids: string[]): Promise<Map<string, PushReceipt>>;
}
