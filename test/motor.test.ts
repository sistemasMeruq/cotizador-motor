/**
 * Verificación del motor contra los números reales de la hoja de Excel.
 *
 *   npm test   (corre con tsx: resuelve los imports sin extensión)
 *
 * Los casos salen de capturas de `Plantilla_IMB_Master.xlsx`. El catálogo de
 * prueba (`catalogo-2026-08.json`) es la extracción del Excel de agosto 2026:
 * es un FIXTURE, no el catálogo vivo, que hoy administra el Panel Maestro.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  cotizar, TODO_FINANCIADO, CONCEPTOS,
  type Parametros, type ModeloCatalogo, type Entrada, type Plazo, type Aseguradora, type Concepto,
} from '../src/index';

const catalogo = JSON.parse(
  readFileSync(new URL('./catalogo-2026-08.json', import.meta.url), 'utf8'),
) as {
  modelos: ModeloCatalogo[];
  ciudades: { ciudad: string; traslado: number }[];
  escalonesPolizaVida: Parametros['escalonesPolizaVida'];
};

const P: Parametros = {
  iva: 0.16,
  igtf: 0.03,
  placa: 480,
  tasaAnual: 0.20,
  comisionFlat: 0.03,                       // DFSK calcula 3% pese a rotular 4%
  multiplicadorSeguro: { 12: 1, 18: 1.5, 24: 2, 36: 3, 48: 4 },
  gpsPorPlazo: { 12: 320, 18: 370, 24: 420, 36: 470, 48: 520 },
  polizaVidaOceanica: { 12: 100, 18: 200, 24: 300, 36: 400, 48: 500 },
  escalonesPolizaVida: catalogo.escalonesPolizaVida,
  trasladoPorCiudad: Object.fromEntries(catalogo.ciudades.map(c => [c.ciudad, c.traslado])),
};

const modeloPorItem = (item: number): ModeloCatalogo => {
  const m = catalogo.modelos.find(x => x.item === item);
  assert.ok(m, `el fixture no trae el item ${item}`);
  return m;
};

const base = (): Entrada => ({
  item: 2,
  cantidad: 1,
  plazo: 18,
  inicial: 0,
  aseguradora: 'BANESCO',
  ciudad: 'CARACAS',
  financiamiento: 'FRANCES',
  financiado: { ...TODO_FINANCIADO },
});

/** Igual con dos centavos de tolerancia: la hoja redondea al mostrar. */
const cerca = (obtenido: number, esperado: number, etiqueta: string, tol = 0.02) =>
  assert.ok(
    Math.abs(obtenido - esperado) <= tol,
    `${etiqueta}: obtenido ${obtenido.toFixed(2)}, esperado ${esperado.toFixed(2)}`,
  );

