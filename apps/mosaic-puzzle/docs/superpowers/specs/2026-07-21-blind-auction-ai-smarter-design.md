# 블라인드 경매 AI 고도화 — 설계 문서

## 배경 / 문제
블라인드 경매(`blind-auction.html` + `blind-auction-logic.js`)의 AI 4명은 각자 게임 시작 시 정해지는 고정 스칼라 값(`aggressiveness`, 0.8~1.3배) 하나로만 움직인다. `computeAiWillingness`는 "공개된 22개 물품 평균값 × 적극성 × 랜덤 지터"로 최대 지불의사를 정하고, `decideAiAction`은 그 안에서 `pickMinimalRaise`로 대충 고른 큐브 조합으로 최소 레이즈만 한다.

사용자가 지적한 답답한 점 3가지:
1. **큐브 자원 관리 미흡** — 남은 라운드 수만 반영한 거친 예산 캡(`budgetCap = 남은큐브합/남은라운드 * 1.6`)뿐이라, 초반에 큐브를 다 써버리거나 반대로 막판까지 큐브를 남긴 채 게임이 끝나는 경우가 있다. 필요 금액을 채우는 큐브 조합도 최적이 아니다.
2. **매 판이 똑같아 보임** — 성격이 숫자 하나뿐이라 AI 4명의 행동이 사실상 비슷하게 느껴진다.
3. **상대 움직임에 반응 없음** — 이번 라운드에 몇 명이 아직 살아있는지, 판이 얼마나 과열됐는지 같은 라운드 내 정보를 전혀 안 본다.

## 목표
- AI 4명에게 매 게임마다 서로 다른 이름 붙은 성격(아키타입)을 랜덤 배정해 체감상 다르게 행동하도록 한다.
- 큐브 예산 계산을 "지금까지 딴 물품 수 vs 진행된 라운드" 페이스와 "막판 완화"를 반영해 더 합리적으로 만든다.
- 필요 금액을 채우는 큐브 조합을 완전탐색으로 최소 초과분으로 정확히 계산한다.
- 라운드 내 활성 경쟁자 수·과열 정도를 반영해 접고/버티는 타이밍을 성격별로 다르게 조정한다.
- AI 성격을 UI에 배지 + 툴팁으로 노출한다.
- 배포 후 사이트 공지사항(업데이트 내역)에 이 변경을 짧게 소개하는 항목을 추가한다.

## 비목표
- 물품의 실제 가치를 AI가 알게 하는 것(블라인드 경매의 핵심 규칙은 그대로 유지 — AI는 여전히 공개된 풀 평균값만으로 추정한다).
- 상대(유저 포함)의 베팅 이력을 게임 내내 누적 추적하는 개인화 모델링(설계 단계에서 논의한 "Approach C" — 복잡도 대비 이득이 크지 않아 범위 밖).
- 난이도 선택 UI(쉬움/보통/어려움 등) 추가 — 이번엔 기본 AI 행동 자체를 개선하는 것으로 범위 한정.
- `blind-auction-logic.js`의 함수 시그니처 변경 — `decideAiAction(player, round, profile, poolTotal, remainingRounds, rng)` 그대로 유지하고 내부 로직만 강화한다. `blind-auction.html`의 `maybeRunAiTurn` 호출부는 수정하지 않는다.

## 설계

### 1. AI 성격 아키타입 4종

`createAiProfiles(rng)`가 매 게임마다 4개 아키타입을 셔플해 `ai1`~`ai4`에 하나씩 배정한다(한 게임 내에서는 고정).

| 아키타입 | 성격 요약 | 파라미터 |
|---|---|---|
| **테토남** | 적극성 높음, 경쟁자가 많아도 잘 버팀 | `baseAggressiveness` 1.05~1.3, 과열 신호에 대한 반응 약함 |
| **에겐남** | 적극성 낮음, 과열 감지 시 빠르게 접음 | `baseAggressiveness` 0.75~0.95, 과열 신호에 대한 반응 강함 |
| **욜로족** | 평소엔 평범, 라운드마다 낮은 확률로 "몰빵 모드" 진입 | `baseAggressiveness` 0.9~1.1, 매 라운드 `gambleChance = 0.15`(15%) 확률로 이번 라운드 willingness를 `×1.8~2.2`(rng로 결정) 증폭 |
| **안정형** | 자기 성과(딴 물품 수)를 진행률과 비교해 스스로 보정 | `baseAggressiveness` 0.9~1.1, 페이스 보정 계수를 가장 강하게 받음(아래 2절) |

각 프로필 객체는 `{ archetype: '테토남'|'에겐남'|'욜로족'|'안정형', aggressiveness: number, ...아키타입별 파라미터 }` 형태로, 기존 `profile.aggressiveness` 필드는 하위 호환을 위해 그대로 유지한다.

### 2. 큐브 자원 관리 개선

`decideAiAction` 내부에서 `budgetCap` 계산을 다음으로 교체한다:

