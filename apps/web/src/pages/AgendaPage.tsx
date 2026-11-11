import { useActiveCarts } from "../api/hooks";
import { errorMessage } from "../api/client";
import { StatusMessage } from "../components/StatusMessage";

export function AgendaPage() {
  const carts = useActiveCarts();

  return (
    <section className="page">
      <header className="page-header">
        <h1>Agenda</h1>
      </header>

      <StatusMessage kind="info">O calendário de reservas será disponibilizado na próxima etapa.</StatusMessage>

      <h2>Carrinhos</h2>
      {carts.isPending && <StatusMessage kind="loading">Carregando carrinhos…</StatusMessage>}
      {carts.isError && <StatusMessage kind="error">{errorMessage(carts.error)}</StatusMessage>}
      {carts.data?.length === 0 && <StatusMessage kind="empty">Nenhum carrinho cadastrado.</StatusMessage>}
      <ul className="cart-list">
        {carts.data?.map((cart) => (
          <li key={cart.id} className="card cart-card">
            <span className="swatch" style={{ backgroundColor: cart.color }} aria-hidden="true" />
            <div>
              <strong>{cart.name}</strong>
              <p className="muted">
                {cart.equipment.available} disponíveis · {cart.equipment.maintenance} em manutenção
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
