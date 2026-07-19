# admin.html 쓰기 보호 (RPC 패턴 전환) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `admin.html`의 탈락자/경매 물품 쓰기를 anon key 직접 REST 호출에서 `SECURITY DEFINER` Postgres RPC 호출로 바꿔서, 비밀번호를 모르는 사람이 REST API를 직접 때려도 쓰기가 막히게 한다.

**Architecture:** Supabase(`paktzmofotvwfdxcpmzv` 프로젝트)에 RLS 정책 5개를 삭제하고 RPC 함수 5개를 새로 만든다(1단계, DB만). 그다음 `admin.html`의 인라인 script에서 `ADMIN_PASSWORD` 하드코딩 상수를 제거하고, 게이트 인증과 4개 쓰기 함수를 전부 RPC 호출로 바꾼다(2단계, 클라이언트만). 두 단계는 순서가 중요하다 — DB가 먼저 준비되어 있어야 클라이언트 RPC 호출이 성공한다.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), 순수 HTML/JS(빌드 도구 없음), Supabase REST/RPC (`/rest/v1/rpc/<fn>`).

## Global Constraints
- 관리자 비밀번호는 기존 값 `dbqlgusejr1234`를 그대로 재사용한다 (spec 확정 사항, 값 변경은 이번 작업 범위 밖).
- 클라이언트 JS 소스 어디에도 비밀번호 문자열을 하드코딩하지 않는다.
- `predict.html`, `blind-auction.html`의 공개 읽기(SELECT)는 절대 건드리지 않는다 — `eliminations_select_anon`, `auction_items_select_anon` 정책은 그대로 둔다.
- Supabase 프로젝트 ID: `paktzmofotvwfdxcpmzv`. anon publishable key: `sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW`. URL: `https://paktzmofotvwfdxcpmzv.supabase.co`.
- 이 저장소(`모자이크퍼즐` 단독 repo)에서만 작업한다. `project/game-hub` 모노레포로의 subtree pull 반영은 이 계획의 범위 밖(별도로 진행).

---

### Task 1: Supabase RLS 정책 정리 + RPC 함수 5개 생성

**Files:**
- 없음 (DB 마이그레이션만, `mcp__claude_ai_Supabase__apply_migration` 도구 사용, `project_id=paktzmofotvwfdxcpmzv`)

**Interfaces:**
- Produces: RPC 엔드포인트 5개 — `POST /rest/v1/rpc/admin_check_password` (`{p_password}` → `boolean`), `POST /rest/v1/rpc/admin_upsert_elimination` (`{p_participant_key, p_week, p_password}` → void), `POST /rest/v1/rpc/admin_restore_elimination` (`{p_participant_key, p_password}` → void), `POST /rest/v1/rpc/admin_insert_auction_items` (`{p_items, p_password}` → auction_items row 배열), `POST /rest/v1/rpc/admin_delete_auction_item` (`{p_id, p_password}` → void). 전부 비밀번호가 틀리면 HTTP 400(Postgres exception)을 반환한다. Task 2가 이 5개를 그대로 호출한다.

- [ ] **Step 1: 마이그레이션 SQL 작성 및 적용**

`mcp__claude_ai_Supabase__apply_migration`을 `project_id="paktzmofotvwfdxcpmzv"`, `name="admin_write_protection"`으로 호출하고 아래 SQL을 그대로 전달한다:

