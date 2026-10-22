'use client';

import { useEffect, useState } from 'react';
import { tablesDB, APPWRITE_CONFIG, Query } from '@/lib/appwrite/client';
import { useRealtimeStock } from '@/hooks/useRealtimeStock';
import type { CarritoItem, ComprarResponse, Producto } from '@/types/database';

interface EntradaCarritoEstado {
  carritoItemId?: string;
  productoId: string;
  nombre: string;
  cantidad: number;
}

/**
 * Lee el ID de usuario activo desde la cookie `farmacia_session`.
 * Devuelve `null` si no hay sesión activa (nunca usa un usuario fijo).
 */
function obtenerUsuarioIdDeCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('farmacia_session='));
  if (!match) return null;
  const valor = decodeURIComponent(match.split('=')[1] ?? '').trim();
  return valor || null;
}

function extraerProductoDeRelacion(
  relacion: CarritoItem['producto'],
  catalogo: Producto[]
): { productoId: string; nombre: string } | null {
  if (!relacion) return null;
  if (typeof relacion === 'string') {
    const encontrado = catalogo.find((p) => p.$id === relacion);
    return {
      productoId: relacion,
      nombre: encontrado?.nombre ?? relacion,
    };
  }
  if (typeof relacion === 'object' && '$id' in relacion) {
    return {
      productoId: relacion.$id,
      nombre: relacion.nombre || relacion.$id,
    };
  }
  return null;
}

