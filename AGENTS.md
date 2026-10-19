<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# 🏥 CONTEXTO DEL PROYECTO PARA AGENTES DE IA (SISTEMA DE FARMACIA)

Este repositorio contiene el **Sistema de Farmacia con Manejo Estricto de Concurrencia e Inventario en Tiempo Real**, construido con **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4** y **Appwrite (`TablesDB` / `Realtime`)** como Backend-as-a-Service.

Si eres un agente de IA asistiendo a alguno de los integrantes del equipo (**Daniel, Raul, Jean, Gabriela, Giovany o Juan**), **DEBES LEER Y RESPETAR ESTRICTAMENTE** esta arquitectura y los módulos que ya fueron construidos por el Arquitecto (Persona 1).

---

## 🚨 REGLAS DE ORO DE LA ARQUITECTURA (NO VIOLAR)

1. **Prohibido descontar stock desde el navegador (`CLIENTE <-> SERVIDOR -> BD`)**:
   - El frontend del cliente (`src/app/cliente/...`) **JAMÁS** debe llamar a `tablesDB.updateRow` ni `databases.updateDocument` sobre la tabla `Productos` para restar `stock`.
   - **TODA compra debe enviarse exclusivamente a `POST /api/comprar`** (`src/app/api/comprar/route.ts`), el cual ya cuenta con un **Mutex FIFO en memoria** (`src/lib/concurrency/mutex.ts`), verificación de stock en tiempo real, respuesta HTTP `409 Conflict` cuando un producto se agota y Rollback compensatorio automático.
2. **No recrear clientes de Appwrite ni redefinir interfaces**:
   - **Tipos oficiales**: Importar siempre desde `@/types/database` (`src/types/database.ts`).
   - **Cliente Web (Navegador / Realtime)**: Importar `client`, `tablesDB`, `realtime`, `APPWRITE_CONFIG`, `Query`, `ID` desde `@/lib/appwrite/client`.
   - **Cliente Servidor (Node.js con API Key)**: Importar `createAdminClient`, `APPWRITE_CONFIG`, `Query`, `ID` desde `@/lib/appwrite/server`.
   - **Hook de Stock en Tiempo Real**: Importar `useRealtimeStock` desde `@/hooks/useRealtimeStock`.
3. **API de Appwrite (`TablesDB`)**:
   - Este proyecto utiliza la API moderna **`TablesDB`** de Appwrite (`tablesDB.listRows`, `tablesDB.getRow`, `tablesDB.createRow`, `tablesDB.updateRow`, `tablesDB.deleteRow`), donde los resultados vienen en `respuesta.rows` (no `documents`).
4. **Rutas separadas en el mismo proyecto Next.js**:
   - `/cliente`: Tienda para los clientes (`Raul`, `Jean`, `Gabriela`, `Giovany`, `Juan`).
   - `/cliente/carrito`: Vista/Drawer del carrito y checkout (protegida por `middleware.ts`).
   - `/servidor`: Dashboard administrativo y monitor de ventas en vivo (protegido por `middleware.ts`, requiere rol `'admin'`).
   - `/login`: Pantalla de inicio de sesión / cambio rápido de usuario.

---

## 🗄️ ESQUEMA REAL EN APPWRITE (6 Tablas en `TablesDB`)

Los nombres exactos de las columnas en la base de datos de Appwrite Cloud (`https://backend.d4niel.dev/v1`) ya están tipados en `src/types/database.ts`:

1. **`Usuarios`** (`APPWRITE_CONFIG.tables.usuarios`):
   - `nombre` (`varchar`, req), `email` (`email`, req), `telefono` (`varchar`, opc), `direccion` (`text`, opc), `rol` (`enum: 'cliente' | 'admin'`, req).
2. **`Categorias`** (`APPWRITE_CONFIG.tables.categorias`):
   - `nombre` (`varchar`, req), `descripcion` (`text`, opc), `activa` (`boolean`, default `true`), `productos` (relación 2-way).
3. **`Productos`** (`APPWRITE_CONFIG.tables.productos`):
   - `nombre` (`varchar`, req), `sku` (`varchar`, req), `descripcion` (`text`, opc), `precio` (`double`, req), `stock` (`integer`, min: `0`, req), `stock_minimo` (`integer`, default: `5`), `activo` (`boolean`, req), `categoria` (relación `manyToOne` hacia `Categorias`).
