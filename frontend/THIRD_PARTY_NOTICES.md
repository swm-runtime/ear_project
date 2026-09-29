# 제3자 저작물 고지

앱 코드에 직접 옮겨 넣은(패키지 의존성이 아닌) 제3자 저작물과 그 라이선스를 적는다. npm 패키지의 라이선스는 각 패키지가 가진다.

## Solar Icon Set — `library` 아이콘

| 항목 | 값 |
|---|---|
| 저작물 | Solar Icon Set — `library-linear`, `library-bold` |
| 저작자 | 480 Design (Solar Icons) |
| 출처 | Iconify `solar` 세트 — https://icon-sets.iconify.design/solar/ |
| 라이선스 | Creative Commons Attribution 4.0 International (CC BY 4.0) — https://creativecommons.org/licenses/by/4.0/ |
| 사용처 | `src/shared/ui/TabBarIcon.tsx` — Android 하단 탭 "라이브러리" 아이콘 |
| 변경 | `library-linear` 의 획 굵기를 1.5 → 1.25 로 줄였다. `library-bold` 는 원본 그대로 |

사용자에게 보이는 고지는 랜딩 `https://earcast.co.kr/licenses/`(원본 `landing-page/src/content/licenses.ts`)이고, 앱 설정 [오픈소스 라이선스] 행이 연다. 항목을 늘리면 두 곳을 함께 고친다.