export default function InterfazCarrito() {
  // 1. Estados de la interfaz y del carrito
  const [estaAbierto, setEstaAbierto] = useState(false);
  const [itemsCarrito, setItemsCarrito] = useState<EntradaCarritoEstado[]>([]);
  const [cargandoCarrito, setCargandoCarrito] = useState(false);
  const [direccionEnvio, setDireccionEnvio] = useState('');
  const [comprando, setComprando] = useState(false);
  const [compraConfirmada, setCompraConfirmada] = useState(false);
  const [respuestaCompra, setRespuestaCompra] =
    useState<ComprarResponse | null>(null);

  // Stock en vivo para cada producto del catálogo
  const {
    productos,
    stockPorId,
    cargando: cargandoStock,
  } = useRealtimeStock({ soloActivos: true });

  // Cargar las entradas actuales del carrito del usuario al abrir el Drawer
  useEffect(() => {
    if (!estaAbierto) return;

    const usuarioId = obtenerUsuarioIdDeCookie();
    if (!usuarioId || !APPWRITE_CONFIG.databaseId || !APPWRITE_CONFIG.tables.carritoItems) {
      return;
    }

    let cancelado = false;

    const cargarItemsCarrito = async () => {
      setCargandoCarrito(true);
      try {
        const respuesta = await tablesDB.listRows<CarritoItem>({
          databaseId: APPWRITE_CONFIG.databaseId,
          tableId: APPWRITE_CONFIG.tables.carritoItems,
          queries: [Query.equal('usuario', usuarioId), Query.limit(100)],
        });

        if (cancelado) return;

        const entradas: EntradaCarritoEstado[] = [];
        for (const fila of respuesta.rows) {
          const info = extraerProductoDeRelacion(fila.producto, productos);
          if (info) {
            entradas.push({
              carritoItemId: fila.$id,
              productoId: info.productoId,
              nombre: info.nombre,
              cantidad: Math.max(1, Number(fila.cantidad) || 1),
            });
          }
        }

        setItemsCarrito(entradas);
        setCompraConfirmada(false);
      } catch {
        // Conservar el estado actual si la consulta falla
      } finally {
        if (!cancelado) {
          setCargandoCarrito(false);
        }
      }
    };

    cargarItemsCarrito();

    return () => {
      cancelado = true;
    };
  }, [estaAbierto, productos]);

  // 2. Lógica de validación del input de cantidad por producto según stock en vivo
  const manejarCambioCantidad = (productoId: string, valorRaw: string) => {
    const stockDisponible = stockPorId[productoId] ?? 0;
    let nuevaCantidad = parseInt(valorRaw, 10);

    if (isNaN(nuevaCantidad) || nuevaCantidad < 1) {
      nuevaCantidad = 1;
    } else if (stockDisponible > 0 && nuevaCantidad > stockDisponible) {
      nuevaCantidad = stockDisponible;
    }

    setItemsCarrito((prev) =>
      prev.map((item) =>
        item.productoId === productoId
          ? { ...item, cantidad: nuevaCantidad }
          : item
      )
    );
  };

  // Verificar si algún producto del carrito tiene stock 0 o excede el stock disponible
  const hayProductoSinStock = itemsCarrito.some(
    (item) => (stockPorId[item.productoId] ?? 0) <= 0
  );

  // 3. Enviar compra hacia POST /api/comprar (mostrando recibo en 201 o alerta en 409)
  const confirmarCompra = async () => {
    if (comprando || compraConfirmada) return;

    const usuarioId = obtenerUsuarioIdDeCookie();
    if (!usuarioId) {
      setRespuestaCompra({
        ok: false,
        error: 'Debes iniciar sesión en /login antes de confirmar tu compra.',
        codigo: 'DATOS_INVALIDOS',
      });
      return;
    }

    const direccionLimpia = direccionEnvio.trim();
    if (!direccionLimpia) {
      setRespuestaCompra({
        ok: false,
        error: 'Por favor ingresa tu dirección de envío para confirmar el pedido.',
        codigo: 'DATOS_INVALIDOS',
      });
      return;
    }

    if (itemsCarrito.length === 0) {
      setRespuestaCompra({
        ok: false,
        error: 'Tu carrito está vacío.',
        codigo: 'CARRITO_VACIO',
      });
      return;
    }

    setComprando(true);
    setRespuestaCompra(null);

    try {
      const itemsPayload = itemsCarrito.map((item) => ({
        productoId: item.productoId,
        cantidad: Math.min(
          item.cantidad,
          Math.max(1, stockPorId[item.productoId] ?? item.cantidad)
        ),
        carritoItemId: item.carritoItemId,
      }));

      const res = await fetch('/api/comprar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuarioId,
          direccionEnvio: direccionLimpia,
          items: itemsPayload,
        }),
      });

      const data = (await res.json()) as ComprarResponse;
      setRespuestaCompra(data);

      // Si la compra fue exitosa (201), vaciamos las entradas compradas y bloqueamos reenvío
      if (data.ok) {
        setItemsCarrito([]);
        setCompraConfirmada(true);
      }
    } catch {
      setRespuestaCompra({
        ok: false,
        error: 'Error de red al intentar procesar la compra.',
        codigo: 'ERROR_PROCESAMIENTO',
      });
    } finally {
      setComprando(false);
    }
  };

  const deshabilitarConfirmacion =
    comprando ||
    compraConfirmada ||
    cargandoStock ||
    cargandoCarrito ||
    itemsCarrito.length === 0 ||
    hayProductoSinStock ||
    !direccionEnvio.trim();

  return (
    <div>
      {/* Boton para abrir el Drawer */}
      <button
        onClick={() => setEstaAbierto(true)}
        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-5 rounded-lg transition-colors cursor-pointer"
      >
        Ver Carrito
      </button>

      {/* 3. Estructura del Drawer (Panel Lateral) */}
      {estaAbierto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Fondo oscuro semi-transparente (al hacer clic, se cierra) */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setEstaAbierto(false)}
          ></div>

          {/* Contenedor principal del carrito (lado derecho) */}
          <div className="relative w-80 md:w-96 bg-white dark:bg-zinc-900 h-full shadow-2xl p-6 flex flex-col transform transition-transform">
            {/* Cabecera del carrito */}
            <div className="flex justify-between items-center mb-6 border-b pb-4 dark:border-zinc-700">
              <h2 className="text-xl font-bold text-gray-800 dark:text-zinc-100">
                Tu Carrito
              </h2>
              <button
                onClick={() => setEstaAbierto(false)}
                className="text-gray-500 hover:text-red-500 font-bold text-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 4. Lista de Items del Carrito */}
            <div className="flex-1 overflow-y-auto space-y-4">
              {cargandoCarrito ? (
                <p className="text-sm text-gray-500 dark:text-zinc-400">
                  Cargando carrito...
                </p>
              ) : itemsCarrito.length === 0 && !compraConfirmada ? (
                <p className="text-sm text-gray-500 dark:text-zinc-400">
                  No hay productos en tu carrito.
                </p>
              ) : (
                itemsCarrito.map((item) => {
                  const stockDisponible = stockPorId[item.productoId] ?? 0;
                  const cantidadActual =
                    stockDisponible > 0
                      ? Math.min(item.cantidad, stockDisponible)
                      : item.cantidad;

                  return (
                    <div
                      key={item.carritoItemId ?? item.productoId}
                      className="border rounded-lg p-4 bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700"
                    >
                      <h3 className="font-semibold text-gray-800 dark:text-zinc-100 mb-1">
                        {item.nombre}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-zinc-400 mb-3">
                        Stock disponible:{' '}
                        {cargandoStock ? 'Cargando...' : stockDisponible}
                      </p>

                      <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                          Cantidad:
                        </label>
                        <input
                          type="number"
                          value={cantidadActual}
                          onChange={(e) =>
                            manejarCambioCantidad(
                              item.productoId,
                              e.target.value
                            )
                          }
                          disabled={stockDisponible <= 0}
                          className="border border-gray-300 rounded-md w-20 p-1.5 text-center dark:bg-zinc-700 dark:text-white dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 outline-none disabled:opacity-50"
                          min="1"
                          max={stockDisponible > 0 ? stockDisponible : 1}
                        />
                      </div>

                      {stockDisponible <= 0 ? (
                        <p className="text-red-500 text-xs mt-2 font-medium">
                          Producto agotado
                        </p>
                      ) : (
                        cantidadActual >= stockDisponible && (
                          <p className="text-orange-500 text-xs mt-2 font-medium">
                            Límite de stock alcanzado
                          </p>
                        )
                      )}
                    </div>
                  );
                })
              )}

              {/* Campo para capturar la dirección de envío del cliente */}
              {itemsCarrito.length > 0 && (
                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-zinc-300 mb-1">
                    Dirección de envío:
                  </label>
                  <input
                    type="text"
                    value={direccionEnvio}
                    onChange={(e) => setDireccionEnvio(e.target.value)}
                    placeholder="Calle, número y colonia"
                    className="w-full border border-gray-300 rounded-md p-2 text-sm dark:bg-zinc-800 dark:text-white dark:border-zinc-700 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              )}

              {/* Respuesta HTTP 201: Recibo de compra exitosa */}
              {respuestaCompra && respuestaCompra.ok && (
                <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/50 border border-green-500 text-green-800 dark:text-green-200 text-sm">
                  <p className="font-bold mb-1">{respuestaCompra.mensaje}</p>
                  <p>
                    Folio Pedido: <strong>{respuestaCompra.pedido.$id}</strong>
                  </p>
                  <p>
                    Total Pagado: <strong>${respuestaCompra.pedido.total}</strong>
                  </p>
                </div>
              )}

              {/* Respuesta HTTP 409 / Error: Alerta de stock agotado / conflicto */}
              {respuestaCompra && !respuestaCompra.ok && (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-500 text-red-800 dark:text-red-200 text-sm">
                  <p className="font-bold mb-1">No se pudo completar la compra</p>
                  <p>{respuestaCompra.error}</p>
                </div>
              )}
            </div>

            {/* 5. Pie del carrito (Botón de Confirmar Compra) */}
            <div className="mt-auto pt-4 border-t dark:border-zinc-700">
              <button
                onClick={confirmarCompra}
                disabled={deshabilitarConfirmacion}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors cursor-pointer"
              >
                {comprando
                  ? 'Confirmando...'
                  : compraConfirmada
                  ? 'Compra Confirmada'
                  : hayProductoSinStock
                  ? 'Stock Agotado'
                  : 'Confirmar Compra'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
