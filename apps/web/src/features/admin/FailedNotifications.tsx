import { useState } from "react";
import { RESERVATION_STATUS_LABELS } from "@chromebook/shared";
import { useFailedNotifications, useRetryNotification } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { StatusMessage } from "../../components/StatusMessage";
import { formatDateShort, formatTimeRange, plural } from "../../lib/format";

export function FailedNotifications() {
  const failed = useFailedNotifications();
  const retry = useRetryNotification();
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  if (!failed.data || failed.data.length === 0) {
    return feedback ? <StatusMessage kind={feedback.kind}>{feedback.text}</StatusMessage> : null;
  }

  async function handleRetry(id: string, recipient: string) {
    setFeedback(null);
    try {
      await retry.mutateAsync(id);
      setFeedback({
        kind: "success",
        text: `Reenvio para ${recipient} iniciado. Se falhar de novo, o sistema tenta mais algumas vezes antes de mostrar aqui.`,
      });
    } catch (error) {
      setFeedback({ kind: "error", text: errorMessage(error) });
    }
  }

  return (
    <section className="card stack failed-notifications" aria-labelledby="failed-title">
      <h2 id="failed-title">E-mails de aviso não entregues</h2>
      <p className="muted small-text">
        {plural(failed.data.length, "aviso de pedido não chegou", "avisos de pedido não chegaram")} depois de várias tentativas.
        Confira o endereço em Configurações ou reenvie. Só dá para reenviar enquanto o pedido aguarda aprovação.
      </p>
      {feedback && <StatusMessage kind={feedback.kind}>{feedback.text}</StatusMessage>}
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Destinatário</th>
              <th>Situação do pedido</th>
              <th>Último erro</th>
              <th aria-label="Ações" />
            </tr>
          </thead>
          <tbody>
            {failed.data.map((item) => (
              <tr key={item.id}>
                <td>
                  {formatDateShort(item.reservation.date)}, {formatTimeRange(item.reservation.startTime, item.reservation.endTime)}
                  <div className="muted small-text">
                    {item.reservation.cartName} · {item.reservation.teacherName} · {item.reservation.className}
                  </div>
                </td>
                <td>{item.recipient}</td>
                <td>{RESERVATION_STATUS_LABELS[item.reservation.status]}</td>
                <td className="error-cell" title={item.lastError ?? undefined}>
                  {item.lastError ?? "—"}
                </td>
                <td className="row-actions">
                  {item.canRetry && (
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={retry.isPending}
                      onClick={() => handleRetry(item.id, item.recipient)}
                    >
                      Reenviar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
