import React from 'react';
import { createRoot } from 'react-dom/client';

let root;
function CartItems({ items, formatCurrency, remove }) {
  if (!items.length) {
    return <div className="empty-state"><h3>Your cart is empty.</h3><p>Add one or more products to continue.</p></div>;
  }
  return items.map(item => (
    <article className="cart-item" key={item.lockId}>
      <h3>{item.title}</h3>
      <p>Direct purchase</p>
      <p className="muted">{formatCurrency(item.dailyRate)} selling price</p>
      <div className="price-line">
        <strong>{formatCurrency(item.lineTotal)}</strong>
        <button className="mini-btn" type="button" onClick={() => remove(item.lockId)}>Remove</button>
      </div>
    </article>
  ));
}
window.renderRewearlyCart = (element, items, formatCurrency, remove) => {
  root ??= createRoot(element);
  root.render(<CartItems items={items} formatCurrency={formatCurrency} remove={remove} />);
};
