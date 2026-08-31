import { SesMailClient } from './ses-mail.client';

interface SentEmailInput {
  FromEmailAddress: string;
  Destination: { ToAddresses: string[] };
  Content: {
    Simple: { Subject: { Data: string }; Body: { Text: { Data: string } } };
  };
}

const sendMock = jest.fn<Promise<unknown>, [{ input: SentEmailInput }]>();

jest.mock('@aws-sdk/client-sesv2', () => ({
  SESv2Client: class {
    send = sendMock;
  },
  SendEmailCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

function buildClient(): SesMailClient {
  const configService = {
    get: jest.fn((key: string) =>
      key === 'AWS_REGION' ? 'ap-northeast-2' : '이어 <no-reply@earcast.co.kr>',
    ),
  };

  return new SesMailClient(configService as never);
}

describe('SesMailClient', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({});
  });

  describe('sendVerificationCode', () => {
    it('수신 주소와 코드를 담아 설정된 발신 주소로 보낸다', async () => {
      // given
      const client = buildClient();

      // when
      await client.sendVerificationCode('user@example.com', '123456');

      // then
      const [command] = sendMock.mock.calls[0];
      expect(command.input.FromEmailAddress).toBe(
        '이어 <no-reply@earcast.co.kr>',
      );
      expect(command.input.Destination.ToAddresses).toEqual([
        'user@example.com',
      ]);
      expect(command.input.Content.Simple.Body.Text.Data).toContain('123456');
      expect(command.input.Content.Simple.Body.Text.Data).toContain('3분');
    });

    it('SES 발송이 실패하면 그대로 던진다 — 호출부가 EMAIL_SEND_FAILED로 변환한다', async () => {
      // given
      const client = buildClient();
      sendMock.mockRejectedValue(new Error('MessageRejected'));

      // when
      const act = client.sendVerificationCode('user@example.com', '123456');

      // then
      await expect(act).rejects.toThrow('MessageRejected');
    });
  });
});
