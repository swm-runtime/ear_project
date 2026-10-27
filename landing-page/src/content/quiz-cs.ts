/**
 * CS 지식 테스트(`/quiz/cs/`)의 문제·결과 문구 — KAN-281 홍보용 참여형 콘텐츠(2026-10-27).
 *
 * 문제는 이어 「키워드로 빠르게 배우는 CS 지식」 시리즈 대본(`pipeline/.work/series/cs-keyword-map/NN-*.md`)에
 * 정의가 나오는 키워드로만 냈다. 풀이는 대본의 정의와 같은 뜻으로 쓰고, `episode.no`는 대본 파일 번호(= 편 번호)다.
 * 대본을 고쳐 정의가 바뀌면 여기도 같이 본다.
 *
 * 문구를 고치면 웹폰트 서브셋을 다시 만든다(`bash scripts/subset-fonts.sh`) — 문제·결과는 클라이언트에서만
 * 그려지므로, 서브셋 스크립트가 이 파일을 직접 훑어 글자를 모은다.
 */

export type QuizQuestion = {
  /** 문제가 다루는 키워드. 화면에는 내지 않는다 — 대본 대조·관리용이다(곧 정답인 경우가 많다). */
  keyword: string;
  question: string;
  options: readonly string[];
  /** `options`의 정답 위치(0부터). */
  answer: number;
  /** 답을 고른 뒤 보여 주는 풀이. */
  explanation: string;
  episode: { no: number; title: string };
};

export type QuizLevel = {
  /** 이 점수 이상이면 이 레벨이다. 높은 레벨부터 적는다. */
  min: number;
  title: string;
  summary: string;
};

export const csQuiz = {
  id: "cs",
  path: "/quiz/cs/",
  /** 앱 받기 링크의 유입 출처(`/app/?src=`) — Play Console·App Store Connect 에서 이 값으로 본다. */
  appSource: "quiz_cs",
  title: "당신의 CS 지식 수준은?",
  description:
    "자료구조부터 네트워크·보안까지, 개발자라면 한 번쯤 들어 본 키워드 10문제로 알아보는 CS 지식 수준 테스트예요.",
  series: "키워드로 빠르게 배우는 CS 지식",
} as const;

