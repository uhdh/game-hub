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

  return { mulberry32, makeRoomCode, connect, deleteSignals };
});
