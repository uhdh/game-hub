# 링 더 벨 온라인 2:2 P2P 대전 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `ring-the-bell.html`에 "나 + 내 AI 팀원 : 상대 + 상대 AI 팀원" 형태의 온라인 2:2 대전 모드를 추가한다. 게임 데이터는 WebRTC DataChannel로 완전히 P2P로 오가고, 연결 수립용 시그널링만 Supabase REST 테이블(폴링 방식)을 우편함으로 쓴다.

**Architecture:** 두 클라이언트가 동일한 시드로 동일한 계산을 독립 수행하는 대칭 시뮬레이션. 기존 핵심 게임 IIFE의 좌석 하드코딩(`players[0]`/`turn!==0`)을 `mySeat`/`remoteHumanSeat` 변수로 일반화하고, `window.RingBellCore` 브릿지(4개 함수)를 통해 좌석 지정·시드 주입·체크섬 조회·원격 행동 재현을 외부 스크립트에서 다룬다. 사람 턴만 네트워크로 전송하고 AI 턴은 결정론적이므로 양쪽이 각자 계산한다.

**Tech Stack:** 순수 HTML/CSS/JS(빌드 도구 없음), WebRTC(`RTCPeerConnection`/`RTCDataChannel`, STUN만 사용), Supabase REST API(anon key, raw `fetch`, SDK 미사용 — 기존 파일들과 동일 패턴), Node.js 내장 테스트 러너(`node:test`, 순수 로직 유닛 테스트 전용).

## Global Constraints

- Supabase 접근은 supabase-js SDK 없이 anon publishable key로 raw `fetch`만 사용 (기존 파일 전체와 동일 패턴).
- Supabase 프로젝트: `paktzmofotvwfdxcpmzv` (`https://paktzmofotvwfdxcpmzv.supabase.co`), anon key `sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW`.
- TURN 서버는 이번 범위에서 제외 — 공용 STUN(`stun:stun.l.google.com:19302`)만 사용.
- 기존 1인용(AI 3명) 모드는 동작·회귀 없이 그대로 유지해야 한다. URL에 `?room=` 파라미터가 없으면 지금과 100% 동일하게 즉시 자동 시작.
- 재연결/이어하기 로직은 만들지 않는다. 연결 끊김 시 안내만 하고 종료.
- 참고 설계 문서: `docs/superpowers/specs/2026-08-07-ring-the-bell-p2p-online-design.md`.

---

## Task 1: Supabase 시그널링 테이블 생성 (`ring_the_bell_signals`)

**Files:** 없음 (Supabase 인프라 변경, MCP 도구로 직접 적용)

**Interfaces:**
- Produces: REST 엔드포인트 `https://paktzmofotvwfdxcpmzv.supabase.co/rest/v1/ring_the_bell_signals` (컬럼: `id, room_code, sender_seat, msg_type, payload, created_at`). Task 4가 이 테이블에 `apikey`/`Authorization` 헤더로 anon 접근해 offer/answer/ICE candidate를 주고받는다.

- [ ] **Step 1: 마이그레이션 적용**

`mcp__claude_ai_Supabase__apply_migration` 도구를 다음 인자로 호출한다.

```
project_id: "paktzmofotvwfdxcpmzv"
name: "create_ring_the_bell_signals_table"
query:
```
```sql
create table public.ring_the_bell_signals (
  id bigint generated always as identity primary key,
  room_code text not null,
  sender_seat smallint not null,
  msg_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.ring_the_bell_signals enable row level security;

create policy "ring_the_bell_signals_select_anon" on public.ring_the_bell_signals
  for select to anon using (true);

create policy "ring_the_bell_signals_insert_anon" on public.ring_the_bell_signals
  for insert to anon with check (true);

create policy "ring_the_bell_signals_delete_anon" on public.ring_the_bell_signals
  for delete to anon using (true);

create index ring_the_bell_signals_room_idx on public.ring_the_bell_signals (room_code, sender_seat, id);
```

- [ ] **Step 2: 테이블 생성 확인**

`mcp__claude_ai_Supabase__list_tables`를 `project_id: "paktzmofotvwfdxcpmzv"`, `schemas: ["public"]`, `verbose: true`로 호출.
Expected: `public.ring_the_bell_signals`가 `rls_enabled: true`, 컬럼 `id, room_code, sender_seat, msg_type, payload, created_at`으로 나타남.

- [ ] **Step 3: anon 권한 insert/select/delete 동작 확인**

`mcp__claude_ai_Supabase__execute_sql`로 실행:

```sql
insert into public.ring_the_bell_signals (room_code, sender_seat, msg_type, payload)
values ('TEST01', 0, 'offer', '{"type":"offer","sdp":"test"}'::jsonb) returning id;
```

반환된 `id`를 메모하고, 조회 후 삭제까지 확인:

```sql
select count(*) from public.ring_the_bell_signals where room_code = 'TEST01';
delete from public.ring_the_bell_signals where room_code = 'TEST01';
select count(*) from public.ring_the_bell_signals where room_code = 'TEST01';
```

Expected: insert 성공, 첫 count가 1, delete 후 count가 0. 검증용 행이므로 반드시 삭제까지 완료한다.

---

## Task 2: 순수 P2P 유틸 모듈 (`ring-the-bell-p2p.js`)

**Files:**
- Create: `ring-the-bell-p2p.js`
- Test: `ring-the-bell-p2p.test.js`

**Interfaces:**
- Consumes: 없음 (순수 함수, DOM/네트워크 의존성 없음)
- Produces: 브라우저에서는 전역 `window.RingBellP2P`, Node에서는 `module.exports`로 다음을 노출 (`gomoku-rating.js`와 동일한 UMD 패턴):
  - `mulberry32(seed: number): () => number` — 시드 기반 결정론적 PRNG. 반환된 함수는 호출할 때마다 `[0,1)` 범위의 숫자를 낸다.
  - `makeRoomCode(): string` — 6자리 대문자 영숫자 방 코드.

- [ ] **Step 1: 실패하는 테스트 작성**

