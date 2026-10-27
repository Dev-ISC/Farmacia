# Product Requirements Document (PRD) — Sistema de Farmacia con Concurrencia Estricta e Inventario en Tiempo Real

## 1. Visión General del Producto
Sistema integral de Farmacia construido con **Next.js 16 (App Router) + TypeScript + Tailwind CSS v4** y **Appwrite Cloud (`TablesDB` y `Realtime`)**. El sistema permite a múltiples clientes explorar el catálogo de medicamentos y realizar compras concurrentes con actualización de stock en vivo por WebSockets, mientras que los administradores gestionan el inventario (alta, edición de precios y stock, baja lógica) en tiempo real.

- **URL Local de Pruebas**: `http://localhost:3000`
- **Exclusión actual de alcance (En desarrollo)**: La vista `/servidor/ventas` (Monitor de Ventas en Vivo - Persona 4) aún no está implementada en el frontend y **NO debe incluirse en las pruebas E2E actuales**.

---

## 2. Usuarios y Credenciales de Prueba

La pantalla `/login` cuenta con **Selección Rápida de Perfiles** (botones de 1 clic que inician sesión automáticamente) y con un **Formulario Manual** de correo y contraseña:

| Usuario | Email | Contraseña | Rol | Acceso Permitido |
| :--- | :--- | :--- | :--- | :--- |
| **Daniel** | `daniel@farmacia.com` | `Farmacia123!` | `admin` | `/servidor`, `/cliente`, `/cliente/carrito` |
| **Raul** | `raul@farmacia.com` | `Farmacia123!` | `cliente` | `/cliente`, `/cliente/carrito` (Redirige si intenta `/servidor`) |
| **Jean** | `jean@farmacia.com` | `Farmacia123!` | `cliente` | `/cliente`, `/cliente/carrito` |
| **Gabriela** | `gabriela@farmacia.com` | `Farmacia123!` | `cliente` | `/cliente`, `/cliente/carrito` |
| **Giovany** | `giovany@farmacia.com` | `Farmacia123!` | `cliente` | `/cliente`, `/cliente/carrito` |
| **Juan** | `juan@farmacia.com` | `Farmacia123!` | `cliente` | `/cliente`, `/cliente/carrito` |

---

## 3. Rutas y Funcionalidades a Probar (Alcance Activo)

### 3.1. Página de Inicio (`/`) — Panel de Estado & Accesos
- Muestra el estado de conexión con **Appwrite Backend** (`En Línea` / `Conectando...`) y la latencia de la API (`/api/categorias`).
- Muestra métricas en tiempo real del stock activo (`X medicamentos (Y unid.)`).
- Incluye tarjetas de navegación hacia **Tienda y Catálogo (`/cliente`)** y **Selector de Usuario (`/login`)**, además de la documentación visual de los 8 endpoints de la API y códigos HTTP.
- *(Nota: La tarjeta "Interfaz Servidor" en `/` muestra estado "Pendiente" intencionalmente hasta que se complete el módulo de Ventas de la Persona 4, pero la ruta `/servidor` es accesible directamente o al iniciar sesión como `admin`).*

### 3.2. Autenticación y Control de Acceso (`/login`, `middleware.ts` y `validarAdmin`)
- **Redirección de Navegación UX (`middleware.ts`) vs Autorización Criptográfica en Servidor (`validarAdmin`)**:
  - `src/middleware.ts` actúa únicamente como filtro de navegación en el cliente: si no detecta cookies de sesión redirige a `/login?redirect=...`, y si el rol indicado en cookie es `cliente` redirige fuera de `/servidor` hacia `/cliente`. **Estas cookies (`farmacia_session` y `farmacia_rol`) no constituyen autorización de seguridad por sí solas.**
  - La autorización real de operaciones administrativas se ejecuta en el servidor dentro de cada Route Handler mediante `validarAdmin()` (`src/lib/auth/validar-admin.ts`), el cual verifica criptográficamente el JWT firmado por Appwrite (`farmacia_jwt`) o el secreto de sesión nativo de Appwrite y comprueba en la tabla `Usuarios` que el registro tenga `rol === 'admin'`.
