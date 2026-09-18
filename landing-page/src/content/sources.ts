/**
 * Sources 섹션의 출처 목록 — **admin.earcast.co.kr(파이프라인 운영 DB)의 `domains` 테이블에서 가져온 값**이다.
 * 우리가 임의로 고른 이름이 아니다(결정 2026-09-18).
 *
 * 추출 기준(2026-09-18 스냅샷):
 *   - tier 가 `blocked`·`hold` 가 아닌 도메인(allow_open · candidate)
 *   - 본문 접근 차단 표시(`fetch_blocked_at`)가 없는 곳
 *   - 스윕으로 실제 적재된 소스가 10건 이상인 곳(domain_stats.source_count)
 *   - 표시 이름은 `publisher` 에서 괄호 설명을 뗀 것. Frontiers 저널 8종은 "Frontiers" 하나로 합쳤다
 * 정렬은 적재 건수 내림차순. 주석의 도메인·건수는 추출 당시 값이다.
 *
 * 다시 뽑을 때: 로그인한 세션으로 `domains` + `domain_stats` 를 읽어 같은 기준으로 걸러 이 목록을 갈아 끼운다.
 * `style` 은 서체 계열(카테고리에서 추정 — 학술·매체는 serif, 오픈소스 공식은 mono, 그 외 sans).
 */
