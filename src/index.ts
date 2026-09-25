export {
  cotizar, primaSeguro, polizaVida, cuotaLineal, cuotaFrances,
  CONCEPTOS, ETIQUETAS, TODO_FINANCIADO,
} from './motor';
export type {
  Plazo, Aseguradora, Financiamiento, Marca, Concepto,
  ModeloCatalogo, Parametros, Entrada, LineaResultado, Resultado,
} from './motor';

export {
  aParametros, aModeloCatalogo, ciudadesDeEntrega, marcasDelCatalogo,
  valoresDeLista, plazosDisponibles, nombreAseguradora,
  ASEGURADORAS, PLAZOS,
} from './catalogo';
export type {
  Catalogo, ModeloFila, CiudadFila, ConcesionarioFila, PlazoFila,
  EscalonFila, ParametroFila, ListaFila,
} from './catalogo';
