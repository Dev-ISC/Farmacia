# Documentación de API — Farmacia (Persona 2)

**Proyecto:** Next.js (App Router) + TypeScript + Appwrite TablesDB  
**Versión:** 0.1 — integración en curso  
**Base de rutas:** `/api` (por ejemplo, `http://localhost:3000/api` en desarrollo)

> **Estado importante:** las consultas públicas de productos y categorías se probaron con datos reales de Appwrite. Los endpoints administrativos rechazaron correctamente peticiones sin sesión; **todavía no se probaron las operaciones reales con un usuario administrador autenticado**. No tratar esta documentación como certificación de producción.

## 1. Cómo consumir la API

Las interfaces de Next.js deben usar **rutas relativas**, por ejemplo `fetch('/api/productos')`. Todas las respuestas son JSON. No llamar a Appwrite con `APPWRITE_API_KEY` desde el navegador: esa clave es **privada y exclusiva del servidor**.

Las rutas administrativas usan `validarAdmin()`, que espera una sesión real de Appwrite en una cookie (`farmacia_session`, `appwrite-session` o `a_session_<PROJECT_ID>`), verifica la cuenta y consulta que su rol sea `admin` en la tabla Usuarios. Este flujo **está pendiente de integración con el login de la Persona 6**. Una cookie con el texto `admin` no concede acceso. Las cuentas deben tener correo verificado según la implementación actual.

## 2. Endpoints disponibles

| Método | Ruta | Acceso | Propósito |
|---|---|---|---|
| `GET` | `/api/productos` | Público | Listar medicamentos activos y categoría relacionada |
| `GET` | `/api/categorias` | Público | Listar categorías |
| `POST` | `/api/productos` | Administrador | Registrar medicamento |
| `PATCH` | `/api/productos/{id}` | Administrador | Editar nombre, descripción, precio o `activo` |
| `PATCH` | `/api/productos/{id}/stock` | Administrador | Establecer existencias absolutas |
| `GET` | `/api/pedidos` | Administrador | Listar pedidos recientes |
| `GET` | `/api/pedidos/{id}` | Administrador | Consultar pedido y detalles |
| `PATCH` | `/api/pedidos/{id}` | Administrador | Cambiar estado del pedido |

### 2.1 GET /api/productos

**Solicitud:** sin cuerpo. Obtiene **solo productos con `activo = true`**, como máximo **100** en la implementación actual. No hay paginación ni parámetros de búsqueda implementados.

**Respuesta de ejemplo (200):**

```json
{
  "total": 1,
  "productos": [
    {
      "id": "prod-ejemplo",
      "nombre": "Paracetamol 500mg",
      "descripcion": "Caja con tabletas",
      "sku": "FAR-PAR-500",
      "precio": 45.5,
      "stock": 10,
      "stock_minimo": 5,
      "activo": true,
      "categoria": {"id": "cat-analgesicos", "nombre": "Analgésicos y Antipiréticos"}
    }
  ]
}
```

`categoria` puede ser `null`; cuando Appwrite devuelve solo el ID, puede ser `{ "id": "...", "nombre": null }`. `stock_minimo` se muestra como 5 si Appwrite devuelve `null` o no lo proporciona; **no implica que se haya guardado 5 en la base de datos**. `total` representa el total reportado por Appwrite y puede ser mayor que la longitud de `productos` cuando hay más de 100 resultados.

**Consumidores:** Personas 3 y 5. La Persona 3 puede marcar alerta cuando `stock <= stock_minimo` y agotado cuando `stock === 0`; la Persona 5 puede filtrar usando `categoria.id` o `categoria.nombre`.

### 2.2 GET /api/categorias

**Solicitud:** sin cuerpo. Devuelve hasta 100 filas de Categorías, con estructura:

```json
{
  "total": 2,
  "categorias": [
    {"id": "cat-analgesicos", "nombre": "Analgésicos y Antipiréticos"},
    {"id": "cat-antibioticos", "nombre": "Antibióticos"}
  ]
}
```

**Advertencia:** actualmente no filtra `activa = true`; en las pruebas había nombres de categorías duplicados con distintos IDs. Coordinar una normalización de datos antes de asumir que un nombre identifica una sola categoría.

