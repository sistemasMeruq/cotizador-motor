/**
 * Motor de cálculo equivalente a `Plantilla_IMB_Master.xlsx`.
 *
 * Cada función replica una celda concreta de la hoja de cotización. Las
 * referencias entre paréntesis son las celdas originales, para poder auditar
 * cualquier diferencia contra el Excel sin tener que adivinar.
 *
 * Verificado contra el caso C31 (Box) · 18 meses · Banesco · Caracas · inicial 0,
 * que en la hoja da Total 23.641,45 y cuota 1.577,03. Ver `test/motor.test.ts`.
 *
 * Es lógica pura: no lee catálogo, no toca red ni DOM. Quien lo llama arma la
 * `Entrada`, el `ModeloCatalogo` y los `Parametros` (ver `catalogo.ts`).
 */

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export type Plazo = 12 | 18 | 24 | 36 | 48;
export type Aseguradora = 'OCEANICA' | 'BANESCO' | 'MERCANTIL';
export type Financiamiento = 'LINEAL' | 'FRANCES';
export type Marca = 'DFSK' | 'SHINERAY' | 'GAC';

/** Cada línea del presupuesto que el usuario puede mover entre cuota e inicial. */
export type Concepto =
  | 'iva'
  | 'igtf'
  | 'seguroVehiculo'
  | 'gps'
  | 'polizaVida'
  | 'placa'
  | 'gastosAdmin'
  | 'traslado'
  | 'comisionFlat';

export const CONCEPTOS: Concepto[] = [
  'iva', 'igtf', 'seguroVehiculo', 'gps', 'polizaVida',
  'placa', 'gastosAdmin', 'traslado', 'comisionFlat',
];

export const ETIQUETAS: Record<Concepto, string> = {
  iva: 'IVA 16%',
  igtf: 'IGTF 3%',
  seguroVehiculo: 'Seguro de Vehículo',
  gps: 'GPS',
  polizaVida: 'Póliza de Vida',
  placa: 'Placa',
  gastosAdmin: 'Gastos Administrativos',
  traslado: 'Traslado y alistamiento',
  comisionFlat: 'Comisión Flat',
};

export interface ModeloCatalogo {
  item: number;
  marca: Marca;
  modelo: string;
  precio: number;
  gastosAdministrativos: number;
  /** Único dato real de seguro: la prima a 12 meses. El resto se deriva. */
  primaSeguro12m: Record<Aseguradora, number>;
}

export interface Parametros {
  iva: number;                                   // 0.16
  igtf: number;                                  // 0.03
  placa: number;                                 // 480
  tasaAnual: number;                             // 0.20
  comisionFlat: number;                          // 0.03 | 0.04
  /** Deriva la prima por plazo desde la de 12 meses. */
  multiplicadorSeguro: Record<Plazo, number>;    // 1 · 1,5 · 2 · 3 · 4
  gpsPorPlazo: Record<Plazo, number>;
  polizaVidaOceanica: Record<Plazo, number>;
  /** Escalones por monto asegurado, ordenados de menor a mayor. */
  escalonesPolizaVida: { cobertura: number; BANESCO: number; MERCANTIL: number }[];
  trasladoPorCiudad: Record<string, number>;
}

export interface Entrada {
  item: number;
  cantidad: number;
  plazo: Plazo;
  /** Monto en dólares, no porcentaje. En la hoja es la celda F20. */
  inicial: number;
  aseguradora: Aseguradora | 'SIN_SEGURO';
  ciudad: string;
  financiamiento: Financiamiento;
  /**
   * Casilla marcada = el concepto se financia y suma al Total a Pagar.
   * Casilla desmarcada = sale del total y se paga de contado en la inicial.
   */
  financiado: Record<Concepto, boolean>;
}

export interface LineaResultado {
  concepto: Concepto;
  etiqueta: string;
  monto: number;
  financiado: boolean;
}

export interface Resultado {
  /** D20 · precio unitario del catálogo */
  precioUnitario: number;
  /** D22 · precio × cantidad */
  subtotal: number;
  /** D24 · precio + IVA + placa */
  baseImponibleIgtf: number;
  lineas: LineaResultado[];
  /** D32 */
  totalAPagar: number;
  /** D33 */
  comisionFlat: number;
  /** D34 */
  saldoAFinanciar: number;
  /** F22 */
  cuotaMensual: number;
  /** K21 · lo que el cliente paga de contado */
  pagoTotalInicial: number;
  /** K22 · de la inicial, cuánto es impuesto */
  impuestosEnInicial: number;
  /** K23 */
  restanteEnInicial: number;
  /** Base sobre la que se calcula la póliza de vida (D28) */
  montoAsegurado: number;
}

// ---------------------------------------------------------------------------
// Piezas de cálculo
// ---------------------------------------------------------------------------

/** Prima del seguro: solo se guarda la de 12 meses, el resto se multiplica. */
export const primaSeguro = (
  modelo: ModeloCatalogo,
  aseguradora: Aseguradora,
  plazo: Plazo,
  p: Parametros
): number => (modelo.primaSeguro12m[aseguradora] || 0) * (p.multiplicadorSeguro[plazo] ?? 1);

/**
 * Póliza de vida. Tres reglas distintas según la aseguradora, no una sola:
 * Oceánica cobra por plazo; Banesco y Mercantil por escalón de monto asegurado.
 */