```sql
-- 1. anon에게 무제한 쓰기를 허용하던 정책 삭제 (SELECT 정책은 그대로 둔다)
drop policy if exists eliminations_insert_anon on public.eliminations;
drop policy if exists eliminations_update_anon on public.eliminations;
drop policy if exists eliminations_delete_anon on public.eliminations;
drop policy if exists auction_items_insert_anon on public.auction_items;
drop policy if exists auction_items_delete_anon on public.auction_items;

-- 2. 비밀번호만 검증하는 함수 (게이트 통과 확인용, 부작용 없음)
create or replace function public.admin_check_password(p_password text)
returns boolean
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if p_password is distinct from 'dbqlgusejr1234' then
    raise exception 'invalid password';
  end if;
  return true;
end;
$$;

-- 3. 탈락 처리 (upsert, 기존 REST의 on_conflict=participant_key + merge-duplicates와 동일)
create or replace function public.admin_upsert_elimination(p_participant_key text, p_week int, p_password text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if p_password is distinct from 'dbqlgusejr1234' then
    raise exception 'invalid password';
  end if;

  insert into public.eliminations (participant_key, week)
  values (p_participant_key, p_week)
  on conflict (participant_key) do update set week = excluded.week;
end;
$$;

-- 4. 탈락 복구
create or replace function public.admin_restore_elimination(p_participant_key text, p_password text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if p_password is distinct from 'dbqlgusejr1234' then
    raise exception 'invalid password';
  end if;

  delete from public.eliminations where participant_key = p_participant_key;
end;
$$;

-- 5. 경매 물품 등록 (단건/일괄 공용, jsonb 배열을 받아 insert 후 삽입된 row 반환)
create or replace function public.admin_insert_auction_items(p_items jsonb, p_password text)
returns setof public.auction_items
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if p_password is distinct from 'dbqlgusejr1234' then
    raise exception 'invalid password';
  end if;

  return query
  insert into public.auction_items (item_name, value, memo)
  select
    (item->>'item_name')::text,
    (item->>'value')::int,
    item->>'memo'
  from jsonb_array_elements(p_items) as item
  returning *;
end;
$$;

-- 6. 경매 물품 삭제
create or replace function public.admin_delete_auction_item(p_id bigint, p_password text)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  if p_password is distinct from 'dbqlgusejr1234' then
    raise exception 'invalid password';
  end if;

  delete from public.auction_items where id = p_id;
end;
$$;
```

Postgres는 새로 만든 함수의 `EXECUTE` 권한을 기본적으로 `PUBLIC`(anon 포함)에 부여하므로 별도 `grant execute`는 필요 없다 — 기존 `submit_admin_reply` 함수도 이 기본 동작으로 anon 호출이 가능했다(2단계에서 확인 예정).

- [ ] **Step 2: RLS가 실제로 막는지 curl로 확인 (직접 테이블 쓰기 차단)**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/eliminations" \
  -H "apikey: sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Authorization: Bearer sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Content-Type: application/json" \
  -d '{"participant_key":"HACK-test","week":1}'
```
Expected: `401` (RLS violation, 이전에는 `201`이었을 것)

- [ ] **Step 3: RPC가 올바른 비밀번호로 동작하는지 curl로 확인**

Run:
```bash
curl -s -X POST "https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/rpc/admin_check_password" \
  -H "apikey: sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Authorization: Bearer sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Content-Type: application/json" \
  -d '{"p_password":"dbqlgusejr1234"}'
```
Expected: `true` (200)

- [ ] **Step 4: RPC가 틀린 비밀번호를 거부하는지 curl로 확인**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/rpc/admin_check_password" \
  -H "apikey: sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Authorization: Bearer sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Content-Type: application/json" \
  -d '{"p_password":"wrong"}'
```
Expected: `400`

- [ ] **Step 5: 나머지 4개 RPC를 curl로 왕복 테스트 (등록 → 확인 → 정리)**

Run (탈락 처리 → 복구):
```bash
curl -s -X POST "https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/rpc/admin_upsert_elimination" \
  -H "apikey: sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Authorization: Bearer sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Content-Type: application/json" \
  -d '{"p_participant_key":"__TEST__","p_week":99,"p_password":"dbqlgusejr1234"}'

curl -s "https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/eliminations?participant_key=eq.__TEST__" \
  -H "apikey: sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Authorization: Bearer sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW"

curl -s -X POST "https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/rpc/admin_restore_elimination" \
  -H "apikey: sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Authorization: Bearer sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Content-Type: application/json" \
  -d '{"p_participant_key":"__TEST__","p_password":"dbqlgusejr1234"}'
```
Expected: 첫 번째 curl은 `204`(또는 빈 200), 두 번째 curl은 `[{"participant_key":"__TEST__","week":99,...}]`, 세 번째 curl 이후 다시 조회하면 빈 배열 `[]`.

Run (경매 물품 등록 → 삭제, `id` 값은 등록 응답에서 받은 값으로 교체):
```bash
curl -s -X POST "https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/rpc/admin_insert_auction_items" \
  -H "apikey: sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Authorization: Bearer sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Content-Type: application/json" \
  -d '{"p_items":[{"item_name":"__TEST_ITEM__","value":1,"memo":null}],"p_password":"dbqlgusejr1234"}'
```
Expected: 등록된 row(JSON 배열, `item_name":"__TEST_ITEM__"` 포함)가 응답으로 옴 — 응답의 `id` 값을 기록해둔다.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST "https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/rpc/admin_delete_auction_item" \
  -H "apikey: sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Authorization: Bearer sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW" \
  -H "Content-Type: application/json" \
  -d '{"p_id":<위에서 받은 id>,"p_password":"dbqlgusejr1234"}'
