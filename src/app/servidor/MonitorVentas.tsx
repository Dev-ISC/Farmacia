'use client';

import { useState, useEffect, useCallback } from 'react';
import { account, realtime, Channel } from '@/lib/appwrite/client';
import { APPWRITE_CONFIG } from '@/lib/appwrite/config';
import type { EstadoPedido } from '@/types/database';

interface PedidoItem {
  $id?: string;
  id?: string;
  usuario_id?: unknown;
  usuario?: unknown;
  total?: number;
  estado?: EstadoPedido | string;
  direccion_envio?: string;
  $createdAt?: string;
  fecha?: string;
}

interface DetalleProductoInfo {
  id?: string;
  nombre?: string;
  stock?: number;
}

interface DetallePedidoItem {
  id?: string;
  producto?: DetalleProductoInfo;
  cantidad: number;
  precioUnitario?: number;
  subtotal?: number;
}

interface PedidoDetallado {
  pedido: {
    id: string;
    usuario?: unknown;
    total: number;
    estado: EstadoPedido | string;
    direccionEnvio?: string;
    fecha?: string;
  };
  totalDetalles: number;
  detalles: DetallePedidoItem[];
}

interface AccionTransicion {
  estado: EstadoPedido;
  label: string;
  estilo: string;
}

interface MonitorVentasProps {
  mostrarToast: (tipo: 'exito' | 'error', m: string) => void;
  stockPorId?: Record<string, number>;
}

// Helper externo para asignar cookies evitando errores de inmutabilidad en react-hooks
function sincronizarJwtCookie(jwt: string) {
  if (typeof document === 'undefined') return;
  const secureAttr =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';
  document.cookie = `farmacia_jwt=${encodeURIComponent(jwt)}; path=/; max-age=900; SameSite=Lax${secureAttr}`;
}

function formatearUsuario(usuario: unknown): string {
  if (!usuario) return 'Cliente';
  if (typeof usuario === 'object' && usuario !== null) {
    const u = usuario as { nombre?: string; email?: string; $id?: string };
    if (u.nombre) return u.nombre;
    if (u.email) return u.email.split('@')[0];
    if (u.$id) return formatearUsuarioId(u.$id);
  }
  if (typeof usuario === 'string') {
    return formatearUsuarioId(usuario);
  }
  return String(usuario);
}

function formatearUsuarioId(id: string): string {
  if (id.startsWith('user-')) {
    const limpio = id.replace('user-', '');
    return limpio.charAt(0).toUpperCase() + limpio.slice(1);
  }
  return id.length > 12 ? `${id.slice(0, 10)}...` : id;
}

