(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CardChessOnline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function toEngineCell(visualRow, visualCol, localPlayer) {
    return localPlayer === 'P2'
      ? { col: visualRow, row: 4 - visualCol }
      : { col: 4 - visualRow, row: visualCol };
  }

  function applyAction(state, action, engine) {
    if (!action || action.player !== state.turn) throw new Error('action player does not match turn');
    if (action.type === 'pass') return engine.applyPass(state, action.cardId);
    if (action.type === 'move') return engine.applyMove(state, action.cardId, action.from, action.to);
    throw new Error('unknown online action');
  }

  function checksum(state) {
    const text = JSON.stringify(state);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  return { toEngineCell, applyAction, checksum };
});