**Consumidor:** Persona 5.

### 2.3 POST /api/productos

**Acceso:** administrador autenticado. **Solicita JSON** con estos campos:

```json
{
  "nombre": "Medicamento de prueba",
  "sku": "TEST-001",
  "precio": 45.5,
  "stock": 12,
  "descripcion": "Descripción opcional",
  "categoria": "cat-analgesicos"
}
```

- **Obligatorios:** `nombre` (texto no vacío, máximo 150 caracteres), `sku` (texto no vacío, máximo 50), `precio` (número finito no negativo), `stock` (entero seguro no negativo).
- **Opcionales:** `descripcion` (texto), `categoria` (ID en texto de categoría existente).
- El servidor asigna `activo: true` y un ID nuevo.
- `stock_minimo` **no se recibe ni almacena explícitamente en este POST**; depende del valor por defecto de Appwrite.
- Se consulta si ya existe un SKU, pero esto **no garantiza unicidad ante peticiones simultáneas**. Crear índice `unique` sobre `sku` en Appwrite y manejar su error de conflicto.
- El ID de `categoria` solo se valida como cadena no vacía, **no se comprueba previamente su existencia**; una relación inválida podría producir 500.

**Respuesta prevista (201):** `{ "mensaje": "Producto registrado", "producto": { ...filaDeAppwrite } }`. **Pendiente de prueba con sesión admin real.**

**Consumidor:** Persona 3.

### 2.4 PATCH /api/productos/{id}

**Acceso:** administrador autenticado. Acepta cualquier combinación no vacía de `nombre`, `descripcion`, `precio`, `activo` con los tipos correspondientes. Rechaza campos desconocidos, incluido `stock`.

```json
{"nombre":"Nombre actualizado","precio":55,"activo":true}
```

**Baja lógica:** enviar `{ "activo": false }` (no borra la fila). El `GET /api/productos` deja de mostrarla debido al filtro de activos. Para reactivarla, `{ "activo": true }`.

**Respuesta prevista (200):** `{ "mensaje": "Producto actualizado correctamente", "producto": { ...filaDeAppwrite } }`. **Pendiente de prueba autenticada.** Un ID inexistente actualmente puede devolver 500 porque este handler no maneja de forma específica el 404 de Appwrite.

**Consumidor:** Persona 3.

### 2.5 PATCH /api/productos/{id}/stock

**Acceso:** administrador autenticado. Solo acepta `{ "stock": 15 }`, donde el valor es un entero no negativo. **Establece el total absoluto de existencias: NO incrementa ni descuenta.**

**Respuesta prevista (200):** `{ "mensaje": "Stock actualizado correctamente", "producto": { ...filaDeAppwrite } }`.

Utiliza `purchaseLockManager.runPurchaseTransaction([id], ...)`. Este mutex solo sincroniza solicitudes que comparten **el mismo proceso/instancia de Node.js** y el mismo gestor. No protege entre múltiples instancias, reinicios o actualizaciones directas en Appwrite. Verificar con Persona 1 la estrategia de concurrencia antes del despliegue.

**Consumidor:** Persona 3.

### 2.6 GET /api/pedidos

**Acceso:** administrador autenticado. Devuelve hasta 100 pedidos, ordenados por `$createdAt` descendente:

```json
{
  "total": 1,
  "pedidos": [
    {
      "$id": "pedido-ejemplo",
      "total": 45.5,
      "estado": "pagado",
      "direccion_envio": "Ejemplo de dirección",
      "usuario_id": "ID u objeto de usuario relacionado"
    }
  ]
}
```

**Importante:** el objeto de cada pedido es la **fila original de Appwrite** y puede incluir metadatos u otros campos. El ejemplo está abreviado. Esta respuesta contiene datos de clientes y nunca debe mostrarse públicamente. No hay paginación implementada.

**Consumidor:** Persona 4.

### 2.7 GET /api/pedidos/{id}

**Acceso:** administrador autenticado. Devuelve el pedido específico y hasta 100 detalles de `Detalle_pedido` relacionados mediante `pedidos_id`.

