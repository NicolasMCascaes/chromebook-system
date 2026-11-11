import { useState } from "react";
import type { ReservationDecisionInput } from "@chromebook/shared";
import { StatusMessage } from "../../components/StatusMessage";

interface DecisionPanelProps {
  busy: boolean;
  error: string | null;
  onDecide: (input: Pick<ReservationDecisionInput, "decision" | "reason">) => void;
  onBack?: () => void;
}

export function DecisionPanel({ busy, error, onDecide, onBack }: DecisionPanelProps) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="stack">
      {error && <StatusMessage kind="error">{error}</StatusMessage>}
      {rejecting ? (
        <>
          <label className="field">
            <span>Motivo da recusa (aparece para o professor)</span>
            <input value={reason} maxLength={300} autoFocus onChange={(event) => setReason(event.target.value)} />
          </label>
          <StatusMessage kind="info">Ao recusar, o horário volta a ficar livre para outros pedidos.</StatusMessage>
          <div className="actions">
            <button type="button" className="button secondary" disabled={busy} onClick={() => setRejecting(false)}>
              Voltar
            </button>
            <button
              type="button"
              className="button danger"
              disabled={busy}
              onClick={() => onDecide({ decision: "REJECT", reason: reason.trim() || null })}
            >
              {busy ? "Recusando…" : "Confirmar recusa"}
            </button>
          </div>
        </>
      ) : (
        <div className="actions">
          {onBack && (
            <button type="button" className="button secondary" disabled={busy} onClick={onBack}>
              Fechar
            </button>
          )}
          <button type="button" className="button danger-outline" disabled={busy} onClick={() => setRejecting(true)}>
            Recusar
          </button>
          <button type="button" className="button primary" disabled={busy} onClick={() => onDecide({ decision: "APPROVE", reason: null })}>
            {busy ? "Aprovando…" : "Aprovar"}
          </button>
        </div>
      )}
    </div>
  );
}