- **Inicio de Sesión (`/login`)**:
  - Permite iniciar sesión con 1 clic mediante las tarjetas de "Selección Rápida de Perfiles" o ingresando correo y contraseña (`Farmacia123!`).
  - Consulta de forma autoritativa el rol del usuario en la tabla `Usuarios` de Appwrite y sincroniza las cookies `farmacia_session`, `farmacia_rol` (`admin` o `cliente`) y `farmacia_jwt` (con atributo `Secure` en HTTPS).
  - Si el usuario es `admin` (Daniel), redirige a `/servidor`. Si es `cliente` (Raul, Jean, etc.), redirige a `/cliente`.
  - Permite cerrar sesión limpiando cookies y el carrito local.

### 3.3. Interfaz Cliente: Catálogo y Stock en Tiempo Real (`/cliente`) — Persona 5
- **Sincronización en Vivo (`useRealtimeStock`)**: Muestra únicamente los productos con `activo: true` y su cantidad disponible en tiempo real (`Disponibles: X`).
- **Buscador Reactivo**: Input (`placeholder="Buscar por medicamento o SKU..."`) que filtra instantáneamente por nombre del medicamento o código SKU, con botón `✕` para limpiar la búsqueda.
- **Filtro por Categorías**: Selector desplegable (`aria-label="Filtrar por categoría"`) que carga las categorías desde `GET /api/categorias` y filtra el grid de medicamentos.
- **Comportamiento de Stock y Carrito**:
  - Si un medicamento tiene `stock > 0`, el botón `+ Agregar` añade 1 unidad al carrito (`localStorage` + estado sincronizado) y cambia temporalmente a `✓ Agregado`.
  - Si un medicamento tiene `stock === 0`, muestra la etiqueta en rojo **`Agotado`** y el botón `+ Agregar` permanece deshabilitado (`disabled`).

### 3.4. Interfaz Cliente: Carrito y Checkout Transaccional (`/cliente/carrito` y Drawer) — Persona 1 y Persona 6
- **Drawer Rápido y Página Completa**:
  - En `/cliente`, el botón `Carrito` en la barra superior abre el Drawer lateral con los productos agregados.
  - El botón `Ir al Carrito y Checkout →` lleva a `/cliente/carrito`.
- **Gestión de Cantidades y Límites de Stock**:
  - Permite modificar la cantidad de cada medicamento mediante un input numérico (`min="1"`, `max={stockDisponible}`). No permite superar el stock disponible en vivo.
  - Permite eliminar productos individuales con el botón `✕`.
  - Si el carrito está vacío, ofrece botones rápidos para agregar productos de prueba (`Agregar productos de prueba`).
- **Confirmación de Compra (`POST /api/comprar`)**:
  - Requiere ingresar una **Dirección de entrega** (`placeholder="Calle, número, colonia"`). Sin dirección o sin productos, el botón de confirmación permanece deshabilitado.
  - Al hacer clic en `Confirmar y Pagar`, envía la petición a `POST /api/comprar` protegida por el **Mutex FIFO en el servidor**.
  - **Caso Exitoso (HTTP 201)**: Muestra el recibo de compra con el mensaje `"¡Compra procesada exitosamente!"`, el **Folio** del pedido (`pedido.$id`), **Total pagado** y **Estado** (`PAGADO`), vacía el carrito y limpia el estado de confirmación al cerrar el drawer o agregar nuevos productos para permitir compras consecutivas sin recargar la página.
  - **Caso Conflicto de Stock (HTTP 409)**: Muestra alerta en rojo `"No se pudo completar la compra"` detallando qué medicamento no tiene stock suficiente.

