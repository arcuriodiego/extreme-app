/**
 * Importes en centavos (enteros). Nunca usamos decimales de punto flotante para plata:
 * 0,1 + 0,2 no da exactamente 0,3 en una computadora.
 */

export type Cents = number;

export function assertCents(value: number): Cents {
  if (!Number.isSafeInteger(value)) throw new Error(`Importe inválido: ${value}. Debe ser un entero en centavos.`);
  return value;
}

export function pesos(amount: number): Cents {
  return assertCents(Math.round(amount * 100));
}

/** Formato argentino: $55.500 · $6.437,50 · -$1.200 */
export function formatARS(cents: Cents): string {
  assertCents(cents);
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const wholeText = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const text = fraction === 0 ? `$${wholeText}` : `$${wholeText},${String(fraction).padStart(2, "0")}`;
  return negative ? `-${text}` : text;
}
