import type { CartDto } from "@chromebook/shared";
import { plural } from "../../lib/format";
import { cartStyle } from "./cart-style";

interface CartFilterProps {
  carts: CartDto[];
  visibleCartIds: string[];
  onChange: (cartIds: string[]) => void;
  compact?: boolean;
}

export function CartFilter({ carts, visibleCartIds, onChange, compact = false }: CartFilterProps) {
  const toggle = (cartId: string) =>
    onChange(visibleCartIds.includes(cartId) ? visibleCartIds.filter((id) => id !== cartId) : [...visibleCartIds, cartId]);

  return (
    <fieldset className={compact ? "cart-filter is-compact" : "cart-filter"}>
      <legend>Carrinhos</legend>
      {carts.map((cart) => (
        <label key={cart.id} className="cart-filter-item" style={cartStyle(cart.color)}>
          <input type="checkbox" checked={visibleCartIds.includes(cart.id)} onChange={() => toggle(cart.id)} />
          <span className="cart-filter-text">
            <span className="cart-filter-name">{cart.name}</span>
            {!compact && (
              <span className="muted">{plural(cart.equipment.available, "Chromebook disponível", "Chromebooks disponíveis")}</span>
            )}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function ScheduleLegend() {
  return (
    <section className="legend" aria-label="Legenda">
      <h3>Legenda</h3>
      <ul>
        <li>
          <span className="legend-swatch is-blocked" aria-hidden="true" />
          Bloqueado: feriado, recesso ou data indisponível
        </li>
        <li>
          <span className="legend-swatch is-pending" aria-hidden="true" />
          Tracejado: pedido aguardando aprovação do TI
        </li>
        <li>
          <span className="day-status is-empty">Sem reservas</span>
          todos os carrinhos livres
        </li>
        <li>
          <span className="day-status is-available">Horários livres</span>
          há reservas, mas ainda sobra horário
        </li>
        <li>
          <span className="day-status is-full">Sem horários livres</span>
          todos os carrinhos ocupados no expediente
        </li>
      </ul>
    </section>
  );
}
