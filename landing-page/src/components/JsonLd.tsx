/**
 * JSON-LD를 <script>로 심는다.
 *
 * 내용을 만드는 일은 `lib/schema.ts`가 하고 여기는 직렬화만 한다.
 * `<`를 유니코드로 바꾸는 건 카피에 꺾쇠가 들어와 </script>가 만들어지는 것을 막기 위한 것이다
 * (정책 문서의 "〈확정 후 기재〉" 같은 자리표시자가 실제로 꺾쇠를 쓴다).
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
