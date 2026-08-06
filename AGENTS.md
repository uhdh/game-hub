# AGENTS.md

이 파일은 Claude Code, Codex 등 어떤 에이전트로 이 저장소를 작업하든 공통으로 참고하는 지침이다.
Claude Code는 `CLAUDE.md`(`@AGENTS.md`로 이 파일을 import함)를 통해, Codex는 이 파일을 직접 읽어서 로드한다.

## 세션 시작 시 반드시 할 일

1. **`HISTORY.md`를 먼저 읽는다.** 다른 에이전트(Claude Code든 Codex든)가 직전에 무엇을 했는지, 미해결로 남긴 게 무엇인지 여기서 확인한다.
2. 이 프로젝트는 **로컬 단독 repo**다 (`git remote -v` 결과 없음). 배포는 별도의 `game-hub` 모노레포를 통해 이루어지므로, 배포/GitHub push 관련 작업을 하기 전에는 아래 "배포 구조" 절을 확인한다.

## 프로젝트 개요

순수 HTML/CSS/JS로 만든 미니게임 허브. 하나의 `index.html`이 여러 게임으로 연결되는 카드 홈 화면이고, 각 게임은 독립된 `.html` 파일 + 필요 시 별도 `.js` 로직 파일로 구성된다 (프레임워크/빌드 도구 없음, 브라우저에서 바로 연다).

주요 게임/페이지:
- `color-connect.html` — 모자이크 퍼즐(원 게임 본체)
- `rearrange.html` — 재배치(15-puzzle 슬라이딩 변형)
- `blind-auction.html` + `blind-auction-logic.js` — 유저+AI 4인 블라인드 경매 게임 (Supabase 물품 데이터)
- `tectonic-shift.html` — 지각변동 게임
- `gomoku-stack.html` + `gomoku-ai.js`/`gomoku-board.js`/`gomoku-rating.js` — 3단 오목 (자체 신경망 AI, 별도 배포 경로 있음 — 아래 참고)
- `predict.html` — 우승자 예측 투표
- `requests.html` — 건의사항 (관리자 답변 RPC 패턴 최초 적용 사례)
- `admin.html` — 관리자 페이지 (탈락자/경매 물품 관리, 비밀번호는 클라이언트에 없음 — RPC로 서버 검증)
- `deploy/` — root 파일들의 "빌드" 미러. **root와 항상 100% 동일하지 않을 수 있음** — 특정 파일은 deploy가 더 최신일 수도, root가 더 최신일 수도 있으니 손대기 전에 diff 확인할 것.

## 배포 구조 (중요 — 이 저장소만 봐서는 알 수 없는 부분)

- 이 로컬 repo 자체는 GitHub에 올라가 있지 않다. 실제 배포는 별도 경로의 **`project/game-hub`** 모노레포(`apps/mosaic-puzzle`)를 거쳐 GitHub(`uhdh/game-hub`) → Vercel(프로덕션 URL `https://pgamex.vercel.app`, 프로젝트명 `game-hub`)로 나간다.
- 표준 배포 흐름: 이 repo에서 커밋 → `game-hub`에서 `git subtree pull --prefix=apps/mosaic-puzzle mosaic master` → `git push origin master` → Vercel Git 연동이 자동 배포한다 (수동 redeploy 불필요).
- **양방향 동기화 주의**: 다른 세션/계정이 로컬 repo를 거치지 않고 `game-hub`에 직접 커밋하는 경우가 실제로 있었다. 배포 관련 작업 전에는 `game-hub`에서 `git fetch origin`으로 로컬에 없는 커밋이 있는지 먼저 확인할 것. 있다면 `git subtree push --prefix=apps/mosaic-puzzle mosaic <임시브랜치>` → 로컬에서 `git merge <임시브랜치>` → 브랜치 삭제, 순서로 역동기화한다 (subtree push는 체크아웃된 브랜치로 직접 push 불가).
- `gomoku-stack.html`은 예외적으로 game-hub 쪽에서 직접 발전해온 히스토리가 섞여 있었던 적이 있다. 이 파일을 만질 때는 `git log -- apps/mosaic-puzzle/gomoku-stack.html`(game-hub 쪽)로 현재 상태를 먼저 확인하고, 과거 메모만 믿지 말 것.
- Supabase 프로젝트: `mosaic-puzzle-rearrange` (project_id `paktzmofotvwfdxcpmzv`, region ap-northeast-2). anon publishable key는 각 페이지 JS에 하드코딩되어 있음 — 공개 정적 사이트라 의도된 것(anon 권한만 부여).
- 관리자 기능(비밀번호 검증)은 클라이언트에 평문 비밀번호를 두지 않고 `SECURITY DEFINER` Postgres RPC 함수로 서버에서 검증하는 패턴을 쓴다 (`submit_admin_reply`, `admin_check_password` 등). 새로운 관리자 전용 기능을 추가할 때 이 패턴을 기본값으로 따를 것.
- 큰 이미지를 base64로 배포 도구에 넣을 때는 중간에 잘리는 사고가 실제로 있었다. 이미지를 최대한 작게 리사이즈하고, 전송 직전 동일 base64를 파일로 써서 디코드 후 원본과 바이트 단위로 비교 검증할 것.
- **3단 오목 신경망은 로컬 실행 전용이다.** `worktree-gomoku-stack-neural-ai`의 `training/`, 학습 코드, 체크포인트, ONNX 모델 및 브라우저용 신경망 연동 코드는 별도 요청이 없는 한 `master`나 `game-hub` 배포본에 병합하지 않는다. 배포되는 3단 오목은 현재의 일반 JS AI를 유지한다.

## 작업 종료 시 반드시 할 일

**`HISTORY.md` 맨 위에 새 항목을 추가한다.** 형식은 파일 안의 안내를 따른다. 요약해서 옮기지 말고 실제로 무엇을 바꿨는지, 배포했는지, 다음에 이어서 할 일이 뭔지 구체적으로 적을 것 — 다른 에이전트(또는 다른 종류의 에이전트)가 이 항목만 보고 맥락을 파악할 수 있어야 한다.
