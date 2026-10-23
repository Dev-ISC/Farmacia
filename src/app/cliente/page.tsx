'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { account } from '@/lib/appwrite/client';
import { useRealtimeStock } from '@/hooks/useRealtimeStock';
import InterfazCarrito, {
  leerCarritoLocal,
  guardarCarritoLocal,
  type EntradaCarritoItem,
} from '@/components/cliente/InterfazCarrito';
import type { Producto } from '@/types/database';

interface CategoriaOpcion {
  id: string;
  nombre: string | null;
}

export default function PaginaCliente() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<{ name: string; email: string } | null>(null);
  const [agregadoId, setAgregadoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [categorias, setCategorias] = useState<CategoriaOpcion[]>([]);

  const { productos, stockPorId, cargando, conectadoRealtime } = useRealtimeStock({ soloActivos: true });

  useEffect(() => {
    account
      .get()
      .then((u) => setUsuario({ name: u.name, email: u.email }))
      .catch(() => {
        // Si no hay sesión, middleware o página lo redirige
      });

    fetch('/api/categorias')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.categorias && Array.isArray(data.categorias)) {
          setCategorias(data.categorias);
        }
      })
      .catch(() => {
        // Ignorar
      });
  }, []);

  const cerrarSesion = async () => {
    try {
      await account.deleteSession({ sessionId: 'current' });
    } catch {
      // Ignorar
    }
    if (typeof document !== 'undefined') {
      document.cookie = 'farmacia_session=; path=/; max-age=0; SameSite=Lax';
      document.cookie = 'farmacia_rol=; path=/; max-age=0; SameSite=Lax';
    }
    guardarCarritoLocal([]);
    router.push('/login');
  };

  const agregarAlCarrito = (prod: Producto) => {
    const actuales = leerCarritoLocal();
    const existe = actuales.find((i) => i.productoId === prod.$id);
    const stockDisp = stockPorId[prod.$id] ?? prod.stock;

    if (stockDisp <= 0) return;

    let nuevos: EntradaCarritoItem[];
    if (existe) {
      nuevos = actuales.map((i) =>
        i.productoId === prod.$id
          ? { ...i, cantidad: Math.min(i.cantidad + 1, stockDisp) }
          : i
      );
    } else {
      nuevos = [
        ...actuales,
        {
          productoId: prod.$id,
          nombre: prod.nombre,
          precio: prod.precio,
          cantidad: 1,
        },
      ];
    }

    guardarCarritoLocal(nuevos);
    setAgregadoId(prod.$id);
    setTimeout(() => setAgregadoId(null), 1200);
  };

  // Filtrado reactivo en tiempo real
  const productosFiltrados = productos.filter((prod) => {
    const termino = busqueda.toLowerCase().trim();
    const coincideBusqueda =
      !termino ||
      prod.nombre.toLowerCase().includes(termino) ||
      (prod.sku && prod.sku.toLowerCase().includes(termino));

    const catId =
      typeof prod.categoria === 'string'
        ? prod.categoria
        : prod.categoria && typeof prod.categoria === 'object' && '$id' in prod.categoria
        ? (prod.categoria as { $id: string }).$id
        : null;

    const coincideCategoria =
      categoriaFiltro === 'Todas' || catId === categoriaFiltro;

    return coincideBusqueda && coincideCategoria;
  });

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 font-sans dark:bg-black text-black dark:text-zinc-50">
      {/* Barra superior estilo Vercel */}
      <header className="w-full border-b border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight text-lg">
            Farmacia
          </Link>
          <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
            / Tienda
          </span>
        </div>

        <div className="flex items-center gap-4">
          {usuario && (
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-600 dark:text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{usuario.name}</span>
            </div>
          )}

          {/* Drawer rápido del carrito con contador */}
          <InterfazCarrito modo="drawer" />

          <button
            type="button"
            onClick={cerrarSesion}
            className="text-xs text-zinc-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
          >
            Salir
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className="flex-1 w-full max-w-5xl mx-auto p-6 sm:p-10 flex flex-col gap-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-black/[.08] dark:border-white/[.145]">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Catálogo de Medicamentos
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
              Inventario en tiempo real ({conectadoRealtime ? '🟢 Conectado' : '⚪ Reconectando'})
            </p>
          </div>

          <Link
            href="/cliente/carrito"
            className="flex h-10 items-center justify-center rounded-full bg-black text-white hover:bg-[#383838] dark:bg-white dark:text-black dark:hover:bg-[#ccc] px-5 text-sm font-medium transition-colors"
          >
            Ir al Carrito y Checkout &rarr;
          </Link>
        </div>

        {/* Buscador y Filtro por Categoría */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Buscar por medicamento o SKU..."
              aria-label="Buscar medicamento"
              className="w-full h-10 px-4 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400 hover:text-black dark:hover:text-white cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <select
            aria-label="Filtrar por categoría"
            className="h-10 px-4 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-xs font-mono focus:outline-none focus:border-black dark:focus:border-white transition-colors cursor-pointer"
            value={categoriaFiltro}
            onChange={(e) => setCategoriaFiltro(e.target.value)}
          >
            <option value="Todas">Todas las categorías</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nombre || cat.id}
              </option>
            ))}
          </select>
        </div>

        {/* Grid de Productos con Stock en Vivo */}
        {cargando ? (
          <div className="py-20 text-center font-mono text-xs text-zinc-400">
            Cargando catálogo en vivo...
          </div>
        ) : productosFiltrados.length === 0 ? (
          <div className="py-20 text-center font-mono text-xs text-zinc-400 border border-dashed border-black/[.08] dark:border-white/[.145] rounded-2xl">
            {busqueda || categoriaFiltro !== 'Todas'
              ? 'No se encontraron medicamentos para los filtros seleccionados.'
              : 'No hay medicamentos disponibles en este momento.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {productosFiltrados.map((prod) => {
              const stockActual = stockPorId[prod.$id] ?? prod.stock;
              const agotado = stockActual <= 0;

              return (
                <div
                  key={prod.$id}
                  className="rounded-2xl border border-solid border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black p-5 flex flex-col justify-between transition-colors hover:border-black/[.2] dark:hover:border-white/[.3]"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-semibold text-base tracking-tight line-clamp-1">
                        {prod.nombre}
                      </h3>
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full border border-black/[.08] dark:border-white/[.145] text-zinc-600 dark:text-zinc-400">
                        ${prod.precio.toFixed(2)}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-4">
                      {prod.descripcion || 'Medicamento farmacéutico verificado.'}
                    </p>

                    <p className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 mb-2">
                      SKU: {prod.sku}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-black/[.05] dark:border-white/[.08] flex items-center justify-between">
                    <span className="text-xs font-mono">
                      {agotado ? (
                        <span className="text-red-500 font-medium">Agotado</span>
                      ) : (
                        <span className="text-zinc-600 dark:text-zinc-400">
                          Disponibles: <strong className="text-black dark:text-white">{stockActual}</strong>
                        </span>
                      )}
                    </span>

                    <button
                      type="button"
                      disabled={agotado}
                      onClick={() => agregarAlCarrito(prod)}
                      className="flex h-8 items-center justify-center rounded-full border border-solid border-black/[.08] dark:border-white/[.145] hover:border-black dark:hover:border-white px-3 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {agregadoId === prod.$id ? '✓ Agregado' : '+ Agregar'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
