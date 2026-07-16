# 바퀴벌레 도박판 (Cockroach Gambling Board) — 설계 문서

## 개요
실물 목재 보드(회전 가능한 15개 판자)를 기반으로 한 싱글플레이어 도박 프로토타입 "라 쿠카라차"의 웹 버전. 라운드 시작 전 판자를 회전시켜 미로를 구성하고, 6개 출구 중 하나에 코인을 베팅한 뒤 벌레를 풀어 물리 시뮬레이션으로 결과를 정한다.

원본 자료: `design_handoff_cockroach_gambling_board/README.md`, `바퀴벌레 도박판.dc.html` (커스텀 템플릿 포맷 프로토타입, Matter.js 기반). 이 문서들은 보드/판자/출구 좌표와 물리 상수를 픽셀 단위로 정확히 명시하며, 이 값들은 그대로 재사용한다(임의로 재배치하지 않음).

## 스택 결정
- **React + TypeScript + Vite**, 물리 엔진은 **Matter.js**
- 배포: **Firebase Hosting**, 신규 Firebase 프로젝트 생성
- 저장: **localStorage**에 코인/통계/이력 영구 저장
- 레이아웃: **처음부터 반응형** (데스크톱 3~4컬럼 → 좁은 화면에서 세로 스택)

단일 화면(setup → running → result 3단계 순환)만 존재하므로 라우터나 전역 상태 라이브러리는 불필요. `useReducer` 기반 로컬 상태로 충분하다.

## 폴더 구조
```
src/
  game/
    constants.ts        # PLANK_LENGTH, PLANK_THICK, PIVOT_OFFSET, BOARD_DATA(15개),
                         # EXIT_META(6개), EXIT_Y, 벽 세그먼트, 벌레 물리 상수
    types.ts             # Phase, PlankState, ExitMeta, HistoryEntry, GameState, GameAction
    usePhysicsEngine.ts  # Matter Engine/Runner 생명주기, 판자 피벗 회전, 벌레 launch,
                         # 출구 충돌 감지, anti-stuck/wobble 틱 로직
    bugRenderer.ts       # 캡슐 몸통 + 다리 6쌍 + 더듬이 커스텀 캔버스 드로잉 (afterRender 포팅)
    useGameState.ts      # useReducer: coins/selectedExitId/betAmount/phase/pendingBet/
                         # lastResult/exitStats/history
  components/
    Header.tsx           # 타이틀, phase pill, 코인 pill, 코인 리필 버튼
    BoardCanvas.tsx       # 물리 캔버스, 판자 클릭 회전 처리
    ExitColumn.tsx        # 좌/우 출구 3개씩, 라벨+배당률, 선택 하이라이트
    BettingPanel.tsx      # 선택 출구/배당, 코인 스테퍼, 예상 수익, 베팅 CTA
    StatsPanel.tsx        # 출구별 누적 이탈 횟수 막대 그래프
    HistoryPanel.tsx      # 최근 8라운드 이력
    ResultModal.tsx       # 적중/탈락 오버레이, 다음 라운드 버튼
  hooks/
    useLocalStorage.ts
  styles/
    tokens.css            # 다크 테마 디자인 토큰 (CSS 변수)
    global.css
```

## 물리 엔진 통합
`usePhysicsEngine(canvasRef, plankStates, onExit)`가 캔버스 마운트 시 Matter `Engine`/`Runner`를 1회 생성하고 언마운트 시 정리한다.

