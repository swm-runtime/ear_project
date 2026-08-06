import { site, stats } from "@/content/site";
import s from "./Hero.module.css";

/** 히어로 오른쪽의 앱 화면 예시. 순수 장식이라 스크린리더에는 캡션 한 줄만 남긴다. */
function AppPreview() {
  const episodes = [
    { topic: "협상·커뮤니케이션", title: "협상의 첫 5분에 벌어지는 일", meta: "13분 · 미청취" },
    { topic: "습관 형성", title: "작심삼일은 의지가 아니라 설계의 문제", meta: "11분 · 미청취" },
    { topic: "경제·금융", title: "금리를 읽는 가장 단순한 방법", meta: "15분 · 미청취" },
  ];

  return (
    <div className={s.previewWrap}>
      <p className="srOnly">
        앱 라이브러리 화면 예시 — 오늘 도착한 에피소드 두 편과 이어듣기 바가 보입니다.
      </p>
      <div className={s.phone} aria-hidden="true">
        <div className={s.phoneScreen}>
          <div className={s.phoneTop}>
            <span className={s.phoneTitle}>라이브러리</span>
            <span className={s.phoneBadge}>오늘 도착 2편</span>
          </div>

          <ul className={s.cards}>
            {episodes.map((ep, i) => (
              <li key={ep.title} className={`${s.card} ${i === 2 ? s.cardFaded : ""}`}>
                <span className={s.chip}>{ep.topic}</span>
                <span className={s.cardTitle}>{ep.title}</span>
                <span className={s.cardMeta}>{ep.meta}</span>
              </li>
            ))}
          </ul>

          <div className={s.mini}>
            <span className={s.playBtn}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                <path d="M8 5.5v13l11-6.5-11-6.5Z" />
              </svg>
            </span>
            <span className={s.miniText}>
              <span className={s.miniTitle}>퇴근길에 듣다 만 그 편</span>
              <span className={s.miniMeta}>6:42 지점부터 이어듣기</span>
            </span>
            <span className={s.wave}>
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className={s.hero} id="top">
      <div className={s.glow} aria-hidden="true" />
      <div className={`container ${s.inner}`}>
        <div className={s.copy}>
          <p className={s.eyebrow}>AI가 만드는 오디오 팟캐스트</p>

          <h1 className={s.title}>
            <span className={s.brand}>{site.name}</span>
            <span className={s.tagline}>
              출근길에 열면,
              <br />
              오늘 들을 게 준비되어 있어요
            </span>
          </h1>

          <p className={s.lede}>
            관심 주제만 한 번 고르면, 자기계발·커리어·교양 콘텐츠가 매일 2편씩
            오디오로 도착합니다. 무엇을 들을지 고르는 수고는 서비스가 대신합니다.
            <strong> 이어폰만 꽂으면 됩니다.</strong>
          </p>

          <div className={s.actions}>
            <a href="#cta" className="btn btnPrimary">
              출시 소식 받기
            </a>
            <a href="#how" className={`btn btnGhost ${s.ghost}`}>
              어떻게 작동하나요
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                <path
                  d="M5 12h13m0 0-5.5-5.5M18 12l-5.5 5.5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </a>
          </div>

          <p className={s.note}>
            카카오·네이버·구글 계정으로 시작 · 무료 요금제에도 매일 2편이 도착합니다
          </p>
        </div>

        <AppPreview />
      </div>

      <div className={`container ${s.statsWrap}`}>
        <dl className={s.stats}>
          {stats.map((stat) => (
            <div key={stat.label} className={s.stat}>
              <dt className={s.statLabel}>{stat.label}</dt>
              <dd className={s.statValue}>{stat.value}</dd>
              <dd className={s.statNote}>{stat.note}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
