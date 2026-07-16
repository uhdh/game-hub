import { useGameState } from './game/useGameState';
import { EXIT_META, STARTING_COINS } from './game/constants';
import { Header } from './components/Header';
import { ExitColumn } from './components/ExitColumn';
import { BoardCanvas } from './components/BoardCanvas';
import { BettingPanel } from './components/BettingPanel';
import { StatsPanel } from './components/StatsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import type { ExitMeta } from './game/types';

const LEFT_EXITS = EXIT_META.filter((e) => e.side === 'left');
const RIGHT_EXITS = EXIT_META.filter((e) => e.side === 'right');

function App() {
  const [state, dispatch] = useGameState();
  const selectedExit = EXIT_META.find((e) => e.id === state.selectedExitId) ?? null;

  const handleEscape = (exit: ExitMeta) => {
    dispatch({ type: 'RESOLVE_ROUND', exit });
  };

  return (
    <div className="app-shell">
      <Header
        phase={state.phase}
        coins={state.coins}
        onRefill={() => dispatch({ type: 'REFILL_COINS', amount: STARTING_COINS })}
      />

      <div className="app-body">
        <div className="board-row">
          <ExitColumn
            exits={LEFT_EXITS}
            selectedExitId={state.selectedExitId}
            phase={state.phase}
            onSelect={(id) => dispatch({ type: 'SELECT_EXIT', id })}
          />
          <BoardCanvas
            phase={state.phase}
            onEscape={handleEscape}
            lastResult={state.lastResult}
            pendingBet={state.pendingBet}
            onNextRound={() => dispatch({ type: 'NEXT_ROUND' })}
          />
          <ExitColumn
            exits={RIGHT_EXITS}
            selectedExitId={state.selectedExitId}
            phase={state.phase}
            onSelect={(id) => dispatch({ type: 'SELECT_EXIT', id })}
          />
        </div>

        <div className="side-panel">
          <BettingPanel
            coins={state.coins}
            selectedExit={selectedExit}
            betAmount={state.betAmount}
            phase={state.phase}
            onIncBet={() => dispatch({ type: 'SET_BET_AMOUNT', amount: state.betAmount + 1 })}
            onDecBet={() => dispatch({ type: 'SET_BET_AMOUNT', amount: state.betAmount - 1 })}
            onPlaceBet={() => dispatch({ type: 'PLACE_BET' })}
          />
          <StatsPanel exitStats={state.exitStats} />
          <HistoryPanel history={state.history} />
          <p className="hint-caption">
            판 위의 나무 판자를 클릭하면 가로/세로로 회전합니다 (베팅 전에만 가능).
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
