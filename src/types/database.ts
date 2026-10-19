import type { Models } from 'appwrite';

// ==========================================
// ENUMS DEL ESQUEMA (APPWRITE CLOUD - DB "Farmacia")
// ==========================================

export type RolUsuario = 'cliente' | 'admin';

export type EstadoPedido =
  | 'pendiente'
  | 'pagado'
  | 'enviado'
  | 'entregado'
  | 'cancelado';

// ==========================================
// METADATOS BASE DE APPWRITE (COMPATIBLE CON TABLESDB Y DATABASES)
// ==========================================

export interface AppwriteBaseRecord extends Models.Row {
  $collectionId?: string;
}

// ==========================================
// 1. TABLA: Usuarios (ID: 6ad04bba003c5a0a1172)
// ==========================================

export interface UsuarioData {
  nombre: string; // varchar(100), required
  email: string; // email, required
  telefono?: string | null; // varchar(20), optional
  direccion?: string | null; // text, optional
  rol: RolUsuario; // enum: 'cliente' | 'admin', required
}

export type Usuario = AppwriteBaseRecord & UsuarioData;

// ==========================================
// 2. TABLA: Categorias (ID: 6ad04ce1001816ba855d)
// ==========================================

export interface CategoriaData {
  nombre: string; // varchar(80), required
  descripcion?: string | null; // text, optional
  activa?: boolean; // boolean, default: true
  /** Relación 2-way hacia Productos */
  productos?: Producto[] | string[];
}

export type Categoria = AppwriteBaseRecord & CategoriaData;

// ==========================================
// 3. TABLA: Productos (ID: 6ad04ba90035decdee29)
// ==========================================

export interface ProductoData {
  nombre: string; // varchar(150), required
  sku: string; // varchar(50), required
  descripcion?: string | null; // text, optional
  precio: number; // double, required
  stock: number; // integer, min: 0, required
  stock_minimo?: number | null; // integer, min: 0, default: 5
  activo: boolean; // boolean, required
  /** Relación manyToOne hacia Categorias (6ad04ce1001816ba855d) */
  categoria?: string | Categoria | null;
  // Campos opcionales de compatibilidad extendida para UI
  sustancia_activa?: string | null;
  requiere_receta?: boolean;
  imagen_url?: string | null;
}

export type Producto = AppwriteBaseRecord & ProductoData;

// ==========================================
// 4. TABLA: Carrito_items (ID: 6ad04d580009264e006b)
// ==========================================

export interface CarritoItemData {
  /** Relación manyToOne hacia Usuarios (6ad04bba003c5a0a1172) */
  usuario: string | Usuario | null;
  /** Relación manyToOne hacia Productos (6ad04ba90035decdee29) */
  producto: string | Producto | null;
  cantidad: number; // integer, min: 1, required
}

export type CarritoItem = AppwriteBaseRecord & CarritoItemData;

// ==========================================
// 5. TABLA: Pedidos (ID: 6ad04bb40026e9d302d8)
// ==========================================

export interface PedidoData {
  /** Relación manyToOne hacia Usuarios (columna real en Appwrite: `usuario_id`) */
  usuario_id: string | Usuario | null;
  total: number; // double, min: 0, required
  estado: EstadoPedido; // enum, required
  direccion_envio: string; // text, required
  // Alias opcionales por si algún componente accede como `usuario` o `receta_url`
  usuario?: string | Usuario | null;
  receta_url?: string | null;
}

export type Pedido = AppwriteBaseRecord & PedidoData;

// ==========================================
// 6. TABLA: Detalle_pedido (ID: 6ad04d6d00065818f3b7)
// ==========================================

export interface DetallePedidoData {
  /** Relación manyToOne hacia Pedidos (columna real en Appwrite: `pedidos_id`) */
  pedidos_id: string | Pedido | null;
  /** Relación manyToOne hacia Productos (columna real en Appwrite: `producto_id`) */
  producto_id: string | Producto | null;
  cantidad: number; // integer, min: 1, required
  precio_unitario: number; // double, min: 0, required
  // Alias opcionales por si algún componente accede como `pedido` o `producto`
  pedido?: string | Pedido | null;
  producto?: string | Producto | null;
}

export type DetallePedido = AppwriteBaseRecord & DetallePedidoData;

// ==========================================
// TIPOS DE RESPUESTA Y PAYLOADS DE API (CONCURRENCIA / COMPRAS)
// ==========================================

export type ListaRespuesta<T extends Models.Row> = Models.RowList<T>;

export interface ItemCompraInput {
  productoId: string;
  cantidad: number;
  /** Si el item proviene de Carrito_items, se puede incluir su ID de fila para borrarlo */
  carritoItemId?: string;
}

export interface ComprarRequestPayload {
  usuarioId: string;
  direccionEnvio: string;
  recetaUrl?: string;
  /**
   * Opcional: Si no se envía, el servidor leerá los items directamente
   * de la tabla `Carrito_items` para ese `usuarioId`.
   */
  items?: ItemCompraInput[];
}

export interface ComprarSuccessResponse {
  ok: true;
  mensaje: string;
  pedido: Pedido;
  detalles: DetallePedido[];
  stockActualizado: Array<{
    productoId: string;
    nombre: string;
    stockAnterior: number;
    stockNuevo: number;
  }>;
}

export interface ComprarConflictResponse {
  ok: false;
  error: string;
  codigo:
    | 'STOCK_INSUFICIENTE'
    | 'PRODUCTO_NO_DISPONIBLE'
    | 'RECETA_REQUERIDA'
    | 'CARRITO_VACIO'
    | 'DATOS_INVALIDOS'
    | 'ERROR_PROCESAMIENTO';
  detallesConflicto?: {
    productoId: string;
    nombreProducto: string;
    stockDisponible: number;
    cantidadSolicitada: number;
  };
}

export type ComprarResponse = ComprarSuccessResponse | ComprarConflictResponse;
