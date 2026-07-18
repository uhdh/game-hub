// admin-auction-parse.js
// "물품명, 가치, 메모" 붙여넣기 텍스트를 파싱하는 순수 함수. DOM/네트워크 의존성 없음.
(function (root) {
  'use strict';

  function parseAuctionBulkText(text) {
    var lines = text.split('\n');
    var items = [];
    var failedCount = 0;
    lines.forEach(function (rawLine) {
      var line = rawLine.trim();
      if (!line) return;
      var parts = line.split(',').map(function (s) { return s.trim(); });
      var itemName = parts[0];
      var valueStr = parts[1];
      var memo = parts[2] || null;
      var value = valueStr !== undefined ? Number(valueStr) : NaN;
      if (!itemName || valueStr === undefined || valueStr === '' || !Number.isFinite(value) || !Number.isInteger(value)) {
        failedCount++;
        return;
      }
      items.push({ item_name: itemName, value: value, memo: memo });
    });
    return { items: items, failedCount: failedCount };
  }

  var api = { parseAuctionBulkText: parseAuctionBulkText };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.AdminAuctionParse = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