`ring-the-bell-p2p.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const P2P = require('./ring-the-bell-p2p.js');

test('mulberry32 is deterministic for the same seed', () => {
  const a = P2P.mulberry32(42);
  const b = P2P.mulberry32(42);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('mulberry32 produces different sequences for different seeds', () => {
  const a = P2P.mulberry32(1)();
  const b = P2P.mulberry32(2)();
  assert.notEqual(a, b);
});

test('mulberry32 output stays within [0, 1)', () => {
  const rand = P2P.mulberry32(7);
  for (let i = 0; i < 200; i++) {
    const v = rand();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('makeRoomCode returns a 6-character uppercase alphanumeric code', () => {
  const code = P2P.makeRoomCode();
  assert.match(code, /^[A-Z0-9]{6}$/);
});

test('makeRoomCode is not constant across calls', () => {
  const codes = new Set(Array.from({ length: 20 }, () => P2P.makeRoomCode()));
  assert.ok(codes.size > 1, 'expected at least some variation across 20 calls');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node ring-the-bell-p2p.test.js`
Expected: `Cannot find module './ring-the-bell-p2p.js'` 에러로 FAIL.

- [ ] **Step 3: 최소 구현 작성**

`ring-the-bell-p2p.js`:

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RingBellP2P = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  "use strict";

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  return { mulberry32, makeRoomCode };
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node ring-the-bell-p2p.test.js`
Expected: `ℹ pass 5`, `ℹ fail 0`.

- [ ] **Step 5: 커밋**

```bash
git add ring-the-bell-p2p.js ring-the-bell-p2p.test.js
git commit -m "feat: 링더벨 P2P용 결정론적 PRNG/방코드 유틸 모듈 추가"
```

---

## Task 3: 핵심 게임 스크립트 좌석/턴/셔플 일반화 + 브릿지 노출

**Files:**
- Modify: `ring-the-bell.html:33-37` (핵심 게임 IIFE 전체 교체)

**Interfaces:**
- Consumes: 없음 (이 태스크만으로는 온라인 기능이 동작하지 않음 — 솔로 모드는 지금과 동일하게 동작해야 함)
- Produces: 전역 `window.RingBellCore`:
  - `start(seat: 0|1, remoteSeat: -1|0|1, randFn?: () => number): void` — 좌석을 지정하고 `startSet()`을 실행해 게임을 시작한다. `randFn`을 넘기면 이후 셔플에 그 함수를 쓴다.
  - `getTurn(): number` — 현재 턴의 좌석 인덱스(0~3).
  - `getMySeat(): number` — 현재 클라이언트의 좌석 인덱스.
  - `getChecksum(): string` — 전체 손패/덱/버림더미 상태를 요약한 문자열 (양쪽 클라이언트 비교용).
  - `replicateAction(kind: 'draw-back'|'draw-front'|'discard'|'bell'|'four', idx?: number): void` — 원격 플레이어의 행동을 로컬 상태에 재현한다. `discard`일 때만 `idx`(현재 턴 플레이어 손패에서의 카드 인덱스) 필요.

이 태스크는 **`ring-the-bell.html`의 33번째 줄부터 37번째 줄까지(핵심 게임 IIFE 전체)를 통째로 아래 코드로 교체**한다. 기존 코드는 한 줄로 압축된 미니파이 스타일이었지만, 이후 유지보수를 위해 가독성 있게 줄바꿈해서 작성한다 — 38번째 줄 이후의 후속 패치 스크립트들은 DOM만 참조하므로 전혀 손대지 않는다.

- [ ] **Step 1: 교체 전 원본 백업 확인**

`git diff --stat ring-the-bell.html`으로 현재 커밋 상태가 깨끗한지 확인한다(이 태스크 이전 변경사항이 남아있지 않아야 안전하게 되돌릴 수 있음). 깨끗하지 않다면 먼저 커밋하거나 사용자에게 확인한다.

- [ ] **Step 2: 33~37번째 줄을 아래 코드로 교체**

`ring-the-bell.html`에서 현재 33번째 줄(`(()=>{const COLORS=...`로 시작)부터 37번째 줄(`$('discardBtn').onclick=discardSelected;...startSet();...`로 끝나는 줄)까지를 정확히 찾아 아래 블록으로 전체 교체한다. (`Edit` 도구로 34~37번째 줄의 정확한 원문 전체를 `old_string`으로 지정해 `new_string`으로 교체 — 원문이 매우 길고 특수문자가 많으므로, 파일을 먼저 `Read`로 열어 정확한 문자열을 복사해 온 뒤 교체할 것. 아래는 교체될 **최종 내용**이다.)

```js
(() => {
const COLORS = [['빨강','red','◆'],['파랑','blue','●'],['초록','green','▲'],['보라','purple','■']];
const players = [
  {name:'나',team:0,human:true,lives:3,hand:[]},
  {name:'카이',team:1,lives:3,hand:[]},
  {name:'루나',team:0,lives:3,hand:[]},
  {name:'미나',team:1,lives:3,hand:[]}
];
let deck=[],discard=[],turn=0,round=1,setNo=1,phase='playing',bellPlayer=null,bellFinalState=null,
    signalFlags=new Set(),signalLocked=false,teamStats={0:{wins:0,losses:0},1:{wins:0,losses:0}},
    leaderboardName=localStorage.getItem('ringTheBellNickname')||'나',selected=[],hasDrawn=false,logLines=[];
let mySeat=0,remoteHumanSeat=-1,rand=Math.random;
const isHumanControlled=t=>t===mySeat||t===remoteHumanSeat;

const missing={disabled:false,style:{},classList:{toggle(){},add(){},remove(){}},click(){}};
const $=id=>document.getElementById(id)||missing;

function cardHtml(c,idx,back=false){
  if(back)return '<div class="card back"></div>';
  const col=COLORS[c.color];
  return `<div class="card ${col[1]}${selected.includes(idx)?' selected':''}" data-idx="${idx}"><span class="mark">${col[2]}</span><span class="num">${c.num}</span></div>`;
}
function makeDeck(){
  deck=[];
  COLORS.forEach((_,color)=>{for(let num=1;num<=10;num++)deck.push({color,num})});
  for(let i=deck.length-1;i>0;i--){
    const j=Math.floor(rand()*(i+1));
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }
}
function draw(){return deck.pop()}
function setMessage(msg){logLines.unshift(msg);logLines=logLines.slice(0,4);$('log').innerHTML=logLines.join('<br>')}
function bestCombo(hand){
  let best={cards:[],score:0};
  for(let mask=1;mask<(1<<hand.length);mask++){
    const cs=hand.filter((_,i)=>mask>>i&1);
    if(cs.length>1&&!((cs.every(c=>c.num===cs[0].num))||(cs.every(c=>c.color===cs[0].color))))continue;
    const score=cs.reduce((s,c)=>s+c.num,0);
    if(score>best.score||(score===best.score&&cs.length>best.cards.length))best={cards:cs,score};
  }
  return best;
}
function fourOf(hand){return hand.length===4&&hand.every(c=>c.num===hand[0].num)}

function lockSignalRule(){
  if(signalLocked)return;
  signalLocked=true;
  const input=document.getElementById('signalThreshold');
  if(input)input.disabled=true;
}

function render(){
  const you=players[mySeat],enemy=players.filter(p=>p.team!==you.team),
    threshold=Math.max(1,Math.min(40,Number(document.getElementById('signalThreshold')?.value)||15));
  players.filter(p=>p.team===you.team).forEach(p=>{
    if(p.hand.length!==4)return;
    const score=bestCombo(p.hand).score;
    if(score>=threshold&&!signalFlags.has(p.name)){
      signalFlags.add(p.name);
      setMessage(`${p===you?'내가':p.name+'님이'} 👋 수신호를 보냈습니다.`);
    }
  });
  const signalState=document.getElementById('signalState');
  if(signalState)signalState.innerHTML=signalFlags.has(you.name)?'<span class="signal-my">👋</span>':'';
  $('scoreboard').innerHTML=`<div class="team you"><div class="team-name"><span>팀 A · 내 팀</span><span>${players.filter(p=>p.team===you.team).map(p=>p.name).join(' · ')}</span></div><div class="life">${'<i></i>'.repeat(you.lives)}${'<i class="off"></i>'.repeat(3-you.lives)}</div></div><div class="versus">ROUND ${round}<br><span class="progress">${setNo} / 9 세트</span></div><div class="team enemy"><div class="team-name"><span>팀 B</span><span>${enemy.map(p=>p.name).join(' · ')}</span></div><div class="life">${'<i></i>'.repeat(enemy[0].lives)}${'<i class="off"></i>'.repeat(3-enemy[0].lives)}</div></div>`;
  $('status').firstChild.textContent=phase==='playing'?`${players[turn].name}의 턴`:phase==='showing'?'조합 공개 중…':'라운드 종료';
  $('substatus').textContent=phase==='playing'?(turn===mySeat?'카드를 가져온 뒤 버리세요.':isHumanControlled(turn)?'상대가 생각하는 중…':'AI가 생각하는 중…'):'';
  $('progress').textContent=`ROUND ${round} · ${setNo}세트`;
  $('opponents').innerHTML=players.map((p,i)=>({p,i})).filter(o=>o.i!==mySeat).map(({p,i})=>`<div class="player-card ${turn===i?'active':''}"><div class="player-head"><span>${p.name} ${p.team===you.team?'· 내 팀':''}${signalFlags.has(p.name)?'<b class="signal-badge">👋</b>':''}</span><span class="mini-lives">${'♥'.repeat(p.lives)}<span class="off">${'♥'.repeat(3-p.lives)}</span></span></div><div style="display:flex;gap:4px;margin-top:11px">${p.hand.map(()=>cardHtml(null,0,true)).join('')}</div></div>`).join('');
  $('hand').innerHTML=you.hand.map((c,i)=>cardHtml(c,i)).join('');
  document.querySelectorAll('#hand .card').forEach(el=>el.onclick=()=>{
    if(phase!=='playing'||turn!==mySeat||!hasDrawn)return;
    const i=+el.dataset.idx;
    const c=players[mySeat].hand.splice(i,1)[0];
    discard.push(c);
    selected=[];
    hasDrawn=false;
    setMessage(`내가 ${COLORS[c.color][0]} ${c.num}를 버렸습니다.`);
    if(fourOf(players[mySeat].hand)){
      setMessage('내가 포카드를 완성해 즉시 종을 쳤습니다! 상대 팀 모두 라이프 1개를 잃습니다.');
      showdown(mySeat,true);
      return;
    }
    nextTurn();
  });
  $('discard').innerHTML=discard.length?cardHtml(discard[discard.length-1],0):'<span style="color:#aaa">—</span>';
  $('deckCount').textContent=`(${deck.length})`;
  $('bell').disabled=phase!=='playing'||turn!==mySeat||hasDrawn||!!bellFinalState;
  $('bell').classList.toggle('ready',!$('bell').disabled);
  $('drawBack').disabled=phase!=='playing'||turn!==mySeat||hasDrawn||!deck.length;
  $('drawFront').disabled=phase!=='playing'||turn!==mySeat||hasDrawn||!discard.length;
  $('discardBtn').disabled=phase!=='playing'||turn!==mySeat||!hasDrawn||selected.length!==1;
  $('fourBtn').disabled=phase!=='playing'||turn!==mySeat||!hasDrawn||!fourOf(you.hand);
}

function startSet(){
  makeDeck();
  discard=[draw()];
  players.forEach(p=>p.hand=[draw(),draw(),draw(),draw()]);
  turn=0;
  bellPlayer=null;
  bellFinalState=null;
  signalFlags=new Set();
  selected=[];
  hasDrawn=false;
  phase='playing';
  setMessage(`${round}라운드 ${setNo}세트 시작. ${turn===mySeat?'내가':players[turn].name+'님이'} 먼저입니다.`);
  render();
}

function take(source){
  if(phase!=='playing'||!isHumanControlled(turn)||hasDrawn)return;
  const c=source==='front'?discard.pop():draw();
  if(!c)return;
  lockSignalRule();
  players[turn].hand.push(c);
  hasDrawn=true;
  setMessage(`${source==='front'?'앞면':'뒷면'} 카드 ${c.num}${COLORS[c.color][2]}를 가져왔습니다.`);
  render();
}

function discardSelected(){
  if(!hasDrawn||selected.length!==1)return;
  const c=players[0].hand.splice(selected[0],1)[0];
  discard.push(c);
  selected=[];
  hasDrawn=false;
  setMessage(`내가 ${c.num}${COLORS[c.color][2]}를 버렸습니다.`);
  if(fourOf(players[0].hand)){
    setMessage(`내가 포카드를 완성해 즉시 종을 쳤습니다! 상대 팀 모두 라이프 1개를 잃습니다.`);
    showdown(0,true);
    return;
  }
  nextTurn();
}

function aiTurn(p){
  if(!deck.length){showdown(turn);return}
  if(fourOf(p.hand)||bestCombo(p.hand).score>=24){showAiBell(turn);return}
  const evaluate=(hand,pick)=>{
    const source=pick?[...hand,pick]:hand.slice();
    let best={score:-1,remove:0};
    for(let i=0;i<source.length;i++){
      const candidate=source.slice();
      candidate.splice(i,1);
      const score=bestCombo(candidate).score;
      if(score>best.score||(score===best.score&&source[i].num<source[best.remove].num))best={score,remove:i};
    }
    return best;
  };
  const front=discard[discard.length-1],frontMove=front?evaluate(p.hand,front):{score:-1},allCards=[];
  COLORS.forEach((_,color)=>{for(let num=1;num<=10;num++)allCards.push({color,num})});
  const known=new Set([...p.hand,...discard].map(c=>`${c.color}-${c.num}`)),
    backCandidates=allCards.filter(c=>!known.has(`${c.color}-${c.num}`)),
    backScores=backCandidates.map(c=>evaluate(p.hand,c).score),
    backExpected=backScores.length?backScores.reduce((a,b)=>a+b,0)/backScores.length:-1,
    useFront=!!front&&frontMove.score>=backExpected,
    picked=useFront?discard.pop():draw();
  if(!picked)return;
  p.hand.push(picked);
  const move=evaluate(p.hand),removed=p.hand.splice(move.remove,1)[0];
  discard.push(removed);
  const pickedText=useFront?`앞면 카드 ${COLORS[picked.color][0]} ${picked.num}`:'뒷면 더미 카드';
  setMessage(`${p.name}님이 ${pickedText}를 가져간 후, ${COLORS[removed.color][0]} ${removed.num}을 버렸습니다.`);
  if(fourOf(p.hand)){
    setMessage(`${p.name}님이 포카드를 완성해 즉시 종을 쳤습니다! 상대 팀 모두 라이프 1개를 잃습니다.`);
    showdown(turn,true);
    return;
  }
  nextTurn();
}

function nextTurn(){
  if(bellFinalState&&phase==='playing'&&isHumanControlled(turn)){
    phase='showing';
    render();
    advanceBellFinal();
    return;
  }
  if(phase!=='playing')return;
  if(!deck.length){showdown(turn);return}
  turn=(turn+1)%4;
  if(isHumanControlled(turn)){
    hasDrawn=false;
    selected=[];
    render();
  }else{
    render();
    setTimeout(()=>aiTurn(players[turn]),400);
  }
}

function showBell(){
  if(phase!=='playing'||!isHumanControlled(turn)||hasDrawn||bellFinalState)return;
  lockSignalRule();
  setMessage(`${turn===mySeat?'내가':players[turn].name+'님이'} 종을 쳤습니다! 다른 플레이어가 마지막 교환을 진행합니다.`);
  phase='showing';
  bellFinalState={who:turn,order:[1,2,3].map(off=>(turn+off)%4),index:0};
  render();
  advanceBellFinal();
}

function showAiBell(who){
  bellPlayer=who;
  phase='showing';
  setMessage(`${players[who].name}님이 종을 쳤습니다! 마지막 교환 후 조합을 공개합니다.`);
  render();
  $('modalBox').innerHTML=`<h2>🔔 ${players[who].name}님이 종을 쳤습니다!</h2><p>나머지 3명의 마지막 교환을 진행합니다.</p>`;
  $('modal').classList.add('show');
  const order=[1,2,3].map(offset=>(who+offset)%4);
  bellFinalState={who,order,index:0};
  setTimeout(()=>{$('modal').classList.remove('show');advanceBellFinal()},1400);
}

function advanceBellFinal(){
  if(!bellFinalState)return;
  if(bellFinalState.index>=bellFinalState.order.length){
    const who=bellFinalState.who;
    bellFinalState=null;
    showdown(who);
    return;
  }
  const idx=bellFinalState.order[bellFinalState.index++];
  if(isHumanControlled(idx)){
    phase='playing';
    turn=idx;
    hasDrawn=false;
    selected=[];
    setMessage(idx===mySeat?'종이 울렸습니다. 마지막 카드 교환을 진행하세요.':`종이 울렸습니다. ${players[idx].name}님의 마지막 교환을 기다립니다.`);
    render();
    return;
  }
  aiTurnForBell(players[idx]);
  setTimeout(advanceBellFinal,350);
}

function aiTurnForBell(p,isHuman=false){
  const c=deck.length&&draw();
  if(c)p.hand.push(c);
  const keep=bestCombo(p.hand),
    remove=p.hand.map((x,i)=>({i,v:keep.cards.includes(x)?99:x.num})).sort((a,b)=>a.v-b.v)[0].i,
    removed=p.hand.splice(remove,1)[0];
  discard.push(removed);
  const discardEl=$('discard');
  discardEl.classList.remove('ai-card-motion','ai-discard-flash');
  void discardEl.offsetWidth;
  discardEl.classList.add('ai-card-motion','ai-discard-flash');
  setMessage(`${isHuman?'내가':`${p.name}님이`} 뒷면 더미 카드를 가져간 후, ${COLORS[removed.color][0]} ${removed.num}을 버렸습니다.`);
}

function showdown(who,declared=false){
  if(phase==='done')return;
  phase='showing';
  bellPlayer=who;
  const rows=players.map(p=>({p,combo:bestCombo(p.hand)})),
    min=Math.min(...rows.map(r=>r.combo.score)),
    losers=rows.filter(r=>r.combo.score===min);
  if(declared)players.filter(p=>p.team!==players[who].team).forEach(p=>p.lives=Math.max(0,p.lives-1));
  else{
    losers.forEach(r=>r.p.lives=Math.max(0,r.p.lives-1));
    if(losers.some(r=>r.p===players[who]))players[who].lives=Math.max(0,players[who].lives-1);
  }
  render();
  const details=rows.map(r=>`<div class="result-row"><span>${r.p.name} ${r.p===players[who]?'🔔':''}</span><span>${r.combo.cards.map(c=>c.num+COLORS[c.color][2]).join(' ')} · ${r.combo.score}점</span><span style="color:#e0786f;letter-spacing:1px;white-space:nowrap">${'♥'.repeat(r.p.lives)}${'♡'.repeat(3-r.p.lives)}</span></div>`).join('');
  const note=declared?'상대 팀 모두 라이프 1개를 잃습니다.':losers.length?`${losers.map(r=>r.p.name).join(', ')}이(가) 최저점입니다.${losers.some(r=>r.p===players[who])?' 종을 친 플레이어의 추가 라이프 손실!':''}`:'모두 무사히 넘어갔습니다.';
  $('modalBox').innerHTML=`<h2>${declared?'포카드 선언!':'세트 결과'}</h2><p>${note}</p><div class="result-list">${details}</div><button class="action" id="continueBtn">다음 세트</button>`;
  $('modal').classList.add('show');
  $('continueBtn').onclick=advance;
}

function advance(){
  $('modal').classList.remove('show');
  const a=players.filter(p=>p.team===0).some(p=>p.lives===0),
    b=players.filter(p=>p.team===1).some(p=>p.lives===0);
  if(a||b){roundEnd(a?1:0);return}
  if(setNo>=9){roundEnd(0);return}
  setNo++;
  startSet();
}

function roundEnd(winner){
  teamStats[winner].wins++;
  teamStats[1-winner].losses++;
  phase='done';
  render();
  $('modalBox').innerHTML=`<h2>${round}라운드 종료</h2><p class="winner">${winner===players[mySeat].team?'팀 A · 내 팀':'팀 B'} 승리!</p><p>${round<3?'다음 라운드는 라이프 3개로 다시 시작합니다.':'3라운드가 모두 끝났습니다.'}</p><button class="action" id="roundBtn">${round<3?'다음 라운드':'새 게임'}</button>`;
  $('modal').classList.add('show');
  $('roundBtn').onclick=()=>{
    $('modal').classList.remove('show');
    if(round<3){round++;setNo=1}else{round=1;setNo=1;teamStats={0:{wins:0,losses:0},1:{wins:0,losses:0}}}
    players.forEach(p=>p.lives=3);
    startSet();
  };
}

$('discardBtn').onclick=discardSelected;
$('bell').onclick=showBell;
$('fourBtn').onclick=()=>showdown(turn,true);
$('deck').onclick=()=>take('back');
$('discard').onclick=()=>take('front');
$('rulesBtn').onclick=()=>{
  $('modalBox').innerHTML='<h2>링 더 벨 규칙</h2><ul><li>4가지 색, 1~10 숫자 카드로 4인 2팀 게임을 진행합니다.</li><li>내 턴에는 카드 한 장을 가져오고 한 장을 버립니다.</li><li>2장 이상 조합은 같은 숫자 또는 같은 색이어야 하며, 합이 높을수록 좋습니다.</li><li>종을 치면 나머지 플레이어가 한 번씩 교환한 뒤 공개합니다.</li><li>같은 숫자 4장이 모이면 포카드 선언으로 상대 팀 모두에게 라이프 1개를 입힙니다.</li></ul><button class="action" id="closeRules">게임으로 돌아가기</button>';
  $('modal').classList.add('show');
  $('closeRules').onclick=()=>$('modal').classList.remove('show');
};
const nicknameInput=document.getElementById('leaderboardNickname');
if(nicknameInput){
  nicknameInput.value=leaderboardName;
  document.getElementById('leaderboardRegister').onclick=()=>{
    const value=nicknameInput.value.trim();
    if(value){leaderboardName=value;localStorage.setItem('ringTheBellNickname',value);render()}
  };
}

const roomParam=new URLSearchParams(location.search).get('room');
if(!roomParam)startSet();
document.getElementById('signalThreshold')?.addEventListener('input',()=>{
  if(!signalLocked){signalFlags=new Set();render()}
});

window.RingBellCore={
  start(seat,remoteSeat,randFn){
    mySeat=seat;
    remoteHumanSeat=typeof remoteSeat==='number'?remoteSeat:-1;
    if(randFn)rand=randFn;
    startSet();
  },
  getTurn(){return turn},
  getMySeat(){return mySeat},
  getChecksum(){
    return players.map(p=>p.hand.map(c=>c.color+':'+c.num).sort().join(',')).join('|')+'#'+deck.length+'#'+discard.length;
  },
  replicateAction(kind,idx){
    if(kind==='draw-back')return take('back');
    if(kind==='draw-front')return take('front');
    if(kind==='discard'){
      const c=players[turn].hand.splice(idx,1)[0];
      discard.push(c);
      selected=[];
      hasDrawn=false;
      setMessage(`${players[turn].name}님이 ${c.num}${COLORS[c.color][2]}를 버렸습니다.`);
      if(fourOf(players[turn].hand)){
        setMessage(`${players[turn].name}님이 포카드를 완성해 즉시 종을 쳤습니다! 상대 팀 모두 라이프 1개를 잃습니다.`);
        showdown(turn,true);
        return;
      }
      nextTurn();
      return;
    }
    if(kind==='bell')return showBell();
    if(kind==='four')return showdown(turn,true);
  }
};
})();
```

**이 교체에서 바뀐 지점 요약 (검증 시 참고):**
- `mySeat`/`remoteHumanSeat`/`rand`/`isHumanControlled()` 신규 도입.
- `makeDeck()`: `sort(()=>Math.random()-.5)` → Fisher-Yates(`rand` 사용) — 셔플 결정론 버그 수정.
- `render()`: `you=players[0]`→`players[mySeat]`, `enemy` 계산을 팀 비교 기반으로 일반화, `opponents` 렌더링에서 실제 인덱스 보존, 각 `disabled`/가드에서 `turn!==0`→`turn!==mySeat`.
- 손패 카드 클릭 핸들러(내 턴 전용, 그대로 `mySeat` 기준)와 `take()`/`showBell()`(양쪽 사람 좌석 모두 허용하도록 `isHumanControlled` 기준)를 구분.
- `nextTurn()`/`advanceBellFinal()`: 원격 사람 좌석일 때 `aiTurn()`을 자동 호출하지 않고 대기하도록 수정 — **이게 이번 작업의 핵심 버그 수정**.
- `showBell()`을 `showAiBell()`과 동일하게 `bellFinalState`+`advanceBellFinal()` 경로로 통일(기존엔 사람이 직접 종을 칠 때만 별도의 병렬 `setTimeout` 로직을 썼는데, 그 로직은 3자리 전부 AI라고 가정하고 있어 원격 사람 좌석을 만나면 깨짐).
- `roundEnd()`의 승리 팀 표시를 `winner===0` 하드코딩에서 `winner===players[mySeat].team` 비교로 수정 — 텍스트 `'팀 A'`는 그대로 유지(파일 뒤쪽의 리더보드 기록 스크립트가 이 문자열을 그대로 파싱하므로 문자열 자체는 바꾸면 안 됨).
- `discardSelected()`는 손대지 않음 — 기존에도 `.actions`가 숨겨져 있어 도달 불가능한 죽은 코드이므로 그대로 둔다.
- 맨 끝에 `window.RingBellCore` 브릿지 4개 함수 노출.

- [ ] **Step 3: 솔로 모드 회귀 확인 (수동, 로컬 서버)**

```bash
cd "C:\Users\maktu\Desktop\project\모자이크퍼즐" && python -m http.server 8791
```

브라우저(Chrome 자동화 도구 사용 가능)로 `http://localhost:8791/ring-the-bell.html`을 연다(파라미터 없이). 다음을 확인:
1. 페이지 로드 즉시 게임이 시작된다(예전과 동일 — `?room=` 없으니 `startSet()`이 즉시 실행됨).
2. 내 턴에 뒷면/앞면 카드를 가져오고 손패 카드를 클릭해 버릴 수 있다.
3. AI 3명(카이·루나·미나)이 자동으로 턴을 진행한다.
4. 종 치기 버튼을 눌러 세트를 마무리할 수 있고, "세트 결과" 모달이 정상 표시된다.
5. 개발자 콘솔에 에러가 없다.

Expected: 기존 플레이 경험과 100% 동일하게 동작(회귀 없음). 문제가 있으면 Step 2의 교체 코드를 다시 검토한다.

- [ ] **Step 4: 콘솔에서 브릿지 노출 확인**

브라우저 개발자 콘솔에서:

```js
typeof window.RingBellCore.start === 'function' &&
typeof window.RingBellCore.getTurn === 'function' &&
typeof window.RingBellCore.getMySeat === 'function' &&
typeof window.RingBellCore.getChecksum === 'function' &&
typeof window.RingBellCore.replicateAction === 'function'
```

Expected: `true`. 그리고 `window.RingBellCore.getMySeat()`이 `0`을 반환.

- [ ] **Step 5: 커밋**

```bash
git add ring-the-bell.html
git commit -m "feat: 링더벨 핵심 로직에 좌석 일반화 및 P2P 브릿지 추가 (솔로 모드 회귀 없음)"
```

---

## Task 4: WebRTC 연결 + 온라인 대전 UI 오케스트레이션

**Files:**
- Modify: `ring-the-bell.html` (body 끝, `</body>` 직전에 새 `<script>` 2개 추가)

**Interfaces:**
- Consumes: Task 2의 `window.RingBellP2P.{mulberry32, makeRoomCode}`, Task 3의 `window.RingBellCore.{start, getTurn, getMySeat, getChecksum, replicateAction}`, Task 1의 `ring_the_bell_signals` 테이블.
- Produces: `window.RingBellP2P.connect(role, roomCode, callbacks)` 함수 추가(연결 오케스트레이션), 화면상 "친구와 온라인 대전" 버튼 및 연결 상태 UI.

- [ ] **Step 1: `ring-the-bell-p2p.js`에 `connect()` 함수 추가**

`ring-the-bell-p2p.js`의 `factory` 함수 안, `return { mulberry32, makeRoomCode };` 윗줄에 추가:

```js
  const SUPABASE_URL = 'https://paktzmofotvwfdxcpmzv.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_jWbstEn2pKJTNDxLTR4Jig_asglvzGW';
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  function signalHeaders(extra) {
    return Object.assign({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, extra || {});
  }

  async function postSignal(roomCode, senderSeat, msgType, payload) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/ring_the_bell_signals`, {
      method: 'POST',
      headers: signalHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify({ room_code: roomCode, sender_seat: senderSeat, msg_type: msgType, payload }),
    });
    if (!res.ok) throw new Error(`signal post ${res.status}`);
  }

  async function fetchSignals(roomCode, fromSeat, afterId) {
    const url = `${SUPABASE_URL}/rest/v1/ring_the_bell_signals?select=id,msg_type,payload&room_code=eq.${encodeURIComponent(roomCode)}&sender_seat=eq.${fromSeat}&id=gt.${afterId}&order=id.asc`;
    const res = await fetch(url, { headers: signalHeaders() });
    if (!res.ok) throw new Error(`signal fetch ${res.status}`);
    return res.json();
  }

  function deleteSignals(roomCode) {
    return fetch(`${SUPABASE_URL}/rest/v1/ring_the_bell_signals?room_code=eq.${encodeURIComponent(roomCode)}`, {
      method: 'DELETE',
      headers: signalHeaders(),
    }).catch(() => {});
  }

  function connect(role, roomCode, { onOpen, onMessage, onClose }) {
    const mySeatNum = role === 'host' ? 0 : 1;
    const peerSeatNum = 1 - mySeatNum;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const pendingIce = [];
    let remoteSet = false;
    let dc = null;

    function attachDc(channel) {
      dc = channel;
      dc.addEventListener('open', () => { clearInterval(poll); onOpen(dc); });
      dc.addEventListener('message', e => onMessage(JSON.parse(e.data)));
      dc.addEventListener('close', onClose);
      dc.addEventListener('error', onClose);
    }

    pc.onicecandidate = e => {
      if (e.candidate) postSignal(roomCode, mySeatNum, 'ice', e.candidate.toJSON());
    };

    if (role === 'host') {
      attachDc(pc.createDataChannel('game'));
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => postSignal(roomCode, mySeatNum, 'offer', { type: pc.localDescription.type, sdp: pc.localDescription.sdp }));
    } else {
      pc.ondatachannel = e => attachDc(e.channel);
    }

    let lastId = 0, handledOffer = false;
    const poll = setInterval(async () => {
      let rows;
      try { rows = await fetchSignals(roomCode, peerSeatNum, lastId); } catch (_e) { return; }
      for (const row of rows) {
        lastId = row.id;
        if (row.msg_type === 'offer' && role === 'guest' && !handledOffer) {
          handledOffer = true;
          await pc.setRemoteDescription(row.payload);
          remoteSet = true;
          for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await postSignal(roomCode, mySeatNum, 'answer', { type: answer.type, sdp: answer.sdp });
        } else if (row.msg_type === 'answer' && role === 'host' && !remoteSet) {
          await pc.setRemoteDescription(row.payload);
          remoteSet = true;
          for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c).catch(() => {});
        } else if (row.msg_type === 'ice') {
          if (remoteSet) await pc.addIceCandidate(row.payload).catch(() => {});
          else pendingIce.push(row.payload);
        }
      }
    }, 800);

    return pc;
  }