export const polizaVida = (
  aseguradora: Aseguradora,
  plazo: Plazo,
  montoAsegurado: number,
  p: Parametros
): number => {
  if (aseguradora === 'OCEANICA') return p.polizaVidaOceanica[plazo] ?? 0;

  // Búsqueda aproximada: se toma el último escalón cuya cobertura no supera
  // el monto, igual que el VLOOKUP con cuarto argumento 1 del original.
  let valor = 0;
  for (const e of p.escalonesPolizaVida) {
    if (montoAsegurado >= e.cobertura) valor = e[aseguradora];
    else break;
  }
  return valor;
};

/** Interés simple sobre el saldo completo durante todo el plazo. */
export const cuotaLineal = (saldo: number, tasaAnual: number, meses: number): number =>
  meses <= 0 ? 0 : (saldo * (tasaAnual / 12) * meses + saldo) / meses;

/** Anualidad estándar. Equivale al PMT del Excel, devuelto en positivo. */
export const cuotaFrances = (saldo: number, tasaAnual: number, meses: number): number => {
  if (meses <= 0) return 0;
  const i = tasaAnual / 12;
  if (i === 0) return saldo / meses;
  return (saldo * i) / (1 - Math.pow(1 + i, -meses));
};

// ---------------------------------------------------------------------------
// Cotización completa
// ---------------------------------------------------------------------------

export const cotizar = (
  entrada: Entrada,
  modelo: ModeloCatalogo,
  p: Parametros
): Resultado => {
  const cantidad = Math.max(1, entrada.cantidad || 1);
  const activo = (c: Concepto) => entrada.financiado[c] === true;

  // --- Bloque fiscal (D22 · D23 · D24 · D25 · D29) ---
  const precioUnitario = modelo.precio;
  const subtotal = precioUnitario * cantidad;
  const iva = subtotal * p.iva;
  const placa = p.placa * cantidad;
  const baseImponibleIgtf = subtotal + iva + placa;
  const igtf = baseImponibleIgtf * p.igtf;

  // --- Bloque de servicios (D26 · D27 · D30 · D31) ---
  const conSeguro = entrada.aseguradora !== 'SIN_SEGURO';
  const aseguradora = entrada.aseguradora as Aseguradora;
  const seguroVehiculo = conSeguro
    ? primaSeguro(modelo, aseguradora, entrada.plazo, p) * cantidad
    : 0;
  const gps = (p.gpsPorPlazo[entrada.plazo] ?? 0) * cantidad;
  const gastosAdmin = modelo.gastosAdministrativos * cantidad;
  const traslado = (p.trasladoPorCiudad[entrada.ciudad] ?? 0) * cantidad;

  // --- Póliza de vida (D28) ---
  // La base excluye la propia póliza y la comisión, tal como en la hoja.
  const montoAsegurado =
    subtotal +
    (activo('iva') ? iva : 0) +
    (activo('igtf') ? igtf : 0) +
    (activo('seguroVehiculo') ? seguroVehiculo : 0) +
    (activo('gps') ? gps : 0) +
    (activo('placa') ? placa : 0) +
    (activo('gastosAdmin') ? gastosAdmin : 0) +
    (activo('traslado') ? traslado : 0) -
    entrada.inicial;

  const polizaVidaMonto = conSeguro
    ? polizaVida(aseguradora, entrada.plazo, montoAsegurado, p) * cantidad
    : 0;

  const montos: Record<Concepto, number> = {
    iva, igtf, seguroVehiculo, gps, polizaVida: polizaVidaMonto,
    placa, gastosAdmin, traslado, comisionFlat: 0,
  };

  // --- Total a Pagar (D32) ---
  // Suma el precio más cada concepto marcado. La comisión va aparte porque
  // se calcula sobre este total.
  const totalAPagar = CONCEPTOS.filter(c => c !== 'comisionFlat')
    .reduce((acc, c) => acc + (activo(c) ? montos[c] : 0), subtotal);

  // --- Comisión (D33) y saldo (D34) ---
  const comisionFlat = (totalAPagar - entrada.inicial) * p.comisionFlat;
  montos.comisionFlat = comisionFlat;

  const saldoAFinanciar =
    totalAPagar + (activo('comisionFlat') ? comisionFlat : 0) - entrada.inicial;

  // --- Cuota (F22) ---
  const cuotaMensual =
    entrada.financiamiento === 'LINEAL'
      ? cuotaLineal(saldoAFinanciar, p.tasaAnual, entrada.plazo)
      : cuotaFrances(saldoAFinanciar, p.tasaAnual, entrada.plazo);

  // --- Desglose de inicial (K21 · K22 · K23) ---
  // Lo desmarcado no desaparece: se paga de contado.
  const pagoTotalInicial =
    CONCEPTOS.reduce((acc, c) => acc + (activo(c) ? 0 : montos[c]), 0) + entrada.inicial;

  const impuestosEnInicial = (['iva', 'igtf', 'placa'] as Concepto[])
    .reduce((acc, c) => acc + (activo(c) ? 0 : montos[c]), 0);

  const lineas: LineaResultado[] = CONCEPTOS.map(c => ({
    concepto: c,
    etiqueta: ETIQUETAS[c],
    monto: montos[c],
    financiado: activo(c),
  }));

  return {
    precioUnitario,
    subtotal,
    baseImponibleIgtf,
    lineas,
    totalAPagar,
    comisionFlat,
    saldoAFinanciar,
    cuotaMensual,
    pagoTotalInicial,
    impuestosEnInicial,
    restanteEnInicial: pagoTotalInicial - impuestosEnInicial,
    montoAsegurado,
  };
};

/** Todo financiado, que es como abre la hoja. */
export const TODO_FINANCIADO: Record<Concepto, boolean> =
  CONCEPTOS.reduce((acc, c) => ({ ...acc, [c]: true }), {} as Record<Concepto, boolean>);
