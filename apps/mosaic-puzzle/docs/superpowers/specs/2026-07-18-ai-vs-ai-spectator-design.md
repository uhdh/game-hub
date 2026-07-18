# 오목 AI vs AI 관전 모드 (design)

## 배경

`gomoku-stack.html`은 현재 "2인 대결"과 "AI 대전"(사람 vs AI) 두 모드만 지원한다. 사용자가
최상(extreme) 난이도 AI끼리 서로 대국하는 것을 볼 수 있는 관전 모드를 요청했고, 그 대국
결과는 나중에 다시 분석할 수 있도록 "학습"(기록)시켜달라고 했다.

이 프로젝트의 AI는 신경망이 아니라 규칙 기반 평가함수 + 미니맥스 탐색(Web Worker로
반복 심화)이므로, "학습"은 실시간 가중치 갱신이 아니라 **기보를 저장해 나중에 사람이
리플레이 분석 후 수동으로 평가함수를 패치하는 재료로 쓰는 것**을 의미한다(직전에
`^_^v` 기보를 분석해 `windowThreatScore`를 추가한 것과 동일한 워크플로).

## 목표

1. 사용자가 버튼 하나로 최상 난이도 AI 두 개가 서로 대국하는 것을 실시간으로 볼 수 있다.
2. 대국이 끝나면 기보가 Supabase에 저장되어, 이후 사람 기보와 동일한 방식으로
   리플레이·분석할 수 있다.

## 범위

`gomoku-stack.html` 한 파일. 다른 게임(재배치, 블라인드 경매)은 대상 아님.

## UI 변경

- `#mode-group`에 세 번째 모드 버튼 "AI vs AI"를 추가한다(`data-mode="ai_vs_ai"`).
- 이 모드를 선택하면:
  - `#difficulty-group`(난이도 선택)을 숨긴다 — 항상 최상(extreme) 고정.
  - 닉네임/랭킹 패널(`#rank-toggle-btn`, `#rank-panel`)을 숨긴다.
  - 무르기 버튼(`.btn-undo`)을 숨긴다(사람이 두는 수가 없으므로 무의미).
- 모드 버튼을 누르는 즉시 기존 `resetGame()` 흐름을 그대로 타고 새 대국이 시작된다(기존
  "모드 변경 → 새 게임" 패턴 재사용, 별도의 "시작" 버튼 없이도 클릭 한 번으로 시작됨).
  "다시하기" 버튼으로 새 AI vs AI 대국을 다시 볼 수 있다.
- 턴 표시 등 "당신 차례"/"AI 차례" 문구를 쓰는 곳은 `ai_vs_ai` 모드일 때 "흑돌 AI 차례" /
  "백돌 AI 차례"처럼 색 기준 문구로 바꾼다.

## 엔진 재사용 방식

현재 `AI_PLAYER`/`HUMAN_PLAYER`는 모듈 전역 변수이고, `evaluatePosition`을 비롯한 모든
평가/탐색 함수가 "AI_PLAYER 시점에서 유리한지"를 기준으로 계산한다. AI vs AI 모드에서는
새로운 탐색 로직을 만들지 않고, **매 턴마다 지금 둘 차례인 플레이어를 임시로
`AI_PLAYER`로, 나머지를 `HUMAN_PLAYER`로 설정한 뒤** 기존 `computeAIMove()`
(→ 최상이면 Web Worker 기반 `computeAIMainMoveHardAsync`)를 그대로 호출한다. 워커
인스턴스(`aiWorker`)는 기존처럼 하나만 재사용하고, 항상 한쪽 턴의 계산이 끝난 뒤에야
다음 쪽 계산을 시작하므로 동시 요청 충돌은 없다.

`scheduleAIIfNeeded()`는 현재 `state.turn === AI_PLAYER`일 때만 AI를 예약하는데,
`ai_vs_ai` 모드에서는 이 조건을 "게임이 안 끝났으면 항상"으로 바꿔 양쪽 턴 모두 AI가
움직이게 한다. 수를 두기 전 300~650ms 랜덤 지연을 주는 기존 연출은 그대로 두어, 최상
난이도 자체 탐색 시간(최대 1.5초/수)과 합쳐져 자연스러운 관전 속도가 나오게 한다(별도
배속 조절 UI는 이번 범위에 넣지 않는다).

## 기보 저장 (Supabase)

기존 `gomoku_game_log` 테이블을 재사용한다. 현재 스키마는 `human_player`가
`NOT NULL`(`CHECK human_player = ANY(ARRAY[1,2])`)이라 "사람이 없는" AI vs AI 대국을
그대로 넣을 수 없다. 다음 추가적(additive) 마이그레이션을 적용한다:

```sql
ALTER TABLE gomoku_game_log ALTER COLUMN human_player DROP NOT NULL;
ALTER TABLE gomoku_game_log ADD COLUMN game_type text NOT NULL DEFAULT 'human';
```

- 기존 행: `game_type`은 마이그레이션 시 전부 `'human'`으로 채워짐(디폴트값), 기존 조회
  쿼리는 전혀 영향 없음.
- `human_player`의 `NOT NULL`만 제거하고 `CHECK` 제약은 그대로 둔다 — Postgres에서
  `CHECK` 제약은 값이 `NULL`이면 자동으로 통과(위반 아님) 처리되므로, 1·2 외 다른 값은
  여전히 막히면서 `NULL`만 새로 허용된다.
- AI vs AI 대국 종료 시 `submitGameLog()`에서 `game_type: "ai_vs_ai"`,
  `human_player: null`, `nickname: null`로 저장한다(닉네임 등록 UI 자체가 이 모드에서
  숨겨지므로 저장할 닉네임이 없음). `difficulty`는 항상 `"extreme"`, `moves`는 기존과
  동일한 `moveLog` 배열.
- 사람 기보 분석 때처럼 이후 `gomoku_game_log?game_type=eq.ai_vs_ai&difficulty=eq.extreme`
  로 조회해서 리플레이 분석할 수 있다.
- 이 모드는 랭킹(`gomoku_extreme_ranking`) 등록을 하지 않는다(랭킹 UI 자체가
  `gameMode === "ai"`일 때만 노출되는 기존 조건에 `ai_vs_ai`가 걸리지 않으므로 자연스럽게
  제외됨 — 별도 방어 코드 불필요).

## 테스트 방법

자동화 테스트 프레임워크가 없는 프로젝트이므로, 이전 작업들과 동일하게:
- Node `vm`으로 순수 로직(모드 전환, 관점 스위칭)을 격리 테스트.
- Playwright로 실제 브라우저에서 "AI vs AI" 모드를 켜고 몇 수가 자동으로 진행되는지,
  대국이 끝났을 때 `gomoku_game_log`에 `game_type: "ai_vs_ai"` 행이 실제로 쌓이는지 확인.

## 배포

로컬 커밋 → `game-hub/apps/mosaic-puzzle/gomoku-stack.html`에 직접 cp+커밋(기존
gomoku-stack.html 배포 절차, subtree pull 아님) → GitHub push → Vercel 자동 배포.
Supabase 마이그레이션은 `mcp__claude_ai_Supabase__apply_migration`으로 별도 적용.
