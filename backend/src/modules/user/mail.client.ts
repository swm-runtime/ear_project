import { Injectable, Logger } from '@nestjs/common';

/**
 * 이메일 발송 경계.
 *
 * **발송 인프라는 미결이다**(auth.md·auth-api.md 미결 사항 — SES 예정, 미확정).
 * 도메인 로직이 특정 제공자에 묶이지 않도록 추상 클래스로 두고,
 * 제공자가 정해지면 이 인터페이스를 구현한 클라이언트로 교체한다.
 */
export abstract class MailClient {
  abstract sendVerificationCode(email: string, code: string): Promise<void>;
}

/**
 * 인프라 확정 전까지 쓰는 개발용 구현.
 *
 * **인증 코드와 이메일 원문을 로그에 남기지 않는다**(convention.md 8.4).
 * 따라서 이 구현으로는 실제 코드를 받아볼 수 없다 — 코드 검증 흐름은 단위 테스트로 검증한다.
 */
@Injectable()
export class LoggingMailClient extends MailClient {
  private readonly logger = new Logger(LoggingMailClient.name);

  sendVerificationCode(email: string): Promise<void> {
    this.logger.log('verification mail dispatched', {
      // 주소 원문 대신 도메인만 남긴다
      email_domain: email.slice(email.indexOf('@') + 1),
    });

    return Promise.resolve();
  }
}
