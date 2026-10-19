import { NextRequest, NextResponse } from 'next/server';
import {
  createAdminClient,
  APPWRITE_CONFIG,
  ID,
  Query,
} from '@/lib/appwrite/server';
import { purchaseLockManager } from '@/lib/concurrency/mutex';
import type {
  CarritoItem,
  ComprarRequestPayload,
  ComprarResponse,
  DetallePedido,
  ItemCompraInput,
  Pedido,
  Producto,
} from '@/types/database';

/**
 * Extrae el ID string de un campo de relación de Appwrite (ya sea que venga
 * como string plano o como objeto expandido `{ $id: string }`).
 */
function extraerRelacionId(relacion: unknown): string | null {
  if (!relacion) return null;
  if (typeof relacion === 'string') return relacion;
  if (
    typeof relacion === 'object' &&
    '$id' in relacion &&
    typeof (relacion as { $id: unknown }).$id === 'string'
  ) {
    return (relacion as { $id: string }).$id;
  }
  return null;
}

/**
 * Consolidar cantidades si el mismo producto aparece más de una vez en la lista.
 */
function consolidarItems(
  items: ItemCompraInput[]
): Array<{ productoId: string; cantidad: number; carritoItemIds: string[] }> {
  const mapa = new Map<
    string,
    { productoId: string; cantidad: number; carritoItemIds: string[] }
  >();

  for (const item of items) {
    const actual = mapa.get(item.productoId);
    if (actual) {
      actual.cantidad += item.cantidad;
      if (item.carritoItemId) {
        actual.carritoItemIds.push(item.carritoItemId);
      }
    } else {
      mapa.set(item.productoId, {
        productoId: item.productoId,
        cantidad: item.cantidad,
        carritoItemIds: item.carritoItemId ? [item.carritoItemId] : [],
      });
    }
  }

  return Array.from(mapa.values());
}