export const csQuestions: readonly QuizQuestion[] = [
  {
    keyword: "과적합",
    question: "학습 데이터는 잘 맞히는데, 처음 보는 데이터에서는 성능이 떨어지는 현상은?",
    options: ["일반화", "군집화", "차원 축소", "과적합"],
    answer: 3,
    explanation:
      "과적합은 모델이 학습 데이터에 지나치게 맞춰진 상태예요. 기출문제 답만 외운 학생이 새 문제를 못 푸는 것과 같아서, 학습·검증·테스트 데이터를 나눠 확인해요.",
    episode: { no: 6, title: "인공지능" },
  },
  {
    keyword: "정규화",
    question: "데이터베이스에서 정규화를 하는 가장 큰 이유는?",
    options: [
      "조회를 무조건 빠르게 하려고",
      "중복을 줄여 삽입·삭제·수정 이상을 없애려고",
      "테이블 개수를 줄이려고",
      "접근 권한을 나누려고",
    ],
    answer: 1,
    explanation:
      "정규화는 중복된 데이터를 줄이도록 테이블을 쪼개 이상 현상을 없애는 과정이에요. 반대로 성능을 위해 일부러 합치거나 중복을 허용하는 건 반정규화예요.",
    episode: { no: 7, title: "데이터베이스의 뼈대와 설계" },
  },
  {
    keyword: "원자성",
    question:
      "송금 중 오류가 나도 '빼기'만 되고 '넣기'는 안 된 채 끝나면 안 돼요. 트랜잭션이 전부 반영되거나 전혀 반영되지 않아야 한다는 성질은?",
    options: ["일관성", "고립성", "원자성", "지속성"],
    answer: 2,
    explanation:
      "ACID의 A, Atomicity예요. 일관성은 끝난 상태가 정해 둔 규칙에 맞는지, 고립성은 동시에 도는 트랜잭션끼리 끼어들지 않는지, 지속성은 완료된 결과가 장애에도 남는지를 따져요.",
    episode: { no: 9, title: "트랜잭션과 복구" },
  },
  {
    keyword: "결합도",
    question: "모듈 사이의 결합도 중 가장 약해서, 가장 바람직한 것은?",
    options: ["제어 결합도", "공통 결합도", "스탬프 결합도", "자료 결합도"],
    answer: 3,
    explanation:
      "결합도는 약한 것부터 자료·스탬프·제어·외부·공통·내용 결합도예요. 자료 결합도는 매개변수로 꼭 필요한 값만 주고받는 경우예요. 좋은 설계는 결합도는 낮고 응집도는 높아요.",
    episode: { no: 3, title: "소프트웨어 설계" },
  },
  {
    keyword: "PaaS",
    question: "개발·실행 환경까지 빌려 쓰고, 애플리케이션과 데이터만 신경 쓰면 되는 클라우드 서비스 모델은?",
    options: ["SaaS", "PaaS", "IaaS", "온프레미스"],
    answer: 1,
    explanation:
      "IaaS는 서버·저장 공간·네트워크까지만, PaaS는 개발·실행 환경인 플랫폼까지, SaaS는 완성된 소프트웨어 자체를 빌려요.",
    episode: { no: 13, title: "시스템 아키텍처와 클라우드" },
  },
  {
    keyword: "ARP",
    question: "IP 주소를 보고 그 장비의 MAC 주소를 알아내는 프로토콜은?",
    options: ["RARP", "ICMP", "ARP", "DHCP"],
    answer: 2,
    explanation:
      "ARP는 IP 주소로 MAC 주소를 알아내요. RARP는 반대로 MAC 주소로 IP 주소를 알아내는데 지금은 DHCP로 대체됐고, ICMP는 오류·상태를 알리는 프로토콜로 ping이 이걸 써요.",
    episode: { no: 12, title: "네트워크" },
  },
  {
    keyword: "검증과 확인",
    question: "V 모델이 강조하는 검증(Verification)과 확인(Validation) 중, '확인'이 따지는 것은?",
    options: [
      "사용자가 원한 것을 만들었는가",
      "명세대로 제대로 만들었는가",
      "정해진 일정 안에 끝냈는가",
      "코드가 오류 없이 빌드되는가",
    ],
    answer: 0,
    explanation:
      "검증은 명세대로 제대로 만들었는지, 확인은 사용자가 원한 것을 만들었는지를 따져요. V 모델은 개발 단계마다 짝이 되는 테스트 단계를 정해 둬서, 결함이 나오면 어느 단계로 돌아갈지 바로 보여요.",
    episode: { no: 1, title: "소프트웨어를 만드는 방법" },
  },
  {
    keyword: "이진 탐색 트리",
    question: "빈 이진 탐색 트리에 1부터 100까지 작은 수부터 차례로 넣으면 어떻게 될까요?",
    options: [
      "균형이 잡혀 탐색이 가장 빨라진다",
      "루트가 자동으로 가운데 값으로 바뀐다",
      "트리가 한 줄로 길어져 선형 탐색만큼 느려진다",
      "값이 겹쳐 삽입이 거부된다",
    ],
    answer: 2,
    explanation:
      "이진 탐색 트리는 왼쪽에 작은 값, 오른쪽에 큰 값만 둬서 평균적으로 빠르게 찾아요. 하지만 정렬된 순서로 들어오면 한쪽으로만 이어져 선형 탐색만큼 느려져요. 중위 순회를 하면 값이 작은 순서대로 나와요.",
    episode: { no: 4, title: "자료구조와 알고리즘" },
  },
  {
    keyword: "공개키 암호",
    question: "공개키 암호로 친구만 읽을 수 있는 메시지를 보내려면, 무엇으로 암호화할까요?",
    options: ["친구의 공개키", "내 개인키", "내 공개키", "친구의 개인키"],
    answer: 0,
    explanation:
      "공개키로 잠근 건 짝이 되는 개인키로만 열 수 있어요. 친구의 공개키로 잠그면 개인키를 가진 친구만 열 수 있죠. 실제로는 데이터를 빠른 세션키로 잠그고, 그 세션키만 공개키로 감싸 보내요.",
    episode: { no: 14, title: "정보보안" },
  },
  {
    keyword: "교착상태",
    question: "교착상태(데드락)가 생기는 네 가지 조건이 아닌 것은?",
    options: ["상호 배제", "선점", "점유와 대기", "환형 대기"],
    answer: 1,
    explanation:
      "네 조건은 상호 배제·점유와 대기·비선점·환형 대기예요. 남이 가진 자원을 강제로 빼앗을 수 없는 '비선점'이 조건이고, 넷 중 하나라도 성립하지 못하게 막으면 교착상태를 예방할 수 있어요.",
    episode: { no: 11, title: "운영체제" },
  },
];

export const csLevels: readonly QuizLevel[] = [
  {
    min: 9,
    title: "CS 마스터",
    summary: "이 정도면 자랑해도 돼요. 근데 주변 개발자들도 다 이 정도일까요? 확인해 볼 차례예요.",
  },
  {
    min: 7,
    title: "시니어 개발자",
    summary: "꽤 하시네요. 다른 개발자들의 수준이 궁금하지 않나요? 주변에 공유해보세요.",
  },
  {
    min: 4,
    title: "주니어 개발자",
    summary: "들어는 봤는데, 설명까지는 어려운 단계예요. 옆자리 동료는 다 맞혔을지도...?",
  },
  {
    min: 0,
    title: "CS 새싹",
    summary: "키워드가 꽤 낯설었죠? 괜찮아요, 상대적으로 부족하지만 지금 시작해도 늦지 않아요.",
  },
];

export function levelFor(score: number): QuizLevel {
  return csLevels.find((level) => score >= level.min) ?? csLevels[csLevels.length - 1];
}