export const sourceItems = [
  { name: "Thoughtworks Insights", style: "sans" }, // www.thoughtworks.com · 2715건
  { name: "Antigone Journal", style: "serif" }, // antigonejournal.com · 200건
  { name: "Engelsberg Ideas", style: "serif" }, // engelsbergideas.com · 106건
  { name: "The Public Domain Review", style: "serif" }, // publicdomainreview.org · 100건
  { name: "뱅크샐러드 기술블로그", style: "sans" }, // blog.banksalad.com · 78건
  { name: "MDN Web Docs Blog", style: "mono" }, // developer.mozilla.org · 71건
  { name: "PsyPost", style: "serif" }, // www.psypost.org · 60건
  { name: "MIT News", style: "serif" }, // news.mit.edu · 50건
  { name: "arXiv", style: "serif" }, // arxiv.org · 49건
  { name: "The Marginalian", style: "sans" }, // www.themarginalian.org · 40건
  { name: "Kellogg Insight", style: "serif" }, // insight.kellogg.northwestern.edu · 33건
  { name: "Martin Fowler", style: "sans" }, // martinfowler.com · 30건
  { name: "Nautilus", style: "serif" }, // nautil.us · 30건
  { name: "어피티", style: "serif" }, // uppity.co.kr · 29건
  { name: "World History Encyclopedia", style: "serif" }, // www.worldhistory.org · 27건
  { name: "Kubernetes Blog", style: "mono" }, // kubernetes.io · 25건
  { name: "Hugging Face Blog", style: "sans" }, // huggingface.co · 25건
  { name: "LINE 기술블로그", style: "sans" }, // techblog.lycorp.co.jp · 25건
  { name: "SK플래닛 기술블로그", style: "sans" }, // techtopic.skplanet.com · 25건
  { name: "Stack Overflow Blog", style: "sans" }, // stackoverflow.blog · 25건
  { name: "Node.js Blog", style: "mono" }, // nodejs.org · 25건
  { name: "데브시스터즈 기술블로그", style: "sans" }, // tech.devsisters.com · 25건
  { name: "카카오스타일 기술블로그", style: "sans" }, // devblog.kakaostyle.com · 25건
  { name: "Google Research Blog", style: "sans" }, // research.google · 25건
  { name: "올리브영 기술블로그", style: "sans" }, // oliveyoung.tech · 25건
  { name: "React Blog", style: "mono" }, // react.dev · 23건
  { name: "토스 블로그", style: "sans" }, // blog.toss.im · 23건
  { name: "Frontiers", style: "serif" }, // frontiersin.org/journals/cognition · 20건
  { name: "Mozilla Hacks", style: "sans" }, // hacks.mozilla.org · 20건
  { name: "Cloudflare Blog", style: "sans" }, // blog.cloudflare.com · 20건
  { name: "네이버 D2", style: "sans" }, // d2.naver.com · 20건
  { name: "토스 기술블로그", style: "sans" }, // toss.tech · 20건
  { name: "Google Developers Blog", style: "sans" }, // developers.googleblog.com · 20건
  { name: "JSTOR Daily", style: "serif" }, // daily.jstor.org · 17건
  { name: "The Pragmatic Engineer", style: "sans" }, // blog.pragmaticengineer.com · 15건
  { name: "InfoQ", style: "serif" }, // www.infoq.com · 15건
  { name: "Eos", style: "serif" }, // eos.org · 15건
  { name: "미국 연방준비제도", style: "sans" }, // www.federalreserve.gov · 15건
  { name: "JetBrains Blog", style: "sans" }, // blog.jetbrains.com · 12건
  { name: "HBS Working Knowledge", style: "serif" }, // hbswk.hbs.edu · 12건
  { name: "Our World in Data", style: "serif" }, // ourworldindata.org · 12건
  { name: "Neuroscience News", style: "serif" }, // neurosciencenews.com · 12건
  { name: "Knowledge at Wharton", style: "serif" }, // knowledge.wharton.upenn.edu · 12건
  { name: "Mindful", style: "serif" }, // www.mindful.org · 10건
  { name: "CNCF Blog", style: "mono" }, // cncf.io · 10건
  { name: "Rust Blog", style: "mono" }, // blog.rust-lang.org · 10건
  { name: "지마켓 기술블로그", style: "sans" }, // dev.gmarket.com · 10건
  { name: "James Clear", style: "sans" }, // jamesclear.com · 10건
  { name: "우아한형제들 기술블로그", style: "sans" }, // techblog.woowahan.com · 10건
  { name: "NASA", style: "sans" }, // www.nasa.gov · 10건
  { name: "The Public Medievalist", style: "sans" }, // www.publicmedievalist.com · 10건
  { name: "The Transmitter", style: "serif" }, // www.thetransmitter.org · 10건
  { name: "Microsoft DevBlogs", style: "sans" }, // devblogs.microsoft.com · 10건
  { name: "Dropbox Tech", style: "sans" }, // dropbox.tech · 10건
  { name: "카카오 기술블로그", style: "sans" }, // tech.kakao.com · 10건
  { name: "하이퍼커넥트 기술블로그", style: "sans" }, // hyperconnect.github.io · 10건
  { name: "Stripe Blog", style: "sans" }, // stripe.com · 10건
  { name: "NHN Cloud Meetup", style: "sans" }, // meetup.nhncloud.com · 10건
  { name: "Go Blog", style: "mono" }, // go.dev · 10건
  { name: "GitHub Blog", style: "sans" }, // github.blog · 10건
  { name: "Literary Hub", style: "serif" }, // lithub.com · 10건
  { name: "web.dev", style: "sans" }, // web.dev · 10건
  { name: "Behavioral Scientist", style: "serif" }, // behavioralscientist.org · 10건
  { name: "MIT McGovern Institute", style: "serif" }, // mcgovern.mit.edu · 10건
] as const;

/**
 * 선을 타고 내려오는 대표 5곳 — 위 목록 중 적재·실제 참고(ok_count)가 많고 알아보기 쉬운 곳을 골랐다.
 * 로고는 각 사이트의 공식 아이콘(favicon)을 받아 `public/sources/` 에 두었다. **로고 그림을 쓰기로 한 결정은
 * 2026-09-18 사용자 지시**다(종전 "상표 문제로 글자만" 결정을 뒤집음).
 */
export const featuredSources = [
  { name: "MIT News", logo: "/sources/mit-news.png", line: 0 }, // news.mit.edu · 대학 발행
  { name: "arXiv", logo: "/sources/arxiv.png", line: 1 }, // arxiv.org · 학술 오픈액세스
  { name: "Frontiers", logo: "/sources/frontiers.png", line: 2 }, // frontiersin.org · 학술 오픈액세스, 실제 참고 최다 묶음
  { name: "PsyPost", logo: "/sources/psypost.jpg", line: 4 }, // psypost.org · 글로벌 미디어, 실제 참고 1위(14건)
  { name: "토스 기술블로그", logo: "/sources/toss-tech.png", line: 5 }, // toss.tech · 국내 기업 기술블로그
] as const;