4. **`Carrito_items`** (`APPWRITE_CONFIG.tables.carritoItems`):
   - `usuario` (relación `manyToOne` hacia `Usuarios`), `producto` (relación `manyToOne` hacia `Productos`), `cantidad` (`integer`, min: `1`, req).
5. **`Pedidos`** (`APPWRITE_CONFIG.tables.pedidos`):
   - `usuario_id` (relación `manyToOne` hacia `Usuarios`), `total` (`double`, req), `estado` (`enum: 'pendiente' | 'pagado' | 'enviado' | 'entregado' | 'cancelado'`, req), `direccion_envio` (`text`, req).
   - ⚠️ **Nota importante**: La columna de relación en `Pedidos` se llama **`usuario_id`** (no `usuario`).
6. **`Detalle_pedido`** (`APPWRITE_CONFIG.tables.detallePedido`):
   - `pedidos_id` (relación `manyToOne` hacia `Pedidos`), `producto_id` (relación `manyToOne` hacia `Productos`), `cantidad` (`integer`, min: `1`, req), `precio_unitario` (`double`, req).
   - ⚠️ **Nota importante**: Las columnas de relación en `Detalle_pedido` se llaman **`pedidos_id`** y **`producto_id`**.

### 👥 Usuarios Iniciales (Seed en Appwrite)
| `$id` | `nombre` | `email` | `rol` |
| :--- | :--- | :--- | :--- |
| `user-daniel` | **Daniel** | `daniel@farmacia.com` | `'admin'` |
| `user-raul` | **Raul** | `raul@farmacia.com` | `'cliente'` |
| `user-jean` | **Jean** | `jean@farmacia.com` | `'cliente'` |
| `user-gabriela` | **Gabriela** | `gabriela@farmacia.com` | `'cliente'` |
| `user-giovany` | **Giovany** | `giovany@farmacia.com` | `'cliente'` |
| `user-juan` | **Juan** | `juan@farmacia.com` | `'cliente'` |

### 💊 Productos Iniciales (Seed en Appwrite)
- `prod-paracetamol-500` (Paracetamol 500mg - Categoría: `cat-analgesicos`)
- `prod-ibuprofeno-400` (Ibuprofeno 400mg - Categoría: `cat-analgesicos`)
- `prod-amoxicilina-500` (Amoxicilina 500mg - Categoría: `cat-antibioticos`)
- `prod-azitromicina-500` (Azitromicina 500mg - Categoría: `cat-antibioticos`)
- `prod-vitamina-c-1g` (Vitamina C 1g Efervescente - Categoría: `cat-vitaminas`)
- `prod-complejo-b` (Complejo B Forte - Categoría: `cat-vitaminas`)

---

## 👥 DIVISIÓN DE ROLES Y QUÉ LE TOCA A CADA INTEGRANTE

Para evitar conflictos de Git (`merge conflicts`), cada integrante debe trabajar únicamente en los archivos de su módulo:

### ✅ Persona 1: Arquitecto / Base de Datos & Concurrencia (COMPLETADO - NO MODIFICAR)
- **Archivos ya listos**:
  - `src/types/database.ts`
  - `src/lib/appwrite/config.ts`, `src/lib/appwrite/client.ts`, `src/lib/appwrite/server.ts`
  - `src/lib/concurrency/mutex.ts`
  - `src/app/api/comprar/route.ts`
  - `src/hooks/useRealtimeStock.ts`
  - `middleware.ts`

---

### 🛠️ Persona 2: Backend / Servicios CRUD (`Servidor -> BD`)
- **Objetivo**: Crear las funciones/endpoints de conexión entre el Servidor y la BD (usando `createAdminClient()` de `@/lib/appwrite/server`):
  1. **Obtener catálogo y categorías**: Endpoints o servicios en `src/services/` y/o `src/app/api/productos/route.ts` y `src/app/api/categorias/route.ts`.
  2. **Alta, baja lógica (`activo = false`) y edición de productos/stock (`Productos`)**: Crear producto (`tablesDB.createRow`), actualizar precio/stock/datos (`tablesDB.updateRow`) y desactivar producto (`activo: false`).
  3. **Consulta de pedidos e historial de ventas (`Pedidos` y `Detalle_pedido`)**: Obtener lista de pedidos con sus detalles y endpoint para actualizar el `estado` de un pedido (`'pendiente' | 'pagado' | 'enviado' | 'entregado' | 'cancelado'`).

---