### 3.5. Interfaz Servidor: Gestión de Inventario CRUD (`/servidor`) — Persona 2 y Persona 3
- **Acceso**: Exclusivo para administradores verificados en la tabla `Usuarios` (ej. `daniel@farmacia.com`).
- **Tarjetas de Métricas Interactivas (KPIs)**:
  - 4 tarjetas que también funcionan como filtros rápidos al hacer clic: **Medicamentos** (todos), **Stock Total** (con stock > 0), **Poco Stock** (`0 < stock <= stock_minimo`), y **Agotados** (`stock === 0`).
- **Buscador y Filtro por Categoría**: Igual que en la tienda cliente, pero incluyendo tanto medicamentos activos como inactivos (`soloActivos: false`).
- **Indicadores Visuales en Tarjetas**:
  - **Disponible**: Punto verde esmeralda (`Disponibles: X`).
  - **Poco Stock**: Borde ámbar y punto ámbar (`Poco stock: X`).
  - **Agotado**: Borde rojo y punto rojo pulsante (`Agotado (0)`).
  - **Inactivo (`activo: false`)**: Tarjeta con borde punteado (`border-dashed`), contenido atenuado (`Inactivo · Oculto en tienda`) y botón verde **`Activar`** de 1 clic.
- **Crear Medicamento (`+ Registrar Medicamento` -> `POST /api/productos`)**:
  - Abre modal con formulario: Nombre comercial (`*`), Código SKU (`*`), Precio (`*`), Stock Inicial (`*`), Mínimo Alerta (opcional, por defecto `5`), Categoría y Descripción.
  - **Validación de `stock_minimo`**: Tanto el formulario como la API validan que `stock_minimo` sea un número entero seguro no negativo (`>= 0`). Si se envía un `stock_minimo < 0` o no entero, la API lo rechaza con **`HTTP 400 Bad Request`**.
  - Valida campos obligatorios y que el SKU no esté duplicado (`HTTP 409 Conflict` si ya existe).
- **Editar Medicamento y Baja Lógica (`Editar` -> `PATCH /api/productos/[id]` y `PATCH /api/productos/[id]/stock`)**:
  - Abre modal de edición para modificar **Nombre Comercial**, **Precio ($ MXN)**, **Stock Absoluto**, **Descripción** y un **Toggle Switch (`role="switch"`)** para activar o desactivar el medicamento (`activo: true/false`).
  - Al desactivar un medicamento (`activo: false`), desaparece inmediatamente del catálogo de `/cliente` y muestra el botón `Activar` en `/servidor`.

---

## 4. Endpoints Backend Involucrados (8 Rutas REST)
1. `POST /api/comprar` — Procesa compras con Mutex FIFO, descuento de stock en Appwrite, creación de pedido/detalles y **compensación de mejor esfuerzo (best-effort rollback)** si ocurre un fallo parcial durante las escrituras (si una operación de reversión falla, el error se registra en los logs del servidor). Nota: el handler recibe `usuarioId` en el cuerpo JSON de la petición y valida que sea una cadena no vacía (no valida cookie de sesión en el endpoint).
2. `GET /api/productos` — Catálogo de medicamentos y relaciones activas (Público).
3. `POST /api/productos` — Alta de nuevos medicamentos en catálogo, incluyendo validación de `stock_minimo >= 0` (Admin — protegido por `validarAdmin`).
4. `PATCH /api/productos/[id]` — Edición y baja lógica (`activo = false`) (Admin — protegido por `validarAdmin`).
5. `PATCH /api/productos/[id]/stock` — Ajuste manual de stock e inventario bajo Mutex (Admin — protegido por `validarAdmin`).
6. `GET /api/categorias` — Clasificación de categorías activas (Público).
7. `GET /api/pedidos` — Consulta de pedidos recientes ordenados por fecha de creación (Admin — protegido por `validarAdmin`, incluye `GET /api/pedidos/[id]` para detalles del pedido).
8. `PATCH /api/pedidos/[id]` — Cambio de estado del pedido (`pagado`, `enviado`, `entregado`, `cancelado`) con validación de transiciones (Admin — protegido por `validarAdmin`).
