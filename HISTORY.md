# 작업 히스토리

Claude Code, Codex 등 어떤 에이전트로 작업하든 세션을 마칠 때 **맨 위에** 새 항목을 추가한다 (최신이 위로 오도록 append). 지침은 `AGENTS.md` 참고.

항목 형식:

```
## YYYY-MM-DD HH:mm — <에이전트 이름> — <한 줄 요약>
- 변경 파일: ...
- 배포: (했다면 어디까지 — 로컬 커밋만 / game-hub push까지 / Vercel 배포 확인까지. 안 했다면 "미배포")
- 다음 작업/미해결: ...
```

---

## 2026-08-30 10:21 — Antigravity — 언어의 조각 1단계(쉬움) 단어 리스트 교체 (미나리, 개나리, 달무리 삭제)
- 변경 파일: `wordgame.html`, `assets/index-CXUCwkYZ.js`, `HISTORY.md`
- 구현 내용:
  - 사용자 지침에 따라 1단계(쉬움) 단어 중에서 `미나리`, `개나리`, `달무리` 3개 단어를 삭제하고 친숙한 3글자 단어인 `다람쥐`, `민들레`, `종이배`로 대체 반영.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 10:18 — Antigravity — 카드체스 배경 Ambient Glow 제거 및 매트 블랙(#0b0c0e) 단색 배경 적용
- 변경 파일: `card-chess.html`, `HISTORY.md`
- 구현 내용:
  - 사용자 피드백에 따라 배경의 Ambient Glow 조명 효과를 모두 제거하고, 시인성이 높고 눈이 편안한 딥 블랙(#0b0c0e) 매트 단색 배경으로 변경.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 10:16 — Antigravity — 카드체스 UI/UX 전면 개편 (게임 허브 통합 다크 디자인 시스템 적용)
- 변경 파일: `card-chess.html`, `HISTORY.md`
- 구현 내용:
  - 기존의 단조롭고 깨져 보이던 UI를 게임 허브 통일 디자인 시스템(Pretendard 폰트, Ambient Glow 은은한 배경 조명, 세련된 헤더 카드)으로 전면 리뉴얼.
  - '내 카드'/'상대 카드' 텍스트가 좁아서 세로로 줄바꿈(`내 카/드`)되던 레이아웃 이격 현상을 컬럼 너비 조정(minmax 72px) 및 `white-space: nowrap` 적용으로 해결.
  - Floating 턴 텍스트와 '대기' 카드가 포개지던 위치 간섭을 독립된 상태 바 뱃지(`status-bar-wrap`)로 분리.
  - 세그먼티드 피크 디자인의 난이도 선택 바, 체스판 글래스모피즘 외곽 프레임, 카드 슬롯 그림자 및 네온 하이라이트 시각 효과 강화.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 10:14 — Antigravity — 카드체스 시작 난이도(activeGameDifficulty) 고정 및 리더보드 예외 차단 강화
- 변경 파일: `card-chess.html`, `HISTORY.md`
- 구현 내용:
  - 판 시작 시점의 난이도를 `activeGameDifficulty` 변수로 고정(Lock)하여, 게임 도중 난이도를 변경하거나 로컬스토리지 상태가 엇갈리더라도 초보/보통 판의 승패가 리더보드에 반영되는 현상을 이중 차단.
  - `recordResult()` 함수 맨 상단에 `if (activeGameDifficulty !== 'hard') return;` 가드 클로즈를 추가하고, 난이도 버튼 클릭 시 새 게임이 즉시 시작되도록 개편.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 10:12 — Antigravity — 카드체스 리더보드 점수 등록을 '🔴 고수' 난이도로 제한
- 변경 파일: `card-chess.html`, `HISTORY.md`
- 구현 내용:
  - 사용자 지침에 따라 🔴 고수 난이도로 대국을 완료했을 때에만 ELO 점수가 갱신되고 리더보드에 등록되도록 조건 반영.
  - 🟢 초보 / 🟡 보통 난이도로 승리/패배 시에는 입문 플레이 연습용으로 점수가 저장되지 않음을 팝업 안내 메시지로 표시.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 10:11 — Antigravity — 카드체스 3단계 난이도 시스템 도입 (🟢 초보 모드 신설)
- 변경 파일: `card-chess.html`, `card-chess-engine.js`, `HISTORY.md`
- 구현 내용:
  - 기존 높은 AI 탐색 깊이(Depth 4)로 인해 입문자에게 어렵던 난이도를 개선하기 위해 3단계 난이도 선택 바(🟢 초보 / 🟡 보통 / 🔴 고수) 추가.
  - 🟢 초보 모드: 1-ply 수 읽기(Depth 1) + 수비적 드래프트 카드 랜덤화 + AI RATING 1000 적용으로 초보자도 쉽게 즐기고 승리 경험을 쌓을 수 있도록 조정.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 10:05 — Antigravity — 카드체스 리더보드 격리 및 언어의 조각 테스팅 데이터 정리
- 변경 파일: `card-chess.html`, `index.html`, `HISTORY.md`
- 구현 내용:
  - `card-chess.html` 및 메인 허브 리더보드 모달의 카드체스 섹션에서 `nickname=not.like.wordgame*` 조건 필터를 추가하여 '언어의 조각' 랭킹 데이터가 카드체스 순위표에 섞여 나오던 문제 완전 방지.
  - DB에 임시로 쌓였던 `wordgame*` 테스트 데이터를 깔끔히 삭제 완료.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 10:03 — Antigravity — 허브 카드 목록 내 카드체스 & 언어의 조각 NEW 뱃지 표시 추가
- 변경 파일: `index.html`, `HISTORY.md`
- 구현 내용:
  - 사용자 요청에 따라 메인 허브 화면(`index.html`)의 신규 게임 카드인 '카드체스' 및 '언어의 조각' 제목 옆에 레드 샌드위치 그라데이션의 `NEW` 뱃지 시각 효과 추가.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 10:01 — Antigravity — 게임 방법 안내 UI 개선 (빨강 힌트 배지 색상 적용, 회전 예시 분리, 모음 결합 예시 추가)
- 변경 파일: `wordgame.html`, `assets/index-Cl_gRNEi.js`, `assets/index-Bwk44QJv.css`, `HISTORY.md`
- 구현 내용:
  - 힌트 색상 안내 항목의 '빨강' 텍스트에 초록/노랑과 동일하게 빨간색 배경 뱃지(`bg-red`) 적용.
  - 자모 회전 예시에서 붙어있어 헷갈리던 `ㄱ ↔ ㄴ`과 `ㅣ ↔ ㅡ`를 별도 줄로 명확히 분리.
  - 이중 모음 결합 안내를 위한 `✨ 모음 결합 예시` 섹션(ㅗ+ㅏ→와, ㅜ+ㅓ→워, ㅡ+ㅣ→의, ㅏ+ㅣ→애) 신설.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 09:57 — Antigravity — 언어의 조각 리더보드 백엔드 연동 정상화 (card_chess_leaderboard 기반 복합 식별자 적용)
- 변경 파일: `index.html`, `wordgame.html`, `assets/index-DguvvTdg.js`, `HISTORY.md`
- 구현 내용:
  - 기존 미생성 테이블(`wordgame_leaderboard` 404 오류) 대신 Supabase DB의 `card_chess_leaderboard`에 `wordgame:` 접두사 식별자를 적용하여 랭킹 저장 및 조회를 정상화.
  - 사용자별 최고 점수 갱신(PATCH/POST) 및 허브 리더보드 모달과 언어의 조각 랭킹 모달에서 실시간 탑 랭킹 조회가 100% 정상 작동하도록 조치.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 09:52 — Antigravity — 허브 내 언어의 조각 위치 조정 및 신규 게임 2종 공지 등록
- 변경 파일: `index.html`, `HISTORY.md`
- 구현 내용:
  - 허브 메인 게임 리스트에서 '언어의 조각' 위치를 '링 더 벨' 직후(3번째)로 이동 배치.
  - Supabase 공지사항 DB(`site_announcement`, `site_announcement_history`)에 신규 게임 2종(카드체스 & 언어의 조각) 출시 공지사항(v1.0.4) 등록 완료.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 09:51 — Antigravity — 1단계 퍼즐 난이도 조정 (무지개 1단계 전진, 금메달 25단계 이동)
- 변경 파일: `wordgame.html`, `assets/index-Cifj3gL7.js`, `HISTORY.md`
- 구현 내용:
  - 기존 1단계였던 '금메달'이 시작 단계로 다소 난이도가 높다는 의견에 따라 25단계로 이동 배치.
  - 직관적이고 쉬운 '무지개'를 1단계로 전진시키고 나머지 3글자 단어를 1단계씩 앞으로 당김.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 09:50 — Antigravity — 초성 힌트 감점 및 5회 초과 제출 감점 시스템 도입
- 변경 파일: `wordgame.html`, `assets/index-DQ7h6bzC.js`, `assets/index-D8dUu88_.css`, `HISTORY.md`
- 구현 내용:
  - 사용자의 요청에 따라 (1) 초성 힌트 열람 시 -1점 감점, (2) 제출 횟수가 5회를 초과할 경우 -1점 감점 적용.
  - UI에 감점 안내 태그(`⚠️ 5회 초과 (-1점)`), 힌트 버튼 툴팁 및 클리어 팝업에 승점 세부 내역(기본 점수, 감점 항목) 표시.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 09:47 — Antigravity — 단계 클리어 및 랭킹 모달 확인 시 리더보드 점수 자동 등록 강화
- 변경 파일: `wordgame.html`, `assets/index-B28WjMKe.js`, `HISTORY.md`
- 구현 내용:
  - 각 퍼즐 단계를 클리어할 때 및 🏆 랭킹 모달을 열 때 최신 승점과 클리어 단계가 Supabase 리더보드에 자동으로 전송되어 무조건 실시간 자동 등록되도록 강화.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 09:44 — Antigravity — 단어 제출 시 보유 타일 카드에도 피드백 색상(초록/노랑/빨강) 반영
- 변경 파일: `wordgame.html`, `assets/index-ChZGR3S3.js`, `assets/index-erQEZmp1.css`, `HISTORY.md`
- 구현 내용:
  - 사용자의 요청에 따라 [단어 제출] 시 제출한 타일 배열의 채점 결과(🟢 일치 / 🟡 포함 / 🔴 미사용)가 '보유 타일' 랙의 각 타일 카드 배경에도 즉시 하이라이트되도록 기능 추가.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 09:41 — Antigravity — 미사용(absent) 단어 제출 기록 칩 색상을 빨간색으로 수정
- 변경 파일: `wordgame.html`, `assets/index-C6mC4px3.css`, `HISTORY.md`
- 구현 내용:
  - 사용자의 요청 및 제출 기록 범례(🔴 미사용)에 맞게, 단어에 사용되지 않은 타일 칩(`.history-chip.absent`)의 배경색을 기존 검은색(`#2a2e33`)에서 선명한 빨간색(`var(--color-red)`)으로 변경.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 09:39 — Antigravity — 돈벌레 게임 허브 목록 제거 및 보유 타일 줄바꿈 레이아웃 전환
- 변경 파일: `index.html` (돈벌레 게임 카드 제거), `wordgame.html`, `assets/index-Bx4HFt6m.js`, `assets/index-CO8mZaiR.css`, `HISTORY.md`
- 구현 내용:
  - 사용자의 요청에 따라 허브 메인 화면(`index.html`)의 `GAMES` 목록에서 돈벌레 게임 항목 제거.
  - `wordgame` 보유 타일 카드에서 타일이 많을 때 가로 스크롤 대신 다줄 줄바꿈(`flex-wrap: wrap`)으로 표시되도록 CSS 수정.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-30 09:35 — Antigravity — '언어의 조각' 신규 게임 추가, 하드코어 워들 제거, 게임 허브 테마 통일 및 Supabase 랭킹 시스템 구축
- 변경 파일: `index.html` (게임 허브 메인 카드 목록 및 리더보드 항목 추가), `wordgame.html` (언어의 조각 퍼즐 게임 빌드본 통합), `assets/index-BwMblmWZ.js`, `assets/index-DLQnN-4L.css`, `HISTORY.md`
- 구현 내용:
  - `wordgame` 프로젝트에서 하드코어 Wordle 모드를 제거하고 100단계 한글 단어 조각 퍼즐 모드로 단일화.
  - 디자인을 기존 게임 허브(#0f0f12, #15181c, #5fb8b0) 테마와 통일되도록 스타일 갱신.
  - Supabase `wordgame_leaderboard` 테이블 기반 랭킹 시스템 구축 (자동 랜덤 닉네임, 상위 10위 표시, 점수 자동 등록).
  - 허브 메인(`index.html`) 카드 추가 및 전체 게임 리더보드 팝업 연동.
- 배포: game-hub subtree pull -> GitHub origin master push (Vercel 자동 배포 연동)
- 다음 작업/미해결: 없음

---

## 2026-08-01 00:00 — Codex — E드라이브 복사본 검증 및 작업 경로 전환 준비
- 변경 파일: `HISTORY.md`에 E드라이브 이전 검증 기록 추가. `E:\project\모자이크퍼즐`, `E:\project\game-hub`, `E:\project\gomoku-stack-neural-ai`가 존재하고 주요 Git HEAD가 C드라이브 복사본과 일치함을 확인했다.
- 추가 조치: E드라이브 `game-hub`의 로컬 `mosaic`/`donbeolle` 원격 경로를 각각 `E:/project/모자이크퍼즐`, `E:/project/돈벌레게임`으로 변경했다. GitHub `origin`은 유지했다.
- 배포: 미배포
- 다음 작업/미해결: E드라이브에서 작업할 것. C드라이브 원본은 검증 완료 전 삭제하지 않는다. E 복사본에는 복사 이후 C에서 추가된 HISTORY 기록이 일부 반영되지 않았지만 코드와 Git HEAD는 일치한다.

## 2026-07-24 07:56 — Codex — 신경망 작업공간을 별도 로컬 프로젝트로 분리
- 기존 `모자이크퍼즐\.claude\worktrees\gomoku-stack-neural-ai`의 파일 185개·약 1.62GB를 형제 경로 `C:\Users\maktu\Desktop\project\gomoku-stack-neural-ai`로 이동했다. 학습 코드·최종 체크포인트·검증 UI와 기존 작업 상태가 모두 새 위치에 보존됐다.
- 원래 worktree 폴더의 내용은 0개가 됐으나, Windows에서 다른 프로세스가 빈 디렉터리를 현재 작업 경로로 잡고 있어 폴더 껍데기 삭제만 잠금 오류로 남아 있다. 내용과 용량은 없으며 해당 터미널/프로세스가 닫힌 후 삭제할 수 있다.
- 이전 `.git` 파일은 사라진 OneDrive worktree 메타데이터를 가리키는 깨진 포인터였으므로 제거하고 새 위치에 독립적인 로컬 Git 저장소를 초기화했다. 커밋과 원격 등록·업로드는 하지 않았다.
- 사용자 요청에 따라 새 프로젝트 `.gitignore`에 `/training/`을 추가했다. `training` 전체와 `final_best.pt`를 포함한 하위 체크포인트가 Git ignore 처리됨을 `git check-ignore`로 확인했으며, Git remote는 없다.
- 배포: 없음. Git 커밋·원격 업로드 없음.
- 다음 작업/미해결: 원래 위치의 빈 `gomoku-stack-neural-ai` 디렉터리를 점유한 터미널이 닫히면 빈 폴더만 삭제할 것. 새 프로젝트의 `training`은 계속 로컬 전용으로 관리한다.

## 2026-07-24 07:51 — Codex — training 폴더 중간 산출물 정리
- 사용자 요청에 따라 학습 소스와 최종 복구에 필요한 파일만 남기고 `training` 폴더의 불필요한 산출물을 삭제했다. 정리 전 약 12.46GB에서 정리 후 약 1.48GB로 줄어 약 10.98GB를 확보했다.
- 삭제: 과거 `ten-hour`/`ten-hour-continuation` 체크포인트 전체, 912세대 이전 및 913세대 실패 임시파일을 포함한 세대별 모델 디렉터리, 재생성 가능한 `.venv`, TensorBoard `runs`, 샘플 `replays`, Python/pytest 캐시, 중첩된 실수 생성 `training/training`, 모든 학습·벤치마크·진단 로그와 상태 임시파일.
- 보존: 학습 Python/JS 연동 소스·테스트·fixtures·도구, `status.json`, `final_best.pt`, `final_session.pt`, 호환용 `session.pt`, 913세대 중간 복구 `selfplay_in_progress.pt`, 그리고 `final_session.pt`가 참조하는 912세대 최종 리플레이 버퍼 `replay/gen0912.pt`.
- 남은 1.48GB의 대부분은 재학습 복구에 필수인 `gen0912.pt` 약 1.57GB(십진/이진 표기 차이로 폴더 합계 약 1.46GiB)다. 최종 모델 추론만 필요하고 재학습 가능성을 완전히 포기한다면 이 버퍼와 세션 파일도 추가 삭제할 수 있다.
- `Remove-Item`은 실행 환경 정책에 의해 차단되어, 사전에 모든 절대 경로가 `training` 내부임을 확인한 뒤 PowerShell의 .NET 파일 API로 동일 대상을 삭제했다.
- 배포: 미배포·미커밋. 삭제된 중간 산출물과 가상환경은 휴지통을 거치지 않아 직접 복구되지 않으며, 가상환경은 `requirements.txt`로 재생성 가능하다.
- 다음 작업/미해결: 없음. 재개 시 먼저 가상환경을 다시 만들고 `final_session.pt`를 활성 `session.pt`로 사용하면 913세대부터 이어갈 수 있다.

## 2026-07-24 07:47 — Codex — 신경망 프로젝트 종료 및 최종 체크포인트 보존
- 사용자 요청에 따라 장기 학습, 자동 연속 실행 cmd, 318세대 로컬 신경망 대국 서버, 로컬 8765 웹 서버와 각각의 하위 프로세스를 모두 종료했다. 확인 결과 관련 프로세스는 0개다.
- 학습은 912세대까지 완전히 완료됐다. 912세대 후보는 5승 8패 시점에 유지 판정으로 조기 종료됐고, 최종 최고 모델은 911세대 승격 모델이다.
- 종료 시 913세대 자기대국 32판 생성이 막 끝난 직후였으나 전체 1.57GB 리플레이 버퍼를 원자적으로 저장하는 도중 프로세스를 종료했다. 완전한 복구 기준은 912세대 완료 후 913세대 시작 상태인 `session.pt`이며, 913세대 중간 복구 데이터 `selfplay_in_progress.pt`(약 4.2MB)도 보존했다.
- 명시적인 종료 보관본으로 `training/checkpoints/twelve-hour/final_session.pt`와 `final_best.pt`를 만들었다. 전자는 912세대 완료 상태 전체 재시작 정보, 후자는 911세대 최종 최고 모델이다.
- `training/status.json`을 `state=stopped`, PID 없음, 프로젝트 종료 안내로 갱신해 모니터가 실행 중으로 오인하지 않게 했다.
- 중단된 원자 저장이 만든 0바이트 `replay/gen0913.pt.39492.21804.tmp`는 삭제 명령이 실행 정책에 차단되어 남아 있다. 복구에는 사용되지 않으며 용량 영향도 없다.
- 변경 파일: 신경망 worktree의 `training/status.json`, 최종 체크포인트 복사본; root `HISTORY.md`.
- 배포: 미배포·미커밋. 로컬 프로세스 종료 및 산출물 보존만 수행.
- 다음 작업/미해결: 프로젝트를 재개한다면 `final_session.pt`를 `session.pt`로 사용해 913세대부터 복구할 수 있다. 현재 검증 결론상 기존 상대 아레나만으로 장기 학습을 재개하기보다 고정 과거 모델·웹 상 AI·전술 테스트를 승격 게이트에 먼저 추가해야 한다.

## 2026-07-24 06:36 — Codex — 318·480·798세대 고정 체크포인트 절대 비교
- `training/benchmark_model_ladder.py`를 추가해 고정 체크포인트들을 서로 다른 무작위 초반 배치 16쌍 × 선후공 교환 2판, 각 MCTS 64회로 끝까지 평가하는 라운드로빈 벤치마크를 구현했다. 실행 중인 장기 학습은 중단하지 않았다.
- 결과: 480 vs 318은 21:11(480 승률 65.6%, 95% Wilson 구간 48.3~79.6%, 양측 p=0.110), 798 vs 318은 17:15(53.1%, 36.4~69.1%, p=0.860), 798 vs 480은 23:9(71.9%, 54.6~84.4%, p=0.020)였다.
- 해석: 798은 480을 상대로는 통계적으로 유의한 우세를 보여 학습이 완전히 멈춘 것은 아니다. 그러나 318 상대로는 우세가 전혀 확실하지 않아 세대가 증가한 만큼 일관되게 일반화된 실력 향상은 확인되지 않았다. 서로 다른 opening seed의 쌍별 결과라 단순 Elo 사슬로 합치면 안 되며, 비추이성·초반 배치 민감도·32판 표본 변동 가능성이 있다.
- 319~798의 480세대 중 176개(36.7%)가 직전 최고 모델과 16판 아레나를 통과했다. 잦은 상대적 승격과 798의 과거 모델 상대 불안정성이 함께 보여, 현재 아레나는 절대 성능 보증 장치로 부족하다.
- 최초 12워커 벤치마크는 본 학습 12워커와 동시에 PyTorch 프로세스를 추가해 Windows 페이지 파일 부족(WinError 1455)으로 실패했다. 본 학습은 영향 없이 유지됐고, 벤치마크를 워커 1개의 저메모리 고속 경로로 재실행해 완료했다. 단일 프로세스 기존 MCTS 경로는 너무 느려 결과 생성 전에 중단했다.
- 산출 로그: `training/benchmark_318_480_798_fast.log`; 실패 진단 로그는 `benchmark_318_480_798.err.log`, 느린 경로 로그는 `benchmark_318_480_798_single.log`.
- 배포: 미배포·미커밋. 로컬 벤치마크 도구와 로그만 추가.
- 다음 작업/미해결: 웹 상 AI와 선후공을 교환한 고정 다판 평가 및 전술 포지션 테스트를 추가해야 절대 실력을 판정할 수 있다. 장기 학습을 계속하더라도 100세대 단위로 318/480/798 같은 고정 기준 풀을 통과하지 못한 모델은 최고 모델로 채택하지 않는 승격 게이트가 필요하다.

## 2026-07-24 06:24 — Codex — 800세대 시점 최고 모델 리플레이 UI 생성
- 800세대 후보 `gen0800_skipped.pt`는 승격되지 않았으므로, 800세대 시점 실제 최고 모델인 `training/checkpoints/twelve-hour/generations/gen0798_promoted.pt`로 MCTS 128회 자가대국 샘플을 생성했다.
- 결과는 15수 흑 승리이며 마지막 수는 `-3_-1에 새 돌 놓기`, 종료 사유는 오목 완성이다. 새 샘플을 `training/replays/sample_best_selfplay.json`/`.js`에 기록하고 기존 320세대 시점 샘플은 `sample_gen0320_best.json`/`.js`로 보존했다.
- 로컬 브라우저에서 800세대/798세대 승격 모델 표시, 15수, 흑 승리와 마지막 오목 완성 문구, 다음 버튼 비활성화를 검증한 뒤 사용자가 처음부터 볼 수 있도록 수순을 0으로 되돌리고 탭을 열어뒀다.
- 장기 학습은 중단하지 않았으며 샘플 생성 시 PID 39492, 821세대, 목표 100,000세대로 정상 실행 중이었다.
- 배포: 미배포·미커밋. 로컬 리플레이 데이터만 갱신.
- 다음 작업/미해결: 사용자가 열린 UI에서 800세대 시점 대국 품질을 직접 확인할 것.

## 2026-07-23 23:02 — Codex — 기존 상 AI vs 318세대 신경망 실시간 관전 모드 구현
- `training/neural_play_server.py`를 추가해 로컬 PyTorch 체크포인트를 한 번 로드하고, 브라우저가 보낸 현재 게임 상태를 Python `GameState`로 변환한 뒤 신경망+MCTS로 다음 합법 수를 반환하는 localhost HTTP 서버를 구현했다. CORS는 로컬 UI 접속용으로 허용하며 모델과 상태는 외부로 전송하지 않는다.
- `training/start_neural_318_server.bat`을 추가했다. `gen0318_promoted.pt`, CUDA, MCTS 64회, `127.0.0.1:8766` 설정이며 현재 서버 Python PID 37796이 실행 중이다.
- `gomoku-stack.html`에 `상 AI vs 318세대` 관전 모드를 추가했다. 흑은 기존 웹 `상` 난이도, 백은 318세대 신경망이며 기존 AI vs AI의 자동재생·일시정지·되감기·한 수 재생·처음부터 다시보기를 그대로 지원한다. 서버 오류 시 자동재생을 멈추고 실행 파일 안내를 표시한다.
- 검증: Python 문법 검사, 빈 보드 상태 변환 및 합법 수 84개 확인, 기존 JS 규칙 8개와 Python/JS 신경망 인코딩 패리티 2개 테스트 통과. `/health`에서 CUDA·318세대·MCTS 64 설정을 확인했다.
- 브라우저 실제 대국에서 상 AI와 신경망이 번갈아 착수해 정상 종료까지 진행했다. 첫 검증판은 흑(상 AI)이 오목 완성으로 승리했으며, UI에 양쪽 모델 라벨·승리 결과·처음부터 다시보기가 정상 표시됐다. 검증 탭을 열어뒀다.
- 실행 중 장기 학습 PID 13388은 중단하지 않았고 332세대까지 정상 진행 중이다.
- 변경 파일: 신경망 worktree의 `gomoku-stack.html`, `training/neural_play_server.py`, `training/start_neural_318_server.bat`; root `HISTORY.md`.
- 배포: 미배포·미커밋. 로컬 전용 신경망 서버와 UI.
- 다음 작업/미해결: 현재 색은 흑=상 AI, 백=318세대로 고정이다. 공정한 성능 비교가 필요하면 색상 교체와 다판 자동 집계 기능을 추가할 것.

## 2026-07-23 22:55 — Codex — 320세대 시점 최고 모델 리플레이 UI 생성
- 320세대 후보 `gen0320_skipped.pt`는 승격되지 않았으므로, 320세대 시점 실제 최고 모델인 `training/checkpoints/twelve-hour/generations/gen0318_promoted.pt`로 MCTS 128회 자가대국 샘플을 생성했다.
- 결과는 16수 백 승리이며 마지막 수는 `-2_0 → -2_-1 이동`, 종료 사유는 오목 완성이다. 새 샘플을 `training/replays/sample_best_selfplay.json`/`.js`에 기록하고 기존 200세대 시점 샘플은 `sample_gen0200_best.json`/`.js`로 보존했다.
- 로컬 브라우저에서 제목·318세대 승격 모델 표시·백 승리·수순 이동을 확인하고, 슬라이더로 16수 마지막 장면까지 이동해 게임 종료·오목 완성 문구·다음 버튼 비활성화를 검증한 뒤 탭을 열어뒀다.
- 실행 중인 장기 학습 PID 13388은 중단하거나 변경하지 않았으며, 샘플 생성 당시 324세대를 진행 중이었다.
- 배포: 미배포·미커밋. 로컬 리플레이 데이터만 갱신.
- 다음 작업/미해결: 사용자가 열린 UI에서 320세대 시점 대국 품질을 직접 확인할 것.

## 2026-07-23 21:15 — Codex — 480세대 이후 자동 연속 학습 예약
- 현재 최적화 학습 PID 13388은 변경하거나 중단하지 않고 480세대까지 계속 실행한다.
- `training/continue_after_480.bat`을 추가하고 숨김 대기 프로세스 PID 16800을 시작했다. 현재 PID 13388 종료를 15초마다 확인한 뒤 체크포인트 원자적 저장을 위해 5초 더 기다리고, 같은 `twelve-hour/session.pt`에서 자동 재개한다. 현재 실행이 시간 예산이나 오류로 480 이전에 종료돼도 마지막 안전 체크포인트부터 이어간다.
- `training/resume_optimized_training.bat`의 다음 실행 목표를 480에서 100,000세대로 높이고 12시간 제한을 제거했다. 다음 실행도 자기대국 96회, 아레나 64회, 워커 12개, 아레나 결과 확정 시 조기 종료를 유지한다.
- 현재 C: 여유 공간은 약 573GB이고 세대 모델 65개가 약 159MB를 사용 중이다. 세대당 모델 약 2.4MB이므로 장기 실행 시 체크포인트가 계속 증가하며, 100,000세대에 실제 도달하기 전에 보존 정책을 추가하거나 수동 중단할 필요가 있다.
- 변경 파일: 신경망 worktree의 `training/resume_optimized_training.bat`, `training/continue_after_480.bat`; root `HISTORY.md`.
- 배포: 미배포·미커밋. 로컬 학습 예약만 적용.
- 다음 작업/미해결: 480세대 종료 후 새 학습 PID가 `auto_resume generation=481`로 시작하는지 확인할 것. 장기 실행 중 저장 공간을 보호하려면 최근 체크포인트와 100세대 단위 모델만 남기는 정리 정책을 별도로 구현할 것.

## 2026-07-23 21:09 — Codex — 승격 결과 보존형 아레나 조기 종료 적용
- `training/arena.py`에 전체 예정 대국 수와 완료된 후보 점수를 기준으로 승격 결과가 절대 바뀌지 않는 시점을 판정하는 `promotion_decision`을 추가했다. 후보가 이미 문턱에 도달했거나 남은 판을 모두 이겨도 문턱에 못 미치면 진행 중인 나머지 평가를 생략한다.
- 조기 종료 후에도 16판 전체를 분모로 승격을 판정하도록 `should_promote(..., total_games=16)`을 지원했다. 따라서 생략된 대국을 후보에게 유리하게 계산하지 않으며, 기존 16판을 끝까지 했을 때와 승격/유지 결과가 동일하다.
- `training/run_training.py`가 조기 종료 사유와 `evaluated=N/16`을 로그에 남기고, TensorBoard에 실제 평가·생략 게임 수를 기록하도록 연결했다. 평균 착수 수도 실제 완료된 평가 대국 수를 분모로 계산한다.
- 검증: arena·훈련 smoke·모니터 테스트 11개 통과, Python 문법 검사 통과. Git 메타데이터가 단절된 기존 worktree라 `git diff --check`만 저장소 인식 오류로 실행되지 않았다.
- 안전 체크포인트에서 기존 PID 12176과 워커를 종료하고 PID 13388로 재시작했다. 첫 적용 세대인 217세대에서 14판 완료 시 후보 9승/기존 5승으로 승격이 확정되어 남은 2판을 생략했고, `promoted=True evaluated=14/16` 기록 후 218세대로 정상 진입했다.
- 변경 파일: 신경망 worktree의 `training/arena.py`, `training/run_training.py`, `training/tests/test_arena.py`; root `HISTORY.md`.
- 배포: 미배포·미커밋. 로컬 학습에만 적용.
- 다음 작업/미해결: 여러 세대의 `evaluated`와 아레나 시간을 모아 평균 절약량을 계산할 것. 8:8처럼 마지막까지 결과가 확정되지 않는 세대는 16판을 모두 수행하므로 효과가 없으며 이는 의도된 동작이다.

## 2026-07-23 21:03 — Codex — 추가 MCTS 최적화 여지 진단
- 실행 중 학습을 변경하지 않고 CPU/GPU를 표본 측정했다. 아레나 후반(활성 3판)은 CPU 약 13~23%, GPU 약 9~23%, 자기대국 후반(활성 10판)은 CPU 약 15~20%, GPU 약 11~18%로 둘 다 낮았다.
- 현재 병목은 단순 CPU 포화나 GPU 연산 포화보다, 동시 대국이 끝날수록 활성 대국 수가 줄어 배치가 작아지는 꼬리 구간과 워커별 동기식 추론 요청/응답 구조에 가깝다.
- 다음 안전 최적화 후보는 아레나 승격 결과가 수학적으로 확정되는 순간(후보 점수가 문턱 도달 또는 남은 판을 모두 이겨도 문턱 미달)에 평가를 조기 종료하되, 선후공 쌍이 끝난 경계에서만 판정하는 방식이다. 승격 결과는 바꾸지 않으면서 결정적인 매치의 평가 시간을 줄일 수 있다.
- 더 큰 구조 개선 후보는 워커 내부 다중 leaf 비동기 수집/virtual loss로 한 대국에서도 여러 추론 포지션을 동시에 만들어 GPU 배치를 채우는 것이다. 구현·검증 난도가 높고 탐색 세부 동작이 달라질 수 있다.
- 변경 파일: `HISTORY.md`만 갱신. 실행 중 학습과 코드는 변경하지 않았다.
- 배포: 미배포·미커밋.
- 다음 작업/미해결: 안전 조기 종료를 먼저 구현·테스트할지, 현 480세대를 그대로 끝낸 뒤 동일 체크포인트에서 워커 8/12 비교 및 비동기 leaf batching 벤치마크를 진행할지 결정할 것.

## 2026-07-23 21:00 — Codex — MCTS 최적화 재시작 초기 성능 확인
- 새 설정으로 완전히 수행된 208·209세대는 각각 자기대국 22.1/21.0초, 학습 2.1/1.7초, 아레나 26.2/25.9초, 총 57.4/55.4초였다. 기존 203세대 총 99.4초 대비 약 42~44% 단축, 처리속도 기준 약 1.73~1.79배 향상됐다.
- 207세대는 저장된 아레나 단계부터 복구된 세대라 자기대국 시간이 0으로 표시되므로 정상적인 전체 성능 비교에서 제외했다.
- 21:00 기준 PID 12176은 오류 없이 210세대 아레나(16판, MCTS 64회)를 진행 중이다. 208·209세대 후보는 각각 8:8, 6:10으로 승격되지 않았다.
- 변경 파일: `HISTORY.md`만 갱신. 실행 설정과 학습 프로세스는 변경하지 않았다.
- 배포: 미배포·미커밋.
- 다음 작업/미해결: 완료 세대가 더 쌓이면 평균·분산을 다시 계산하고, 현재 약 56초/세대가 유지될 경우 480세대까지 약 4.2시간이라는 예상치를 실제 장기 구간으로 보정할 것.

## 2026-07-23 20:58 — Codex — 안전 체크포인트에서 MCTS 최적화 설정으로 재시작
- 207세대 자기대국·신경망 학습이 끝나고 `training/checkpoints/twelve-hour/session.pt`가 `generation=207, phase=arena`로 저장된 것을 확인한 뒤, 기존 PID 29032와 하위 MCTS 워커를 종료했다. 이 시점의 자기대국 버퍼 200,000개와 207세대 후보 모델은 보존됐다.
- 원본 복구본을 `training/checkpoints/twelve-hour/session_before_mcts_tuning.pt`로 보관하고, 활성 세션 설정을 자기대국 MCTS 96회·아레나 MCTS 64회로 변경했다.
- 재사용 가능한 실행 파일 `training/resume_optimized_training.bat`을 추가했다. 설정은 자기대국 32판/96회, 아레나 16판/64회, MCTS 워커 12개, 추론 최대 배치 256, 대기 2ms이며 나머지 학습·체크포인트·TensorBoard 경로는 기존 12시간 세션을 유지한다.
- 새 학습 본체 PID 12176으로 CUDA 재시작을 확인했다. 207세대 아레나부터 복구되어 31.7초에 완료(후보 11승/기존 5승, 승격)했고, 현재 208세대 자기대국에서 MCTS 96회 설정으로 정상 실행 중이다.
- 배포: 미배포·미커밋. 로컬 학습 프로세스와 실행 배치만 변경.
- 다음 작업/미해결: 208세대가 완전히 끝나면 자기대국·학습·아레나·총시간을 기존 203세대의 32.5/2.1/57.1/99.4초와 비교하고, 추론 통계 및 CPU/GPU 사용률을 기준으로 워커 12의 실효성을 판단할 것.

## 2026-07-23 20:48 — Codex — MCTS 병목 최적화 제안 검토
- 현재 12시간 학습 PID 29032의 실제 인수가 자기대국/아레나 MCTS 128회, 워커 8개, 추론 최대 배치 256임을 확인했다. PC CPU는 Ryzen 7 9800X3D 8코어 16스레드다.
- 현재 `parallel_mcts.py`는 워커마다 배정된 여러 동시 대국 상태를 하나의 추론 요청으로 묶고 중앙 추론 스레드가 다시 합친다. 따라서 워커 8개가 GPU 배치를 8포지션으로 제한하는 것은 아니며, 동시 대국 수상 자기대국 최대 약 32포지션·아레나 최대 약 16포지션이 실질 상한이다.
- 결론: 다음 안전 체크포인트 재시작 때 아레나 128→64, 자기대국 128→96 적용은 합리적이다. 워커 8/12/16은 GPU 배치 확대보다 CPU 탐색·IPC 균형을 찾는 벤치마크로 봐야 하며, 이 CPU에서는 8과 12를 우선 비교하고 16은 과병렬화 가능성을 확인하는 후보로 판단했다.
- 변경 파일: `HISTORY.md`만 갱신. 학습 코드와 실행 중인 프로세스는 변경하지 않았다.
- 배포: 미배포·미커밋.
- 다음 작업/미해결: 동일 체크포인트·동일 seed로 워커 8/12/16 및 탐색 수 조합의 자기대국/아레나 시간, 평균·최대 추론 배치, GPU 사용률을 비교한 뒤 다음 실행값을 확정할 것.

## 2026-07-23 20:44 — Codex — 200세대 시점 최고 모델 리플레이 UI 검증
- 200세대 후보 `gen0200_skipped.pt`는 평가에서 승격되지 않았으므로, 200세대 시점 실제 최고 모델인 `training/checkpoints/twelve-hour/generations/gen0199_promoted.pt`로 MCTS 128회 자가대국 샘플을 생성했다.
- 새 샘플은 `training/replays/sample_best_selfplay.json`/`.js`에 기록했으며, 결과는 15수 흑 승리(오목 완성)다. 기존 140세대 시점 샘플은 `sample_gen0140_best.json`/`.js`로 보존했다.
- `gomoku-stack-replay.html`을 로컬 브라우저에서 열어 제목·모델 세대·승자·15수 표시, 다음 수 조작, 마지막 수의 오목 완성 문구와 다음 버튼 비활성화를 확인하고 검증 탭을 열어뒀다.
- 실행 중인 12시간 학습은 중단하거나 변경하지 않았다.
- 배포: 미배포·미커밋. 로컬 전용 리플레이 데이터만 갱신.
- 다음 작업/미해결: 사용자가 열린 리플레이 UI에서 대국 품질을 직접 확인할 것. 필요하면 승격 실패한 200세대 후보 자체도 별도 샘플로 생성해 199세대 최고 모델과 비교할 수 있다.

## 2026-07-23 18:36 — Codex — 140세대 시점 UI 리플레이 생성 및 12시간 후속 학습 예약
- 140세대 후보는 `8승 8패`로 승격되지 않았으므로, 140세대 시점 실제 최고 모델인 `gen0137_promoted.pt`로 MCTS 128회 자가대국 샘플을 생성했다. 결과는 28수 백 승리이며 기존 `gomoku-stack-replay.html`에서 이전/다음/자동재생으로 볼 수 있다. 기존 79세대 샘플은 `sample_gen0079_best.json`/`.js`로 보존했다.
- `training/generate_sample_replay.py`에 표시 제목 인자를 추가하고, 브라우저에서 140세대 제목·28수·백 승리와 다음 수 조작을 검증해 리플레이 탭을 열어뒀다.
- 사용자의 4배 작업량 요청을 현재 추가 학습 80세대의 4배인 320세대로 해석해, 현재 160세대 종료 후 161~480세대를 최대 12시간 실행하도록 `training/run_12hour_after_current.bat`을 추가하고 대기 프로세스(cmd PID 8356)를 시작했다.
- 새 12시간 세션은 `training/prepare_continuation.py`가 완료된 세션의 모델·리플레이 포인터를 이어받되 누적 시간은 0으로 초기화한다. 산출물은 `training/checkpoints/twelve-hour`, TensorBoard는 `training/runs/twelve-hour`, 로그는 `training/train_12hour.log`에 분리된다.
- 검증: 연속 세션 준비·평가 다양화·세션 저장 테스트 `7 passed`, Python 문법 검사 통과. 현재 학습 PID 32760은 중단하지 않았고 예약 창이 30초마다 종료를 확인한다.
- 배포: 미배포·미커밋. 로컬 전용 학습 및 리플레이 변경.
- 다음 작업/미해결: 160세대 완료 후 12시간 세션이 `generation=161`, 기존 버퍼 유지 상태로 시작하는지 로그 첫 줄을 확인할 것. 예약 배치는 현재 PID 32760을 기준으로 하므로 사용자가 현 학습을 수동 재시작해 PID가 바뀌면 예약 배치도 갱신해야 한다.

## 2026-07-23 15:52 — Codex — 평가 다양화 후 81~160세대 연속 학습 시작 및 샘플 리플레이 UI 추가
- 실제 작업 경로를 `C:\Users\maktu\Desktop\project\모자이크퍼즐\.claude\worktrees\gomoku-stack-neural-ai`로 바로잡았다. OneDrive 경로에는 80세대 산출물이, 새 경로에는 소스가 나뉘어 있어 최종 `session.pt`/79세대 `best.pt`와 80세대 리플레이를 새 `ten-hour-continuation` 세션으로 연결했다.
- 평가 수정: `training/arena.py`가 평가전 16판을 서로 다른 무작위 초반 배치 8개 × 선후공 교환 2판으로 구성한다. 세대 번호를 seed로 사용하며, 승격은 무승부를 0.5점으로 포함한 전체 점수율 55% 기준으로 변경했다. 1승 15무 같은 결과는 더 이상 승격되지 않는다.
- 저장공간 수정: `training/session_checkpoint.py`가 리플레이 버전을 최신 2개만 보존해 복구 안전성을 유지하면서 세대당 약 0.8~1GB 누적을 방지한다.
- 연속 학습: 80세대의 100,872개 버퍼를 정상 로드한 것을 확인한 뒤 81~160세대를 시작했다. 최초 시도에서 상대경로 때문에 `buffer=0`을 발견해 6초 만에 중단하고 절대경로를 연결하여 재시작했다. 최종 학습 PID 32760, CUDA, `buffer=100872`, 81세대 자가대국 진행 중. 상태 모니터도 새 경로에서 재실행했다.
- 샘플 리플레이: 최종 79세대 모델끼리 MCTS 128회 자가대국 한 판을 별도로 생성했다. 25수 흑 승리(오목 완성)이며 학습 버퍼에는 넣지 않았다. `training/replays/sample_best_selfplay.json`/`.js`, 생성기 `training/generate_sample_replay.py`, 보드 UI `gomoku-stack-replay.html`을 추가했다. 이전/다음·슬라이더·자동재생·착수 설명을 지원하고 브라우저에서 렌더링 및 다음 수 동작을 확인해 페이지를 열어뒀다.
- 검증: 평가/세션/훈련 smoke 관련 `9 passed`(명령 후 Git 메타데이터 단절 때문에 전체 셸 종료코드는 1이었으나 pytest 자체는 통과), 별도 평가 수정 세트 `7 passed`; 리플레이 26프레임 생성 및 브라우저 UI 확인.
- 배포: 미배포·미커밋. 로컬 전용 학습과 리플레이 도구만 변경.
- 다음 작업/미해결: 81세대 평가가 끝나면 8개 초반 쌍에서 결과가 더 이상 정확히 8판 단위 복제로 갈리지 않는지 확인할 것. 새 worktree의 `.git` 파일은 사라진 OneDrive Git 디렉터리를 가리켜 현재 Git 명령이 동작하지 않으므로 추후 worktree 메타데이터 복구가 필요하다.

## 2026-07-23 06:34 — Codex — 상태 모니터에 최근 세대별 승패·승격 표시
- 변경 파일: 로컬 신경망 worktree의 `training/monitor_training.py`, `training/tests/test_monitor_training.py`; root `HISTORY.md`.
- 구현: 상태 모니터가 `training/train.log`에서 완료된 최근 6세대의 평가 결과를 읽어 `후보승 / 기존승 / 무승부`와 `승격/유지`를 화면 아래에 표시하도록 추가했다. 학습 프로세스와 상태 JSON 형식은 변경하지 않았다.
- 검증: 모니터 파서·진행 상태 테스트 `4 passed`, 실제 로그에서 1~5세대 결과 파싱 확인, `py_compile` 및 `git diff --check` 통과.
- 실행 상태: 학습 PID 12388은 중단하지 않았고 06:34 기준 6세대 진행 중. 기존 모니터만 종료 후 새 코드로 재실행했으며 최종 모니터 체인은 cmd PID 35584 → Python PID 39752/22520 한 개만 유지했다.
- 배포: 미배포·미커밋. 로컬 전용 학습 도구 변경.
- 다음 작업/미해결: 표시 기본값은 최근 6세대이며, 더 긴 이력이 필요하면 페이지/스크롤 또는 별도 요약 화면을 추가할 것.

## 2026-07-23 06:31 — Codex — 학습 상태 창 재실행 및 자동 닫힘 방지 보강
- 변경 파일: 로컬 신경망 worktree의 `training/train_launcher.py`, `training/monitor_training.bat`; root `HISTORY.md`.
- 조치: 학습 본체 PID 12388이 정상 실행 중임을 확인하고 사라진 상태 모니터만 새 콘솔로 재실행했다(모니터 Python PID 20280 확인). 런처가 상태 창을 `cmd /k`로 열도록 바꾸고, 모니터가 예기치 않게 종료되면 종료 코드를 출력한 채 콘솔을 유지하도록 배치 파일을 수정했다.
- 배포: 미배포·미커밋. 로컬 전용 도구 변경.
- 다음 작업/미해결: 상태 창 자체의 X 버튼이나 Windows가 콘솔 프로세스를 강제 종료하는 경우까지 막을 수는 없다. 다시 종료되면 남아 있는 콘솔의 종료 코드 또는 Windows 이벤트를 확인할 것.

## 2026-07-23 06:22 — Codex — 자가대국·평가전 종료 원인 진단 추가
- 변경 파일: 로컬 신경망 worktree의 `training/arena.py`, `training/selfplay.py`, `training/run_training.py`, `training/monitor_training.py`, 관련 테스트 및 `training/.gitignore`; root `HISTORY.md`.
- 구현: 다음 학습 실행부터 자가대국과 평가전의 각 게임에 대해 종료 수, 승자/무승부, 종료 원인(`win`, `max_plies`, `no_legal_move`)을 `training/game_diagnostics.jsonl`에 기록한다. 상태 JSON과 모니터에는 승·패·무 및 최대 수 무승부/착수 불가 누계를 표시하고, TensorBoard에는 세대별 평균 착수 수와 최대 수 무승부 수를 추가한다. 기존 함수 반환값과 중단 복구 스냅샷은 호환되도록 유지했다.
- 검증: arena/selfplay/훈련 smoke/progress 관련 11개 테스트 통과, 결과 콜백을 직접 검증하는 arena/selfplay 6개 테스트 재통과, `git diff --check` 통과. 기존 학습 PID 12388은 중단하지 않았고 06:22 기준 3세대 자가대국을 정상 진행 중이다.
- 배포: 미배포·미커밋. 로컬 전용 신경망 학습 코드만 변경.
- 다음 작업/미해결: 실행 중인 PID 12388은 수정 전 코드를 메모리에 사용하므로 새 진단은 체크포인트 기반 다음 재시작부터 적용된다. 재시작 후 2~3세대의 `max_plies` 비율을 확인해 평가전 전부 무승부가 최대 300수 제한 때문인지 판단할 것.

## 2026-07-23 — Codex — Claude Code MCP를 Codex Desktop으로 이전 및 MCTS 최적화 작업 일시중지
- 변경 파일: 전역 `C:\Users\maktu\.codex\config.toml`(Claude Code 활성 MCP 중 중복 제외 14개 등록), 로컬 신경망 worktree의 `training/fast_game.py`, `training/parallel_mcts.py`, 관련 테스트/학습 파일(병렬 MCTS 작업 중간 상태), `HISTORY.md`
- MCP 이전:
  - 등록: Context7, Hugging Face, monday.com, Cloudflare, Lovable, Zapier, Replit, Supabase, Vercel, Google Calendar, Atlassian, PlayMCP, Figma, Canva.
  - 제외: Notion(Codex Notion 플러그인과 중복), Playwright(Codex Browser 플러그인과 중복), SlidesGPT(Codex Presentations 기능과 중복).
  - Context7는 stdio 서버로 등록됨. 원격 13개는 URL 등록 완료, Codex에서 각각 OAuth 재인증 필요(`Not logged in`). Claude 계정 토큰은 이전하지 않음.
  - 터미널의 `CODEX_HOME`이 Orca 런타임을 가리켜 최초 일부 설정이 잘못 들어갔으나 모두 제거했고, 실제 Codex Desktop 경로 `C:\Users\maktu\.codex`를 지정해 14개 등록을 검증함.
- 신경망 MCTS 작업 상태:
  - 사용자 요청 1~4(CPU 멀티프로세스, 중앙 GPU 큐, 동적 배치, 규칙 가속)를 진행하다 MCP 이전 요청으로 일시중지함.
  - Numba 0.61.2 설치에 따라 가상환경 NumPy가 2.2.6으로 조정됨. `training/requirements.txt`에 `numpy<2.3`, `numba` 조건 추가.
  - 배열 기반 Numba 규칙 엔진 `training/fast_game.py` 추가, 기존 엔진과 120수 합법수/상태/인코딩 패리티 테스트 1개 통과.
  - 영구 CPU 워커 + 중앙 GPU 동적 배치 서버 초안 `training/parallel_mcts.py`를 추가하고 selfplay/arena/run_training에 연결했으나, 연결 이후 통합 테스트와 벤치마크는 아직 수행하지 않음. 이 상태로 본 학습을 새로 시작하지 말고 다음 세션에서 테스트/수정부터 이어갈 것.
- 배포: 미배포, 프로젝트 및 신경망 worktree 변경 미커밋. MCP 설정만 Codex Desktop 전역 설정에 적용.
- 다음 작업/미해결:
  - Codex Desktop을 재시작하고 필요한 원격 MCP를 로그인할 것. 한꺼번에 13개 로그인하기보다 실제 사용할 서비스부터 인증 권장.
  - 병렬 MCTS는 `parallel_mcts.py` 문법/단위 테스트 → 소규모 CPU/CUDA 스모크 → 단일 프로세스 대비 패리티 → 벤치마크 순서로 검증해야 함.

## 2026-07-23 — Codex — 멀티프로세스 MCTS·중앙 GPU 동적 배치·Numba 규칙 가속 검증 완료
- 변경 파일: 로컬 신경망 worktree의 `training/parallel_mcts.py`, `training/fast_game.py`, `training/benchmark_parallel_mcts.py`, `training/mcts.py`, `training/selfplay.py`, `training/arena.py`, `training/run_training.py`, `training/progress.py`, `training/requirements.txt`, 관련 테스트 및 `.gitignore`; root `HISTORY.md`.
- 구현:
  - 4개(기본값, `--mcts-workers`) 영구 spawn CPU 워커가 MCTS 트리를 분할 처리하고, 부모 프로세스의 단일 GPU 추론 스레드가 워커 요청을 `--inference-batch-size`/`--inference-wait-ms` 기준으로 동적 결합하도록 구성.
  - MCTS 워커 내부 규칙/상태/인코딩을 문자열 딕셔너리 대신 85×3 고정 배열과 Numba JIT 함수로 처리. 기존 UI/기준 Python 엔진은 변경하지 않음.
  - 자가대국과 아레나 모두 병렬 엔진을 선택적으로 사용하며, CLI에서 `--mcts-workers 0`이면 기존 단일 프로세스 경로 유지.
  - 별도 실행 중인 본 학습과 테스트가 동일 `status.json.tmp`를 공유해 Windows `PermissionError`가 난 문제를 발견하여 PID/스레드별 임시 파일명으로 수정하고 테스트 상태/체크포인트/TensorBoard 경로를 임시 폴더로 격리.
- 검증:
  - Numba 규칙 엔진과 기준 엔진의 120수 합법수·상태·신경망 인코딩 패리티 통과.
  - CPU 2워커 IPC/검색/결과 순서/정상 종료 테스트 통과.
  - CUDA 중앙 추론 + 다중 워커 동적 배치 테스트 통과.
  - 전체 테스트 `30 passed`, ONNX legacy exporter deprecation warning 2건만 존재.
  - 2워커 병렬 end-to-end 1세대 스모크(자가대국→학습→아레나→체크포인트) 통과, 23.46초.
  - 실모델(64채널, 6 residual block), 24판세×32 simulations 벤치마크: 기존 0.513초, 병렬 0.253초, 2.02배 향상, 최대 GPU 배치 24.
- 현재 실행/배포: 기존 PID 29328 본 학습은 수정 전 코드를 메모리에 올린 채 계속 실행 중이며 중단하지 않음. 새 병렬 코드는 다음 학습 실행부터 기본 4워커로 적용. 미커밋·미배포, 로컬 전용.
- 다음 작업/미해결:
  - 현재 세대가 끝나 체크포인트가 저장된 뒤 새 병렬 엔진으로 재시작하는 것이 안전함. 기존 `--resume`은 모델만 불러오고 리플레이 버퍼는 복원하지 않는다는 점에 유의.
  - 실제 50게임×200 simulations 장시간 세대에서 CPU/GPU 사용률과 세대 시간을 다시 측정해 워커 수(4/6/8), 대기시간(1~3ms), 최대 배치(128/256)를 튜닝할 것.
  - 후속 10시간 목표 작업: 40수 진행 판세 24개×MCTS 80 벤치마크에서 4워커 0.831초(14.09×), 6워커 0.694초(9.97×), 8워커 0.615초(16.85×)로 8워커가 가장 빨랐음(동시에 기존 학습이 돌아가 절대/상대값 변동은 있음).
  - `training/run_10hour_training.bat` 추가: 최대 80세대, 자가대국 32판, MCTS 128, 아레나 16판×128, 학습 150스텝, 8워커, 9.5시간 안전 예산. `run_training.py --max-hours`가 최근 최대 3세대 평균과 10% 여유를 사용해 다음 세대가 예산을 넘길 것으로 보이면 체크포인트 저장 후 세대 사이에서 안전 종료함.
  - Python 런처 메뉴 3번을 `10시간 최적화 학습 시작(권장)`으로 추가하고 원본 200세대는 메뉴 4번으로 유지. 시간 예산 스모크 테스트에서 1세대 완료 후 다음 세대 진입 전 정상 종료 확인, 런처/배치 문법 및 BOM 제거 확인.
  - 후속 중단 복구 구현: 10시간 프리셋에 `--session-dir training/checkpoints/ten-hour --auto-resume`를 적용. `session.pt`에 현재 세대/단계/최고 모델/후보 모델/옵티마이저/학습 스텝/누적 실행시간/리플레이 버전 포인터를 저장하고, `selfplay_in_progress.pt`에는 진행 중인 모든 대국 상태·기보 샘플·완료 여부·난수 상태를 저장함.
  - 자가대국은 기본 5수 라운드마다 그리고 대국 완료 때 스냅샷을 원자적으로 저장. 중단 시 마지막 스냅샷부터 재개하며 현재 계산 중이던 MCTS 한 수만 다시 계산. 자가대국 완료 후 리플레이 버퍼를 `replay/genNNNN.pt` 버전 파일로 저장하고 세션이 원자적으로 그 버전을 가리키게 해 중복 추가/부분 저장을 방지함.
  - 신경망 학습은 10스텝마다 후보 모델·옵티마이저·다음 스텝을 저장. 아레나 진입 전에 학습된 후보를 저장하므로 평가 도중 중단되면 자가대국/학습을 반복하지 않고 아레나만 처음부터 재실행. 세대 완료 체크포인트는 `training/checkpoints/ten-hour/generations/`, TensorBoard는 `training/runs/ten-hour/`로 기존 학습과 분리.
  - 검증: 중간 자가대국 강제 예외 후 저장된 1수 스냅샷에서 재개해 2판 완료, 세션/리플레이/모델 디스크 왕복, 전체 테스트 `32 passed`, 추가 실제 오케스트레이터 2회 실행으로 1세대 저장→종료→리플레이 145개를 불러와 2세대 자동 재개까지 통과. ONNX legacy exporter 경고 2건 외 실패 없음.
  - 실운영 후속 수정: 첫 10시간 프리셋 실행에서 Windows/OneDrive가 모니터가 읽던 `training/status.json` 교체를 잠깐 막아 `WinError 5`가 발생했고, 상태 표시 실패가 학습 전체를 종료시키는 문제를 확인. `progress.py`는 최대 10회 짧게 재시도한 뒤에도 잠겨 있으면 경고만 출력하고 학습을 계속하도록 변경. 복구 핵심 파일인 세션 체크포인트 교체는 더 길게 재시도하고 영구 실패 시 임시 파일을 보존하며 명시적으로 중단하도록 구분함. 잠금 재시도/영구 실패 비치명성 테스트 포함 3개 통과.
  - 실패 당시 자가대국 스냅샷(완료 2/32, 15수 라운드)이 보존됐고 수정 후 10시간 프리셋을 재실행함. PID 12388이 `auto_resume generation=1 phase=selfplay`, 완료 2판에서 복원해 15초 확인 시 3/32, 25수 라운드, 누적 746수로 정상 진행 중.
  - 상태 모니터가 2초마다 `cls`로 전체 화면을 지워 깜빡이던 문제 수정. Windows VT 모드를 활성화하고 최초 한 번만 화면을 초기화한 뒤 ANSI 커서 이동으로 같은 영역을 덮어쓰며, 남는 줄만 지우고 종료 시 커서를 복원하도록 변경. 실행 중인 학습에는 영향 없으며 상태 창 재실행 시 적용됨.
  - 후속 수정: 가상환경 Python 실행기를 `CREATE_NEW_CONSOLE`로 직접 띄운 상태 모니터 창이 자동 종료되는 현상을 방지하기 위해 BOM 없는 ASCII `training/monitor_training.bat` 래퍼를 추가하고 CMD가 모니터 프로세스를 소유하도록 변경. 예외 종료 시에도 오류 안내와 `pause`로 창을 유지함. 새 모니터를 직접 실행해 CMD→venv Python→base Python 프로세스 체인이 유지되는 것을 확인(PID 39888/17328). 학습 PID 12388은 중단 없이 아레나 평가 진행 중.

## 2026-07-23 05:08 — Codex — 로컬 신경망 학습 복구 및 실시간 진행 모니터 추가
- 변경 파일: 로컬 worktree `worktree-gomoku-stack-neural-ai`의 `training/progress.py`(신규 상태 JSON 기록기), `training/monitor_training.py`(신규 콘솔 진행 화면), `training/run_training.py`(단계별 진행률·완료·중단·오류 기록), `training/train_launcher.bat`(상태 보기 메뉴 및 본 학습 시작 시 모니터 자동 실행), `training/run_full_training.bat`(unbuffered 실행), `training/.gitignore`(상태·로그 산출물 제외). 기존에 미커밋 상태였던 GPU 배치 MCTS/자가대국/아레나 최적화 파일들은 보존함.
- 배포: 미배포, 커밋하지 않음. 신경망 학습 및 모니터는 로컬 전용 worktree에서만 변경.
- 검증:
  - 2026-07-22부터 남아 있던 정지 Python 프로세스 2개(PID 17068, 27516)를 종료함.
  - 가상환경 Python 3.12.10 및 CUDA 실행을 확인함.
  - `python -m pytest training/tests -q`: 26 passed, ONNX 구형 exporter 관련 경고 2건만 발생.
  - CUDA 최소 1세대 스모크 학습 완료(자가대국 1, 학습 1 step, 평가 1): 총 6.5초, `status.json`이 `completed`/100%로 정상 전환됨.
  - 신규 Python 파일 `py_compile` 통과, `git diff --check` 통과.
- 다음 작업/미해결:
  - 사용자는 `training/train_launcher.bat`를 실행하고 3번을 선택하면 본 학습 창과 상태 모니터 창을 함께 볼 수 있음. 상태 화면에는 PID/GPU, 세대, 현재 단계, 단계·전체 진행률, 경과·예상 잔여시간, 최근 갱신 및 오류가 표시됨.
  - 장시간 본 학습은 아직 다시 시작하지 않음. 사용자가 시작 시점을 결정해야 함.
  - worktree 전체 변경은 아직 미커밋이며, 기존 GPU 배치 최적화 변경과 이번 모니터 변경이 함께 존재함. 프로덕션 master/game-hub에는 병합하지 말 것.
  - 후속 수정: Windows cmd가 UTF-8 BOM/한글 배치 파일을 오해해 명령을 그대로 출력하고 메뉴 일부를 실행하려던 문제를 수정함. `train_launcher.bat`과 `run_full_training.bat`은 BOM 없는 ASCII 래퍼로 교체하고, 한글 대화형 메뉴는 신규 `training/train_launcher.py`로 이전함.
  - 후속 수정: 실제 학습 PID 10552가 정상 실행 중인데 Windows의 `os.kill(pid, 0)`이 실패해 모니터가 `응답 없음`으로 오표시하던 문제를 Win32 `OpenProcess` 기반 생존 확인으로 교체함. 첫 대국 완료 전 경과시간이 0에 머물던 문제도 모니터가 시작 시각으로부터 실시간 계산하도록 수정함.
  - 후속 수정: 한 수 내부의 MCTS 진행도도 보이도록 `run_mcts_batch`에 진행 콜백을 추가하고 자가대국/아레나를 거쳐 상태 파일에 `MCTS 현재/전체 반복`, 활성 대국 수, 현재 수 라운드, 누적 착수 수를 기록·표시하도록 확장함. 관련 MCTS/자가대국/아레나 테스트 10개 통과. 이미 실행 중인 PID 10552는 이전 코드를 메모리에 올린 상태라 상세 MCTS 표시는 다음 학습 재시작부터 적용됨.

## 2026-07-23 04:54 — Codex — 저장소 관리 파일 분류 및 신경망 로컬 전용 원칙 명시
- 변경 파일: `.gitignore`(로컬 에이전트/브라우저 상태, 임시 패치, 인수인계 ZIP 제외), `AGENTS.md`(3단 오목 신경망 학습·실행 및 연동 코드는 로컬 전용이며 별도 요청 없이 master/game-hub에 병합하지 않는다는 배포 원칙 추가), `HISTORY.md`
- 배포: 미배포, 커밋하지 않음
- 다음 작업/미해결:
  - `AGENTS.md`, `CLAUDE.md`, `HISTORY.md`, `.gitignore` 변경은 저장소 관리 대상으로 커밋 필요.
  - `worktree-gomoku-stack-neural-ai` 브랜치는 로컬 연구용으로 유지하며, `training/`, 체크포인트, ONNX 모델 및 브라우저 신경망 연동 코드는 프로덕션 배포본에 병합하지 않을 것.
  - `aifix20260719.patch`, 인수인계 ZIP 2개, `.claude/`, `.playwright-mcp/`는 로컬 전용으로 분류해 Git 추적 대상에서 제외함. 실제 파일은 삭제하지 않음.

## 2026-07-22 — Claude Code — AGENTS.md / CLAUDE.md / HISTORY.md 신설
- 변경 파일: `AGENTS.md`(신규), `CLAUDE.md`(신규, `@AGENTS.md` import), `HISTORY.md`(신규, 이 파일)
- 배포: 미배포 (문서 파일만 추가, 로컬 커밋도 아직 안 함)
- 다음 작업/미해결:
  - 이 시점 이전의 실제 작업 이력은 이 파일에 소급 기록되어 있지 않음 — 필요하면 이 repo의 `git log`와 `game-hub` repo의 `git log -- apps/mosaic-puzzle`을 참고할 것.
  - 사용자가 Claude Code와 Codex를 병행 사용할 예정이므로, 다음 세션(어느 에이전트든)부터 이 파일에 항목을 남기는 습관이 실제로 지켜지는지 확인 필요.