function formatearFecha(iso?: string): string {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Paleta Opción 1: Éxito comercial en Pagado (Verde Esmeralda), Enviado (Ámbar), Entregado (Zinc Neutro)
function obtenerBadgeEstado(estado?: string) {
  switch (estado) {
    case 'pagado':
      return {
        label: 'Pagado',
        dot: 'bg-emerald-500',
        badge: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
      };
    case 'enviado':
      return {
        label: 'Enviado',
        dot: 'bg-amber-500',
        badge: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-400',
      };
    case 'entregado':
      return {
        label: 'Entregado',
        dot: 'bg-zinc-500',
        badge: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
      };
    case 'cancelado':
      return {
        label: 'Cancelado',
        dot: 'bg-red-500',
        badge: 'border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-400',
      };
    case 'pendiente':
    default:
      return {
        label: estado || 'Pendiente',
        dot: 'bg-zinc-400',
        badge: 'border-zinc-400/25 bg-zinc-400/10 text-zinc-600 dark:text-zinc-400',
      };
  }
}

// Transiciones de estado permitidas según la lógica de negocio de la API
const TRANSICIONES_VALIDAS: Record<string, AccionTransicion[]> = {
  pendiente: [
    {
      estado: 'pagado',
      label: 'Marcar Pagado',
      estilo: 'bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:text-black dark:hover:bg-emerald-400',
    },
    {
      estado: 'cancelado',
      label: 'Cancelar Pedido',
      estilo: 'border border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:border-red-500/40',
    },
  ],
  pagado: [
    {
      estado: 'enviado',
      label: 'Marcar Enviado',
      estilo: 'bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:text-black dark:hover:bg-amber-400',
    },
    {
      estado: 'cancelado',
      label: 'Cancelar Pedido',
      estilo: 'border border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400 dark:border-red-500/40',
    },
  ],
  enviado: [
    {
      estado: 'entregado',
      label: 'Marcar Entregado',
      estilo: 'bg-black text-white hover:bg-[#383838] dark:bg-white dark:text-black dark:hover:bg-[#ccc]',
    },
  ],
  entregado: [],
  cancelado: [],
};

export default function MonitorVentas({ mostrarToast, stockPorId }: MonitorVentasProps) {
  const [pedidos, setPedidos] = useState<PedidoItem[]>([]);
  const [cargandoPedidos, setCargandoPedidos] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [cambiandoEstado, setCambiandoEstado] = useState<string | null>(null);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState<PedidoDetallado | null>(null);

  // Asegurar JWT sin llamadas de red redundantes si ya existe en cookies
  const asegurarJwt = useCallback(async () => {
    if (typeof document !== 'undefined' && document.cookie.includes('farmacia_jwt=')) {
      return;
    }
    try {
      const { jwt } = await account.createJWT();
      sincronizarJwtCookie(jwt);
    } catch {
      // Ignorar si no se puede generar JWT en este momento
    }
  }, []);

  const refrescarPedidos = useCallback(async () => {
    try {
      await asegurarJwt();
      const res = await fetch('/api/pedidos', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        mostrarToast('error', err.error || 'No se pudieron consultar los pedidos.');
        return;
      }
      const data: { pedidos?: PedidoItem[] } = await res.json();
      setPedidos(data.pedidos || []);
    } catch {
      mostrarToast('error', 'Error de conexión al cargar pedidos.');
    } finally {
      setCargandoPedidos(false);
    }
  }, [asegurarJwt, mostrarToast]);

  // Suscripción en tiempo real a la tabla de Pedidos (TablesDB + Databases)
  useEffect(() => {
    let cancelado = false;

    asegurarJwt()
      .then(() => fetch('/api/pedidos', { credentials: 'include', cache: 'no-store' }))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelado && data?.pedidos) {
          setPedidos(data.pedidos);
        }
      })
      .catch(() => {
        if (!cancelado) {
          mostrarToast('error', 'Error de conexión al cargar pedidos.');
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCargandoPedidos(false);
        }
      });

    const dbId = APPWRITE_CONFIG.databaseId;
    const tablaPedidos = APPWRITE_CONFIG.tables.pedidos;

    if (!dbId || !tablaPedidos) return;

    const canales = [
      Channel.tablesdb(dbId).table(tablaPedidos).row(),
      `databases.${dbId}.collections.${tablaPedidos}.documents`,
    ];

    let unsubscribeFn: (() => Promise<void>) | null = null;

    realtime
      .subscribe(canales, (response) => {
        const eventos = response.events || [];
        if (
          eventos.some((e) =>
            e.includes('.create') || e.includes('.update') || e.includes('.delete')
          )
        ) {
          void refrescarPedidos();
        }
      })
      .then((sub) => {
        if (!cancelado) {
          unsubscribeFn = () => sub.unsubscribe();
        } else {
          void sub.unsubscribe();
        }
      })
      .catch(() => {});

    return () => {
      cancelado = true;
      if (unsubscribeFn) {
        void unsubscribeFn();
      }
    };
  }, [asegurarJwt, refrescarPedidos, mostrarToast]);

  // Apertura instantánea (0ms de latencia) con datos en memoria + carga en segundo plano de artículos
  const verDetallesPedido = (pedidoResumen: PedidoItem) => {
    const id = pedidoResumen.$id || pedidoResumen.id || '';
    if (!id) return;

    // 1. Abrir inmediatamente el modal con los datos que ya tenemos en memoria
    setPedidoSeleccionado({
      pedido: {
        id,
        usuario: pedidoResumen.usuario_id || pedidoResumen.usuario,
        total: Number(pedidoResumen.total || 0),
        estado: (pedidoResumen.estado as EstadoPedido) || 'pendiente',
        direccionEnvio: pedidoResumen.direccion_envio,
        fecha: pedidoResumen.$createdAt || pedidoResumen.fecha,
      },
      totalDetalles: 0,
      detalles: [],
    });
    setCargandoDetalle(true);

    // 2. Traer en segundo plano los detalles/artículos de la compra
    (async () => {
      try {
        await asegurarJwt();
        const res = await fetch(`/api/pedidos/${id}`, { credentials: 'include' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          mostrarToast('error', err.error || 'No se pudo cargar el detalle del pedido.');
          return;
        }
        const data: PedidoDetallado = await res.json();
        setPedidoSeleccionado(data);
      } catch {
        mostrarToast('error', 'Error al consultar detalle del pedido.');
      } finally {
        setCargandoDetalle(false);
      }
    })();
  };

  const cambiarEstadoPedido = async (id: string, nuevoEstado: EstadoPedido) => {
    setCambiandoEstado(nuevoEstado);
    try {
      await asegurarJwt();
      const res = await fetch(`/api/pedidos/${id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        mostrarToast('error', err.error || 'No se pudo actualizar el estado del pedido.');
        return;
      }

      mostrarToast('exito', `Pedido actualizado a "${nuevoEstado}".`);
      await refrescarPedidos();

      setPedidoSeleccionado((prev) =>
        prev
          ? {
              ...prev,
              pedido: { ...prev.pedido, estado: nuevoEstado },
            }
          : null
      );
    } catch {
      mostrarToast('error', 'Error de red al actualizar estado del pedido.');
    } finally {
      setCambiandoEstado(null);
    }
  };

  const estadoActual = pedidoSeleccionado?.pedido.estado || 'pendiente';
  const transicionesDisponibles = TRANSICIONES_VALIDAS[estadoActual] || [];

  return (
    <div className="flex flex-col gap-4">
      {/* Contador sutil sin botones ni indicadores redundantes */}
      <div className="flex justify-between items-center px-1">
        <span className="text-xs font-mono text-zinc-500">
          {pedidos.length} {pedidos.length === 1 ? 'pedido registrado' : 'pedidos registrados'}
        </span>
      </div>

      {/* Tabla de Pedidos / Ventas */}
      <div className="rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 text-[11px] font-mono uppercase tracking-wider border-b border-black/[.08] dark:border-white/[.145]">
              <tr>
                <th className="px-5 py-3.5 font-medium">Folio</th>
                <th className="px-5 py-3.5 font-medium">Fecha</th>
                <th className="px-5 py-3.5 font-medium">Cliente</th>
                <th className="px-5 py-3.5 font-medium">Total</th>
                <th className="px-5 py-3.5 font-medium">Estado</th>
                <th className="px-5 py-3.5 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[.05] dark:divide-white/[.08]">
              {cargandoPedidos && pedidos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs font-mono text-zinc-400">
                    Cargando transacciones en vivo...
                  </td>
                </tr>
              ) : pedidos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-xs font-mono text-zinc-400">
                    No se han registrado ventas aún.
                  </td>
                </tr>
              ) : (
                pedidos.map((pedido) => {
                  const idCompleto = pedido.$id || pedido.id || '';
                  const badge = obtenerBadgeEstado(pedido.estado);
                  const usuarioNombre = formatearUsuario(pedido.usuario_id || pedido.usuario);
                  const fechaTexto = formatearFecha(pedido.$createdAt || pedido.fecha);

                  return (
                    <tr
                      key={idCompleto}
                      className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors"
                    >
                      <td className="px-5 py-4 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                        #{idCompleto.slice(-8)}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-zinc-500 whitespace-nowrap">
                        {fechaTexto}
                      </td>
                      <td className="px-5 py-4">
                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">
                          {usuarioNombre}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        ${Number(pedido.total || 0).toFixed(2)}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono border ${badge.badge}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => verDetallesPedido(pedido)}
                          className="inline-flex h-8 items-center justify-center rounded-full border border-black/[.08] dark:border-white/[.145] hover:border-black dark:hover:border-white bg-white dark:bg-zinc-900 px-3.5 text-xs font-medium text-black dark:text-zinc-100 transition-all hover:shadow-xs cursor-pointer"
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Detalle y Gestión Operativa del Pedido */}
      {pedidoSeleccionado && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-zinc-950 border border-black/[.08] dark:border-white/[.145] rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl flex flex-col gap-5">
            {/* Cabecera del Modal */}
            <div className="flex justify-between items-start pb-3 border-b border-black/[.08] dark:border-white/[.145]">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Monitor de Ventas · Operación
                </span>
                <div className="flex items-center gap-2.5 mt-1">
                  <h3 className="text-lg font-semibold tracking-tight text-black dark:text-white">
                    Pedido #{pedidoSeleccionado.pedido.id.slice(-8)}
                  </h3>
                  {(() => {
                    const b = obtenerBadgeEstado(pedidoSeleccionado.pedido.estado);
                    return (
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono border ${b.badge}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${b.dot}`} />
                        {b.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPedidoSeleccionado(null)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/[.04] dark:hover:bg-white/[.06] transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Resumen del Cliente y Pedido */}
            <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-zinc-50 dark:bg-zinc-900/50 border border-black/[.05] dark:border-white/[.08] text-xs">
              <div>
                <span className="block text-[10px] font-mono text-zinc-400 uppercase">Cliente</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatearUsuario(pedidoSeleccionado.pedido.usuario)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-mono text-zinc-400 uppercase">Total Pagado</span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 text-sm">
                  ${Number(pedidoSeleccionado.pedido.total).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-mono text-zinc-400 uppercase">Fecha de Orden</span>
                <span className="font-mono text-zinc-600 dark:text-zinc-300">
                  {formatearFecha(pedidoSeleccionado.pedido.fecha)}
                </span>
              </div>
              <div>
                <span className="block text-[10px] font-mono text-zinc-400 uppercase">Dirección de Entrega</span>
                <span className="text-zinc-600 dark:text-zinc-300 truncate block max-w-[180px]">
                  {pedidoSeleccionado.pedido.direccionEnvio || 'Mostrador / No especificada'}
                </span>
              </div>
            </div>

            {/* Artículos Vendidos con Stock Restante en Almacén */}
            <div>
              <div className="flex justify-between items-center mb-2.5">
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                  Artículos en el Pedido {cargandoDetalle ? '(Cargando...)' : `(${pedidoSeleccionado.totalDetalles})`}
                </h4>
                {!cargandoDetalle && <span className="text-[10px] font-mono text-zinc-400">Stock en almacén</span>}
              </div>

              {cargandoDetalle ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-black/[.08] dark:border-white/[.1]">
                  <div className="w-5 h-5 rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-black dark:border-t-white animate-spin" />
                  <span className="text-[11px] font-mono text-zinc-400">Cargando artículos...</span>
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {pedidoSeleccionado.detalles.map((det, idx) => {
                    const prodId = det.producto?.id;
                    const stockActual =
                      prodId && stockPorId && stockPorId[prodId] !== undefined
                        ? stockPorId[prodId]
                        : det.producto?.stock;

                    return (
                      <div
                        key={det.id || idx}
                        className="flex items-center justify-between p-2.5 rounded-xl border border-black/[.05] dark:border-white/[.08] bg-zinc-50/50 dark:bg-zinc-900/30 text-xs"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold px-1.5 py-0.5 rounded-md bg-black/[.05] dark:bg-white/[.08]">
                              {det.cantidad}x
                            </span>
                            {det.producto?.nombre || 'Medicamento'}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400 mt-0.5 ml-7">
                            ${Number(det.precioUnitario || 0).toFixed(2)} c/u
                          </span>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                            ${Number(det.subtotal || 0).toFixed(2)}
                          </span>
                          {stockActual !== undefined && (
                            <span
                              className={`inline-flex items-center text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                                stockActual === 0
                                  ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400 font-semibold'
                                  : stockActual <= 5
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                                  : 'border-black/[.08] dark:border-white/[.1] bg-black/[.02] dark:bg-white/[.03] text-zinc-500 dark:text-zinc-400'
                              }`}
                            >
                              {stockActual === 0
                                ? 'Agotado (0)'
                                : stockActual <= 5
                                ? `Poco stock (${stockActual})`
                                : `Restante: ${stockActual}`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Acciones de Cambio de Estado según el flujo de la API */}
            <div className="pt-3 border-t border-black/[.08] dark:border-white/[.145] space-y-2.5">
              <span className="block text-[11px] font-mono uppercase tracking-wider text-zinc-400">
                Acción de Estado
              </span>

              {transicionesDisponibles.length > 0 ? (
                <div className="flex flex-wrap gap-2.5">
                  {transicionesDisponibles.map((accion) => {
                    const ejecutando = cambiandoEstado === accion.estado;
                    return (
                      <button
                        key={accion.estado}
                        type="button"
                        onClick={() =>
                          void cambiarEstadoPedido(pedidoSeleccionado.pedido.id, accion.estado)
                        }
                        disabled={cambiandoEstado !== null}
                        className={`flex h-9 items-center justify-center rounded-full px-4 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 ${accion.estilo}`}
                      >
                        {ejecutando ? 'Actualizando...' : accion.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-3 rounded-xl border border-black/[.06] dark:border-white/[.08] bg-zinc-50 dark:bg-zinc-900 text-xs text-zinc-500 dark:text-zinc-400 text-center font-mono">
                  {estadoActual === 'entregado'
                    ? '✓ El pedido fue completado y entregado al cliente.'
                    : estadoActual === 'cancelado'
                    ? '✕ El pedido se encuentra cancelado definitivamente.'
                    : 'No hay acciones disponibles para este pedido.'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
