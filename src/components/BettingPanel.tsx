import type { ExitMeta, Phase } from '../game/types';

interface BettingPanelProps {
  coins: number;
  selectedExit: ExitMeta | null;
  betAmount: number;
  phase: Phase;
  onIncBet: () => void;
  onDecBet: () => void;
  onPlaceBet: () => void;
}

export function BettingPanel({
  coins,
  selectedExit,
  betAmount,
  phase,
  onIncBet,
  onDecBet,
  onPlaceBet,
}: BettingPanelProps) {
  const betDisabled = phase !== 'setup' || !selectedExit || betAmount < 1 || betAmount > coins || coins < 1;
  const gameOver = coins < 1 && phase === 'setup';
  const betButtonLabel =
    phase === 'running' ? '진행 중...' : phase === 'result' ? '결과 확인 중' : '베팅하고 출발!';
  const potentialWin = selectedExit ? betAmount * selectedExit.odds : 0;

  return (
    <section className="card betting-panel">
      <div className="card__title">베팅</div>
      <div className="betting-panel__selection">
        선택한 출구:{' '}
        {selectedExit ? (
          <b className="betting-panel__selection-value">
            {selectedExit.label} (x{selectedExit.odds})
          </b>
        ) : (
          <span className="betting-panel__hint">판 옆의 출구를 클릭해 선택하세요</span>
        )}
      </div>

      <div className="bet-stepper">
        <span className="bet-stepper__label">베팅 코인</span>
        <div className="bet-stepper__controls">
          <button type="button" onClick={onDecBet} disabled={phase !== 'setup'}>
            −
          </button>
          <span className="bet-stepper__value">{betAmount}</span>
          <button type="button" onClick={onIncBet} disabled={phase !== 'setup'}>
            +
          </button>
        </div>
      </div>

      <div className="betting-panel__potential">
        예상 수익: 적중 시 <b>{potentialWin}</b> 코인
      </div>

      <button type="button" className="bet-cta" disabled={betDisabled} onClick={onPlaceBet}>
        {betButtonLabel}
      </button>

      {gameOver && (
        <div className="betting-panel__gameover">코인이 부족합니다. 상단의 '코인 리필'을 눌러 계속하세요.</div>
      )}
    </section>
  );
}
