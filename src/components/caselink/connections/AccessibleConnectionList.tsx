import type { Investigation } from "@/lib/caselink/types";
import type { BoardConnection } from "./board.types";

export function AccessibleConnectionList({
  connections,
  caseMap,
  selectedConnectionId,
  onSelect,
}: {
  connections: BoardConnection[];
  caseMap: Map<string, Investigation>;
  selectedConnectionId: string | null;
  onSelect: (connectionId: string) => void;
}) {
  return (
    <section className="border-t border-border/70 bg-background/75 p-3" aria-label="Structured connection list">
      <p className="label-xs mb-2">Accessible connection list</p>
      {connections.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No stored connections reach the 60% board threshold.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {connections.map((connection) => {
            const a = caseMap.get(connection.case_a_id);
            const b = caseMap.get(connection.case_b_id);
            return (
              <button
                key={connection.id}
                type="button"
                onClick={() => onSelect(connection.id)}
                aria-pressed={selectedConnectionId === connection.id}
                className={
                  "rounded-md border px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan " +
                  (selectedConnectionId === connection.id ? "border-danger bg-danger/10" : "border-border hover:border-danger/60")
                }
              >
                <span className="block truncate text-[11px] text-foreground">
                  {a?.code ?? "Referenced record unavailable"} ↔ {b?.code ?? "Referenced record unavailable"}
                </span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-danger">
                  Connection strength {connection.score.toFixed(1)} percent
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
