import { formatEnCount, formatFullDate, toLocalDate } from '@/shared/i18n/format';
import { particleRo, particleWa } from '@/shared/i18n/korean-particle';
import { localized, type LocalizedCopy } from '@/shared/i18n/localized';

/**
 * 사용자 노출 문구(convention.md 3.5). 확정 카피는 explore-uiux.md 6장과 1:1 대조한다.
 * 잔여 표시·재생 확인 팝업·회수/한도 토스트는 player가 소유한다(PLAYER_COPY) — 여기 두지 않는다.
 */
const ko = {
  /** iOS 26 큰 제목 바의 제목 — 탭 라벨과 같은 말(NativeMainTabs, 2026-09-25) */
  tabTitle: '탐색',
  /** E6·E7 검색(explore.md 4.5 — MVP 포함 격상, 합의 2026-08-23) */
  search: {
    /** 검색 탭(iOS 26)의 큰 제목 — 앱스토어·뮤직 검색 탭과 같은 한 단어 */
    tabTitle: '검색',
    /** TODO(카피): uiux 6장 제안값 — features에 확정 문구가 없다 */
    placeholder: '콘텐츠 검색',
    /** 입력한 검색어 지우기(ⓧ) 낭독 라벨 */
    clearA11y: '검색어 지우기',
    cancel: '취소',
    /** 2자 미만·특수문자/이모지만 입력 — 검색을 실행하지 않는다(explore.md 7장, 확정 문구) */
    emptyPrompt: '검색어를 입력해주세요',
    /** TODO(카피): 섹션 라벨 확정 전 — wireframe E6 표기를 따른다 */
    recentTitle: '최근 검색어',
    clearAll: '전체 삭제',
    suggestedTitle: '추천 키워드',
    /** 입력한 검색어를 그대로 되비춘다(explore.md 4.5-3, 확정 문구) */
    noResult: (query: string) => `‘${query}’ 검색 결과가 없어요`,
    /**
     * 서버가 오타를 교정해 "대신 검색"했다(KAN-239 — PM 문구 2026-10-22 02:56). 교정어를 되비추고 조사는 받침에 맞춘다
     * ("‘커리어’로" · "‘면접’으로")
     */
    correctedTo: (queryUsed: string) => `‘${queryUsed}’${particleRo(queryUsed)} 대신 검색했어요`,
    /** 교정 안내 오른쪽 버튼 — 탭하면 교정을 끄고 원문 그대로 검색한다(`exact=true`). 한 줄에 같이 선다(PM 2026-10-22) */
    searchInsteadFor: (original: string) => `원본 검색 ‘${original}’`,
    searchInsteadA11y: (original: string) => `‘${original}’${particleRo(original)} 검색`,
    /** 교정 없이 키워드로 맞은 편이 하나도 없다 — 의미 유사 결과만이다(match: related). 입력 검색어를 되비춘다 */
    relatedResult: (query: string) => `‘${query}’${particleWa(query)} 관련된 결과예요`,
    /** E7 대체 목록의 제목(explore-uiux.md 4.6 — "인기 콘텐츠" 행 목록) */
    popularTitle: '인기 콘텐츠',
    /** 결과 갱신을 polite 채널로 한 번 알린다 — "'커리어' 검색 결과 12개"(uiux 7) */
    resultCountA11y: (query: string, count: number) => `‘${query}’ 검색 결과 ${count}개`,
    /** 최근 검색어는 검색어·삭제가 각각 포커스를 받는다(uiux 7) */
    recentItemA11y: (query: string) => `${query}, 최근 검색어, 탭하면 검색`,
    recentDeleteA11y: (query: string) => `‘${query}’ 검색어 삭제`,
    /** 추천 키워드는 버튼이다 — 탭 결과가 필터가 아니라 검색 실행이다(uiux 7) */
    suggestedChipA11y: (name: string) => `${name}, 추천 키워드, 탭하면 검색`,
  },

  /**
   * E1 섹션 제목 — **아는 종류(`key`)만 앱이 갖는다**(global-api.md 2.3 "화면 문구는 클라이언트" · 2026-10-19 KAN-194 실기기 —
   * 서버 `title` 은 한국어 고정이라 영어 표시에서 한국어가 보였다). 모르는 종류·`topic_group`(주제 이름)은 서버 `title` 그대로다
   * (`explore.section-title.ts`). 한국어는 서버 문자열과 같은 값이다
   */
  sectionTitles: {
    interest: '관심사에 맞는 추천',
    new: '새로 나온 콘텐츠',
    popular: '인기 콘텐츠',
  },

  /** E12 더보기 액션시트 — 상세 정보·원문 보기·담기/제거(explore-uiux.md 4.4, 공유는 P1) */
  sheet: {
    detail: '상세 정보',
    sourceLink: '원문 보기',
    save: '라이브러리에 담기',
    remove: '라이브러리에서 제거',
    close: '닫기',
  },

  /** E3 담기 완료 — 제거는 무음이다(uiux 4.4) */
  saveToast: '라이브러리에 담았어요',
  saveToastAction: '보러가기',
  /** 낙관 반영 실패 — 원상 복구 + 토스트(common-error-handling.md 4.4) */
  saveFailedToast: '담지 못했어요. 다시 시도해주세요',
  removeFailedToast: '제거하지 못했어요. 다시 시도해주세요',

  /** 빈 상태 2종 — 원인이 다르므로 문구를 공유하지 않는다(uiux 4.7) */
  empty: {
    feed: {
      title: '준비된 콘텐츠가 곧 늘어나요',
      action: '라이브러리로 가기',
    },
    filtered: {
      title: '이 주제의 콘텐츠는 아직 없어요',
      action: '필터 해제',
    },
  },

  /** E10 전체 화면 에러 — 캐시 피드로 대체하지 않는다(합의 2026-08-06) */
  error: {
    networkTitle: '인터넷 연결을 확인해주세요',
    loadFailedTitle: '일시적인 오류가 발생했어요',
    loadFailedDescription: '잠시 후 다시 시도해주세요',
    retry: '다시 시도',
    loadMoreFailed: '목록을 더 불러오지 못했어요',
  },

  row: {
    durationLabel: (minutes: number) => `${minutes}분`,
    /**
     * 주제 해시태그 — 대표 카드의 하단 줄(PM 2026-09-28 01:06 "해시태그 ㄱㄱ"). 이름 사이 공백은 그대로 둔다
     * (`#경제 상식`) — 붙여 쓰면 주제 목록·필터에 보이는 이름과 달라져 같은 주제로 안 읽힌다
     */
    hashtags: (names: string[]) => names.map((name) => `#${name}`).join(' '),
    /** 카드 하단 줄 — 해시태그가 있으면 `#태그 #태그 · N분`, 없으면 `N분` */
    metaWithTags: (tags: string[], minutes: number) =>
      tags.length > 0 ? `${tags.map((tag) => `#${tag}`).join(' ')} · ${minutes}분` : `${minutes}분`,
    /** 해시태그 한 개 — 대표 카드에서는 이 글자가 검색 버튼이다(KAN-219) */
    hashtag: (tag: string) => `#${tag}`,
    /** 해시태그 버튼 낭독 — 누르면 무엇을 하는지까지(uiux 7) */
    hashtagSearchA11y: (tag: string) => `#${tag} 검색`,
    /** 대표 카드 하단 줄의 길이 — 태그 버튼 뒤에 붙는다 */
    durationAfterTags: (minutes: number) => `· ${minutes}분`,
    moreA11y: '더보기, 담기·제거',
    /** 완청 체크는 색이 아니라 형태 단서 + 스크린리더 텍스트로 전달한다(library 카드와 동일) */
    completedA11y: '완청한 콘텐츠',
    /** 행은 하나의 탭 영역으로 읽힌다 — 값과 동작을 한 문장으로(uiux 7) */
    a11yLabel: (parts: { title: string; minutes: number; completed: boolean }) =>
      [
        parts.title,
        `${parts.minutes}분`,
        ...(parts.completed ? ['완청한 콘텐츠'] : []),
        '재생',
      ].join(', '),
  },

  chips: {
    /** 주제 칩은 하나만 고르는 토글이다(uiux 7, 2026-10-09) */
    a11yHint: '주제 필터',
  },

  /**
   * 시리즈 카드(KAN-225 — explore-uiux.md 4.1-1). 단일 타일과 같은 크기·격자에 들어가고, 사진 아래 변의 "시리즈" 글자로 가른다.
   * 편수는 계획 편수 그대로다(PM 2026-10-22 — 시리즈는 결국 한 번에 다 공개되므로 "공개 편/계획 편"을 쓰지 않는다. 시리즈 화면 머리와 같다)
   */
  seriesCard: {
    badge: '시리즈',
    /** 카드 하단 줄 — 주제가 있으면 `#주제 #주제 · N편`, 없으면 `N편` */
    meta: (topicNames: string[], total: number) => {
      const episodes = `${total}편`;
      return topicNames.length > 0
        ? `${topicNames.map((name) => `#${name}`).join(' ')} · ${episodes}`
        : episodes;
    },
    /** 카드는 재생이 아니라 시리즈 화면을 연다 — 낭독도 "열기"로 끝난다(uiux 7) */
    a11yLabel: (title: string, total: number) => `${title}, 시리즈, ${total}편, 열기`,
  },

  /** E14 시리즈 화면(KAN-225 — explore.md 4.7 · explore-uiux.md 4.11) */
  series: {
    backA11y: '뒤로 가기',
    /** 머리 메타 줄의 편수 — 계획 편수 그대로(PM 2026-10-22 — 종전 "N편 중 M편 공개"는 쓰지 않는다) */
    episodeTotal: (total: number) => `${total}편`,
    status: { ongoing: '연재 중', completed: '완결' },
    /** 목록 끝 요약 — 앨범의 "N곡, M분" 자리. 길이는 노출 편 길이의 합(분 올림 합) */
    footer: (count: number, totalMinutes: number) => {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const length =
        hours === 0 ? `${minutes}분` : minutes === 0 ? `${hours}시간` : `${hours}시간 ${minutes}분`;
      return `${count}편, ${length}`;
    },
    /** 지금 플레이어에 올라 있는 편 — 번호 자리 표식의 낭독 */
    nowPlaying: '재생 중',
    /** 머리 [재생] — 아직 다 듣지 않은 가장 앞 편(전부 들었으면 1화). 낭독은 어느 편인지까지 */
    play: '재생',
    playA11y: (episodeNo: number, title: string) => `재생, ${episodeNo}화 ${title}`,
    /**
     * [재생] 양옆 원 버튼(PM 2026-10-22 08:55 — 애플 뮤직 앨범 화면). 셔플 = 무작위 한 편 재생 + 재생 목록 순서 섞기(자동 다음 재생은
     * 여전히 없다). 담기 = 시리즈 편 전부를 라이브러리에 편 단위로 담는다(새로 공개될 편은 들어오지 않는다 — 구독 아님)
     */
    shuffleA11y: '셔플 재생',
    saveAllA11y: '시리즈를 라이브러리에 담기',
    removeAllA11y: '시리즈를 라이브러리에서 빼기',
    removeAllToast: (count: number) => `${count}편을 라이브러리에서 뺐어요`,
    /** 담긴 편 없이 시리즈째 담기만 남아 있을 때의 빼기 */
    seriesRemovedToast: '시리즈를 라이브러리에서 뺐어요',
    undo: '실행 취소',
    saveAllToast: (count: number) => `${count}편을 라이브러리에 담았어요`,
    /** 노출 편이 이미 다 담겨 있을 때 시리즈째 담기 — 새로 담긴 편은 없고 따라오기만 켜진다 */
    followToast: '새 편이 나오면 라이브러리에 담아 드릴게요',
    /** 아래 가로 목록 제목 — 애플 뮤직 앨범 화면 "○○의 다른 앨범" · "좋아할 만한 다른 항목" 자리(PM 2026-10-22) */
    /** 발행일자 — 노출 편 중 가장 이른 발행 시각(ISO 순간)을 기기 시간대의 연·월·일로. 앨범 하단 발행일 자리 */
    publishedAt: (iso: string) => formatFullDate(toLocalDate(iso), 'ko'),
    /** 같은 간행물(발행 이름)의 다른 시리즈 — 애플 뮤직 "○○의 다른 앨범" 자리(PM 2026-10-22) */
    publisherSeriesTitle: (publisherName: string) => `${publisherName}의 다른 시리즈`,
    moreSeriesTitle: '다른 시리즈 더보기',
    youMayLikeTitle: '좋아할 만한 다른 항목',
    /** 앱바 오른쪽 캡슐의 ⋯ — 시리즈 시트(공유 · 소개 전체 보기) */
    moreA11y: '시리즈 더보기',
    aboutAction: '소개 전체 보기',
    /** 편 행의 내 상태 — 서버 값(library·progress)을 글자로 옮긴다. 색만으로 말하지 않는다 */
    state: {
      completed: '완청',
      saved: '담음',
      remaining: (minutes: number) => `${minutes}분 남음`,
    },
    rowA11y: (parts: { episodeNo: number; title: string; minutes: number; state: string | null }) =>
      [
        `${parts.episodeNo}화`,
        parts.title,
        `${parts.minutes}분`,
        ...(parts.state ? [parts.state] : []),
        '재생',
      ].join(', '),
    /** 404(없는·다른 시장·노출 편 0개 시리즈 — explore-api.md 4.7) */
    notFound: {
      title: '시리즈를 찾을 수 없어요',
      action: '돌아가기',
    },
  },

  /** E13 인기 구간 토글 — 라벨은 화면 문구이고 week·month·all은 전송값이다(uiux 6장) */
  popular: {
    periodLabels: { week: '주간', month: '월간', all: '전체' },
    /** 낭독용 구간 이름 — 한국어는 화면 라벨과 같다. 영어는 화면 라벨을 Week·Month·All 로 줄여서 낭독은 온전한 말로 둔다(2026-10-19) */
    periodA11yLabels: { week: '주간', month: '월간', all: '전체' },
    toggleA11y: '인기 콘텐츠 집계 구간',
    /** 전환 실패 — 직전 목록을 유지한 채 섹션 안에서만 알린다(uiux 4.10) */
    switchFailed: '목록을 불러오지 못했어요',
    /** 전환 완료를 스크린리더에 한 번 알린다 — "월간 인기 콘텐츠, 10개"(uiux 7) */
    switchedA11y: (periodLabel: string, count: number) => `${periodLabel} 인기 콘텐츠, ${count}개`,
  },
} as const;

