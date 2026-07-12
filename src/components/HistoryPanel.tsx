import type { HistoryEntry } from '../game/types';

interface HistoryPanelProps {
  history: HistoryEntry[];
}

export function HistoryPanel({ history }: HistoryPanelProps) {
  return (
    <section className="card history-panel">
      <div className="card__title">최근 결과</div>
      {history.length > 0 ? (
        <div className="history-panel__rows">
          {history.map((h) => (
            <div key={h.id} className={`history-row${h.win ? ' history-row--win' : ' history-row--loss'}`}>
              <span className="history-row__icon">{h.win ? '▲' : '▼'}</span>
              <span className="history-row__label">
                {h.betLabel} → {h.actualLabel}
              </span>
              <span className="history-row__delta">{h.win ? `+${h.payout}` : `-${h.bet}`}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="history-panel__empty">아직 라운드 기록이 없습니다.</div>
      )}
    </section>
  );
}
