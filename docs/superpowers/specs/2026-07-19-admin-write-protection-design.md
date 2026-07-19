# admin.html 쓰기 보호 (Admin Write Protection) — 설계 문서

## 배경 / 문제
`admin.html`(탈락자 관리 + 경매 물품 관리)의 관리자 인증은 클라이언트 JS에 평문으로 하드코딩된 비밀번호(`ADMIN_PASSWORD`)를 비교하는 방식뿐이었다. 실제 쓰기(`eliminations`, `auction_items` 테이블에 대한 INSERT/UPDATE/DELETE)는 사이트 전체가 공유하는 공개 anon key로 이루어지고, 두 테이블 모두 RLS 정책이 anon에게 INSERT/UPDATE/DELETE를 무조건 허용(`USING (true)` / `WITH CHECK (true)`)하고 있었다. 즉 비밀번호 게이트를 무시하고 브라우저 콘솔이나 curl로 Supabase REST API를 직접 호출하면 누구나 탈락자 목록과 경매 물품을 조작할 수 있는 상태였다.

같은 프로젝트의 요청 게시판(`requests.html`) 관리자 답변 기능은 이미 이 문제를 올바르게 처리하고 있다: 비밀번호를 클라이언트에 저장하지 않고, `SECURITY DEFINER` Postgres 함수(`submit_admin_reply`) 안에서 비밀번호를 검증한 뒤 함수 내부에서만 테이블을 갱신한다. 이번 작업은 이 기존 패턴을 `eliminations`/`auction_items`에도 동일하게 적용한다.

## 목표
- 비밀번호를 모르는 사람이 REST API를 직접 호출해 `eliminations`/`auction_items`를 쓰기(추가/수정/삭제)할 수 없도록 막는다.
- 비밀번호 문자열을 `admin.html`의 클라이언트 JS 소스에 더 이상 하드코딩하지 않는다.
- `predict.html`, `blind-auction.html`의 공개 읽기(SELECT) 동작은 그대로 유지한다.
- 새로운 배포 인프라(Edge Function 등) 없이, 기존 RPC 패턴만으로 해결한다.

## 비목표
- 실제 Supabase Auth 로그인 도입 (범위 밖 — 별도 결정 필요시 재검토)
- 비밀번호 해싱/솔팅 (기존 `submit_admin_reply`도 평문 비교이며, 이번 작업은 그 패턴과의 일관성을 우선함)
- 비밀번호 값 자체의 변경 (기존 `dbqlgusejr1234` 그대로 재사용, 사용자 확인됨)

## 설계

### 1. DB 마이그레이션

**RLS 정책 변경**
- `eliminations`: `eliminations_insert_anon`, `eliminations_update_anon`, `eliminations_delete_anon` 정책 삭제. `eliminations_select_anon`(공개 읽기)은 유지.
- `auction_items`: `auction_items_insert_anon`, `auction_items_delete_anon` 정책 삭제. `auction_items_select_anon`(공개 읽기)은 유지.

**신규 RPC 함수** (전부 `SECURITY DEFINER`, `SET search_path = 'public'`, `p_password`가 리터럴 `'dbqlgusejr1234'`와 다르면 예외 발생, `anon` role에 `EXECUTE` 권한 부여 — `submit_admin_reply`와 동일한 형태):

| 함수 | 인자 | 동작 |
|---|---|---|
| `admin_check_password` | `p_password text` | 비밀번호만 검증하고 `true` 반환, 부작용 없음. 게이트 통과 확인용. |
| `admin_upsert_elimination` | `p_participant_key text, p_week int, p_password text` | `eliminations`에 `on conflict (participant_key) do update` upsert. 기존 `eliminate()`의 REST 호출과 동일한 효과. |
| `admin_restore_elimination` | `p_participant_key text, p_password text` | `eliminations`에서 해당 row `delete`. |
| `admin_insert_auction_items` | `p_items jsonb, p_password text` | `p_items`(배열, 각 원소 `{item_name, value, memo}`)를 `auction_items`에 insert하고 삽입된 row들을 반환. 단건 등록도 1개짜리 배열로 이 함수를 재사용. |
| `admin_delete_auction_item` | `p_id bigint, p_password text` | `auction_items`에서 해당 row `delete`. |

### 2. `admin.html` 클라이언트 변경

- `const ADMIN_PASSWORD = "dbqlgusejr1234";` 상수 **삭제**.
- 게이트 제출(`gate-form` submit) 핸들러: 입력값으로 `POST /rest/v1/rpc/admin_check_password` 호출.
  - 성공(200): 입력값을 세션 상태로 저장(`sessionStorage`에 `bloodGameXAdminPw` 키로 저장 + 모듈 스코프 변수)하고 `unlock()` 호출.
  - 실패(400, "invalid password" 예외): 기존과 동일하게 `#gate-error`에 에러 문구 표시.
- 페이지 로드 시 자동 잠금해제: `sessionStorage`에 저장된 비밀번호가 있으면 그 값을 신뢰하고 바로 `unlock()` (재검증 RPC 호출 없이 — 실제 쓰기 시점에 어차피 검증되므로 왕복 절약).
- `eliminate(key, week)`, `restore(key)`, `insertAuctionItems(items)`, `deleteAuctionItem(id)` 4개 함수: 테이블에 직접 POST/DELETE하던 것을 각각 대응하는 RPC(`admin_upsert_elimination`, `admin_restore_elimination`, `admin_insert_auction_items`, `admin_delete_auction_item`) 호출로 교체하고, 저장해둔 비밀번호를 매 호출 `p_password`로 전달.
- `fetchEliminations()`, `fetchAuctionItems()` (조회 전용): 변경 없음.

### 3. 영향 범위 확인
- `predict.html` (`eliminations` SELECT만) — 무영향.
- `blind-auction.html` (`auction_items` SELECT만) — 무영향.
- `admin-auction-parse.test.js`, `blind-auction-logic.test.js` — admin.html의 인라인 스크립트는 별도 모듈이 아니라 테스트 대상 밖. 무영향, 그대로 통과.

### 4. 검증 방법
- 자동 테스트 없음(admin.html 로직이 인라인 script라 기존 node:test 대상 밖). 수동 검증:
  1. `admin.html`에서 정상 비밀번호로 탈락 처리 → 복구 → 경매 물품 단건 등록 → 일괄 등록 → 삭제가 모두 정상 동작하는지 확인.
  2. 틀린 비밀번호 입력 시 게이트 통과 실패 확인.
  3. 브라우저 콘솔에서 anon key로 `eliminations`/`auction_items`에 직접 POST/PATCH/DELETE 시도 → RLS에 의해 차단(403/permission denied)되는지 확인.
  4. Supabase 쪽에서 `get_advisors(type: security)` 재실행 → 해당 테이블의 `rls_policy_always_true` 경고가 사라졌는지 확인.
