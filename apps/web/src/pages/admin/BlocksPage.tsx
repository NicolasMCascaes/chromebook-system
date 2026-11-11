import { useState, type FormEvent } from "react";
import {
  blockInputSchema,
  CALENDAR_BLOCK_KIND_LABELS,
  CALENDAR_BLOCK_KINDS,
  schoolNow,
  type AdminReservationDto,
  type BlockDto,
  type BlockInput,
  type CalendarBlockKind,
  type CartDto,
} from "@chromebook/shared";
import { useAdminBlocks, useAdminCarts, useDeleteBlock, usePreviewBlock, useSaveBlock } from "../../api/hooks";
import { errorMessage } from "../../api/client";
import { Modal } from "../../components/Modal";
import { StatusMessage } from "../../components/StatusMessage";
import { FieldError } from "../../components/FieldError";
import { AffectedReservations } from "../../features/admin/AffectedReservations";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "../../lib/form-errors";
import { formatDateShort } from "../../lib/format";

interface BlockFormValues {
  kind: CalendarBlockKind;
  startDate: string;
  endDate: string;
  reason: string;
  cartId: string;
}

function toFormValues(block: BlockDto | undefined, today: string): BlockFormValues {
  if (!block) return { kind: "BLOCK", startDate: today, endDate: today, reason: "", cartId: "" };
  return { kind: block.kind, startDate: block.startDate, endDate: block.endDate, reason: block.reason, cartId: block.cartId ?? "" };
}

function formatPeriod(block: BlockDto): string {
  if (block.startDate === block.endDate) return formatDateShort(block.startDate);
  return `${formatDateShort(block.startDate)} a ${formatDateShort(block.endDate)}`;
}