```
Expected: `204`

- [ ] **Step 6: 보안 어드바이저 재확인**

`mcp__claude_ai_Supabase__get_advisors`를 `project_id="paktzmofotvwfdxcpmzv"`, `type="security"`로 호출.
Expected: `eliminations`/`auction_items`에 대한 `rls_policy_always_true` 경고가 더 이상 나오지 않음 (다른 테이블의 경고는 이번 작업 범위 밖이라 그대로 남아있어도 됨).

---

### Task 2: admin.html 클라이언트를 RPC 호출로 전환

**Files:**
- Modify: `admin.html:246-465` (인라인 `<script>` 블록)

**Interfaces:**
- Consumes: Task 1에서 만든 5개 RPC 엔드포인트 (`admin_check_password`, `admin_upsert_elimination`, `admin_restore_elimination`, `admin_insert_auction_items`, `admin_delete_auction_item`) — 위 시그니처 그대로.

- [ ] **Step 1: 상수 정리 — `ADMIN_PASSWORD` 하드코딩 삭제, 비밀번호 저장용 변수로 교체**

`admin.html`에서 다음을 찾는다:
```js
  const SUPABASE_URL = "https://paktzmofotvwfdxcpmzv.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW";
  const ELIMINATIONS_TABLE = "eliminations";
  const ADMIN_PASSWORD = "dbqlgusejr1234";
  const ADMIN_SESSION_KEY = "bloodGameXAdminOk";
```
아래로 교체:
```js
  const SUPABASE_URL = "https://paktzmofotvwfdxcpmzv.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW";
  const ELIMINATIONS_TABLE = "eliminations";
  const ADMIN_PW_KEY = "bloodGameXAdminPw";
  let ADMIN_PW = "";
```

- [ ] **Step 2: 게이트 인증을 RPC 기반으로 교체**

다음을 찾는다:
```js
  function unlock() {
    document.getElementById("gate").style.display = "none";
    document.getElementById("app").classList.add("show");
    initApp();
  }

  if (sessionStorage.getItem(ADMIN_SESSION_KEY) === "1") {
    unlock();
  }

  document.getElementById("gate-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = document.getElementById("gate-input").value;
    if (val === ADMIN_PASSWORD) {
      sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
      unlock();
    } else {
      document.getElementById("gate-error").textContent = "비밀번호가 올바르지 않습니다.";
    }
  });
```
아래로 교체:
```js
  function unlock() {
    document.getElementById("gate").style.display = "none";
    document.getElementById("app").classList.add("show");
    initApp();
  }

  async function checkPassword(pw) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_check_password`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_password: pw }),
    });
    return res.ok;
  }

  const storedPw = sessionStorage.getItem(ADMIN_PW_KEY);
  if (storedPw) {
    ADMIN_PW = storedPw;
    unlock();
  }

  document.getElementById("gate-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = document.getElementById("gate-input").value;
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    const ok = await checkPassword(val);
    submitBtn.disabled = false;
    if (ok) {
      ADMIN_PW = val;
      sessionStorage.setItem(ADMIN_PW_KEY, val);
      unlock();
    } else {
      document.getElementById("gate-error").textContent = "비밀번호가 올바르지 않습니다.";
    }
  });
```

- [ ] **Step 3: `eliminate`/`restore` 함수를 RPC 호출로 교체**

다음을 찾는다:
```js
  async function eliminate(key, week) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${ELIMINATIONS_TABLE}?on_conflict=participant_key`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({ participant_key: key, week }),
      }
    );
    if (!res.ok) throw new Error("탈락 처리 실패");
  }

  async function restore(key) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${ELIMINATIONS_TABLE}?participant_key=eq.${encodeURIComponent(key)}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    if (!res.ok) throw new Error("복구 실패");
  }
```
아래로 교체:
```js
  async function eliminate(key, week) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_upsert_elimination`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_participant_key: key, p_week: week, p_password: ADMIN_PW }),
    });
    if (!res.ok) throw new Error("탈락 처리 실패");
  }

  async function restore(key) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_restore_elimination`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_participant_key: key, p_password: ADMIN_PW }),
    });
    if (!res.ok) throw new Error("복구 실패");
  }