```

그리고 `return { mulberry32, makeRoomCode };`를 다음으로 교체:

```js
  return { mulberry32, makeRoomCode, connect, deleteSignals };
```

- [ ] **Step 2: 기존 P2P 유틸 테스트가 여전히 통과하는지 확인**

Run: `node ring-the-bell-p2p.test.js`
Expected: `ℹ pass 5`, `ℹ fail 0` (Step 1은 브라우저 전용 API(`fetch`, `RTCPeerConnection`)를 쓰는 함수만 추가했으므로 Node 환경에서도 모듈 로드 자체는 에러 없이 되어야 하고 기존 순수 함수 테스트는 영향받지 않는다).

- [ ] **Step 3: `ring-the-bell.html`에 스크립트 로드 및 온라인 UI 오케스트레이션 추가**

`ring-the-bell.html`의 `</body>` 바로 앞(파일 맨 끝, 176번째 줄 부근)에 다음을 추가한다:

```html
<script src="ring-the-bell-p2p.js"></script>
<script>
(() => {
  const roomParam = new URLSearchParams(location.search).get('room');

  const onlineBtn = document.createElement('button');
  onlineBtn.className = 'rules-btn';
  onlineBtn.textContent = '친구와 온라인 대전';
  onlineBtn.style.marginLeft = '8px';
  document.getElementById('rulesBtn').insertAdjacentElement('afterend', onlineBtn);

  const statusBar = document.createElement('div');
  statusBar.id = 'onlineStatus';
  statusBar.style.cssText = 'font-size:11px;color:#8992a0;margin:-8px 0 10px';
  document.querySelector('.hero').insertAdjacentElement('afterend', statusBar);

  let sendAction = null;
  let mySeatRole = null;
  let myChecksum = null;
  let pendingRemoteChecksum = null;

  function attachOutgoingListeners() {
    const send = payload => { if (sendAction) sendAction({ type: 'action', ...payload }); };
    const isMyTurn = () => window.RingBellCore.getTurn() === window.RingBellCore.getMySeat();
    document.getElementById('deck').addEventListener('click', () => { if (isMyTurn()) send({ kind: 'draw-back' }); });
    document.getElementById('discard').addEventListener('click', () => { if (isMyTurn()) send({ kind: 'draw-front' }); });
    document.getElementById('hand').addEventListener('click', e => {
      const card = e.target.closest('.card');
      if (!card || card.dataset.idx === undefined) return;
      if (isMyTurn()) send({ kind: 'discard', idx: Number(card.dataset.idx) });
    });
    document.getElementById('bell').addEventListener('click', () => { if (isMyTurn()) send({ kind: 'bell' }); });
    document.getElementById('fourBtn').addEventListener('click', () => { if (isMyTurn()) send({ kind: 'four' }); });
  }

  function compareChecksums() {
    if (myChecksum === null || pendingRemoteChecksum === null) return;
    if (myChecksum !== pendingRemoteChecksum) {
      statusBar.textContent = '⚠️ 동기화 오류가 발생했습니다. 게임을 다시 시작해주세요.';
    }
    myChecksum = null;
    pendingRemoteChecksum = null;
  }

  function watchForChecksum() {
    const modalBox = document.getElementById('modalBox');
    let lastText = '';
    new MutationObserver(() => {
      const text = modalBox.textContent || '';
      if (text === lastText) return;
      if (!text.includes('세트 결과') && !text.includes('포카드 선언')) return;
      lastText = text;
      myChecksum = window.RingBellCore.getChecksum();
      sendAction({ type: 'checksum', value: myChecksum });
      compareChecksums();
    }).observe(modalBox, { childList: true, subtree: true, characterData: true });
  }

  function handleIncoming(msg) {
    if (msg.type === 'init') {
      const seatNum = mySeatRole === 'host' ? 0 : 1;
      const remoteNum = 1 - seatNum;
      window.RingBellCore.start(seatNum, remoteNum, window.RingBellP2P.mulberry32(msg.seed));
      const thresholdInput = document.getElementById('signalThreshold');
      if (thresholdInput) thresholdInput.value = msg.threshold;
      attachOutgoingListeners();
      watchForChecksum();
      return;
    }
    if (msg.type === 'action') {
      window.RingBellCore.replicateAction(msg.kind, msg.idx);
      return;
    }
    if (msg.type === 'checksum') {
      pendingRemoteChecksum = msg.value;
      compareChecksums();
    }
  }

  function startOnline(role, roomCode) {
    mySeatRole = role;
    statusBar.textContent = role === 'host' ? '상대 접속을 기다리는 중…' : '접속 중…';
    window.RingBellP2P.connect(role, roomCode, {
      onOpen: channel => {
        sendAction = obj => channel.send(JSON.stringify(obj));
        statusBar.textContent = '연결됨';
        document.getElementById('modal').classList.remove('show');
        window.RingBellP2P.deleteSignals(roomCode);
        if (role === 'host') {
          const seed = Math.floor(Math.random() * 2 ** 31);
          const threshold = document.getElementById('signalThreshold')?.value || 15;
          const seatNum = 0, remoteNum = 1;
          sendAction({ type: 'init', seed, threshold });
          window.RingBellCore.start(seatNum, remoteNum, window.RingBellP2P.mulberry32(seed));
          attachOutgoingListeners();
          watchForChecksum();
        }
      },
      onMessage: handleIncoming,
      onClose: () => {
        statusBar.textContent = '상대와의 연결이 끊어졌습니다.';
        document.getElementById('modalBox').innerHTML = '<h2>연결 끊김</h2><p>상대와의 연결이 끊어졌습니다.</p><a class="action" href="./index.html" style="display:block;text-align:center;text-decoration:none">홈으로</a>';
        document.getElementById('modal').classList.add('show');
      },
    });
  }

  onlineBtn.addEventListener('click', () => {
    document.getElementById('modalBox').innerHTML = `
      <h2>친구와 온라인 대전</h2>
      <p style="font-size:12px;color:#8992a0">나 + 내 AI 팀원, 친구 + 친구 AI 팀원이 2:2로 맞붙습니다.</p>
      <button class="action" id="onlineCreateBtn">방 만들기</button>
      <button class="action secondary" id="onlineCloseBtn" style="margin-top:8px">닫기</button>
    `;
    document.getElementById('modal').classList.add('show');
    document.getElementById('onlineCreateBtn').onclick = () => {
      const code = window.RingBellP2P.makeRoomCode();
      const link = `${location.origin}${location.pathname}?room=${code}`;
      document.getElementById('modalBox').innerHTML = `
        <h2>초대 링크</h2>
        <input type="text" id="onlineLinkInput" value="${link}" readonly style="width:100%;padding:8px;border-radius:8px;border:1px solid #3b4853;background:#1c2024;color:#eef3f4">
        <button class="action" id="onlineCopyBtn" style="margin-top:10px">링크 복사</button>
        <p style="margin-top:14px;font-size:12px;color:#8992a0">이 링크를 친구에게 보내면 자동으로 참가합니다.</p>
      `;
      document.getElementById('onlineCopyBtn').onclick = () => navigator.clipboard.writeText(link);
      startOnline('host', code);
    };
    document.getElementById('onlineCloseBtn').onclick = () => document.getElementById('modal').classList.remove('show');
  });

  if (roomParam) {
    document.getElementById('modalBox').innerHTML = '<h2>온라인 대전 접속 중…</h2><p style="font-size:12px;color:#8992a0">호스트에게 연결하는 중입니다.</p>';
    document.getElementById('modal').classList.add('show');
    startOnline('guest', roomParam);
  }
})();
</script>
```

- [ ] **Step 4: 파일 문법 확인**

```bash
node --check ring-the-bell-p2p.js
```

Expected: 에러 없음(0 exit code). HTML 안의 인라인 스크립트는 `node --check`로 직접 검증할 수 없으므로, 브라우저에서 Step 5로 실제 로드해 콘솔 에러 여부로 확인한다.

- [ ] **Step 5: 솔로 모드 회귀 재확인**

Task 3의 Step 3과 동일하게 `http://localhost:8791/ring-the-bell.html`(파라미터 없이)을 열어, 새 스크립트 추가로 인한 콘솔 에러나 레이아웃 깨짐이 없는지 확인한다. "친구와 온라인 대전" 버튼이 "게임 규칙" 버튼 옆에 나타나야 한다(클릭하지 않아도 됨 — 온라인 플레이 자체는 Task 5에서 검증).