```json
{
  "pedido": {
    "id": "pedido-ejemplo",
    "usuario": "ID u objeto relacionado",
    "total": 45.5,
    "estado": "pagado",
    "direccionEnvio": "Ejemplo de dirección",
    "fecha": "2026-10-20T00:00:00.000+00:00"
  },
  "totalDetalles": 1,
  "detalles": [
    {
      "id": "detalle-ejemplo",
      "producto": {"$id":"prod-ejemplo","nombre":"Paracetamol 500mg"},
      "cantidad": 1,
      "precioUnitario": 45.5,
      "subtotal": 45.5
    }
  ]
}
```

El campo `producto` depende de cómo Appwrite expanda la relación; no dar por garantizada exactamente la forma del ejemplo hasta probar con una sesión real y un pedido existente. La ruta usa `Query.select(['*', 'producto_id.nombre'])`, cuya respuesta se debe verificar en integración.

**Consumidor:** Persona 4.

### 2.8 PATCH /api/pedidos/{id}

**Acceso:** administrador autenticado. Cuerpo JSON:

```json
{"estado":"enviado"}
```

**Estados válidos:** `pendiente`, `pagado`, `enviado`, `entregado`, `cancelado`.

**Transiciones admitidas por la implementación:**

- `pendiente` → `pagado` o `cancelado`
- `pagado` → `enviado` o `cancelado`
- `enviado` → `entregado`
- `entregado` y `cancelado` → sin cambios posteriores (repetir mismo estado devuelve mensaje de que ya estaba así)

**Respuesta prevista (200):** `{ "mensaje": "Estado actualizado correctamente", "pedido": { ...filaDeAppwrite } }`.

**Advertencias:** cancelar un pedido **no devuelve stock ni gestiona reembolsos**. Las transiciones se validan antes del `updateRow`, pero esta comprobación **no es atómica frente a dos administradores actualizando simultáneamente**. Coordinar reglas de negocio con Persona 1 antes de usar cancelaciones reales.

**Consumidor:** Persona 4.

## 3. Ejemplos de integración (Next.js)

### Persona 5: cargar catálogo y categorías

```typescript
const [respuestaProductos, respuestaCategorias] = await Promise.all([
  fetch('/api/productos', { cache: 'no-store' }),
  fetch('/api/categorias'),
]);

if (!respuestaProductos.ok || !respuestaCategorias.ok) {
  throw new Error('No se pudo cargar el catálogo');
}

const { productos } = await respuestaProductos.json();
const { categorias } = await respuestaCategorias.json();
```

### Persona 3: registrar o editar medicamento

```typescript
const respuesta = await fetch('/api/productos', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    nombre: 'Producto demo', sku: 'DEMO-001', precio: 25,
    stock: 8, categoria: 'cat-analgesicos',
  }),
});
const resultado = await respuesta.json();
if (!respuesta.ok) throw new Error(resultado.error ?? 'Error al registrar');
```

Para editar, usar `PATCH /api/productos/{id}`. Para cambiar stock, usar **únicamente** `PATCH /api/productos/{id}/stock`.

### Persona 4: monitor de ventas

```typescript
const respuesta = await fetch('/api/pedidos', {
  credentials: 'include',
  cache: 'no-store',
});
if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
const { pedidos } = await respuesta.json();
```

Para ver detalles: `GET /api/pedidos/{id}`. Para cambiar estado, `PATCH /api/pedidos/{id}` con `{ "estado": "enviado" }`.

### Persona 6: autenticación

El login debe generar y guardar de forma segura un **secreto de sesión auténtico de Appwrite**, no un ID de usuario ni una cookie de rol fabricada. El servidor verifica la sesión mediante Appwrite y busca `rol = 'admin'` en Usuarios. Usar cookie `HttpOnly`, `Secure` en producción y configuración `SameSite` apropiada. Asegurarse de que los clientes normales **no pueden crear/editar su propio rol admin en Appwrite**. Coordinar nombre exacto de cookie y cierre de sesión con `src/lib/auth/validar-admin.ts`.

## 4. Códigos HTTP principales

