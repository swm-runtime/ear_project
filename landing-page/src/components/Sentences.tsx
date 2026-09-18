/**
 * 짧은 안내문(리드·주석)을 **문장 단위로** 끊어 그린다.
 *
 * 문장마다 `display: inline-block` 조각(`.sentence`, globals.css)으로 감싼다. 그러면 한 줄에 두 문장이
 * 다 들어오면 그대로 한 줄이고, 들어오지 않으면 **다음 문장이 통째로 다음 줄로** 내려간다 —
 * "…들을 수 / 있어요." 같은 애매한 자리에서 감기지 않는다(피드백 2026-09-18). 한 문장이 한 줄보다
 * 길면 그 안에서는 보통처럼 감긴다. `<br />`을 박는 것과 달리 넓은 화면에서 불필요한 줄바꿈이 생기지 않는다.
 *
 * 문장 경계는 마침표·물음표·느낌표 뒤의 공백이다. 마크업이 섞인 문장(굵게 등)은 이 컴포넌트 대신
 * `.sentence` 클래스를 직접 감싼다(Hero 리드).
 */
export function Sentences({ text }: { text: string }) {
  const parts = text.split(/(?<=[.!?])\s+/).filter((part) => part.length > 0);
  return (
    <>
      {parts.map((part, i) => (
        // 띄어쓰기는 조각 **밖**에 둔다 — inline-block 안의 끝 공백은 줄 끝에서 사라져 문장이 붙어 보인다
        <span key={i}>
          {i > 0 ? " " : null}
          <span className="sentence">{part}</span>
        </span>
      ))}
    </>
  );
}