describe('C31 (Box) · 18 meses · Banesco · Caracas · inicial 0', () => {
  const modelo = modeloPorItem(2);

  it('caso 1 — todo financiado, cuadra con la hoja', () => {
    const r = cotizar(base(), modelo, P);
    const m = (k: Concepto) => r.lineas.find(l => l.concepto === k)!.monto;
    cerca(r.subtotal, 17490.0, 'Precio de venta');
    cerca(m('iva'), 2798.4, 'IVA 16%');
    cerca(r.baseImponibleIgtf, 20768.4, 'Base imponible IGTF');
    cerca(m('igtf'), 623.05, 'IGTF 3%');
    cerca(m('seguroVehiculo'), 750.0, 'Seguro de Vehículo');
    cerca(m('gps'), 370.0, 'GPS');
    cerca(m('polizaVida'), 190.0, 'Póliza de Vida');
    cerca(m('placa'), 480.0, 'Placa');
    cerca(m('gastosAdmin'), 380.0, 'Gastos Administrativos');
    cerca(m('traslado'), 560.0, 'Traslado');
    cerca(r.totalAPagar, 23641.45, 'Total a Pagar');
    cerca(r.comisionFlat, 709.24, 'Comisión Flat');
    cerca(r.saldoAFinanciar, 24350.7, 'Saldo a Financiar');
    cerca(r.cuotaMensual, 1577.03, 'Cuota mensual');
    cerca(r.pagoTotalInicial, 0, 'Pago total de inicial');
  });

  it('caso 2 — IGTF, seguro y GPS a la inicial', () => {
    const e = base();
    e.financiado.igtf = false;
    e.financiado.seguroVehiculo = false;
    e.financiado.gps = false;
    const r = cotizar(e, modelo, P);
    cerca(r.totalAPagar, 21898.4, 'Total a Pagar');
    cerca(r.comisionFlat, 656.95, 'Comisión Flat');
    cerca(r.saldoAFinanciar, 22555.35, 'Saldo a Financiar');
    cerca(r.cuotaMensual, 1460.76, 'Cuota mensual');
    cerca(r.pagoTotalInicial, 1743.05, 'Pago total de inicial');
    cerca(r.impuestosEnInicial, 623.05, 'Impuestos en inicial');
    cerca(r.restanteEnInicial, 1120.0, 'Restante en $');
  });

  it('caso 3 — todo a la inicial, inicial 10.000, Oceánica 12 meses', () => {
    const e = base();
    e.plazo = 12;
    e.inicial = 10000;
    e.aseguradora = 'OCEANICA';
    for (const c of CONCEPTOS) e.financiado[c] = false;
    e.financiado.comisionFlat = true;          // la comisión sí se financia
    const r = cotizar(e, modelo, P);
    const m = (k: Concepto) => r.lineas.find(l => l.concepto === k)!.monto;
    cerca(m('seguroVehiculo'), 390.0, 'Seguro Oceánica 12m');
    cerca(m('gps'), 320.0, 'GPS 12m');
    cerca(m('polizaVida'), 100.0, 'Póliza Oceánica 12m');
    cerca(r.totalAPagar, 17490.0, 'Total a Pagar');
    cerca(r.comisionFlat, 224.7, 'Comisión Flat');
    cerca(r.saldoAFinanciar, 7714.7, 'Saldo a Financiar');
    cerca(r.cuotaMensual, 714.65, 'Cuota mensual', 0.05);
    cerca(r.pagoTotalInicial, 15651.45, 'Pago total de inicial');
    cerca(r.impuestosEnInicial, 3901.45, 'Impuestos en inicial');
    cerca(r.restanteEnInicial, 11750.0, 'Restante en $');
  });

  it('caso 4 — lineal es más caro que francés con el mismo saldo', () => {
    const e = base();
    e.financiamiento = 'LINEAL';
    const lineal = cotizar(e, modelo, P).cuotaMensual;
    const frances = cotizar(base(), modelo, P).cuotaMensual;
    assert.ok(lineal > frances, `lineal ${lineal.toFixed(2)} debería superar a francés ${frances.toFixed(2)}`);
  });
});

/*
 * Los cuatro casos anteriores son DFSK, que calcula 3%. Sin un caso GAC o
 * SHINERAY, un motor que cobrara 3% a todo el mundo pasaba las pruebas igual.
 */
describe('GAC EMZOOM GB · 12 meses · Oceánica (comisión 4%)', () => {
  const gac = modeloPorItem(28);
  const Pgac: Parametros = { ...P, comisionFlat: 0.04 };
  const entrada: Entrada = {
    item: gac.item, cantidad: 1, plazo: 12, aseguradora: 'OCEANICA',
    ciudad: 'CARACAS', inicial: 0, financiamiento: 'FRANCES',
    financiado: { ...TODO_FINANCIADO },
  };

  it('caso 5 — cuadra con la captura de la hoja GAC', () => {
    const r = cotizar(entrada, gac, Pgac);
    const m = (k: Concepto) => r.lineas.find(l => l.concepto === k)!.monto;
    cerca(r.subtotal, 25490, 'Precio de venta');
    cerca(m('iva'), 4078.40, 'IVA 16%');
    cerca(r.baseImponibleIgtf, 30048.40, 'Base Imponible IGTF');
    cerca(m('igtf'), 901.45, 'IGTF 3%');
    cerca(m('seguroVehiculo'), 562, 'Seguro Oceánica 12m');
    cerca(m('gps'), 320, 'GPS 12m');
    cerca(m('polizaVida'), 100, 'Póliza Oceánica 12m');
    cerca(m('placa'), 480, 'Placa');
    cerca(m('gastosAdmin'), 380, 'Gastos administrativos');
    cerca(m('traslado'), 560, 'Traslado y alistamiento');
    cerca(r.totalAPagar, 32871.85, 'Total a Pagar');
    cerca(r.comisionFlat, 1314.87, 'Comisión Flat 4%');
    cerca(r.saldoAFinanciar, 34186.73, 'Saldo a Financiar');
    cerca(r.cuotaMensual, 3166.87, 'Cuota mensual');
  });

  it('la comisión afecta la cuota: al 4% sale más alta que al 3%', () => {
    const al4 = cotizar(entrada, gac, Pgac).cuotaMensual;
    const al3 = cotizar(entrada, gac, { ...P, comisionFlat: 0.03 }).cuotaMensual;
    assert.ok(al4 > al3);
  });
});

