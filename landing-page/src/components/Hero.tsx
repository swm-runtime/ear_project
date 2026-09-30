import Image from "next/image";
import Link from "next/link";
import { iosStoreUrl, site, stats } from "@/content/site";
import { AppleLogo } from "./AppleLogo";
import { CountUp } from "./CountUp";
import { HeroPhoneScene } from "./HeroPhoneScene";
import { PhoneStatusBar } from "./PhoneStatusBar";
import { PhoneTilt } from "./PhoneTilt";
import { routes } from "@/content/routes";
import s from "./Hero.module.css";

/* 브랜드 '이어'를 손글씨 획으로 그리는 SVG — 애플 초기 설정 "hello"처럼 획이 순서대로
   그려진다(pathLength=1 + stroke-dashoffset 1→0, 획마다 지속·지연을 달리해 손맛을 낸다).
   색은 잉크 단색(var(--ink-950) — Hero.module.css)이다. 손글씨에 그라데이션은 어색해서 뺐다.
   실제 텍스트는 스크린리더·SEO용으로 .srOnly 에 남는다. prefers-reduced-motion 이면
   애니메이션 없이 완성형으로 보인다(Hero.module.css). */
function BrandScript() {
  const strokes: [d: string, delay: number, dur: number][] = [
    // 이 — ㅇ (위에서 시작해 반시계로 한 붓)
    ["M60 46 C47 36 24 40 16 57 C7 76 18 98 41 100 C62 102 74 87 70 69 C68 60 64 53 58 49", 0.1, 0.62],
    // 이 — ㅣ (살짝 휘는 세로획)
    ["M97 12 C100 40 100 74 96 108", 0.72, 0.4],
    // 어 — ㅇ
    ["M172 46 C159 36 136 40 128 57 C119 76 130 98 153 100 C174 102 186 87 182 69 C180 60 176 53 170 49", 1.12, 0.62],
    // 어 — ㅓ 의 가로 꼭지 (세로획 허리에 붙는다)
    ["M199 59 C207 57.5 217 57.5 227 60", 1.74, 0.22],
    // 어 — ㅓ 세로획
    ["M230 12 C233 40 233 74 229 108", 1.96, 0.42],
  ];
  return (
    <svg className={s.brandSvg} viewBox="0 0 250 120" fill="none" aria-hidden="true">
      {strokes.map(([d, delay, dur]) => (
        <path key={d} d={d} className={s.brandStroke} pathLength={1}
          strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"
          style={{ animationDelay: `${delay}s`, animationDuration: `${dur}s` }} />
      ))}
    </svg>
  );
}

/**
 * 하단 탭 아이콘 — 앱이 iOS 26 시스템 탭 바 아이콘(books.vertical · safari · person)을 재서 직접 그린
 * 도형 그대로다(frontend/src/shared/ui/TabBarIcon · PersonIcon). 선택된 탭은 면(fill), 나머지는
 * 선(stroke)으로 그린다 — 색만으로 현재 탭을 알리지 않기 위한 규칙이라 옮겨 올 때 같이 지킨다.
 * 이 장면은 탐색 탭이라 탐색만 채운 변형이다.
 */
