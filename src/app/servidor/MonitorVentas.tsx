'use client';

import { useState, useEffect } from 'react';
import { account } from '@/lib/appwrite/client';

interface Pedido {
    $id?: string;
    id?: string;
    total?: number;
    estado?: string;
}

interface DetallePedido {
    cantidad: number;
    subtotal?: number;
    producto?: {
        nombre?: string;
    };
}

interface PedidoSeleccionado {
    id?: string;
    pedido?: {
        id?: string;
        total?: number;
    };
    totalDetalles?: number;
    detalles?: DetallePedido[];
}

export default function MonitorVentas({ mostrarToast }: { mostrarToast: (tipo: 'exito' | 'error', m: string) => void }) {
    const [pedidos, setPedidos] = useState<Pedido[]>([]);
    const [cargandoPedidos, setCargandoPedidos] = useState(false);
    const [pedidoSeleccionado, setPedidoSeleccionado] = useState<PedidoSeleccionado | null>(null);

    const asegurarJwt = async () => {
        try {
            const { jwt } = await account.createJWT();
            document.cookie = `farmacia_jwt=${encodeURIComponent(jwt)}; path=/; max-age=900; SameSite=Lax`;
        } catch {}
    };

    const cargarPedidos = async () => {
        setCargandoPedidos(true);
        try {
            await asegurarJwt();
            const res = await fetch('/api/pedidos', { credentials: 'include', cache: 'no-store' });
            if (res.ok) {
                const data: { pedidos?: Pedido[] } = await res.json();
                setPedidos(data.pedidos || []);
            }
        } catch {
            mostrarToast('error', 'Error al cargar ventas.');
        } finally {
            setCargandoPedidos(false);
        }
    };

    const verDetallesPedido = async (id: string) => {
        try {
            await asegurarJwt();
            const res = await fetch(`/api/pedidos/${id}`, { credentials: 'include' });
            if (res.ok) {
                const data: PedidoSeleccionado = await res.json();
                setPedidoSeleccionado(data);
            }
        } catch {
            mostrarToast('error', 'Error al cargar detalle.');
        }
    };

    const cambiarEstadoPedido = async (id: string, nuevoEstado: string) => {
        try {
            await asegurarJwt();
            const res = await fetch(`/api/pedidos/${id}`, {
                method: 'PATCH', credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado: nuevoEstado }),
            });
            if (!res.ok) throw new Error();
            mostrarToast('exito', `Pedido marcado como ${nuevoEstado}`);
            void cargarPedidos();
            setPedidoSeleccionado(null);
        } catch {
            mostrarToast('error', 'Error al cambiar estado.');
        }
    };

    useEffect(() => {
        const cargar = async () => {
            await cargarPedidos();
        };
        void cargar();
    }, []);

    return (
        <>
            <div className="flex justify-end mb-4">
                <button onClick={cargarPedidos} disabled={cargandoPedidos} className="flex h-10 items-center justify-center rounded-full border border-black/[.08] dark:border-white/[.145] hover:border-black dark:hover:border-white bg-white dark:bg-black px-5 text-sm font-medium transition-colors shadow-xs">
                    {cargandoPedidos ? 'Actualizando...' : 'Actualizar Ventas'}
                </button>
            </div>

            <div className="rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black overflow-hidden shadow-xs">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-50 dark:bg-zinc-950 text-zinc-500 dark:text-zinc-400 text-xs font-mono uppercase tracking-wider border-b border-black/[.08] dark:border-white/[.145]">
                    <tr>
                        <th className="px-6 py-4 font-medium">ID Pedido</th>
                        <th className="px-6 py-4 font-medium">Total</th>
                        <th className="px-6 py-4 font-medium">Estado</th>
                        <th className="px-6 py-4 font-medium text-right">Acción</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[.05] dark:divide-white/[.08]">
                    {cargandoPedidos && pedidos.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-xs font-mono text-zinc-400">Cargando transacciones...</td></tr>
                    ) : pedidos.length === 0 ? (
                        <tr><td colSpan={4} className="px-6 py-12 text-center text-xs font-mono text-zinc-400">No hay pedidos recientes.</td></tr>
                    ) : (
                        pedidos.map((pedido) => (
                            <tr key={pedido.$id || pedido.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                                <td className="px-6 py-4 font-mono text-xs text-zinc-600 dark:text-zinc-300">{(pedido.$id || pedido.id || '').slice(-8)}</td>
                                <td className="px-6 py-4 font-semibold text-emerald-600 dark:text-emerald-400">${pedido.total?.toFixed(2)}</td>
                                <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase border ${
                        pedido.estado === 'pagado' ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900/50' :
                            pedido.estado === 'cancelado' ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900/50' :
                                'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800'
                    }`}>{pedido.estado}</span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => void verDetallesPedido(pedido.$id || pedido.id || '')} className="text-[11px] bg-black text-white dark:bg-white dark:text-black px-3 py-1.5 rounded-full">Gestionar</button>
                                </td>
                            </tr>
                        ))
                    )}
                    </tbody>
                </table>
            </div>

            {pedidoSeleccionado && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-black border border-black/[.08] dark:border-white/[.145] rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl flex flex-col gap-5">
                        <div className="flex justify-between items-start">
                            <div><span className="text-[11px] font-mono text-zinc-400">Detalle Operativo</span><h3 className="text-lg font-semibold tracking-tight mt-0.5">Gestión de Pedido</h3></div>
                            <button onClick={() => setPedidoSeleccionado(null)} className="text-zinc-400 hover:text-black dark:hover:text-white">✕</button>
                        </div>
                        <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-black/[.05]">
                            <p className="text-xs font-mono text-zinc-500 mb-1">ID: <span className="text-black dark:text-white">{pedidoSeleccionado.pedido?.id || pedidoSeleccionado.id}</span></p>
                            <p className="text-xs font-mono text-zinc-500">Total: <span className="text-emerald-600 dark:text-emerald-400 font-semibold">${pedidoSeleccionado.pedido?.total?.toFixed(2)}</span></p>
                        </div>
                        <div>
                            <h4 className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-2 border-b pb-1">Artículos ({pedidoSeleccionado.totalDetalles || 0})</h4>
                            <div className="max-h-32 overflow-y-auto space-y-2 pr-1">
                                {pedidoSeleccionado.detalles?.map((det, idx) => (
                                    <div key={idx} className="flex justify-between text-xs items-center">
                                        <span className="text-zinc-700 dark:text-zinc-300"><span className="font-mono text-zinc-400 mr-2">{det.cantidad}x</span> {det.producto?.nombre}</span>
                                        <span className="font-mono text-zinc-500">${det.subtotal?.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="pt-2 border-t">
                            <h4 className="text-[11px] font-mono text-zinc-400 uppercase tracking-wider mb-3">Actualizar Estado</h4>
                            <div className="grid grid-cols-2 gap-2">
                                <button onClick={() => void cambiarEstadoPedido(pedidoSeleccionado.pedido?.id || pedidoSeleccionado.id || '', 'pagado')} className="text-xs py-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950/30 dark:text-blue-400">Pagado</button>
                                <button onClick={() => void cambiarEstadoPedido(pedidoSeleccionado.pedido?.id || pedidoSeleccionado.id || '', 'cancelado')} className="text-xs py-2 rounded-xl bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/30 dark:text-red-400">Cancelado</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}