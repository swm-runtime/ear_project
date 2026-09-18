import { ProblemCards } from "./ProblemCards";
import { Sentences } from "./Sentences";

export function Problem() {
  return (
    <section id="problem" className="section">
      <div className="container">
        <p className="eyebrow">Why</p>
        <h2 className="sectionTitle">듣고 싶은데, 마땅히 들을 게 없어요</h2>
        <p className="sectionLede">
          <Sentences text="출퇴근길 30분, 뭔가 들으며 성장하고 싶은데 딱 맞는 콘텐츠가 없어요. 카드를 올리면 이어의 답이 보여요." />
        </p>

        {/* 앞면은 문제, 올리거나 누르면 뒷면(이어의 답)으로 뒤집힌다 */}
        <ProblemCards />
      </div>
    </section>
  );
}
