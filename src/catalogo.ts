/**
 * La forma del catálogo que administra el Panel Maestro (Supabase, tablas
 * `catalogo_*`) tal como la ven los consumidores, y su conversión a lo que el
 * motor necesita. Aquí NO se lee nada: cada consumidor trae las filas como
 * pueda (el cotizador web con supabase-js y su sesión; pedidosimb desde su
 * servidor) y las convierte con estas funciones, para que los dos coticen
 * exactamente igual.
 */

import type { Aseguradora, Marca, ModeloCatalogo, Parametros, Plazo } from './motor';

export interface ModeloFila {
  item: number;
  marca: string;
  modelo: string;
  precio: number;
  gastosAdministrativos: number;
  primaBANESCO: number;
  primaOCEANICA: number;
  primaMERCANTIL: number;
}

export interface CiudadFila {
  indice: number;
  ciudad: string;
  traslado: number;
  /**
   * Se le ofrece al cliente como destino de entrega. Desde la migración 007
   * del Panel la tabla también guarda los puntos de SALIDA (Guarenas,
   * Charallave, La Guaira) para armar rutas de flete: esos no se venden.
   */
  esPuntoEntrega: boolean;
}

export interface ConcesionarioFila { indice: number; concesionario: string; telefono: string }
export interface PlazoFila { plazo: number; gps: number; polizaOceanica: number; multiplicador: number }
export interface EscalonFila { cobertura: number; BANESCO: number; MERCANTIL: number }
export interface ParametroFila { clave: string; etiqueta: string; valor: number }
/** Listas descriptivas de la proforma: anio, color, motor, combustible, estado. */
export interface ListaFila { tipo: string; valor: string; orden: number }

export interface Catalogo {
  modelos: ModeloFila[];
  ciudades: CiudadFila[];
  concesionarios: ConcesionarioFila[];
  plazos: PlazoFila[];
  escalones: EscalonFila[];
  parametros: ParametroFila[];
  listas: ListaFila[];
}

export const PLAZOS: Plazo[] = [12, 18, 24, 36, 48];

export const ASEGURADORAS: { clave: Aseguradora | 'SIN_SEGURO'; nombre: string }[] = [
  { clave: 'OCEANICA', nombre: 'Oceánicas de Seguro' },
  { clave: 'BANESCO', nombre: 'Banesco Seguros' },
  { clave: 'MERCANTIL', nombre: 'Mercantil Seguros' },
  { clave: 'SIN_SEGURO', nombre: 'Sin seguro' },
];

export const nombreAseguradora = (clave: string): string =>
  ASEGURADORAS.find(a => a.clave === clave)?.nombre ?? 'Sin seguro';

/**
 * Convierte el catálogo en los parámetros que espera el motor.
 *
 * La comisión depende de la marca. En el Excel las tres hojas rotulan
 * "Comisión Flat 4%", pero la de DFSK calcula `(D32-F20)*3%` y las de SHINERAY
 * y GAC calculan `*4%`. Para que el cotizador dé lo mismo que la hoja hay que
 * respetar esa diferencia, así que se busca primero `comisionFlat_<MARCA>` y
 * solo si no existe se cae al valor general.
 */
export const aParametros = (c: Catalogo, marca?: string): Parametros => {
  const p = (clave: string, porDefecto: number) =>
    c.parametros.find(x => x.clave === clave)?.valor ?? porDefecto;
  const comision = marca
    ? p(`comisionFlat_${marca}`, p('comisionFlat', 0.04))
    : p('comisionFlat', 0.04);
  const porPlazo = <T,>(sel: (f: PlazoFila) => T) =>
    Object.fromEntries(c.plazos.map(f => [f.plazo, sel(f)])) as Record<Plazo, T>;

  return {
    iva: p('iva', 0.16),
    igtf: p('igtf', 0.03),
    placa: p('placa', 480),
    tasaAnual: p('tasaAnual', 0.20),
    comisionFlat: comision,
    multiplicadorSeguro: porPlazo(f => f.multiplicador),
    gpsPorPlazo: porPlazo(f => f.gps),
    polizaVidaOceanica: porPlazo(f => f.polizaOceanica),
    escalonesPolizaVida: [...c.escalones].sort((a, b) => a.cobertura - b.cobertura),
    trasladoPorCiudad: Object.fromEntries(c.ciudades.map(x => [x.ciudad, x.traslado])),
  };
};

/** La fila del catálogo, en la forma que el motor entiende. */
export const aModeloCatalogo = (m: ModeloFila): ModeloCatalogo => ({
  item: m.item,
  marca: m.marca as Marca,
  modelo: m.modelo,
  precio: m.precio,
  gastosAdministrativos: m.gastosAdministrativos,
  primaSeguro12m: { BANESCO: m.primaBANESCO, OCEANICA: m.primaOCEANICA, MERCANTIL: m.primaMERCANTIL },
});

/** Solo las ciudades donde de verdad se entrega. */
export const ciudadesDeEntrega = (c: Catalogo): CiudadFila[] =>
  c.ciudades.filter(x => x.esPuntoEntrega !== false);

/** Marcas presentes en el catálogo, ordenadas. */
export const marcasDelCatalogo = (c: Catalogo): string[] =>
  [...new Set(c.modelos.map(m => m.marca))].sort();

/** Valores de una lista descriptiva, en el orden definido en el Panel. */
export const valoresDeLista = (c: Catalogo, tipo: string): string[] =>
  c.listas.filter(l => l.tipo === tipo).sort((a, b) => a.orden - b.orden).map(l => l.valor);

/** Plazos que el Panel tiene cargados; si no hay, los cinco de la hoja. */
export const plazosDisponibles = (c: Catalogo): Plazo[] => {
  const cargados = c.plazos.map(p => p.plazo).filter((p): p is Plazo => PLAZOS.includes(p as Plazo));
  return (cargados.length ? cargados : [...PLAZOS]).sort((a, b) => a - b);
};
