import type { LastResult } from '../game/types';

interface ResultModalProps {
  visible: boolean;
  result: LastResult | null;
  pendingBet: number;
  onNext: () => void;
}

export function ResultModal({ visible, result, pendingBet, onNext }: ResultModalProps) {
  if (!visible || !result) return null;

  const title = result.win ? '적중!' : '탈락';
  const titleColor = result.win ? '#5fb8b0' : '#c96a63';
  const payoutLabel = result.win ? `+${result.payout}` : `-${pendingBet}`;

  return (
    <div className="result-overlay">
      <div className="result-card">
        <h2 style={{ color: titleColor }}>{title}</h2>
        <div className="result-exit">
          벌레가 <b>{result.exitLabel}</b>(으)로 탈출
        </div>
        <div className="result-payout" style={{ color: titleColor }}>
          {payoutLabel}
        </div>
        <button type="button" className="result-next-btn" onClick={onNext}>
          다음 라운드
        </button>
      </div>
    </div>
  );
}
