import type { Phase } from '../game/types';

interface HeaderProps {
  phase: Phase;
  coins: number;
  onRefill: () => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  setup: '베팅 대기',
  running: '진행 중',
  result: '결과',
};

export function Header({ phase, coins, onRefill }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__titles">
        <span className="app-header__title">바퀴벌레 도박판</span>
        <span className="app-header__subtitle">출구를 골라 베팅하고, 벌레를 출발시키세요</span>
      </div>
      <div className="app-header__controls">
        <a href="https://game-hub-three-neon.vercel.app/" className="home-btn">
          홈으로
        </a>
        <span className="phase-pill">{PHASE_LABEL[phase]}</span>
        <div className="coin-pill">
          <span className="coin-pill__label">코인</span>
          <span className="coin-pill__value">{coins}</span>
        </div>
        <button type="button" className="refill-btn" onClick={onRefill}>
          코인 리필
        </button>
      </div>
    </header>
  );
}
