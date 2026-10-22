'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { account, tablesDB, APPWRITE_CONFIG, Query } from '@/lib/appwrite/client';
import { useRealtimeStock } from '@/hooks/useRealtimeStock';
import type { CarritoItem, ComprarResponse, Producto } from '@/types/database';

export interface EntradaCarritoItem {
  carritoItemId?: string;
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

interface InterfazCarritoProps {
  modo?: 'pagina' | 'drawer';
}

export function leerCarritoLocal(): EntradaCarritoItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('farmacia_cart');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function guardarCarritoLocal(items: EntradaCarritoItem[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('farmacia_cart', JSON.stringify(items));
    window.dispatchEvent(new Event('farmacia_cart_updated'));
  } catch {
    // Ignorar
  }
}

function suscribirCarrito(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('farmacia_cart_updated', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('farmacia_cart_updated', callback);
    window.removeEventListener('storage', callback);
  };
}

let carritoCacheRaw = '';
let carritoCacheParsed: EntradaCarritoItem[] = [];

function obtenerSnapshotCarrito(): EntradaCarritoItem[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem('farmacia_cart') || '[]';
  if (raw !== carritoCacheRaw) {
    carritoCacheRaw = raw;
    try {
      carritoCacheParsed = JSON.parse(raw);
    } catch {
      carritoCacheParsed = [];
    }
  }
  return carritoCacheParsed;
}

const SERVER_EMPTY_CART: EntradaCarritoItem[] = [];
function obtenerSnapshotServidor(): EntradaCarritoItem[] {
  return SERVER_EMPTY_CART;
}

async function obtenerUsuarioActualId(): Promise<string | null> {
  try {
    const user = await account.get();
    return user.$id;
  } catch {
    return null;
  }
}

function extraerId(relacion: unknown): string | null {
  if (!relacion) return null;
  if (typeof relacion === 'string') return relacion;
  if (typeof relacion === 'object' && '$id' in relacion) {
    return String((relacion as { $id: unknown }).$id);
  }
  return null;
}

async function consultarItemsAppwrite(usuarioId: string): Promise<EntradaCarritoItem[]> {
  let rows: CarritoItem[] = [];

  try {
    const res = await tablesDB.listRows<CarritoItem>({
      databaseId: APPWRITE_CONFIG.databaseId,
      tableId: APPWRITE_CONFIG.tables.carritoItems,
      queries: [Query.equal('usuario', usuarioId), Query.limit(100)],
    });
    rows = res.rows;
  } catch {
    const resFallback = await tablesDB.listRows<CarritoItem>({
      databaseId: APPWRITE_CONFIG.databaseId,
      tableId: APPWRITE_CONFIG.tables.carritoItems,
      queries: [Query.limit(100)],
    });
    rows = resFallback.rows.filter(
      (fila) => extraerId(fila.usuario) === usuarioId
    );
  }

  return rows
    .map((fila) => {
      const prodId = extraerId(fila.producto) ?? '';
      return {
        carritoItemId: fila.$id,
        productoId: prodId,
        nombre: `Producto (${prodId})`,
        precio: 0,
        cantidad: Math.max(1, Number(fila.cantidad) || 1),
      };
    })
    .filter((item) => Boolean(item.productoId));
}

export default function InterfazCarrito({ modo = 'drawer' }: InterfazCarritoProps) {
  const [estaAbierto, setEstaAbierto] = useState(modo === 'pagina');
  const [cargandoCarrito, setCargandoCarrito] = useState(false);
  const [direccionEnvio, setDireccionEnvio] = useState('');
  const [comprando, setComprando] = useState(false);
  const [compraConfirmada, setCompraConfirmada] = useState(false);
  const [respuestaCompra, setRespuestaCompra] = useState<ComprarResponse | null>(null);

  const montado = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const itemsCarrito = useSyncExternalStore(
    suscribirCarrito,
    obtenerSnapshotCarrito,
    obtenerSnapshotServidor
  );

  const { productos, stockPorId, cargando: cargandoStock } = useRealtimeStock({ soloActivos: true });

  // Cargar items de la base de datos de Appwrite y combinar con los locales
  useEffect(() => {
    if (modo !== 'pagina' && !estaAbierto) return;

    let cancelado = false;

    const cargar = async () => {
      await Promise.resolve();
      if (cancelado) return;

      const usuarioId = await obtenerUsuarioActualId();
      if (!usuarioId || !APPWRITE_CONFIG.databaseId || !APPWRITE_CONFIG.tables.carritoItems) {
        return;
      }

      setCargandoCarrito(true);

      try {
        const entradasBD = await consultarItemsAppwrite(usuarioId);
        if (!cancelado) {
          const locales = leerCarritoLocal();
          // Combinar BD y locales sin duplicar productoId
          const combinados = [...locales];
          for (const itemBD of entradasBD) {
            const index = combinados.findIndex((i) => i.productoId === itemBD.productoId);
            if (index !== -1) {
              combinados[index].carritoItemId = itemBD.carritoItemId;
            } else {
              combinados.push(itemBD);
            }
          }
          guardarCarritoLocal(combinados);
        }
      } catch (err) {
        console.error('Error al cargar items del carrito:', err);
      } finally {
        if (!cancelado) {
          setCargandoCarrito(false);
        }
      }
    };

    void cargar();

    return () => {
      cancelado = true;
    };
  }, [estaAbierto, modo]);

  const manejarCambioCantidad = (productoId: string, valorRaw: string) => {
    const stockDisponible = stockPorId[productoId] ?? 0;
    let nuevaCantidad = parseInt(valorRaw, 10);

    if (isNaN(nuevaCantidad) || nuevaCantidad < 1) {
      nuevaCantidad = 1;
    } else if (stockDisponible > 0 && nuevaCantidad > stockDisponible) {
      nuevaCantidad = stockDisponible;
    }

    const actualizados = itemsCarrito.map((item) =>
      item.productoId === productoId ? { ...item, cantidad: nuevaCantidad } : item
    );
    guardarCarritoLocal(actualizados);
  };

  const eliminarItem = (productoId: string) => {
    const actualizados = itemsCarrito.filter((item) => item.productoId !== productoId);
    guardarCarritoLocal(actualizados);
  };

  const agregarProductoDemo = (producto: Producto) => {
    const existe = itemsCarrito.find((i) => i.productoId === producto.$id);
    let actualizados: EntradaCarritoItem[];
    if (existe) {
      const stockDisp = stockPorId[producto.$id] ?? 1;
      actualizados = itemsCarrito.map((i) =>
        i.productoId === producto.$id
          ? { ...i, cantidad: Math.min(i.cantidad + 1, stockDisp) }
          : i
      );
    } else {
      actualizados = [
        ...itemsCarrito,
        {
          productoId: producto.$id,
          nombre: producto.nombre,
          precio: producto.precio,
          cantidad: 1,
        },
      ];
    }
    guardarCarritoLocal(actualizados);
  };

  const totalPagar = itemsCarrito.reduce((acum, item) => {
    const prod = productos.find((p) => p.$id === item.productoId);
    const precio = prod?.precio ?? item.precio ?? 0;
    return acum + precio * item.cantidad;
  }, 0);

  const hayProductoSinStock = itemsCarrito.some(
    (item) => (stockPorId[item.productoId] ?? 0) <= 0
  );

  const confirmarCompra = async () => {
    if (comprando || compraConfirmada) return;

    const usuarioId = await obtenerUsuarioActualId();
    if (!usuarioId) {
      setRespuestaCompra({
        ok: false,
        error: 'Debes iniciar sesión antes de confirmar tu compra.',
        codigo: 'DATOS_INVALIDOS',
      });
      return;
    }

    const direccionLimpia = direccionEnvio.trim();
    if (!direccionLimpia) {
      setRespuestaCompra({
        ok: false,
        error: 'Por favor ingresa tu dirección de envío.',
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
        cantidad: item.cantidad,
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

      if (data.ok) {
        guardarCarritoLocal([]);
        setCompraConfirmada(true);
      }
    } catch {
      setRespuestaCompra({
        ok: false,
        error: 'Error de red al procesar la compra con el servidor.',
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

  // Contenido del Carrito (Estilo Vercel)
  const cuerpoCarrito = (
    <div className="flex flex-col h-full space-y-5">
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {cargandoCarrito ? (
          <div className="text-center py-10 font-mono text-xs text-zinc-400">
            Cargando carrito...
          </div>
        ) : itemsCarrito.length === 0 && !compraConfirmada ? (
          <div className="text-center py-12 border border-dashed border-black/[.08] dark:border-white/[.145] rounded-2xl p-6">
            <p className="text-sm text-zinc-500 mb-4">No hay productos en tu carrito.</p>
            {productos.length > 0 && (
              <div>
                <p className="text-xs font-mono text-zinc-400 mb-3">
                  Agregar productos de prueba:
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {productos.slice(0, 3).map((p) => (
                    <button
                      key={p.$id}
                      type="button"
                      onClick={() => agregarProductoDemo(p)}
                      className="flex h-8 items-center justify-center rounded-full border border-solid border-black/[.08] dark:border-white/[.145] px-3 text-xs font-mono hover:bg-black/[.04] dark:hover:bg-[#1a1a1a] transition-colors cursor-pointer"
                    >
                      + {p.nombre} (${p.precio})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          itemsCarrito.map((item) => {
            const stockDisponible = stockPorId[item.productoId] ?? 0;
            const prod = productos.find((p) => p.$id === item.productoId);
            const nombreMostrar = prod?.nombre ?? item.nombre;
            const precioUnitario = prod?.precio ?? item.precio ?? 0;
            const subtotal = precioUnitario * item.cantidad;

            return (
              <div
                key={item.carritoItemId ?? item.productoId}
                className="rounded-xl border border-solid border-black/[.08] dark:border-white/[.145] p-4 flex flex-col gap-2 transition-colors hover:bg-black/[.01] dark:hover:bg-white/[.02]"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-sm tracking-tight text-black dark:text-zinc-100">
                      {nombreMostrar}
                    </h3>
                    <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                      ${precioUnitario.toFixed(2)} &bull; Subtotal: ${subtotal.toFixed(2)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => eliminarItem(item.productoId)}
                    className="text-xs text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-black/[.05] dark:border-white/[.08] text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 font-mono">Cantidad:</span>
                    <input
                      type="number"
                      value={item.cantidad}
                      onChange={(e) =>
                        manejarCambioCantidad(item.productoId, e.target.value)
                      }
                      disabled={stockDisponible <= 0}
                      className="w-14 h-7 rounded-md border border-solid border-black/[.08] dark:border-white/[.145] bg-transparent text-center font-mono text-xs text-black dark:text-white focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white disabled:opacity-50"
                      min="1"
                      max={stockDisponible > 0 ? stockDisponible : 1}
                    />
                  </div>

                  <div className="font-mono text-[11px]">
                    {stockDisponible <= 0 ? (
                      <span className="text-red-500">Agotado</span>
                    ) : (
                      <span className="text-zinc-500 dark:text-zinc-400">
                        Stock: {stockDisponible}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Campo de dirección */}
        {itemsCarrito.length > 0 && !compraConfirmada && (
          <div className="pt-2">
            <label className="block text-xs font-mono uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
              Dirección de entrega
            </label>
            <input
              type="text"
              value={direccionEnvio}
              onChange={(e) => setDireccionEnvio(e.target.value)}
              placeholder="Calle, número, colonia"
              className="w-full h-10 rounded-lg border border-solid border-black/[.08] dark:border-white/[.145] bg-transparent px-3 text-sm text-black dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white transition-colors"
            />
          </div>
        )}

        {/* Respuesta 201: Recibo de compra exitosa */}
        {respuestaCompra && respuestaCompra.ok && (
          <div className="p-4 rounded-xl border border-black/[.08] dark:border-white/[.145] bg-black/[.02] dark:bg-white/[.04] text-xs font-mono space-y-1.5">
            <div className="text-sm font-semibold tracking-tight text-emerald-600 dark:text-emerald-400">
              {respuestaCompra.mensaje}
            </div>
            <p className="text-zinc-600 dark:text-zinc-400">
              Folio: <strong className="text-black dark:text-white">{respuestaCompra.pedido.$id}</strong>
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Total pagado: <strong className="text-black dark:text-white">${respuestaCompra.pedido.total.toFixed(2)}</strong>
            </p>
            <p className="text-zinc-600 dark:text-zinc-400">
              Estado: <span className="uppercase">{respuestaCompra.pedido.estado}</span>
            </p>
          </div>
        )}

        {/* Respuesta 409: Alerta de stock insuficiente */}
        {respuestaCompra && !respuestaCompra.ok && (
          <div className="p-4 rounded-xl border border-red-500/30 bg-red-500/[.05] text-xs font-mono text-red-600 dark:text-red-400 space-y-1">
            <div className="font-semibold">No se pudo completar la compra</div>
            <p>{respuestaCompra.error}</p>
          </div>
        )}
      </div>

      {/* Pie con Total y Botón de Pago estilo Vercel */}
      <div className="pt-4 border-t border-black/[.08] dark:border-white/[.145] space-y-3">
        {itemsCarrito.length > 0 && !compraConfirmada && (
          <div className="flex justify-between items-center text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Total a pagar:</span>
            <span className="text-2xl font-semibold tracking-tight text-black dark:text-white font-mono">
              ${totalPagar.toFixed(2)}
            </span>
          </div>
        )}

        {compraConfirmada ? (
          <Link
            href="/cliente"
            onClick={() => {
              setCompraConfirmada(false);
              setRespuestaCompra(null);
            }}
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-black text-white hover:bg-[#383838] dark:bg-white dark:text-black dark:hover:bg-[#ccc] text-sm font-medium transition-colors"
          >
            &larr; Volver a la Tienda
          </Link>
        ) : (
          <button
            type="button"
            onClick={confirmarCompra}
            disabled={deshabilitarConfirmacion}
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-full bg-black text-white hover:bg-[#383838] dark:bg-white dark:text-black dark:hover:bg-[#ccc] text-sm font-medium transition-colors disabled:opacity-50"
          >
            {comprando
              ? 'Procesando en servidor...'
              : hayProductoSinStock
              ? 'Stock Insuficiente'
              : !direccionEnvio.trim() && itemsCarrito.length > 0
              ? 'Ingresa tu dirección'
              : 'Confirmar y Pagar'}
          </button>
        )}
      </div>
    </div>
  );

  // 1. Modo Página Completa
  if (modo === 'pagina') {
    return (
      <div className="w-full max-w-2xl bg-white dark:bg-black border border-solid border-black/[.08] dark:border-white/[.145] rounded-3xl p-8 sm:p-10 shadow-xs">
        <div className="flex justify-between items-center pb-4 border-b border-black/[.08] dark:border-white/[.145] mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
              Carrito de Compras
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Verifica tus productos y confirma tu pedido
            </p>
          </div>
          <Link
            href="/cliente"
            className="flex h-9 items-center justify-center rounded-full border border-solid border-black/[.08] dark:border-white/[.145] px-4 text-xs font-medium hover:bg-black/[.04] dark:hover:bg-[#1a1a1a] transition-colors"
          >
            &larr; Tienda
          </Link>
        </div>
        {cuerpoCarrito}
      </div>
    );
  }

  // 2. Modo Drawer
  return (
    <>
      <button
        type="button"
        onClick={() => setEstaAbierto(true)}
        className="flex h-10 items-center justify-center gap-2 rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a] cursor-pointer"
      >
        <span>Carrito</span>
        {montado && itemsCarrito.length > 0 && (
          <span className="ml-1 px-2 py-0.5 rounded-full bg-black text-white dark:bg-white dark:text-black font-mono text-[10px]">
            {itemsCarrito.reduce((a, b) => a + b.cantidad, 0)}
          </span>
        )}
      </button>

      {estaAbierto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setEstaAbierto(false)}
          />

          <div className="relative w-full max-w-md bg-white dark:bg-black border-l border-black/[.08] dark:border-white/[.145] h-full shadow-2xl p-6 sm:p-8 flex flex-col z-10">
            <div className="flex justify-between items-center pb-4 border-b border-black/[.08] dark:border-white/[.145] mb-6">
              <h2 className="text-lg font-semibold tracking-tight text-black dark:text-zinc-100">
                Tu Carrito
              </h2>
              <button
                type="button"
                onClick={() => setEstaAbierto(false)}
                className="text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-hidden">{cuerpoCarrito}</div>
          </div>
        </div>
      )}
    </>
  );
}