const en: LocalizedCopy<typeof ko> = {
  tabTitle: 'Explore',
  search: {
    tabTitle: 'Search',
    placeholder: 'Search episodes',
    clearA11y: 'Clear search',
    cancel: 'Cancel',
    emptyPrompt: 'Enter a search term',
    recentTitle: 'Recent searches',
    clearAll: 'Clear all',
    suggestedTitle: 'Suggested',
    noResult: (query: string) => `No results for “${query}”`,
    correctedTo: (queryUsed: string) => `Showing results for “${queryUsed}”`,
    searchInsteadFor: (original: string) => `Search “${original}” instead`,
    searchInsteadA11y: (original: string) => `Search for “${original}”`,
    relatedResult: (query: string) => `Showing related results for “${query}”`,
    popularTitle: 'Popular',
    resultCountA11y: (query: string, count: number) =>
      `${formatEnCount(count, { one: 'result', other: 'results' })} for “${query}”`,
    recentItemA11y: (query: string) => `${query}, recent search, tap to search`,
    recentDeleteA11y: (query: string) => `Remove “${query}” from recent searches`,
    suggestedChipA11y: (name: string) => `${name}, suggested keyword, tap to search`,
  },

  sectionTitles: {
    interest: 'Recommended',
    new: 'New episodes',
    popular: 'Popular',
  },

  sheet: {
    detail: 'Details',
    sourceLink: 'View original',
    save: 'Add to Library',
    remove: 'Remove from Library',
    close: 'Close',
  },

  saveToast: 'Added to Library',
  saveToastAction: 'View',
  saveFailedToast: "Couldn't add. Please try again.",
  removeFailedToast: "Couldn't remove. Please try again.",

  empty: {
    feed: {
      title: 'More episodes are coming soon',
      action: 'Go to Library',
    },
    filtered: {
      title: 'No episodes on this topic yet',
      action: 'Clear filter',
    },
  },

  error: {
    networkTitle: 'Check your internet connection',
    loadFailedTitle: 'Something went wrong',
    loadFailedDescription: 'Please try again later.',
    retry: 'Try again',
    loadMoreFailed: "Couldn't load more",
  },

  row: {
    durationLabel: (minutes: number) => `${minutes} min`,
    hashtags: (names: string[]) => names.map((name) => `#${name}`).join(' '),
    metaWithTags: (tags: string[], minutes: number) =>
      tags.length > 0
        ? `${tags.map((tag) => `#${tag}`).join(' ')} · ${minutes} min`
        : `${minutes} min`,
    hashtag: (tag: string) => `#${tag}`,
    hashtagSearchA11y: (tag: string) => `Search #${tag}`,
    durationAfterTags: (minutes: number) => `· ${minutes} min`,
    moreA11y: 'More, add or remove',
    completedA11y: 'Played',
    a11yLabel: (parts: { title: string; minutes: number; completed: boolean }) =>
      [parts.title, `${parts.minutes} min`, ...(parts.completed ? ['Played'] : []), 'Play'].join(
        ', ',
      ),
  },

  chips: {
    a11yHint: 'Topic filter',
  },

  seriesCard: {
    badge: 'Series',
    meta: (topicNames: string[], total: number) => {
      const episodes = formatEnCount(total, { one: 'episode', other: 'episodes' });
      return topicNames.length > 0
        ? `${topicNames.map((name) => `#${name}`).join(' ')} · ${episodes}`
        : episodes;
    },
    a11yLabel: (title: string, total: number) =>
      `${title}, series, ${formatEnCount(total, { one: 'episode', other: 'episodes' })}, open`,
  },

  series: {
    backA11y: 'Back',
    episodeTotal: (total: number) => formatEnCount(total, { one: 'episode', other: 'episodes' }),
    status: { ongoing: 'Ongoing', completed: 'Complete' },
    shuffleA11y: 'Shuffle',
    saveAllA11y: 'Add series to Library',
    removeAllA11y: 'Remove series from Library',
    removeAllToast: (count: number) =>
      `Removed ${formatEnCount(count, { one: 'episode', other: 'episodes' })} from Library`,
    seriesRemovedToast: 'Removed series from Library',
    undo: 'Undo',
    saveAllToast: (count: number) =>
      `Added ${formatEnCount(count, { one: 'episode', other: 'episodes' })} to Library`,
    followToast: 'New episodes will be added to your Library',
    publishedAt: (iso: string) => formatFullDate(toLocalDate(iso), 'en'),
    publisherSeriesTitle: (publisherName: string) => `More from ${publisherName}`,
    moreSeriesTitle: 'More Series',
    youMayLikeTitle: 'You Might Also Like',
    footer: (count: number, totalMinutes: number) => {
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      const length =
        hours === 0
          ? `${minutes} min`
          : minutes === 0
            ? `${hours} hr`
            : `${hours} hr ${minutes} min`;
      return `${formatEnCount(count, { one: 'episode', other: 'episodes' })}, ${length}`;
    },
    nowPlaying: 'Now playing',
    play: 'Play',
    playA11y: (episodeNo: number, title: string) => `Play, episode ${episodeNo}, ${title}`,
    moreA11y: 'More for this series',
    aboutAction: 'Show description',
    state: {
      completed: 'Played',
      saved: 'In Library',
      remaining: (minutes: number) => `${minutes} min left`,
    },
    rowA11y: (parts: { episodeNo: number; title: string; minutes: number; state: string | null }) =>
      [
        `Episode ${parts.episodeNo}`,
        parts.title,
        `${parts.minutes} min`,
        ...(parts.state ? [parts.state] : []),
        'Play',
      ].join(', '),
    notFound: {
      title: "Couldn't find this series",
      action: 'Go back',
    },
  },

  popular: {
    // 짧은 명사형 — 한국어 주간·월간·전체와 같은 꼴. "Weekly·Monthly·All time"은 칸 76 이 필요해 제목이 접혔다(2026-10-19 PM)
    periodLabels: { week: 'Week', month: 'Month', all: 'All' },
    periodA11yLabels: { week: 'this week', month: 'this month', all: 'all time' },
    toggleA11y: 'Popular episodes time range',
    switchFailed: "Couldn't load the list",
    switchedA11y: (periodLabel: string, count: number) =>
      `Popular ${periodLabel}, ${formatEnCount(count, { one: 'episode', other: 'episodes' })}`,
  },
};

export const EXPLORE_COPY = localized({ ko, en });