- [ ] **Step 6: 커밋**

```bash
git add ring-the-bell.html ring-the-bell-p2p.js
git commit -m "feat: 링더벨 온라인 2:2 대전 UI/WebRTC 시그널링 오케스트레이션 추가"
```

---

## Task 5: 엔드투엔드 수동 검증 (두 브라우저 탭)

**Files:** 없음 (검증 전용, 코드 변경 없음)

**Interfaces:** 없음

- [ ] **Step 1: 로컬 서버 기동**

```bash
cd "C:\Users\maktu\Desktop\project\모자이크퍼즐" && python -m http.server 8791
```

- [ ] **Step 2: 방 생성 (탭 A)**

Chrome 자동화 도구로 새 탭을 열어 `http://localhost:8791/ring-the-bell.html` 접속 → "친구와 온라인 대전" 클릭 → "방 만들기" 클릭 → 표시된 초대 링크(`?room=XXXXXX` 형태)를 읽어 기록한다.

Expected: "상대 접속을 기다리는 중…" 상태 문구가 보인다.

- [ ] **Step 3: 참가 (탭 B)**

두 번째 탭을 열어 Step 2에서 기록한 링크로 접속한다.

Expected: 몇 초 안에 두 탭 모두 "연결됨" 상태로 바뀌고, 게임이 시작되어 손패 4장씩 표시된다. 탭 A의 손패와 탭 B의 손패가 서로 다른 카드로 보여야 한다(각자 자기 좌석 기준으로 렌더링됨).