/**
 * POST /api/comprar
 *
 * Endpoint transaccional protegido por Mutex FIFO estricto.
 * Regla de Oro: CLIENTE <-> SERVIDOR -> BD.
 *
 * Flujo:
 * 1. Valida el payload (`usuarioId`, `direccionEnvio`, y `items` opcional).
 * 2. Entra en la cola FIFO del Mutex para evitar condiciones de carrera (Race Conditions).
 * 3. Si no se enviaron `items` en el body, los consulta desde la tabla `Carrito_items` del usuario.
 * 4. Consulta el stock real actual de cada producto en Appwrite (`TablesDB.getRow`).
 * 5. Si algún producto no existe, está inactivo o tiene `stock < cantidad`, libera el candado
 *    y responde con HTTP 409 (`Conflict`) indicando exactamente qué producto falló y cuánto queda.
 * 6. Si todos tienen stock suficiente:
 *    - Descuenta el stock de cada producto en `Productos`.
 *    - Crea el registro maestro en `Pedidos`.
 *    - Crea los renglones en `Detalle_pedido`.
 *    - Vacía los items comprados en `Carrito_items`.
 * 7. Si ocurre algún error inesperado a mitad de las escrituras, ejecuta compensación (Rollback
 *    manual) restaurando el stock original y eliminando registros parciales antes de liberar el Mutex.
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<ComprarResponse>> {
  let body: ComprarRequestPayload;

  try {
    body = (await request.json()) as ComprarRequestPayload;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'El cuerpo de la petición no es un JSON válido.',
        codigo: 'DATOS_INVALIDOS',
      },
      { status: 400 }
    );
  }

  const { usuarioId, direccionEnvio, items: itemsPayload } = body;

  if (!usuarioId || typeof usuarioId !== 'string' || !usuarioId.trim()) {
    return NextResponse.json(
      {
        ok: false,
        error: 'El campo "usuarioId" es obligatorio.',
        codigo: 'DATOS_INVALIDOS',
      },
      { status: 400 }
    );
  }

  if (
    !direccionEnvio ||
    typeof direccionEnvio !== 'string' ||
    !direccionEnvio.trim()
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: 'El campo "direccionEnvio" es obligatorio.',
        codigo: 'DATOS_INVALIDOS',
      },
      { status: 400 }
    );
  }

  const { tablesDB } = createAdminClient();
  const dbId = APPWRITE_CONFIG.databaseId;
  const {
    productos: tablaProductosId,
    carritoItems: tablaCarritoId,
    pedidos: tablaPedidosId,
    detallePedido: tablaDetalleId,
  } = APPWRITE_CONFIG.tables;

  // Si ya vienen los productoIds en el body, los pasamos al gestor de candados
  const idsPreliminares = Array.isArray(itemsPayload)
    ? itemsPayload.map((i) => i.productoId).filter(Boolean)
    : [];

  // =========================================================================
  // SECCIÓN CRÍTICA PROTEGIDA POR MUTEX (1 SOLA COMPRA A LA VEZ EN FILA FIFO)
  // =========================================================================
  return purchaseLockManager.runPurchaseTransaction(
    idsPreliminares,
    async () => {
      // Registro de cambios aplicados para compensación (Rollback) en caso de fallo
      const stockDescontadoRollback: Array<{
        productoId: string;
        stockOriginal: number;
      }> = [];
      let pedidoCreadoId: string | null = null;
      const detallesCreadosIds: string[] = [];

      try {
        // 1. Obtener los items a comprar (desde el body o desde Carrito_items en Appwrite)
        let itemsCrudos: ItemCompraInput[] = [];
        let carritoRowsDelUsuario: CarritoItem[] = [];

        // Consultamos los items del carrito del usuario para poder limpiarlos al finalizar
        try {
          const respuestaCarrito = await tablesDB.listRows<CarritoItem>({
            databaseId: dbId,
            tableId: tablaCarritoId,
            queries: [Query.equal('usuario', usuarioId), Query.limit(100)],
          });
          carritoRowsDelUsuario = respuestaCarrito.rows;
        } catch {
          // Fallback en caso de que la relación no permita filtro directo por Query.equal
          const todosLosItems = await tablesDB.listRows<CarritoItem>({
            databaseId: dbId,
            tableId: tablaCarritoId,
            queries: [Query.limit(100)],
          });
          carritoRowsDelUsuario = todosLosItems.rows.filter(
            (row) => extraerRelacionId(row.usuario) === usuarioId
          );
        }

        if (Array.isArray(itemsPayload) && itemsPayload.length > 0) {
          itemsCrudos = itemsPayload;
        } else {
          itemsCrudos = carritoRowsDelUsuario
            .map((row) => {
              const prodId = extraerRelacionId(row.producto);
              return prodId
                ? {
                    productoId: prodId,
                    cantidad: Number(row.cantidad),
                    carritoItemId: row.$id,
                  }
                : null;
            })
            .filter((item): item is NonNullable<typeof item> => item !== null);
        }

        if (itemsCrudos.length === 0) {
          return NextResponse.json(
            {
              ok: false,
              error:
                'El carrito está vacío o no se especificaron productos para comprar.',
              codigo: 'CARRITO_VACIO',
            },
            { status: 400 }
          );
        }

        // Validar que todas las cantidades sean enteros >= 1
        for (const item of itemsCrudos) {
          if (
            !item.productoId ||
            !Number.isInteger(item.cantidad) ||
            item.cantidad < 1
          ) {
            return NextResponse.json(
              {
                ok: false,
                error: `Cantidad inválida (${item.cantidad}) para el producto ${item.productoId}. Debe ser un entero mayor o igual a 1.`,
                codigo: 'DATOS_INVALIDOS',
              },
              { status: 400 }
            );
          }
        }

        const itemsConsolidados = consolidarItems(itemsCrudos);

        // 2. Verificar stock en tiempo real en Appwrite para cada producto
        const productosVerificados = new Map<string, Producto>();

        for (const item of itemsConsolidados) {
          let producto: Producto;
          try {
            producto = await tablesDB.getRow<Producto>({
              databaseId: dbId,
              tableId: tablaProductosId,
              rowId: item.productoId,
            });
          } catch {
            return NextResponse.json(
              {
                ok: false,
                error: `El producto con ID "${item.productoId}" no existe en el catálogo.`,
                codigo: 'PRODUCTO_NO_DISPONIBLE',
              },
              { status: 404 }
            );
          }

          if (!producto.activo) {
            return NextResponse.json(
              {
                ok: false,
                error: `El producto "${producto.nombre}" ya no se encuentra activo para la venta.`,
                codigo: 'PRODUCTO_NO_DISPONIBLE',
                detallesConflicto: {
                  productoId: producto.$id,
                  nombreProducto: producto.nombre,
                  stockDisponible: producto.stock,
                  cantidadSolicitada: item.cantidad,
                },
              },
              { status: 409 }
            );
          }

          const stockActual = Number(producto.stock);

          if (stockActual < item.cantidad) {
            return NextResponse.json(
              {
                ok: false,
                error:
                  stockActual === 0
                    ? `El producto "${producto.nombre}" se acaba de agotar (Stock disponible: 0).`
                    : `Stock insuficiente para "${producto.nombre}". Solicitaste ${item.cantidad}, pero solo quedan ${stockActual} unidades disponibles.`,
                codigo: 'STOCK_INSUFICIENTE',
                detallesConflicto: {
                  productoId: producto.$id,
                  nombreProducto: producto.nombre,
                  stockDisponible: stockActual,
                  cantidadSolicitada: item.cantidad,
                },
              },
              { status: 409 }
            );
          }

          productosVerificados.set(item.productoId, producto);
        }

        // 3. Descontar el stock en `Productos` (dispara evento Realtime a todos los clientes y al dashboard)
        const resumenStockActualizado: Array<{
          productoId: string;
          nombre: string;
          stockAnterior: number;
          stockNuevo: number;
        }> = [];

        let totalPedido = 0;

        for (const item of itemsConsolidados) {
          const producto = productosVerificados.get(item.productoId)!;
          const stockAnterior = Number(producto.stock);
          const stockNuevo = stockAnterior - item.cantidad;

          await tablesDB.updateRow<Producto>({
            databaseId: dbId,
            tableId: tablaProductosId,
            rowId: producto.$id,
            data: {
              stock: stockNuevo,
            },
          });

          // Guardamos el estado previo por si necesitamos hacer Rollback más adelante
          stockDescontadoRollback.push({
            productoId: producto.$id,
            stockOriginal: stockAnterior,
          });

          resumenStockActualizado.push({
            productoId: producto.$id,
            nombre: producto.nombre,
            stockAnterior,
            stockNuevo,
          });

          totalPedido += Number(producto.precio) * item.cantidad;
        }

        // Redondear a 2 decimales para evitar imprecisiones de punto flotante
        totalPedido = Math.round(totalPedido * 100) / 100;

        // 4. Crear el documento maestro en `Pedidos`
        const pedidoCreado = await tablesDB.createRow<Pedido>({
          databaseId: dbId,
          tableId: tablaPedidosId,
          rowId: ID.unique(),
          data: {
            usuario_id: usuarioId,
            total: totalPedido,
            estado: 'pagado',
            direccion_envio: direccionEnvio.trim(),
          },
        });

        pedidoCreadoId = pedidoCreado.$id;

        // 5. Insertar los renglones en `Detalle_pedido`
        const detallesCreados: DetallePedido[] = [];

        for (const item of itemsConsolidados) {
          const producto = productosVerificados.get(item.productoId)!;

          const detalle = await tablesDB.createRow<DetallePedido>({
            databaseId: dbId,
            tableId: tablaDetalleId,
            rowId: ID.unique(),
            data: {
              pedidos_id: pedidoCreado.$id,
              producto_id: producto.$id,
              cantidad: item.cantidad,
              precio_unitario: Number(producto.precio),
            },
          });

          detallesCreadosIds.push(detalle.$id);
          detallesCreados.push(detalle);
        }

        // 6. Limpiar los items del carrito del usuario (`Carrito_items`)
        for (const carritoRow of carritoRowsDelUsuario) {
          try {
            await tablesDB.deleteRow({
              databaseId: dbId,
              tableId: tablaCarritoId,
              rowId: carritoRow.$id,
            });
          } catch (deleteErr) {
            console.warn(
              `[POST /api/comprar] No se pudo limpiar el item de carrito ${carritoRow.$id}:`,
              deleteErr
            );
          }
        }

        return NextResponse.json(
          {
            ok: true,
            mensaje: 'Compra procesada exitosamente.',
            pedido: pedidoCreado,
            detalles: detallesCreados,
            stockActualizado: resumenStockActualizado,
          },
          { status: 201 }
        );
      } catch (error) {
        console.error(
          '[POST /api/comprar] Error durante la transacción. Ejecutando Rollback compensatorio...',
          error
        );

        // =====================================================================
        // LÓGICA DE COMPENSACIÓN (ROLLBACK MANUAL)
        // =====================================================================

        // A. Eliminar detalles de pedido que se hayan alcanzado a crear
        for (const detalleId of detallesCreadosIds) {
          try {
            await tablesDB.deleteRow({
              databaseId: dbId,
              tableId: tablaDetalleId,
              rowId: detalleId,
            });
          } catch (rollbackErr) {
            console.error(
              `[Rollback] Error al eliminar Detalle_pedido ${detalleId}:`,
              rollbackErr
            );
          }
        }

        // B. Eliminar el pedido maestro si se alcanzó a crear
        if (pedidoCreadoId) {
          try {
            await tablesDB.deleteRow({
              databaseId: dbId,
              tableId: tablaPedidosId,
              rowId: pedidoCreadoId,
            });
          } catch (rollbackErr) {
            console.error(
              `[Rollback] Error al eliminar Pedido ${pedidoCreadoId}:`,
              rollbackErr
            );
          }
        }

        // C. Restaurar el stock original de todos los productos modificados
        for (const itemRollback of stockDescontadoRollback) {
          try {
            await tablesDB.updateRow({
              databaseId: dbId,
              tableId: tablaProductosId,
              rowId: itemRollback.productoId,
              data: {
                stock: itemRollback.stockOriginal,
              },
            });
          } catch (rollbackErr) {
            console.error(
              `[Rollback] Error crítico al restaurar stock de producto ${itemRollback.productoId}:`,
              rollbackErr
            );
          }
        }

        const mensajeError =
          error instanceof Error
            ? error.message
            : 'Error interno al procesar la compra.';

        return NextResponse.json(
          {
            ok: false,
            error: `La compra no pudo completarse y los cambios fueron revertidos (Rollback): ${mensajeError}`,
            codigo: 'ERROR_PROCESAMIENTO',
          },
          { status: 500 }
        );
      }
    }
  );
}
