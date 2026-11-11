import { useState, type FormEvent } from "react";
import { cartInputSchema, type AdminReservationDto, type CartDto } from "@chromebook/shared";
import { useAdminCarts, useFetchCartUpcomingReservations, useSaveCart } from "../../api/hooks";
import { ImpactConfirmation } from "../../features/admin/AffectedReservations";
import { errorMessage } from "../../api/client";
import { Modal } from "../../components/Modal";
import { StatusMessage } from "../../components/StatusMessage";
import { FieldError } from "../../components/FieldError";
import { apiFieldErrors, zodFieldErrors, type FieldErrors } from "../../lib/form-errors";

interface CartFormValues {
  name: string;
  description: string;
  color: string;
  displayOrder: string;
  active: boolean;
}

const EMPTY_FORM: CartFormValues = { name: "", description: "", color: "#1E88E5", displayOrder: "0", active: true };

function toFormValues(cart: CartDto): CartFormValues {
  return {
    name: cart.name,
    description: cart.description ?? "",
    color: cart.color,
    displayOrder: String(cart.displayOrder),
    active: cart.active,
  };
}

function CartForm({ cart, onDone }: { cart?: CartDto; onDone: (message: string) => void }) {
  const [values, setValues] = useState<CartFormValues>(cart ? toFormValues(cart) : EMPTY_FORM);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [impact, setImpact] = useState<AdminReservationDto[] | null>(null);
  const [checking, setChecking] = useState(false);
  const save = useSaveCart();
  const fetchUpcoming = useFetchCartUpcomingReservations();

  const set = <K extends keyof CartFormValues>(key: K, value: CartFormValues[K]) => {
    setImpact(null);
    setValues((current) => ({ ...current, [key]: value }));
  };

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = cartInputSchema.safeParse({
      name: values.name,
      description: values.description,
      color: values.color,
      displayOrder: Number(values.displayOrder),
      active: values.active,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    if (cart?.active && !values.active && !impact) {
      setChecking(true);
      try {
        setImpact(await fetchUpcoming(cart.id));
      } catch (error) {
        setErrors(apiFieldErrors(error));
      } finally {
        setChecking(false);
      }
      return;
    }
    try {
      await save.mutateAsync({ id: cart?.id, input: parsed.data });
      onDone(cart ? "Carrinho atualizado." : "Carrinho cadastrado.");
    } catch (error) {
      setErrors(apiFieldErrors(error));
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <div className="form-grid">
        <label className="field">
          <span>Nome</span>
          <input value={values.name} onChange={(event) => set("name", event.target.value)} maxLength={60} />
          <FieldError message={errors.name} />
        </label>
        <label className="field">
          <span>Cor na agenda</span>
          <input type="color" value={values.color} onChange={(event) => set("color", event.target.value.toUpperCase())} />
          <FieldError message={errors.color} />
        </label>
        <label className="field">
          <span>Ordem de exibição</span>
          <input
            type="number"
            min={0}
            max={999}
            value={values.displayOrder}
            onChange={(event) => set("displayOrder", event.target.value)}
          />
          <FieldError message={errors.displayOrder} />
        </label>
        <label className="field checkbox">
          <input type="checkbox" checked={values.active} onChange={(event) => set("active", event.target.checked)} />
          <span>Ativo (disponível para reservas)</span>
        </label>
        <label className="field full">
          <span>Descrição (opcional)</span>
          <input value={values.description} onChange={(event) => set("description", event.target.value)} maxLength={200} />
          <FieldError message={errors.description} />
        </label>
      </div>
      {save.isError && <StatusMessage kind="error">{errorMessage(save.error)}</StatusMessage>}
      {impact ? (
        <ImpactConfirmation
          title={`Desativar ${cart?.name ?? "carrinho"}?`}
          consequences={[
            "O carrinho deixa de aparecer na agenda e não recebe novos pedidos.",
            "Reservas já aprovadas continuam marcadas; pedidos aguardando não poderão ser aprovados.",
            "Dá para reativar depois marcando \"Ativo\" de novo.",
          ]}
          reservations={impact}
          confirmLabel="Desativar carrinho"
          busy={save.isPending}
          onBack={() => setImpact(null)}
          onConfirm={() => handleSubmit({ preventDefault() {} } as FormEvent)}
        />
      ) : (
        <div className="actions">
          <button type="button" className="button secondary" onClick={() => onDone("")}>
            Cancelar
          </button>
          <button type="submit" className="button primary" disabled={save.isPending || checking}>
            {save.isPending ? "Salvando…" : checking ? "Verificando reservas…" : "Salvar"}
          </button>
        </div>
      )}
    </form>
  );
}

export function CartsPage() {
  const carts = useAdminCarts();
  const [editing, setEditing] = useState<CartDto | "new" | null>(null);
  const [feedback, setFeedback] = useState("");

  function finish(message: string) {
    setEditing(null);
    setFeedback(message);
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <p className="muted">A quantidade operacional considera apenas Chromebooks com situação “Disponível”.</p>
        <button
          type="button"
          className="button primary"
          onClick={() => {
            setFeedback("");
            setEditing("new");
          }}
        >
          Novo carrinho
        </button>
      </div>

      {feedback && <StatusMessage kind="success">{feedback}</StatusMessage>}
      <Modal
        open={editing !== null}
        title={editing === "new" ? "Novo carrinho" : editing ? `Editar ${editing.name}` : ""}
        onClose={() => setEditing(null)}
      >
        {editing && (
          <CartForm key={editing === "new" ? "new" : editing.id} cart={editing === "new" ? undefined : editing} onDone={finish} />
        )}
      </Modal>

      {carts.isPending && <StatusMessage kind="loading">Carregando carrinhos…</StatusMessage>}
      {carts.isError && <StatusMessage kind="error">{errorMessage(carts.error)}</StatusMessage>}
      {carts.data?.length === 0 && <StatusMessage kind="empty">Nenhum carrinho cadastrado ainda.</StatusMessage>}

      {carts.data && carts.data.length > 0 && (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Carrinho</th>
                <th>Total</th>
                <th>Disponíveis</th>
                <th>Manutenção</th>
                <th>Inativos</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {carts.data.map((cart) => (
                <tr key={cart.id}>
                  <td>
                    <span className="swatch" style={{ backgroundColor: cart.color }} aria-hidden="true" /> {cart.name}
                  </td>
                  <td>{cart.equipment.total}</td>
                  <td>{cart.equipment.available}</td>
                  <td>{cart.equipment.maintenance}</td>
                  <td>{cart.equipment.inactive}</td>
                  <td>{cart.active ? "Ativo" : "Inativo"}</td>
                  <td>
                    <button
                      type="button"
                      className="button link"
                      onClick={() => {
                        setFeedback("");
                        setEditing(cart);
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
