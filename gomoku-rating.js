// gomoku-rating.js
// 상/최상 난이도 랭킹의 Elo 레이팅 계산. gomoku-stack.html의 submitRankResult에서
// 쓰던 계산식을 그대로 옮겼다(정근우#330 사례 조사 때 이 계산식을 직접
// 재현해서 검증한 바 있음).
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.GomokuRating = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  "use strict";

  function computeExpectedScore(aiRating, playerRating) {
    return 1 / (1 + Math.pow(10, (aiRating - playerRating) / 400));
  }

  function computeNewRating(currentRating, actual, aiRating, kFactor) {
    const expected = computeExpectedScore(aiRating, currentRating);
    return Math.round(currentRating + kFactor * (actual - expected));
  }

  return { computeExpectedScore, computeNewRating };
});