function TabIcon({ name }: { name: "library" | "explore" | "profile" }) {
  if (name === "library") {
    return (
      <svg viewBox="0 0 28 25" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M5.83 24.08H1.92a1 1 0 0 1-1-1V5.25a1 1 0 0 1 1-1h2.91a1 1 0 0 1 1 1Z" />
          <path d="M5.83 24.08V7.83h8.34v16.25Z" />
          <path d="M14.17 24.08V1.92a1 1 0 0 1 1-1h3.66a1 1 0 0 1 1 1v21.16a1 1 0 0 1-1 1H1.92" />
          <rect x="22.05" y="3.83" width="4" height="20.25" rx="1" transform="rotate(-4 24.05 24.08)" />
        </g>
        <path d="M8.3 10.83h3.6M8.3 21.17h3.6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    );
  }

  if (name === "explore") {
    // 채운 변형 — 원을 채우고 바늘은 흰색, 가운데 구멍으로 원 색이 비친다
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11.5" fill="currentColor" />
        <path
          fill="#fff"
          fillRule="evenodd"
          d="M17.8 6.2 14.4 14.4 6.2 17.8 9.6 9.6Z M12 10.8a1.2 1.2 0 1 0 0 2.4a1.2 1.2 0 1 0 0-2.4Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <circle cx="12" cy="6.55" r="4.1" />
        <path d="M12 14.55C17.1 14.55 20.6 17.3 20.6 20.6Q20.6 21.1 20.1 21.1H3.9Q3.4 21.1 3.4 20.6C3.4 17.3 6.9 14.55 12 14.55Z" />
      </g>
    </svg>
  );
}

/** 더보기 — 가로 둥근 점 3개(앱 shared/ui/MoreIcon과 같은 도형) */
function MoreDots() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="5.5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="18.5" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

/** 커버 사진 한 변. scripts/preview-art.mjs가 굽는 크기와 같아야 한다 */
const COVER_PX = 420;
/** 주제 칩 배경 사진의 크기 — 이것도 scripts/preview-art.mjs와 같아야 한다 */
const TOPIC_PX = { w: 240, h: 96 };

/* 주제 칩 — 관심 주제가 앞에 오는 순서는 서버가 정한다. 이름과 사진은 앱의 것 그대로다
   (frontend/src/features/interest/components/TopicChip.tsx가 주제 이름으로 사진을 찾는다).
   지금 공개된 주제(GET /public/topics) 가운데서 골랐다 — 앱에 없는 주제를 그리지 않는다. */
const TOPICS = [
  { name: "생산성", photo: "/preview/topic-productivity.webp" },
  { name: "데이터·AI", photo: "/preview/topic-data-ai.webp" },
  { name: "심리학", photo: "/preview/topic-psychology.webp" },
  { name: "커뮤니케이션", photo: "/preview/topic-communication.webp" },
];

/* 피드에 그릴 콘텐츠 — **운영에 발행된 실제 콘텐츠**다(2026-09-30 — 종전 시드 제목·picsum 사진 대체).
   제목·길이·주제는 운영 `contents`의 값 그대로이고, 커버는 그 콘텐츠의 실제 썸네일을 받아 구운 것이다
   (scripts/preview-art.mjs의 COVERS와 **같은 순서** — 어긋나면 남의 커버가 붙는다).
   섹션 제목과 순서는 앱 탐색 화면의 것이다. 대표 카드는 주제 해시태그(최대 2개) + 길이를, 타일은 길이만 적는다. */
const POPULAR = [
  { title: "뱅크런은 원인이 아니라 결과다", topics: ["경제 상식", "경제"], min: 17, cover: "/preview/cover-1.webp" },
  { title: "일이 잘 안될 때 더 집중하면 안 되는 이유", topics: ["뇌과학·인지", "습관·동기"], min: 14, cover: "/preview/cover-2.webp" },
];

const RECOMMENDED = [
  { title: "월급이 끊겨도 흔들리지 않는 구조 — 비상금·필수 계좌·현금흐름의 설계", min: 19, cover: "/preview/cover-3.webp" },
  { title: "말이 막혀도 생각은 돌아간다 — 언어와 사고는 다른 회로다", min: 17, cover: "/preview/cover-4.webp" },
  { title: "알고도 몸이 움직이지 않는 이유", min: 17, cover: "/preview/cover-5.webp" },
];

/**
 * 히어로 오른쪽의 앱 화면 예시 — 실제 이어 앱의 **탐색 화면(iOS 26)**을 그대로 옮겼다.
 *
 * 구조·문구·치수의 출처는 `frontend/`다(2026-09-30 기준으로 다시 그렸다):
 * - 상단: 시스템 큰 제목 "탐색"과 오른쪽 잔여 재생 링 캡슐이 같은 줄(useSystemLargeTitle · ExploreRingPill),
 *   그 밑에 채움 검색 필드(ExploreSearchBarRow `fill`)와 사진 알약 주제 칩(TopicChips)
 * - 피드: 섹션별 가로 캐러셀(ExploreScreen). 인기 섹션만 큰 카드(ExploreFeaturedCard — 커버가 카드 위·양옆에
 *   붙고 아래는 흐린 커버가 이어진다)와 집계 구간 토글(PopularPeriodToggle), 나머지는 사각 타일(ExploreTile)
 * - 하단: 떠 있는 유리 캡슐 탭 바(NativeMainTabs — iOS 26 시스템 탭 바). 목록은 그 밑으로 흐른다
 *
 * 치수는 앱의 pt 값을 그대로 쓴다(Hero.module.css의 `--pt`). **앱 화면이 바뀌면 여기도 같이 고쳐야 한다** —
 * 랜딩이 실제와 다른 화면을 보여주면 첫인상부터 약속이 어긋난다.
 *
 * 미니플레이어는 정적 화면에 그리지 않는다 — 활성 재생 세션이 있을 때만 뜨고, 여기 담은 장면은
 * 재생 없이 둘러보는 중이다. 재생 흐름은 덧씌움 층(HeroPhoneScene)이 보여 준다.
 *
 * 껍데기는 아이폰이다. 화면 비율(393:852)·모서리·다이내믹 아일랜드·홈 인디케이터를
 * 실제 비율로 두어야 "폰에서 이렇게 보인다"가 그대로 읽힌다.
 *
 * 순수 장식이라 스크린리더에는 캡션 한 줄만 남긴다.
 */
function AppPreview() {
  return (
    <div className={s.previewWrap}>
      <p className="srOnly">
        앱 탐색 화면 예시 — 검색창과 주제 칩 아래로 &lsquo;지금 인기&rsquo;, &lsquo;관심사에 맞는
        추천&rsquo; 섹션이 가로로 넘겨 보는 카드 목록으로 놓여 있어요.
      </p>
      {/* 흰 페이지 위에 놓이는 검은 컴포넌트는 기기 껍데기뿐이다. 화면 안은 앱과 같은
          흰 배경이라 토큰을 뒤집지 않는다(darkTokens를 붙이지 않는 이유다). */}
      {/* 마우스 위치에 따라 살짝 기울어진다(PhoneTilt) — 변환은 .phone 이, 값은 --rx/--ry 가 든다 */}
      <PhoneTilt className={s.tilt}>
      <div className={s.phone} aria-hidden="true">
        {/* 측면 버튼 — 왼쪽은 액션·볼륨, 오른쪽은 전원 */}
        <span className={`${s.sideBtn} ${s.btnAction}`} />
        <span className={`${s.sideBtn} ${s.btnVolUp}`} />
        <span className={`${s.sideBtn} ${s.btnVolDown}`} />
        <span className={`${s.sideBtn} ${s.btnPower}`} />

        <div className={s.phoneScreen}>
          <PhoneStatusBar />

          {/* 큰 제목 줄 — 제목과 잔여 재생 링이 같은 줄이다. 링은 가운데 숫자가 남은 횟수,
              둘레의 원호가 남은/한도 비율(12시에서 시계 방향). 무제한이면 자리를 비운다 */}
          <div className={s.navBar}>
            <span className={s.navTitle}>탐색</span>
            <span className={s.ringPill}>
              <svg viewBox="0 0 28 28" className={s.ring}>
                <circle cx="14" cy="14" r="12.5" fill="none" stroke="#e3e3e8" strokeWidth="3" />
                <circle
                  cx="14"
                  cy="14"
                  r="12.5"
                  fill="none"
                  stroke="#1a1a1e"
                  strokeWidth="3"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray="0.5 1"
                  transform="rotate(-90 14 14)"
                />
              </svg>
              <span className={s.ringCount}>1</span>
            </span>
          </div>

          {/* 검색 필드 — 콘텐츠 안에 놓여 목록과 같이 스크롤한다. 유리가 아니라 채운 면 */}
          <div className={s.searchRow}>
            <span className={s.searchField}>
              <svg viewBox="0 0 24 24" className={s.searchIcon}>
                <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
                <path d="M15.4 15.4 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
              콘텐츠 검색
            </span>
          </div>

          {/* 주제 칩 — 주제 사진 + 어두운 막 + 흰 라벨. 고르면 막이 짙어지고 피드가 격자 목록으로 바뀐다 */}
          <div className={s.chipRow}>
            {TOPICS.map((topic) => (
              <span key={topic.name} className={s.chip}>
                <Image
                  className={s.chipPhoto}
                  src={topic.photo}
                  alt=""
                  width={TOPIC_PX.w}
                  height={TOPIC_PX.h}
                />
                <span className={s.chipLabel}>{topic.name}</span>
              </span>
            ))}
          </div>

          {/* 섹션형 피드. 섹션 구성·순서·제목은 서버 응답 그대로다 */}
          <div className={s.feed}>
            {/* 인기 섹션만 큰 카드이고, 제목 줄에 집계 구간 토글이 붙는다 */}
            <div className={s.section}>
              <div className={s.sectionHead}>
                <span className={s.sectionTitle}>지금 인기</span>
                <span className={s.periodToggle}>
                  <span className={`${s.seg} ${s.segActive}`}>주간</span>
                  <span className={s.seg}>월간</span>
                  <span className={s.seg}>전체</span>
                </span>
              </div>
              {/* 다음 카드가 옆에 걸쳐 보여야 가로로 더 있다는 것이 드러난다 */}
              <div className={s.carousel}>
                {POPULAR.map((c) => (
                  <span key={c.title} className={s.featCard}>
                    {/* 카드 전체에 흐린 커버를 깔고 위 정사각형만 선명한 커버가 덮는다 */}
                    <span className={s.featBackdrop} style={{ backgroundImage: `url(${c.cover})` }} />
                    <span className={s.featScrim} />
                    <Image
                      className={s.featArt}
                      src={c.cover}
                      alt=""
                      width={COVER_PX}
                      height={COVER_PX}
                    />
                    <span className={s.featTitle}>{c.title}</span>
                    <span className={s.featFoot}>
                      <span className={s.featMeta}>
                        {c.topics.slice(0, 2).map((name) => `#${name}`).join(" ")} · {c.min}분
                      </span>
                      <span className={s.featMore}>
                        <MoreDots />
                      </span>
                    </span>
                  </span>
                ))}
              </div>
            </div>

            {/* 일반 섹션은 사각 타일. 더보기는 아트워크 위에 얹는다. 탭 바 밑으로 흘러 들어간다 */}
            <div className={s.section}>
              <span className={`${s.sectionTitle} ${s.sectionTitleBlock}`}>관심사에 맞는 추천</span>
              <div className={s.carousel}>
                {RECOMMENDED.map((c) => (
                  <span key={c.title} className={s.tile}>
                    <span className={s.tileArt}>
                      <Image
                        className={s.tileImg}
                        src={c.cover}
                        alt=""
                        width={COVER_PX}
                        height={COVER_PX}
                      />
                      <span className={s.tileMore}>
                        <MoreDots />
                      </span>
                    </span>
                    <span className={s.tileTitle}>{c.title}</span>
                    <span className={s.tileMeta}>{c.min}분</span>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 바 밑을 지나는 목록은 바닥으로 갈수록 옅어진다(iOS 26 scroll edge effect를 흉내 낸 막) */}
          <span className={s.edgeFade} />

          {/* 하단 탭 바 — 화면 폭을 다 쓰는 띠가 아니라 떠 있는 유리 캡슐이다. 지금 보이는 화면은 탐색 */}
          <div className={s.tabBar}>
            {(
              [
                { name: "library", label: "라이브러리" },
                { name: "explore", label: "탐색" },
                { name: "profile", label: "프로필" },
              ] as const
            ).map((t) => (
              <span
                key={t.name}
                className={`${s.tabBarItem} ${t.name === "explore" ? s.tabBarItemActive : ""}`}
              >
                <TabIcon name={t.name} />
                <span className={s.tabBarLabel}>{t.label}</span>
              </span>
            ))}
          </div>

          <span className={s.homeIndicator} />

          {/* 정적 화면 위에서 앱 흐름(카드 탭 → 플레이어 → 미니플레이어)을 반복하는 덧씌움 층.
              reduced-motion이면 아무것도 그리지 않아 위 정적 화면만 남는다 */}
          <HeroPhoneScene track={POPULAR[0]} />

          {/* 다이내믹 아일랜드 — 어느 화면이 떠 있든 맨 위 층이다 */}
          <span className={s.island} />
        </div>
      </div>
      </PhoneTilt>
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
            <span className={s.brand}>
              <BrandScript />
              <span className={s.srOnly}>{site.name}</span>
            </span>
            <span className={s.tagline}>
              자기계발 하고 싶은데,
              <br />
              시간이 부족하신가요?
            </span>
          </h1>

          {/* 히어로 문구에는 편수·한도 같은 정책 수치를 넣지 않는다. 정책이 바뀔 때마다
              첫 화면을 고쳐야 하고, 무엇보다 여기서 할 말은 규격이 아니라 약속이다.
              구체적인 숫자는 바로 아래 숫자 띠와 요금제 페이지가 맡는다. */}
          {/* 문장 단위로 끊는다(components/Sentences.tsx와 같은 규칙) — 굵은 조각이 있어 직접 감싼다 */}
          <p className={s.lede}>
            <span className="sentence">관심 있는 주제만 한 번 골라 두세요.</span>{" "}
            <span className="sentence">매일 아침, 그 주제로 만든 15분짜리 에피소드가 도착해 있어요.</span>{" "}
            <span className="sentence">
              오늘은 뭘 듣지 고민할 일 없이,<strong> 이어폰만 꽂으면 돼요.</strong>
            </span>
          </p>

          <div className={s.actions}>
            <a href={iosStoreUrl} className="btn btnPrimary" target="_blank" rel="noopener noreferrer">
              <AppleLogo />
              App Store에서 다운로드
            </a>
            <Link href={routes.features.path} className="btn btnGhost">
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
            </Link>
          </div>

          {/* iOS만 먼저 나왔다 — 받기 버튼 바로 밑에서 Android 사용자가 헛걸음하지 않게 알린다 */}
          <p className={s.platformNote}>Android는 곧 출시 예정이에요</p>

          <p className={s.note}>
            카카오·네이버·구글·애플 계정으로 시작해요 · 무료 요금제에도 매일 2편이 도착해요
          </p>
        </div>

        <AppPreview />
      </div>

      <div className={`container ${s.statsWrap}`}>
        <dl className={s.stats}>
          {stats.map((stat) => (
            <div key={stat.label} className={s.stat}>
              <dt className={s.statLabel}>{stat.label}</dt>
              {/* 숫자만 짧게 카운트업 — 스크롤해서 들어올 때 한 번(CountUp) */}
              <dd className={s.statValue}>
                <CountUp value={stat.value} />
              </dd>
              <dd className={s.statNote}>{stat.note}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