- [ ] **Step 4: 턴 진행 확인**

탭 A(호스트, `나` 좌석)가 먼저 턴이므로 뒷면/앞면 카드를 가져오고 손패 카드를 클릭해 버린다. 이어서 AI 2명(루나·미나)의 턴이 양쪽 탭에서 각각 자동으로 진행되는지 확인한 뒤, 탭 B(게스트, `카이` 좌석 대체)의 턴 차례에 탭 B에서 카드를 가져오고 버린다.

Expected: 탭 A에서 조작한 내용이 탭 B 화면에도(상대 카드 뒷면 개수 등으로) 반영되고, 탭 B에서 조작한 내용이 탭 A에도 반영된다. 로그 메시지가 양쪽에서 일관되게 늘어난다.

- [ ] **Step 5: 세트 종료까지 진행 후 체크섬 확인**

한 세트가 끝날 때까지(종 치기 또는 덱 소진) 진행한다. "세트 결과" 모달이 양쪽 탭에 동시에 뜨는지, 결과 목록(손패/점수/라이프)이 양쪽에서 동일하게 보이는지 확인한다.

Expected: 양쪽 모두 상태 표시줄에 "⚠️ 동기화 오류" 문구가 **뜨지 않아야** 한다(체크섬 일치). 만약 뜬다면 Task 3의 좌석/턴 일반화 로직에 아직 놓친 하드코딩이 있다는 뜻이므로 `nextTurn()`/`advanceBellFinal()`/`showBell()` 주변을 다시 점검한다.

- [ ] **Step 6: 연결 끊김 처리 확인**

탭 B를 닫는다.

Expected: 탭 A에 "상대와의 연결이 끊어졌습니다" 모달이 뜨고 "홈으로" 링크가 동작한다.

- [ ] **Step 7: Supabase 신호 테이블 정리 확인**

`mcp__claude_ai_Supabase__execute_sql`로 확인:

```sql
select count(*) from public.ring_the_bell_signals;
```

Expected: 연결이 정상적으로 열렸던 방의 신호 행은 `deleteSignals()` 호출로 삭제되어 0이거나, 탭 B를 강제로 닫아 정리 호출이 못 갔던 방의 행 몇 개만 남아있는 수준(수십~수백 개씩 누적되지 않음). 남은 행이 있다면 수동으로 정리한다:

```sql
delete from public.ring_the_bell_signals;
```

- [ ] **Step 8: 로컬 서버 종료 및 열린 탭 정리**

Chrome 자동화로 연 탭들을 닫고, 로컬 서버 프로세스를 종료한다.

---

## 이번 계획에서 다루지 않는 것 (스펙과 동일)

- TURN 서버, 랜덤 매칭/로비, 재연결/이어하기, 관전 모드, 게임 중 채팅.