| Código | Interpretación |
|---|---|
| `200` | Consulta o modificación satisfactoria |
| `201` | Producto creado |
| `400` | Datos inválidos o campos no admitidos |
| `401` | Sesión faltante, inválida o expirada |
| `403` | Usuario autenticado sin permisos de administrador o correo sin verificar |
| `404` | Recurso no encontrado, cuando el handler lo maneja explícitamente |
| `409` | SKU existente o transición de pedido no permitida (según operación) |
| `500` | Error interno o de integración; revisar logs del servidor |

## 5. Estado real de las pruebas

| Comprobación | Resultado |
|---|---|
| `GET /api/productos` contra Appwrite | ✅ Probado, devuelve 6 productos en la prueba |
| `GET /api/categorias` contra Appwrite | ✅ Probado, devuelve 7 categorías en la prueba |
| Relación de categorías y `stock_minimo` en catálogo | ✅ Probado en navegador |
| `POST /api/productos` sin sesión | ✅ Devuelve `401`, sin comprobar creación |
| `PATCH /api/productos/{id}` sin sesión | ✅ Devuelve `401`, sin comprobar edición |
| `PATCH /api/productos/{id}/stock` sin sesión | ✅ Devuelve `401`, sin comprobar actualización |
| `GET /api/pedidos` y `/api/pedidos/{id}` sin sesión | ✅ Devuelven error de sesión; lectura real no comprobada |
| `PATCH /api/pedidos/{id}` sin sesión | ✅ Devuelve `401`, sin comprobar cambio real |
| `pnpm exec tsc --noEmit` | ✅ Sin errores en última prueba compartida |
| `pnpm exec eslint src/app/api src/lib/auth` | ✅ Sin errores en última prueba compartida |
| `pnpm build` | ✅ Pasó antes de los últimos ajustes; **repetir** al finalizar |
| Pruebas positivas con administrador real | ⏳ Pendientes de login de Persona 6 |
| Pruebas simultáneas de compras y stock | ⏳ Pendientes; mutex local no basta para múltiples instancias |

## 6. Pendientes antes de dar el backend por terminado

1. Integrar el login de Persona 6 y probar solicitudes **autenticadas** con cuenta admin real, no simulada.
2. Confirmar que `Usuarios.rol` no sea editable por clientes comunes; verificar identidad de Appwrite y vínculo seguro entre cuenta y fila de Usuario.
3. Crear o comprobar un **índice único para `Productos.sku`**, de modo que la unicidad no dependa de una consulta previa. [Documentación de índices](https://appwrite.io/docs/products/databases/tablesdb/tables).
4. Validar que `categoria` corresponda a una categoría existente y transformar errores previsibles de Appwrite a respuestas 400/404/409 apropiadas.
5. Revisar valores por defecto de `stock_minimo`, SKU, relaciones y restricciones en las columnas de Appwrite. El alta actual no permite configurar `stock_minimo`.
6. Añadir paginación, búsqueda y filtros cuando haya más de 100 productos, categorías, pedidos o detalles.
7. Revisar con Persona 1 transacciones, cancelaciones/restauración de inventario y despliegue con múltiples procesos o instancias.
8. Ajustar la respuesta de pedidos para exponer solo los campos que necesita la Persona 4, evitando incluir datos innecesarios de clientes.
9. Ejecutar nuevamente `pnpm exec tsc --noEmit`, `pnpm exec eslint src/app/api src/lib/auth` y `pnpm build` después de la integración final.

---

**Archivos clave:**

- `src/app/api/productos/route.ts` — GET y POST de productos
- `src/app/api/productos/[id]/route.ts` — edición y baja lógica
- `src/app/api/productos/[id]/stock/route.ts` — actualización de stock
- `src/app/api/categorias/route.ts` — catálogo de categorías
- `src/app/api/pedidos/route.ts` — listado de pedidos
- `src/app/api/pedidos/[id]/route.ts` — detalle y estado
- `src/lib/auth/validar-admin.ts` — autorización
- `src/lib/appwrite/server.ts` y `config.ts` — Appwrite del servidor
- `src/lib/concurrency/mutex.ts` — candados en memoria

**Nota:** Todos los ejemplos de IDs, medicamentos y personas de esta documentación son ilustrativos, salvo los resultados resumidos expresamente como pruebas realizadas.
