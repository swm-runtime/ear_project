import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { EnvironmentVariables } from '@/config/env.validation';

import { MailClient } from './mail.client';
import { EMAIL_VERIFICATION_CODE_TTL_SEC } from './user.constant';

/**
 * SES 발송 구현 (`MAIL_DELIVERY=ses` — auth.md 미결이던 발송 인프라를 SES로 확정, 2026-08-31).
 *
 * - 자격증명은 SDK 기본 체인(EC2 인스턴스 롤의 `ses-send`)이 준다. env에 키를 두지 않는다.
 * - 발신 주소(`MAIL_FROM_ADDRESS`)는 SES에서 검증된 도메인/주소여야 한다. 미검증이면 SES가
 *   거부하고, 그 실패는 그대로 던진다 — 호출부(EmailVerificationService)가 행을 지우고
 *   `EMAIL_SEND_FAILED`(횟수 미차감)로 변환한다(auth-api.md 4.8).
 * - **코드·수신 주소 원문을 로그에 남기지 않는다**(convention.md 8.4) — LoggingMailClient와
 *   같은 기준. 실패 사유도 SES 에러 이름까지만.
 */
@Injectable()
export class SesMailClient extends MailClient {
  private readonly logger = new Logger(SesMailClient.name);
  private readonly ses: SESv2Client;
  private readonly fromAddress: string;

  constructor(configService: ConfigService<EnvironmentVariables, true>) {
    super();
    this.ses = new SESv2Client({
      region: configService.get('AWS_REGION', { infer: true }),
    });
    this.fromAddress = configService.get('MAIL_FROM_ADDRESS', { infer: true });
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const ttlMin = Math.floor(EMAIL_VERIFICATION_CODE_TTL_SEC / 60);

    await this.ses.send(
      new SendEmailCommand({
        FromEmailAddress: this.fromAddress,
        Destination: { ToAddresses: [email] },
        Content: {
          Simple: {
            Subject: {
              Data: `[이어] 이메일 인증 코드 ${code}`,
              Charset: 'UTF-8',
            },
            Body: {
              Text: {
                Data: [
                  '이어 이메일 인증 코드예요.',
                  '',
                  code,
                  '',
                  `코드는 ${ttlMin}분 동안 유효해요.`,
                  '본인이 요청하지 않았다면 이 메일을 무시해 주세요.',
                ].join('\n'),
                Charset: 'UTF-8',
              },
            },
          },
        },
      }),
    );

    this.logger.log('verification mail dispatched', {
      email_domain: email.slice(email.indexOf('@') + 1),
    });
  }
}