```
(`ELIMINATIONS_TABLE` 상수는 `fetchEliminations()`의 조회 쿼리에서 계속 쓰이므로 그대로 둔다.)

- [ ] **Step 4: `insertAuctionItems`/`deleteAuctionItem` 함수를 RPC 호출로 교체**

다음을 찾는다:
```js
  async function insertAuctionItems(items) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${AUCTION_TABLE}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(items),
    });
    if (!res.ok) throw new Error("경매 물품 등록 실패");
    return res.json();
  }

  async function deleteAuctionItem(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${AUCTION_TABLE}?id=eq.${id}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) throw new Error("삭제 실패");
  }
```
아래로 교체:
```js
  async function insertAuctionItems(items) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_insert_auction_items`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_items: items, p_password: ADMIN_PW }),
    });
    if (!res.ok) throw new Error("경매 물품 등록 실패");
    return res.json();
  }

  async function deleteAuctionItem(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_delete_auction_item`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_id: id, p_password: ADMIN_PW }),
    });
    if (!res.ok) throw new Error("삭제 실패");
  }
```
(`AUCTION_TABLE` 상수는 `fetchAuctionItems()`의 조회 쿼리에서 계속 쓰이므로 그대로 둔다.)

- [ ] **Step 5: 기존 자동 테스트가 안 깨졌는지 확인**

Run: `node --test *.test.js`
Expected: `admin.html`은 인라인 스크립트라 이 테스트들의 대상이 아니므로 영향 없음 — 기존과 동일하게 `pass 24, fail 0`.

- [ ] **Step 6: 브라우저 수동 검증**

로컬에서 정적 서버로 `admin.html`을 열고(예: `python -m http.server` 또는 VS Code Live Server), 아래를 순서대로 확인한다:
1. 틀린 비밀번호 입력 → "비밀번호가 올바르지 않습니다." 에러 표시, 화면 안 열림.
2. 올바른 비밀번호(`dbqlgusejr1234`) 입력 → 화면 열림.
3. "탈락자 관리" 탭: 아무 참가자 "탈락 처리" 클릭 → 상태 배너에 성공 메시지, 목록에 취소선/주차 표시 → "복구" 클릭 → 원상복구.
4. "경매 물품 관리" 탭: 단건 등록 → 목록에 반영 → 방금 등록한 항목 "삭제" → 목록에서 사라짐.
5. 새로고침 후에도(같은 세션 안에서는) 비밀번호 재입력 없이 바로 화면이 열리는지 확인(세션 유지 확인).
6. 브라우저 개발자도구 콘솔에서 아래를 실행해 직접 쓰기가 막히는지 확인:
   ```js
   fetch("https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/eliminations", {
     method: "POST",
     headers: {
       apikey: "sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW",
       Authorization: "Bearer sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW",
       "Content-Type": "application/json",
     },
     body: JSON.stringify({ participant_key: "HACK-console", week: 1 }),
   }).then(r => console.log(r.status));
   ```
   Expected: `401` 로그.

- [ ] **Step 7: 커밋**

```bash
git add admin.html
git commit -m "$(cat <<'EOF'
fix: admin.html 쓰기를 anon key 직접 REST 대신 비밀번호 검증 RPC로 전환

eliminations/auction_items 테이블에 anon 쓰기를 전부 허용하던 RLS 정책 때문에
관리자 비밀번호를 몰라도 REST API를 직접 호출하면 탈락자/경매 물품을 조작할
수 있었다. requests.html의 submit_admin_reply와 동일한 패턴으로 비밀번호
검증을 SECURITY DEFINER 함수 안으로 옮기고(admin_check_password 외 4개),
클라이언트에서는 ADMIN_PASSWORD 하드코딩 상수를 완전히 제거했다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review 결과
- **스펙 커버리지**: 스펙의 4개 섹션(DB 마이그레이션, 클라이언트 변경, 영향 범위, 검증 방법) 모두 Task 1~2에 대응하는 단계가 있음. 영향 범위 확인은 브레인스토밍 단계에서 이미 grep으로 검증 완료(설계 문서에 기록됨), 별도 태스크 불필요.
- **플레이스홀더 스캔**: "TBD"/"나중에" 등 없음. curl 명령의 `<위에서 받은 id>` 하나는 실행 시점에 실제 값으로 채워야 하는 자리표시자이지만, 이는 "이전 단계 응답 값을 그대로 대입"하라는 명확한 지시라 코드 스텁 누락과는 다름.
- **타입/시그니처 일관성**: RPC 파라미터명(`p_participant_key`, `p_week`, `p_password`, `p_items`, `p_id`)이 Task 1 SQL과 Task 2 JS `body: JSON.stringify(...)` 전체에서 동일하게 사용됨. `ADMIN_PW` 변수명도 Step 1~4에서 일관됨.