- **판자 15개**: 정적 바디로 생성. 회전은 README의 오프센터 피벗 로직을 그대로 구현 — `Body.setCentre`로 회전 원점만 이동시키고 지오메트리는 그대로 유지 (`PIVOT_OFFSET = 9`).
- **출구 6개**: `isSensor: true` 바디로 생성, `collisionStart` 이벤트로 벌레와의 충돌을 감지해 라운드를 종료한다.
- **벽**: 상/하 26유닛 두께 바 2개, 좌/우 각 4개 세그먼트(3개 갭 = 출구 위치).
- **벌레**: 반지름 14 원형 콜라이더(frictionless, restitution 0.5), 매 틱 전진력(`bugSpeed` 기본 0.0032) + 각속도 흔들림(`sin(t)*cos(0.8t)*0.035`) 적용. 40틱 이상 속도 0.5 미만 정체 시 각도 반전 + 랜덤 킥(anti-stuck).
- **시각**: 벌레는 원이 아니라 캡슐(58×17) + 다리 6쌍(사인파 wiggle) + 더듬이로 커스텀 렌더링.
- `noiseTime`/`stuckTimer` 등 매 틱 변하는 값은 React state가 아닌 훅 내부 `ref`/클로저 변수로 관리해 불필요한 리렌더를 막는다.

## 상태 관리
`useGameState`는 `useReducer`로 다음을 관리한다:
- `coins` (기본 15), `selectedExitId`, `betAmount`, `phase`, `pendingBet`, `lastResult`, `exitStats`, `history`(최대 8개, 최신순)

액션: `SELECT_EXIT`, `SET_BET_AMOUNT`, `PLACE_BET`(코인 즉시 차감 + phase→running), `RESOLVE_ROUND(result)`(승패 판정, 코인 정산, 통계/이력 갱신, phase→result), `NEXT_ROUND`(phase→setup, 판자 회전 상태는 유지), `REFILL_COINS`.

`coins`/`exitStats`/`history`가 변경될 때마다 `useLocalStorage` 훅을 통해 자동 직렬화 저장. 판자 회전 상태(`plankStates`)는 라운드 간에는 유지되지만 localStorage에는 저장하지 않는다 — 새로고침 시 기본 배치(`state: 0`)로 리셋된다.

## 반응형 레이아웃
데스크톱: `[좌 출구 컬럼(100px)] [보드 560×560] [우 출구 컬럼(100px)]`를 한 행으로, 그 옆에 사이드 패널(320px)을 배치하는 CSS Grid.
좁은 화면(~900px 이하): 보드 영역이 위, 사이드 패널이 아래로 쌓이는 세로 스택으로 전환. 보드는 1000×1000 논리 좌표를 유지한 채 CSS로만 스케일(`clamp()` 기반 반응형 크기)하여 물리/히트테스트 정확도를 훼손하지 않는다.

## 디자인 토큰
README에 명시된 다크 테마 값을 CSS 커스텀 프로퍼티로 이식 (배경 `#0f0f12`, 카드 `#15181c`, 텍스트 `#e7ebee`, 강조 teal `#5fb8b0`, blue `#5b8fc4`, loss `#c96a63` 등). 보드/판자/벌레는 사진 매칭 리터럴 팔레트(`#4a3525`, `#8b7355` 등)를 사용하며 다크 테마로 재스타일링하지 않는다.

## 배포
1. `npm run build` → `dist/`
2. Firebase 신규 프로젝트 생성, `firebase init hosting` (public: `dist`, SPA rewrite: 모든 경로 → `index.html`)
3. `firebase deploy --only hosting`
4. 배포 실행 자체는 구현 완료 후 사용자 확인을 받고 진행한다.

## 테스트
Matter.js 물리 시뮬레이션 자체는 단위 테스트로 검증하기 어려우므로, 다음 순수 로직만 Vitest로 커버한다:
- 리듀서(`useGameState`) 액션별 상태 전이
- 판자 오프센터 피벗 회전 좌표 계산
- localStorage 직렬화/역직렬화

실제 게임플레이(판자 회전, 벌레 이동 애니메이션, 베팅 플로우 전체)는 `npm run dev`로 브라우저에서 수동 확인한다.

## 범위 밖 (Out of scope)
- 실제 화폐/결제 연동 (가상 코인만)
- 멀티플레이어/서버 동기화
- 코인 리필 버튼의 프로덕션 게이팅 (개인 프로젝트 성격상 유지, 필요 시 추후 논의)
