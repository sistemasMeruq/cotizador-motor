# @meruq/cotizador-motor

Motor de cálculo del cotizador de IMB Movilidad. Replica la hoja
`Plantilla_IMB_Master.xlsx`: mismas líneas, mismo orden y misma aritmética.
Es el **único** lugar donde vive la fórmula; lo consumen:

- **pedidosimb** (`SistemaOrdenVentasIMB`), en el módulo Cotizador nativo.
- **cotizador web** (`simulador-de-costos-imb-movilidad`), el que usan los
  concesionarios y donde vive el Panel Maestro.

No lee catálogo, no toca red ni DOM. Recibe una `Entrada`, un `ModeloCatalogo`
y unos `Parametros`, y devuelve el `Resultado`. `catalogo.ts` describe la forma
del catálogo del Panel Maestro y lo convierte a lo que el motor espera, para
que los dos consumidores coticen exactamente igual.

## Uso

```ts
import { cotizar, aParametros, aModeloCatalogo, TODO_FINANCIADO } from '@meruq/cotizador-motor';

const parametros = aParametros(catalogo, 'DFSK');
const modelo = aModeloCatalogo(catalogo.modelos[0]);
const r = cotizar({
  item: modelo.item, cantidad: 1, plazo: 18, inicial: 0,
  aseguradora: 'BANESCO', ciudad: 'CARACAS', financiamiento: 'FRANCES',
  financiado: { ...TODO_FINANCIADO },
}, modelo, parametros);
r.cuotaMensual; // 1577.03
```

## Cómo se consume

Se distribuye como **fuente TypeScript** por dependencia git, fijada a una
etiqueta de versión:

```json
"@meruq/cotizador-motor": "github:sistemasMeruq/cotizador-motor#v0.1.0"
```

- Next.js: agregar `transpilePackages: ["@meruq/cotizador-motor"]` en
  `next.config.ts`.
- Vite: no hace falta nada.

Un cambio en la fórmula es un commit aquí, una etiqueta nueva
(`git tag v0.2.0 && git push --tags`) y subir la versión en cada consumidor.
Así los dos sistemas cambian de fórmula a propósito, nunca por accidente.

## Pruebas

```
npm install
npm test
```

Los casos salen de capturas del Excel (C31 Box, GAC EMZOOM GB, SHINERAY X30).
`test/catalogo-2026-08.json` es la extracción del Excel de agosto 2026: es un
fixture, no el catálogo vivo.

## Decisiones que el motor respeta

- **La comisión depende de la marca** (DFSK 3 %, SHINERAY y GAC 4 %), aunque
  las tres hojas rotulen 4 %. `aParametros` busca `comisionFlat_<MARCA>`.
- **Lo desmarcado no desaparece**: sale de la cuota y se paga de contado en la
  inicial (`pagoTotalInicial`).
- **SHINERAY**: el motor usa la prima del modelo y los gastos de la tabla; la
  hoja tiene un defecto de VLOOKUP y valores a mano. Está documentado en las
  pruebas (caso 6).
