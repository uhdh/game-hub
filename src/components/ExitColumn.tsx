import type { ExitMeta, Phase } from '../game/types';

interface ExitColumnProps {
  exits: ExitMeta[];
  selectedExitId: number | null;
  phase: Phase;
  onSelect: (id: number) => void;
}

export function ExitColumn({ exits, selectedExitId, phase, onSelect }: ExitColumnProps) {
  return (
    <div className="exit-column">
      {exits.map((exit) => {
        const selected = selectedExitId === exit.id;
        return (
          <button
            key={exit.id}
            type="button"
            className={`exit-chip${selected ? ' exit-chip--selected' : ''}`}
            style={{ top: `calc(${exit.y} / 1000 * 100% - 24px)` }}
            disabled={phase !== 'setup'}
            onClick={() => onSelect(exit.id)}
          >
            <span className="exit-chip__label">{exit.label}</span>
            <span className="exit-chip__odds">x{exit.odds}</span>
          </button>
        );
      })}
    </div>
  );
}