function BlockForm({
  block,
  carts,
  onDone,
}: {
  block?: BlockDto;
  carts: CartDto[];
  onDone: (result: { message: string; affected: AdminReservationDto[] } | null) => void;
}) {
  const [values, setValues] = useState(() => toFormValues(block, schoolNow(new Date()).date));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [preview, setPreview] = useState<AdminReservationDto[] | null>(null);
  const save = useSaveBlock();
  const previewBlock = usePreviewBlock();
  const appliesToCart = values.kind === "BLOCK";

  const set = <K extends keyof BlockFormValues>(key: K, value: BlockFormValues[K]) => {
    setPreview(null);
    setValues((current) => ({ ...current, [key]: value }));
  };

  function parse(): BlockInput | null {
    const parsed = blockInputSchema.safeParse({ ...values, cartId: appliesToCart && values.cartId ? values.cartId : null });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return null;
    }
    setErrors({});
    return parsed.data;
  }

  async function handlePreview() {
    const input = parse();
    if (!input) return;
    try {
      setPreview((await previewBlock.mutateAsync(input)).affectedReservations);
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const input = parse();
    if (!input) return;
    try {
      const result = await save.mutateAsync({ id: block?.id, input });
      onDone({ message: block ? "Bloqueio atualizado." : "Bloqueio cadastrado.", affected: result.affectedReservations });
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field">
          <span>Tipo</span>
          <select value={values.kind} onChange={(event) => set("kind", event.target.value as CalendarBlockKind)}>
            {CALENDAR_BLOCK_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {CALENDAR_BLOCK_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Carrinho</span>
          <select value={appliesToCart ? values.cartId : ""} disabled={!appliesToCart} onChange={(event) => set("cartId", event.target.value)}>
            <option value="">Todos os carrinhos</option>
            {carts.map((cart) => (
              <option key={cart.id} value={cart.id}>
                {cart.name}
              </option>
            ))}
          </select>
          <FieldError message={errors.cartId} />
        </label>
        <label className="field">
          <span>Data inicial</span>
          <input type="date" value={values.startDate} onChange={(event) => set("startDate", event.target.value)} />
          <FieldError message={errors.startDate} />
        </label>
        <label className="field">
          <span>Data final</span>
          <input type="date" value={values.endDate} onChange={(event) => set("endDate", event.target.value)} />
          <FieldError message={errors.endDate} />
        </label>
        <label className="field full">
          <span>Motivo (aparece na agenda)</span>
          <input value={values.reason} maxLength={200} onChange={(event) => set("reason", event.target.value)} />
          <FieldError message={errors.reason} />
        </label>
      </div>

      {preview?.length === 0 && <StatusMessage kind="success">Nenhuma reserva confirmada nesse período.</StatusMessage>}
      {preview && <AffectedReservations reservations={preview} intro="Nesse período," />}
      {(save.isError || previewBlock.isError) && (
        <StatusMessage kind="error">{errorMessage(save.error ?? previewBlock.error)}</StatusMessage>
      )}

      <div className="actions">
        <button type="button" className="button secondary" onClick={() => onDone(null)}>
          Cancelar
        </button>
        <button type="button" className="button secondary" disabled={previewBlock.isPending} onClick={handlePreview}>
          {previewBlock.isPending ? "Verificando…" : "Ver reservas afetadas"}
        </button>
        <button type="submit" className="button primary" disabled={save.isPending}>
          {save.isPending ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

function BlockRow({ block, onEdit, onDeleted }: { block: BlockDto; onEdit: () => void; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useDeleteBlock();

  return (
    <tr>
      <td>{formatPeriod(block)}</td>
      <td>{CALENDAR_BLOCK_KIND_LABELS[block.kind]}</td>
      <td>{block.reason}</td>
      <td>{block.cartName ?? "Todos"}</td>
      <td className="row-actions">
        {confirming ? (
          <>
            <button type="button" className="button link" disabled={remove.isPending} onClick={() => setConfirming(false)}>
              Manter
            </button>
            <button
              type="button"
              className="button link danger-text"
              disabled={remove.isPending}
              onClick={() => remove.mutate(block.id, { onSuccess: onDeleted })}
            >
              Confirmar exclusão
            </button>
          </>
        ) : (
          <>
            <button type="button" className="button link" onClick={onEdit}>
              Editar
            </button>
            <button type="button" className="button link danger-text" onClick={() => setConfirming(true)}>
              Excluir
            </button>
          </>
        )}
        {remove.isError && <div className="field-error">{errorMessage(remove.error)}</div>}
      </td>
    </tr>
  );
}

export function BlocksPage() {
  const [year, setYear] = useState(() => Number(schoolNow(new Date()).date.slice(0, 4)));
  const [editing, setEditing] = useState<BlockDto | "new" | null>(null);
  const [result, setResult] = useState<{ message: string; affected: AdminReservationDto[] } | null>(null);
  const blocks = useAdminBlocks(year);
  const carts = useAdminCarts();

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="year-nav">
          <button type="button" className="icon-button bordered" aria-label="Ano anterior" onClick={() => setYear(year - 1)}>
            ‹
          </button>
          <strong>{year}</strong>
          <button type="button" className="icon-button bordered" aria-label="Próximo ano" onClick={() => setYear(year + 1)}>
            ›
          </button>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={() => {
            setResult(null);
            setEditing("new");
          }}
        >
          Novo bloqueio
        </button>
      </div>
      <p className="muted small-text">
        Feriados e recessos valem para todos os carrinhos. Bloqueios podem valer para um carrinho específico. Nenhuma reserva é
        cancelada automaticamente.
      </p>

      {result && (
        <>
          <StatusMessage kind="success">{result.message}</StatusMessage>
          <AffectedReservations reservations={result.affected} intro="No período bloqueado," />
        </>
      )}
      <Modal
        open={editing !== null}
        title={editing === "new" ? "Novo bloqueio ou feriado" : "Editar bloqueio"}
        onClose={() => setEditing(null)}
      >
        {editing && carts.data && (
          <BlockForm
            key={editing === "new" ? "new" : editing.id}
            block={editing === "new" ? undefined : editing}
            carts={carts.data}
            onDone={(outcome) => {
              setEditing(null);
              setResult(outcome);
            }}
          />
        )}
      </Modal>

      {blocks.isPending && <StatusMessage kind="loading">Carregando bloqueios…</StatusMessage>}
      {blocks.isError && <StatusMessage kind="error">{errorMessage(blocks.error)}</StatusMessage>}
      {blocks.data?.length === 0 && <StatusMessage kind="empty">Nenhum bloqueio ou feriado em {year}.</StatusMessage>}

      {blocks.data && blocks.data.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Período</th>
                <th>Tipo</th>
                <th>Motivo</th>
                <th>Carrinho</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {blocks.data.map((block) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  onEdit={() => {
                    setResult(null);
                    setEditing(block);
                  }}
                  onDeleted={() => setResult({ message: "Bloqueio excluído. As datas voltaram a aceitar reservas.", affected: [] })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
