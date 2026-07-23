alter table public.blind_auction_leaderboard
  add column if not exists auction_total numeric;

comment on column public.blind_auction_leaderboard.auction_total is
  '실제 경매에 출품된 11개 물품의 가치 합계';
