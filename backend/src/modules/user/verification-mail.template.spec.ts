import { renderVerificationMail } from './verification-mail.template';

describe('renderVerificationMail', () => {
  it('숫자가 아닌 코드는 조립하지 않는다 — HTML 주입 경로를 원천 차단한다', () => {
    expect(() => renderVerificationMail('<img src=x>')).toThrow();
  });

  it('HTML과 텍스트 대체본에 코드와 유효 시간이 함께 들어간다', () => {
    // given / when
    const { subject, html, text } = renderVerificationMail('123456');

    // then
    expect(subject).toContain('123456');
    expect(html).toContain('123456');
    expect(html).toContain('3분');
    // 텍스트 대체본은 변경 전 본문 4줄 그대로다 — HTML 미지원 클라이언트의 몫
    expect(text).toBe(
      [
        '이어 이메일 인증 코드예요.',
        '',
        '123456',
        '',
        '코드는 3분 동안 유효해요.',
        '본인이 요청하지 않았다면 이 메일을 무시해 주세요.',
      ].join('\n'),
    );
  });
});
