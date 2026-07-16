# 전체 코인 랭킹 시스템 — 설계 문서

## 개요
모든 플레이어가 공유하는 전체(글로벌) 코인 랭킹. 플레이어가 원할 때 "제출" 버튼을 눌러 닉네임과 함께 현재 코인 잔액을 등록하고, 상위 기록을 누구나 조회할 수 있다.

## 결정된 사항 (브레인스토밍에서 확정)
- **범위**: 전체 공유 랭킹 (기기/브라우저에 국한되지 않음) → 서버(Firestore) 필요
- **닉네임**: 제출 버튼을 누를 때 입력받음. 최초 입력 후 이 기기에 저장해 다음 제출부터 자동으로 채워줌 (재입력 불필요, 단 계정 개념은 없음 — 다른 기기에서는 다시 입력)
- **제출값**: 제출 시점의 **현재 코인 잔액** (베팅으로 잃으면 그만큼 낮아진 채로 제출됨)
- **재제출 규칙**: 같은 닉네임으로 다시 제출하면 새 값이 기존 기록보다 **높을 때만** 갱신 (즉, 닉네임별 최고 기록만 유지)
- **부정 방지 한계**: 클라이언트가 스스로 신고하는 값이라, 개발자도구로 로컬 코인 값을 조작해 제출하는 것을 완전히 막을 수는 없다. Firestore 보안 규칙로 닉네임 길이·코인 범위 등 기본적인 형식 검증만 수행하고, 그 이상의 부정행위 방지(실사용자 인증, 서버 측 라운드 검증 등)는 이번 범위 밖으로 한다. 캐주얼/비영리 게임 특성상 허용 가능한 리스크로 판단.

## 아키텍처
기존 Firebase 프로젝트(`cockroach-gambling-board`, 이미 Hosting에 사용 중)에 **Firestore**를 추가한다. 별도 서버 코드(Cloud Functions 등) 없이, 클라이언트가 Firestore JS SDK로 직접 읽고 쓰며, Firestore 보안 규칙이 유일한 서버 측 검증 계층이다.

**컬렉션 구조**: `leaderboard` 컬렉션, 문서 1개 = 플레이어(닉네임) 1명.
- 문서 ID = 닉네임 원문 (trim만 적용, 별도 슬러그화 없음 — 같은 닉네임을 쓰면 같은 슬롯을 공유하는 것이 의도된 동작)
- 필드: `{ nickname: string, coins: number, updatedAt: Timestamp }`

**조회**: `coins` 내림차순 정렬, 상위 10명만 조회 (Firestore 단일 필드 정렬이라 별도 복합 인덱스 불필요).

**제출 흐름**:
1. 사용자가 "랭킹 제출" 버튼 클릭
2. 닉네임 입력 필드가 비어 있으면(=기기에 저장된 닉네임이 없으면) 입력을 요구; 있으면 자동으로 채워짐 (수정 가능)
3. 제출 시 해당 닉네임 문서를 읽어 기존 `coins`와 비교
4. 기존 기록이 없거나 새 값이 더 크면 덮어쓰기(`updatedAt`은 서버 타임스탬프); 아니면 아무것도 쓰지 않고 "이미 더 높은 기록이 있습니다" 안내만 표시
5. 성공 시 목록을 다시 불러와 갱신하고, 닉네임을 로컬에 저장

## 컴포넌트/파일 구조
```
src/leaderboard/
  firebaseClient.ts     # Firebase App 초기화 + Firestore 인스턴스 export
  leaderboardApi.ts     # submitScore(nickname, coins), fetchTopScores(limit)
  validateNickname.ts   # 순수 함수: trim + 길이 검증 (1~20자), 테스트 가능
src/components/
  LeaderboardPanel.tsx  # 목록 표시 + 닉네임 입력 + 제출 버튼, 사이드 패널에 추가
firestore.rules         # 보안 규칙 (닉네임 길이, 코인 범위, updatedAt=서버시간 강제)
```

`App.tsx`의 사이드 패널에 `StatsPanel`/`HistoryPanel` 아래(또는 위)에 `LeaderboardPanel`을 추가하고, `state.coins`를 prop으로 전달한다.

## 데이터 흐름 & 상태
`LeaderboardPanel`은 독립적인 로컬 상태를 가진다 (게임의 `useGameState`와는 별개):
- `topScores: {nickname:string, coins:number}[]` — 마운트 시 + 제출 성공 시 갱신
- `nickname: string` — `useLocalStorage`로 영속화 (키: `cockroach-gambling-nickname`)
- `status: 'idle' | 'loading' | 'submitted' | 'not-a-new-high' | 'error'` — 제출 버튼 눌렀을 때의 피드백 표시용

## 보안 규칙 (firestore.rules)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /leaderboard/{nickname} {
      allow read: if true;
      allow write: if request.resource.data.keys().hasOnly(['nickname', 'coins', 'updatedAt'])
                   && request.resource.data.nickname is string
                   && request.resource.data.nickname.size() > 0
                   && request.resource.data.nickname.size() <= 20
                   && request.resource.data.coins is int
                   && request.resource.data.coins >= 0
                   && request.resource.data.coins <= 1000000
                   && request.resource.data.updatedAt == request.time;
    }
  }
}
```

## 배포 절차 (사용자 확인 필요)
1. Firebase 콘솔/CLI로 Firestore 데이터베이스 프로비저닝 (기존 프로젝트에 추가하는 것이므로, 기존 Hosting 배포 승인과 마찬가지로 실행 직전 확인받는다)
2. `firebase.json`에 `firestore` 설정(rules 파일 경로) 추가
3. `firebase deploy --only firestore:rules`로 규칙 배포
4. 앱 빌드 후 `firebase deploy --only hosting`로 갱신된 프론트엔드 배포

## 테스트
- `validateNickname`은 순수 함수이므로 Vitest로 단위 테스트 (빈 문자열, 공백만, 21자 이상, 정상 케이스)
- Firestore 읽기/쓰기 자체는 실제 백엔드 없이 의미 있게 단위 테스트하기 어려워, 기존 물리 엔진과 같은 방침으로 **테스트하지 않고 빌드/타입체크로만 검증** — 사용자가 로컬/배포 환경에서 직접 확인
- 카드 UI(로딩/에러/빈 목록 상태)는 수동 확인

## 범위 밖 (Out of scope)
- 실사용자 인증/계정 시스템
- 서버 측 라운드 검증(부정 제출 완전 차단)
- 랭킹 페이지네이션(11등 이하 조회) — 상위 10명만
- 닉네임 중복 방지/예약어 필터링
