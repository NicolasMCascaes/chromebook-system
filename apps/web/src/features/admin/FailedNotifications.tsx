import { RESERVATION_STATUS_LABELS } from "@chromebook/shared";
import { useFailedNotifications, useRetryNotification } from "../../api/hooks";
import { notify } from "../../lib/toast";
import { formatDateShort, formatTimeRange, plural } from "../../lib/format";

export function FailedNotifications() {
  const failed = useFailedNotifications();
  const retry = useRetryNotification();
  if (!failed.data || failed.data.length === 0) return null;

  function handleRetry(id: string, recipient: string) {
    retry.mutate(id, {
      onSuccess: () =>
        notify.success(`Reenvio para ${recipient} iniciado. Se falhar de novo, o sistema tenta mais algumas vezes antes de mostrar aqui.`),
    });
  }

  return (
    <section className="card stack failed-notifications" aria-labelledby="failed-title">
      <h2 id="failed-title">E-mails de aviso não entregues</h2>
      <p className="muted small-text">
        {plural(failed.data.length, "aviso de pedido não chegou", "avisos de pedido não chegaram")} depois de várias tentativas.
        Confira o endereço em Configurações ou reenvie. Só dá para reenviar enquanto o pedido aguarda aprovação.
      </p>
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
