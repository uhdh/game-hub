import { EXIT_META } from '../game/constants';

interface StatsPanelProps {
  exitStats: Record<number, number>;
}

export function StatsPanel({ exitStats }: StatsPanelProps) {
  const counts = EXIT_META.map((e) => exitStats[e.id] ?? 0);
  const maxStat = Math.max(1, ...counts);

  return (
    <section className="card stats-panel">
      <div className="card__title">출구별 누적 통계</div>
      <div className="stats-panel__bars">
        {EXIT_META.map((exit) => {
          const count = exitStats[exit.id] ?? 0;
          const pct = Math.round((count / maxStat) * 100);
          return (
            <div key={exit.id} className="stats-bar">
              <span className="stats-bar__label">{exit.label}</span>
              <div className="stats-bar__track">
                <div className="stats-bar__fill" style={{ width: `${pct}%` }} />
              </div>
              <span className="stats-bar__count">{count}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