/*
 * Aquí el motor NO da lo mismo que la hoja, y es a propósito. La hoja SHINERAY
 * busca el seguro con VLOOKUP(Datos!$AB$8 + 25, ...) y ese +25 se pasa una
 * fila: con X30 (Panel) cotiza la prima de EMPOW GS (un GAC). Además tiene los
 * gastos administrativos escritos a mano en 380 cuando la tabla dice 880.
 * Captura de la hoja: Seguro 550 · Gastos adm. 380 · Total 28.678,05.
 */
describe('SHINERAY X30 (Panel) · 12 meses · Oceánica (comisión 4%)', () => {
  const shy = modeloPorItem(26);
  const entrada: Entrada = {
    item: shy.item, cantidad: 1, plazo: 12, aseguradora: 'OCEANICA',
    ciudad: 'CARACAS', inicial: 0, financiamiento: 'FRANCES',
    financiado: { ...TODO_FINANCIADO },
  };

  it('caso 6 — usa la prima del modelo y los gastos de la tabla, no el defecto de la hoja', () => {
    const r = cotizar(entrada, shy, { ...P, comisionFlat: 0.04 });
    const m = (k: Concepto) => r.lineas.find(l => l.concepto === k)!.monto;
    cerca(r.subtotal, 21990, 'Precio de venta');
    cerca(m('iva'), 3518.40, 'IVA 16%');
    cerca(r.baseImponibleIgtf, 25988.40, 'Base imponible IGTF');
    cerca(m('igtf'), 779.65, 'IGTF 3%');
    cerca(m('gps'), 320, 'GPS 12m');
    cerca(m('polizaVida'), 100, 'Póliza Oceánica 12m');
    cerca(m('placa'), 480, 'Placa');
    cerca(m('traslado'), 560, 'Traslado y alistamiento');
    // Lo que a propósito NO coincide con la hoja.
    cerca(m('seguroVehiculo'), 520, 'Seguro (prima del modelo, la hoja cobra 550)');
    cerca(m('gastosAdmin'), 880, 'Gastos adm. (de la tabla, la hoja cobra 380)');
    cerca(r.comisionFlat, Math.round(r.totalAPagar * 0.04 * 100) / 100, 'Comisión Flat 4%');
  });
});

describe('cobertura del catálogo de prueba', () => {
  it('ningún modelo trae datos faltantes', () => {
    const sinDato = catalogo.modelos.filter(m =>
      !m.precio || m.gastosAdministrativos == null ||
      Object.values(m.primaSeguro12m).some(v => v == null));
    assert.deepEqual(sinDato.map(m => m.modelo), []);
  });

  it('toda combinación de modelo, plazo y aseguradora da una cuota válida', () => {
    for (const m of catalogo.modelos) {
      for (const plazo of [12, 18, 24, 36, 48] as Plazo[]) {
        for (const a of ['OCEANICA', 'BANESCO', 'MERCANTIL'] as Aseguradora[]) {
          const r = cotizar({ ...base(), item: m.item, plazo, aseguradora: a }, m, P);
          assert.ok(Number.isFinite(r.cuotaMensual) && r.cuotaMensual > 0,
            `${m.modelo} ${plazo}m ${a} → cuota ${r.cuotaMensual}`);
        }
      }
    }
  });
});