```
paceRatio = (player.wonItems.length / roundsPlayedSoFar) / (poolTotal 기준 기대 당첨률)
```
- `roundsPlayedSoFar = TOTAL_ROUNDS - remainingRounds`(0이면 페이스 보정 생략, 첫 라운드는 원래 캡 사용)
- 뒤처진 AI(자기 몫보다 덜 땀) → `budgetCap` 상향, 앞선 AI → 하향. 보정 폭은 아키타입별 계수를 곱해 적용한다: **안정형 1.0**(보정 전부 적용) · **테토남/에겐남 0.4**(성격이 우선이라 약하게만 적용) · **욜로족 0**(몰빵 모드가 우선이라 페이스 보정 생략).
- **막판 완화**: `remainingRounds <= 2`일 때는 `budgetCap`을 남은 큐브 총합에 가깝게 풀어준다(큐브를 쓸데없이 남긴 채 게임이 끝나는 것을 방지).

`pickMinimalRaise(availableCubeValues, extraNeeded)`는 시그니처를 유지하되 내부를 완전탐색으로 교체한다: 가진 큐브(최대 11개, 부분집합 최대 2^11=2048가지)를 전부 확인해 `합계 >= extraNeeded`를 만족하는 조합 중 **합계가 가장 작은 조합**(동점이면 개수가 적은 조합)을 반환한다. 만족하는 조합이 없으면 기존과 동일하게 `null`.

### 3. 라운드 내 반응성

`decideAiAction`이 다음 두 신호를 `round`/`poolTotal`에서 직접 계산해 반영한다(추가 인자 불필요):

- **활성 경쟁자 수**: `rivals = activeIds(round).length - 1`(자기 자신 제외). 기준점 2명 대비 한 명 늘어날 때마다 willingness `-4%`, 줄어들 때마다 `+4%` (상한/하한 `±16%`, 즉 최대 ±4명 차이까지만 반영).
- **과열도**: `pressureRatio = round.highestTotal / (poolTotal / POOL_SIZE)`. 아키타입별 임계값을 넘으면 willingness를 `40%` 깎는다(임계값 이하일 때는 조정 없음): **에겐남 1.05** · **안정형 1.2** · **테토남/욜로족 1.4**.

이 두 신호는 `willingness`를 조정하는 방식으로만 반영되고, 기존의 "최대 지불의사 내에서만 베팅, 초과 시 pass" 흐름은 그대로 유지된다.

### 4. UI 노출 (`blind-auction.html`)

- AI 이름 표시 영역(플레이어 카드/로그 등 AI 이름이 나오는 곳)에 성격 배지를 추가: 예 `AI2 · 에겐남`.
- 배지에 `title` 속성(또는 hover 툴팁)으로 짧은 성격 설명 노출 (예: "판이 과열되면 빠르게 손을 뗍니다").
- `state.aiProfiles[id].archetype`을 읽어 렌더링하며, 게임 시작/재시작 시마다 갱신된다.

### 5. 배포 후 공지사항 반영

기능 배포가 완료되면 `admin.html`의 "공지사항 관리" 탭을 통해 `site_announcement_history`에 짧은 업데이트 항목을 추가한다(예: "블라인드 경매 AI 지능 개선" + "AI 4명에게 테토남/에겐남/욜로족/안정형 성격을 부여하고, 큐브 자원 관리와 상대 반응성을 개선했습니다."). 이 항목은 실제 배포 후에 추가하는 것으로, 설계/구현 단계에서는 미리 넣지 않는다.

## 테스트 계획
`blind-auction-logic.test.js`에 케이스 추가(고정 시드 `rng`로 결정론적 실행):
- 동일한 라운드 상황에서 4개 아키타입이 서로 다르게 행동하는가 (예: 동일 `pressureRatio`에서 에겐남이 테토남보다 더 자주 pass).
- `pickMinimalRaise`가 여전히 정답(만족 가능/불가능 케이스 모두)을 내는가 + 기존보다 낭비 없는(초과분이 더 작은) 조합을 찾는 케이스.
- 뒤처진 상태(`wonItems.length`가 적고 라운드는 많이 지남)에서 `budgetCap`이 상향되는가, 앞선 상태에서 하향되는가 — 특히 안정형에서 두드러지는가.
- `remainingRounds <= 2`일 때 캡이 완화되는가.
- 활성 경쟁자 수가 적을 때 willingness가 실제로 달라지는가.
- 욜로족의 `gambleChance` 발동 시 willingness가 크게 증폭되는가(고정 rng로 발동/미발동 양쪽 케이스).

## 영향 범위 확인
- `admin.html`, `predict.html` — 무영향(이 변경은 `blind-auction-logic.js`/`blind-auction.html`에만 국한).
- `admin-auction-parse.test.js` — 무영향.
- Supabase 스키마 — 변경 없음(순수 클라이언트 로직 개선이므로 마이그레이션 불필요). 공지사항 반영은 기존 `site_announcement_history` 테이블/RPC를 그대로 사용.
