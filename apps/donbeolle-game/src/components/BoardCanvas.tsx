import { useRef } from 'react';
import { usePhysicsEngine } from '../game/usePhysicsEngine';
import { ResultModal } from './ResultModal';
import type { ExitMeta, LastResult, Phase } from '../game/types';

interface BoardCanvasProps {
  phase: Phase;
  onEscape: (exit: ExitMeta) => void;
  lastResult: LastResult | null;
  pendingBet: number;
  onNextRound: () => void;
}

export function BoardCanvas({ phase, onEscape, lastResult, pendingBet, onNextRound }: BoardCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  usePhysicsEngine({ containerRef, phase, onEscape });

  return (
    <div className="board-stage">
      <div ref={containerRef} className="board-canvas" />
      {phase === 'running' && <div className="running-pill">벌레 이동 중...</div>}
      <ResultModal visible={phase === 'result'} result={lastResult} pendingBet={pendingBet} onNext={onNextRound} />
    </div>
  );
}
