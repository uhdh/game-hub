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
    let poll;
    let connectTimeout;
    let disconnectTimer;
    let closed = false;

    function close() {
      if (closed) return;
      closed = true;
      clearInterval(poll);
      clearTimeout(connectTimeout);
      clearTimeout(disconnectTimer);
      onClose();
    }

    function attachDc(channel) {
      dc = channel;
      dc.addEventListener('open', () => { clearInterval(poll); clearTimeout(connectTimeout); onOpen(dc); });
      dc.addEventListener('message', e => onMessage(JSON.parse(e.data)));
      dc.addEventListener('close', close);
      dc.addEventListener('error', close);
    }

    pc.onicecandidate = e => {
      if (e.candidate) postSignal(roomCode, mySeatNum, 'ice', e.candidate.toJSON()).catch(() => {});
    };

    // dc의 'close'/'error' 이벤트는 정상적인 종료 협상이 있어야만 발생하므로, 상대 탭이 갑자기
    // 닫히거나 크래시하는 경우(작별 신호 없음)를 감지하지 못한다. ICE 연결 상태를 대신 감시한다:
    // 'disconnected'는 일시적일 수 있어 5초 유예를 두고, 'failed'/'closed'는 즉시 종료로 간주한다.
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'failed' || state === 'closed') {
        close();
      } else if (state === 'disconnected') {
        if (!disconnectTimer) {
          disconnectTimer = setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') close();
          }, 5000);
        }
      } else if (disconnectTimer) {
        clearTimeout(disconnectTimer);
        disconnectTimer = null;
      }
    };

    if (role === 'host') {
      attachDc(pc.createDataChannel('game'));
      pc.createOffer()
        .then(offer => pc.setLocalDescription(offer))
        .then(() => postSignal(roomCode, mySeatNum, 'offer', { type: pc.localDescription.type, sdp: pc.localDescription.sdp }))
        .catch(err => { console.error('signal error', err); close(); });
    } else {
      pc.ondatachannel = e => attachDc(e.channel);
    }

    connectTimeout = setTimeout(close, 60000);

    let lastId = 0, handledOffer = false;
    poll = setInterval(async () => {
      let rows;
      try { rows = await fetchSignals(roomCode, peerSeatNum, lastId); } catch (_e) { return; }
      try {
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
      } catch (err) {
        console.error('signal error', err);
        close();
      }
    }, 800);

    return pc;
  }

  return { mulberry32, makeRoomCode, connect, deleteSignals };
});
