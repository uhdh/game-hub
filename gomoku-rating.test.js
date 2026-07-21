const test = require('node:test');
const assert = require('node:assert/strict');
const Rating = require('./gomoku-rating.js');

test('computeExpectedScore is 0.5 when ratings are equal', () => {
  assert.equal(Rating.computeExpectedScore(1500, 1500), 0.5);
});

test('computeExpectedScore is low when the AI is rated far above the player', () => {
  const expected = Rating.computeExpectedScore(1900, 1000);
  assert.ok(expected < 0.01);
});

test('computeNewRating gives a near-full K-factor gain for an upset win against a much stronger AI', () => {
  const next = Rating.computeNewRating(1000, 1, 1900, 32);
  assert.equal(next, 1032);
});

test('computeNewRating barely moves the rating on an expected loss against a much stronger AI', () => {
  const next = Rating.computeNewRating(1000, 0, 1900, 32);
  assert.equal(next, 1000);
});

test('reproduces the 정근우#330 leaderboard investigation numbers (3승 1패 기준 재계산 -> 1096)', () => {
  let rating = 1000;
  const sequence = ['WIN', 'WIN', 'WIN', 'LOSS'];
  for (const r of sequence) {
    rating = Rating.computeNewRating(rating, r === 'WIN' ? 1 : 0, 1900, 32);
  }
  assert.equal(rating, 1096);
});
