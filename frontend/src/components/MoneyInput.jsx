import { currencySymbol } from '../utils/format.js'

// Up to 2 decimal places, e.g. "12", "12.", "12.5", "12.50" (or empty).
const MONEY_PATTERN = /^\d*(\.\d{0,2})?$/

// A number box for prices, with the currency symbol ($) shown in front.
// Takes the same props as <input>, e.g. value, onChange, required.
// Typing a third decimal digit is ignored, so amounts stay in whole cents.
function MoneyInput({ onChange, ...props }) {
  function handleChange(event) {
    if (MONEY_PATTERN.test(event.target.value)) onChange(event)
  }

  return (
    <span className="money-input">
      <span className="money-symbol" aria-hidden="true">{currencySymbol()}</span>
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        placeholder="0.00"
        {...props}
        onChange={handleChange}
      />
    </span>
  )
}

export default MoneyInput
