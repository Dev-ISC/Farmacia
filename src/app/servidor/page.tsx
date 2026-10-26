'use client';
import { useEffect, useState } from 'react';

export default function PanelServidor() {
    const [productos, setProductos] = useState<any[]>([]);

    // Estados para Edición
    const [editando, setEditando] = useState<any>(null);
    const [nuevoPrecio, setNuevoPrecio] = useState('');
    const [nuevoStock, setNuevoStock] = useState('');

    // Estados para Creación
    const [creando, setCreando] = useState(false);
    const [formCrear, setFormCrear] = useState({
        nombre: '', sku: '', precio: '', stock: '', descripcion: '', categoria: ''
    });

    const cargarInventario = async () => {
        const res = await fetch('/api/productos', { cache: 'no-store' });
        if (res.ok) {
            const data = await res.json();
            setProductos(data.productos);
        }
    };

    useEffect(() => {
        cargarInventario();
    }, []);

    const manejarError = async (res: Response) => {
        if (!res.ok) {
            const error = await res.json().catch(() => ({}));
            alert(`Error del servidor (${res.status}): ${error.error || 'Probablemente falte iniciar sesión como Admin (Persona 6)'}`);
            return true;
        }
        return false;
    };

    const desactivarProducto = async (id: string) => {
        const res = await fetch(`/api/productos/${id}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ activo: false }),
        });
        if (await manejarError(res)) return;
        cargarInventario();
    };

    const guardarEdicion = async () => {
        if (!editando) return;

        if (parseFloat(nuevoPrecio) !== editando.precio) {
            const res = await fetch(`/api/productos/${editando.id || editando.$id}`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ precio: parseFloat(nuevoPrecio) }),
            });
            if (await manejarError(res)) return;
        }

        if (parseInt(nuevoStock, 10) !== editando.stock) {
            const resStock = await fetch(`/api/productos/${editando.id || editando.$id}/stock`, {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stock: parseInt(nuevoStock, 10) }),
            });
            if (await manejarError(resStock)) return;
        }

        setEditando(null);
        cargarInventario();
    };

    const guardarNuevoMedicamento = async () => {
        const payload = {
            nombre: formCrear.nombre,
            sku: formCrear.sku,
            precio: parseFloat(formCrear.precio),
            stock: parseInt(formCrear.stock, 10),
            descripcion: formCrear.descripcion,
            categoria: formCrear.categoria || undefined
        };

        const res = await fetch('/api/productos', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (await manejarError(res)) return;

        setCreando(false);
        setFormCrear({ nombre: '', sku: '', precio: '', stock: '', descripcion: '', categoria: '' });
        cargarInventario();
    };

    return (
        <div className="min-h-screen bg-black text-white p-10 font-sans relative">
            <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold mb-2">Panel Administrativo</h1>
                        <p className="text-gray-400 text-sm flex items-center">
                            Gestión de inventario <span className="ml-2 w-2 h-2 rounded-full bg-green-500 inline-block"></span>
                        </p>
                    </div>
                    <button
                        onClick={() => setCreando(true)}
                        className="bg-white text-black px-4 py-2 rounded-full font-semibold hover:bg-gray-200 transition"
                    >
                        + Crear Medicamento
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {productos.map((prod) => {
                        const agotado = prod.stock === 0;
                        const pocoStock = prod.stock <= (prod.stock_minimo || 5);

                        return (
                            <div key={prod.id || prod.$id} className="border border-zinc-800 bg-[#0a0a0a] rounded-xl p-5 flex flex-col justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <h2 className="text-lg font-bold">{prod.nombre}</h2>
                                        <span className="text-sm font-mono bg-zinc-900 px-2 py-1 rounded border border-zinc-700">
                      ${prod.precio.toFixed(2)}
                    </span>
                                    </div>
                                    <p className="text-sm text-gray-400 mb-4">{prod.descripcion}</p>
                                    <p className="text-xs text-zinc-500 mb-4">SKU: {prod.sku}</p>
                                </div>

                                <div className="flex items-center justify-between border-t border-zinc-800 pt-4 mt-auto">
                                    <div className="text-sm font-medium">
                                        {agotado ? (
                                            <span className="text-red-500">Agotado (0)</span>
                                        ) : pocoStock ? (
                                            <span className="text-red-400">Poco stock: {prod.stock}</span>
                                        ) : (
                                            <span className="text-green-400">Stock: {prod.stock}</span>
                                        )}
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => {
                                                setEditando(prod);
                                                setNuevoPrecio(prod.precio.toString());
                                                setNuevoStock(prod.stock.toString());
                                            }}
                                            className="text-xs border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1 rounded-full transition"
                                        >
                                            Editar
                                        </button>
                                        <button
                                            onClick={() => desactivarProducto(prod.id || prod.$id)}
                                            className="text-xs border border-red-900 text-red-400 hover:bg-red-950 px-3 py-1 rounded-full transition"
                                        >
                                            Desactivar
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Modal de Edición */}
            {editando && (
                <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
                    <div className="bg-[#111] border border-zinc-800 p-6 rounded-xl w-96">
                        <h3 className="text-xl font-bold mb-4">Editar {editando.nombre}</h3>

                        <div className="mb-4">
                            <label className="block text-sm text-gray-400 mb-1">Precio ($)</label>
                            <input type="number" step="0.01" value={nuevoPrecio} onChange={(e) => setNuevoPrecio(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white outline-none focus:border-zinc-500" />
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm text-gray-400 mb-1">Stock Absoluto</label>
                            <input type="number" value={nuevoStock} onChange={(e) => setNuevoStock(e.target.value)} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white outline-none focus:border-zinc-500" />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setEditando(null)} className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition">Cancelar</button>
                            <button onClick={guardarEdicion} className="px-4 py-2 rounded bg-white text-black hover:bg-gray-200 text-sm font-medium transition">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de Creación */}
            {creando && (
                <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
                    <div className="bg-[#111] border border-zinc-800 p-6 rounded-xl w-[32rem]">
                        <h3 className="text-xl font-bold mb-4">Crear Nuevo Medicamento</h3>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Nombre</label>
                                <input type="text" value={formCrear.nombre} onChange={(e) => setFormCrear({...formCrear, nombre: e.target.value})} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white outline-none focus:border-zinc-500" />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">SKU</label>
                                <input type="text" value={formCrear.sku} onChange={(e) => setFormCrear({...formCrear, sku: e.target.value})} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white outline-none focus:border-zinc-500" />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Precio ($)</label>
                                <input type="number" step="0.01" value={formCrear.precio} onChange={(e) => setFormCrear({...formCrear, precio: e.target.value})} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white outline-none focus:border-zinc-500" />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Stock Inicial</label>
                                <input type="number" value={formCrear.stock} onChange={(e) => setFormCrear({...formCrear, stock: e.target.value})} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white outline-none focus:border-zinc-500" />
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm text-gray-400 mb-1">Descripción</label>
                            <textarea value={formCrear.descripcion} onChange={(e) => setFormCrear({...formCrear, descripcion: e.target.value})} className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-white outline-none focus:border-zinc-500 h-20" />
                        </div>

                        <div className="flex justify-end gap-3">
                            <button onClick={() => setCreando(false)} className="px-4 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-sm font-medium transition">Cancelar</button>
                            <button onClick={guardarNuevoMedicamento} className="px-4 py-2 rounded bg-white text-black hover:bg-gray-200 text-sm font-medium transition">Registrar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}