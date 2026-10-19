# 🏥 Sistema de Farmacia — Concurrencia Estricta e Inventario en Tiempo Real

Proyecto desarrollado con **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4** y **Appwrite (`TablesDB` & `Realtime`)**.

> 🤖 **Nota para el equipo**: Si utilizas un asistente de IA (Cursor, Copilot, Antigravity, Claude, Windsurf, etc.), el archivo [`AGENTS.md`](./AGENTS.md) en la raíz ya tiene todas las reglas de arquitectura, IDs de base de datos, tipos y lo que le toca hacer a cada integrante para que tu IA trabaje sin romper nada.

---

## ⚙️ Configuración Inicial (Para todos los integrantes)

1. Clona el repositorio yUbícate en la carpeta del proyecto:
   ```bash
   pnpm install
   ```
2. Copia el archivo de ejemplo de variables de entorno:
   ```bash
   cp .env.example .env
   ```
   *(Pídele a **Daniel (Persona 1)** los valores del archivo `.env` por privado).*
3. Inicia el servidor de desarrollo:
   ```bash
   pnpm dev
   ```
4. Abre [http://localhost:3000](http://localhost:3000).

---

## 🏗️ Arquitectura y Regla de Oro de Concurrencia

```text
[ Navegador /cliente ]  ---(POST /api/comprar)--->  [ Next.js Server (Mutex FIFO) ]  --->  [ Appwrite TablesDB ]
         ^                                                                                          |
         |---------------------(WebSocket Realtime: useRealtimeStock)-------------------------------|
```

- **Dos interfaces en el mismo proyecto**:
  - `/cliente`: Tienda donde múltiples clientes (**Raul, Jean, Gabriela, Giovany, Juan**) ven el catálogo y compran simultáneamente.
  - `/servidor`: Dashboard administrativo (**Daniel**) donde se gestiona el CRUD de productos, stock y monitor de ventas en tiempo real.
- **Regla de Oro (`CLIENTE <-> SERVIDOR -> BD`)**:
  - El cliente **NUNCA** descuenta el stock directamente en Appwrite.
  - Toda compra se envía a `POST /api/comprar` (`src/app/api/comprar/route.ts`), donde un **Mutex FIFO en el servidor** (`src/lib/concurrency/mutex.ts`) procesa las compras en fila una por una, impidiendo condiciones de carrera (*race conditions*) y evitando que el stock baje de `0`.

---

## 📦 Módulos Base Listos para Usar (Creados por Persona 1)

| Archivo | Qué contiene / Cómo usarlo |
| :--- | :--- |
| [`src/types/database.ts`](./src/types/database.ts) | Interfaces TypeScript de las 6 tablas (`Usuario`, `Categoria`, `Producto`, `CarritoItem`, `Pedido`, `DetallePedido`) y payloads de `/api/comprar`. |
| [`src/lib/appwrite/client.ts`](./src/lib/appwrite/client.ts) | SDK Web (`appwrite`) para el navegador: `tablesDB`, `realtime`, `account`, `storage`, `Channel`, `Query`, `ID`. |
| [`src/lib/appwrite/server.ts`](./src/lib/appwrite/server.ts) | SDK Servidor (`node-appwrite`): `createAdminClient()` con `APPWRITE_API_KEY` para operaciones privilegiadas en el backend. |
| [`src/hooks/useRealtimeStock.ts`](./src/hooks/useRealtimeStock.ts) | Hook de 1 línea: `const { productos, stockPorId, cargando, conectadoRealtime } = useRealtimeStock();` para que el stock cambie en vivo en todas las pantallas sin recargar. |
| [`src/app/api/comprar/route.ts`](./src/app/api/comprar/route.ts) | Endpoint transaccional `POST /api/comprar` con Mutex, validación de stock en tiempo real, respuesta `409 Conflict` si se agota, y Rollback compensatorio. |
| [`middleware.ts`](./middleware.ts) | Protege `/servidor/:path*` (solo rol `'admin'`) y `/cliente/carrito/:path*` (requiere sesión activa). |

---

## 👥 División del Equipo (6 Personas)

| Integrante | Rol / Módulo | Responsabilidades Principales |
| :--- | :--- | :--- |
| **Persona 1 (Daniel)** | Arquitecto / BD, Concurrencia, Middleware y Realtime | ✅ Configuración del repo, ramas protegidas, 6 tablas en Appwrite, Mutex FIFO, `POST /api/comprar` y hook `useRealtimeStock`. |
| **Persona 2** | Backend / Servicios CRUD (`Servidor -> BD`) | Crear funciones/endpoints para: 1) Obtener catálogo y categorías, 2) Alta, baja lógica (`activo = false`) y edición de productos/stock (`Productos`), 3) Consulta de pedidos e historial de ventas (`Pedidos` y `Detalle_pedido`). |
| **Persona 3** | Interfaz Servidor (Dashboard & CRUD Inventario) | Construir `/servidor` (panel administrativo): tabla de productos en vivo con botones para Crear medicamento, Editar precio/stock, Desactivar (`activo = false`) y alertas visuales en rojo cuando haya poco stock o esté agotado (`stock === 0`). |
| **Persona 4** | Interfaz Servidor (Monitor de Ventas en Vivo) | Construir la sección de Ventas en `/servidor`: pantalla en tiempo real donde se ven las compras entrantes (quién compró, qué producto, cuántos quedan) y permite cambiar el estado del pedido (`pagado`, `enviado`, `entregado`, `cancelado`). |
| **Persona 5** | Interfaz Cliente (Catálogo, Buscador y Stock en Vivo) | Construir `/cliente`: grid de medicamentos con filtro por `Categorias`, buscador, y etiqueta en vivo `"Disponibles: X"` usando `useRealtimeStock` (cambia a `"Agotado"` y bloquea el botón si llega a `0`). |
| **Persona 6** | Interfaz Cliente (Carrito, Checkout y Login) | Construir `/login` (identificar usuario y guardar cookies `farmacia_session` y `farmacia_rol`) y Carrito (`/cliente/carrito`): validar que la cantidad no supere el stock y botón de Confirmar Compra hacia `POST /api/comprar` (mostrando recibo en `201` o alerta de stock agotado en `409`). |