### 🖥️ Persona 3: Interfaz Servidor (Dashboard & CRUD Inventario)
- **Ruta sugerida**: `src/app/servidor/page.tsx` (y componentes en `src/components/servidor/`).
- **Objetivo**:
  - Construir el panel administrativo "Farmacia Interfaz Servidor".
  - Usar `useRealtimeStock()` en 1 línea para mostrar la tabla de productos siempre actualizada en vivo.
  - Botones y modales/formularios para **Crear nuevo medicamento**, **Editar precio/stock** y **Desactivar (`activo = false`)** consumiendo los servicios/endpoints de la Persona 2.
  - **Indicadores visuales**: Alertas en amarillo/naranja cuando `stock <= stock_minimo` y alerta en **rojo** cuando el producto esté agotado (`stock === 0`).

---

### 📈 Persona 4: Interfaz Servidor (Monitor de Ventas en Vivo)
- **Ruta sugerida**: `src/app/servidor/ventas/page.tsx` (o pestaña/sección dentro de `/servidor` en `src/components/servidor/MonitorVentas.tsx`).
- **Objetivo**:
  - Construir la vista en tiempo real de "Ventas / Pedidos".
  - Suscribirse en tiempo real a la tabla `Pedidos` (`Channel.tablesdb(APPWRITE_CONFIG.databaseId).table(APPWRITE_CONFIG.tables.pedidos).row()`) y/o usar los endpoints de Persona 2 para ver al instante las compras que entran de los clientes (quién compró mediante `usuario_id`, qué productos mediante `Detalle_pedido`, total pagado y stock restante).
  - Permitir cambiar el `estado` del pedido (`pagado`, `enviado`, `entregado`, `cancelado`).

---

### 🛒 Persona 5: Interfaz Cliente (Catálogo, Buscador y Stock en Vivo)
- **Ruta sugerida**: `src/app/cliente/page.tsx` (y componentes en `src/components/cliente/`).
- **Objetivo**:
  - Construir la tienda ("Interfaz Cliente") donde entran **Raul, Jean, Gabriela, Giovany y Juan**.
  - Usar `const { productos, stockPorId, cargando, conectadoRealtime } = useRealtimeStock({ soloActivos: true });` para que el catálogo se actualice solo sin recargar la página.
  - Grid de medicamentos con **filtro por `Categorias`** y **barra de búsqueda** (por `nombre` o `sku`).
  - Etiqueta en vivo de **`"Disponibles: X"`**: si `stock === 0`, debe cambiar automáticamente a **`"Agotado"`** y deshabilitar el botón de agregar al carrito.

---

### 🔐 Persona 6: Interfaz Cliente (Carrito, Checkout y Login)
- **Rutas sugeridas**: `src/app/login/page.tsx` y `src/app/cliente/carrito/page.tsx` (o Drawer de Carrito en `src/components/cliente/Carrito.tsx`).
- **Objetivo**:
  1. **Pantalla de Login/Selector rápido (`/login`)**:
     - Permitir iniciar sesión o seleccionar rápidamente quién es el usuario activo (**Daniel** como `'admin'`, o **Raul, Jean, Gabriela, Giovany, Juan** como `'cliente'`).
     - **IMPORTANTE para compatibilidad con `middleware.ts`**: Al iniciar sesión, guardar las cookies `farmacia_session=<userId>` y `farmacia_rol=<'admin' | 'cliente'>` (ej. `document.cookie = "farmacia_session=user-raul; path=/"` y `document.cookie = "farmacia_rol=cliente; path=/"`).
  2. **Vista / Drawer del Carrito (`Carrito_items`)**:
     - Mostrar los productos agregados y validar que el input de `cantidad` **no permita seleccionar más unidades que el `stock` disponible en vivo** (`stockPorId[productoId]`).
  3. **Botón de Confirmar Compra (`POST /api/comprar`)**:
     - Enviar `fetch('/api/comprar', { method: 'POST', body: JSON.stringify({ usuarioId, direccionEnvio, items }) })`.
     - Manejar las dos respuestas posibles del servidor:
       - **HTTP `201` (`ok: true`)**: Mostrar recibo/resumen de compra exitosa con el folio del pedido (`pedido.$id`) y total.
       - **HTTP `409` (`ok: false, codigo: 'STOCK_INSUFICIENTE'`)**: Mostrar alerta clara al usuario (ej. *"Alguien más ganó el último producto o no hay stock suficiente: quedan X disponibles"*).
