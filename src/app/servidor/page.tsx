'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { account } from '@/lib/appwrite/client';
import { useRealtimeStock } from '@/hooks/useRealtimeStock';
import MonitorVentas from '@/app/servidor/MonitorVentas';
import type { Producto } from '@/types/database';

interface CategoriaOpcion {
  id: string;
  nombre: string | null;
}

interface ToastInfo {
  tipo: 'exito' | 'error';
  mensaje: string;
}

type FiltroMetrica = 'todos' | 'conStock' | 'poco' | 'agotados';

export default function PanelServidor() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<{ name: string; email: string } | null>(null);

  // Estado para controlar la pestaña activa
  const [tabActiva, setTabActiva] = useState<'inventario' | 'ventas'>('inventario');

  // Hook de inventario en tiempo real sincronizado por WebSockets
  const { productos, stockPorId, cargando, conectadoRealtime, recargar } = useRealtimeStock({
    soloActivos: false,
  });

  // Filtros y búsqueda
  const [busqueda, setBusqueda] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('Todas');
  const [filtroMetrica, setFiltroMetrica] = useState<FiltroMetrica>('todos');
  const [categorias, setCategorias] = useState<CategoriaOpcion[]>([]);
  const [skuCopiado, setSkuCopiado] = useState<string | null>(null);

  // Estados de notificación Toast
  const [toast, setToast] = useState<ToastInfo | null>(null);

  const mostrarToast = (tipo: 'exito' | 'error', mensaje: string) => {
    setToast({ tipo, mensaje });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  // Estados para Edición
  const [editando, setEditando] = useState<Producto | null>(null);
  const [formEditar, setFormEditar] = useState({
    nombre: '',
    precio: '',
    stock: '',
    descripcion: '',
    activo: true,
  });
  const [guardando, setGuardando] = useState(false);

  // Estados para Creación
  const [creando, setCreando] = useState(false);
  const [formCrear, setFormCrear] = useState({
    nombre: '',
    sku: '',
    precio: '',
    stock: '',
    stock_minimo: '5',
    categoria: '',
    descripcion: '',
  });
  const [guardandoCreacion, setGuardandoCreacion] = useState(false);

  // Cargar usuario autenticado y catálogo de categorías
  useEffect(() => {
    account
        .get()
        .then(async (u) => {
          setUsuario({ name: u.name, email: u.email });
          try {
            const { jwt } = await account.createJWT();
            const secureAttr =
                typeof window !== 'undefined' && window.location.protocol === 'https:'
                    ? '; Secure'
                    : '';
            document.cookie = `farmacia_jwt=${encodeURIComponent(jwt)}; path=/; max-age=900; SameSite=Lax${secureAttr}`;
          } catch {
            // Ignorar si no se puede generar JWT en este momento
          }
        })
        .catch(() => {
          // Ignorar si middleware redirige
        });

    fetch('/api/categorias')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.categorias && Array.isArray(data.categorias)) {
            setCategorias(data.categorias);
          }
        })
        .catch(() => {
          // Ignorar en caso de error de red
        });
  }, []);

  // Diccionario de categorías para resolver nombres legibles
  const mapaCategorias = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const cat of categorias) {
      if (cat.nombre) mapa.set(cat.id, cat.nombre);
    }
    return mapa;
  }, [categorias]);

  const obtenerNombreCategoria = (prod: Producto): string | null => {
    if (!prod.categoria) return null;
    const catId =
        typeof prod.categoria === 'string'
            ? prod.categoria
            : typeof prod.categoria === 'object' && '$id' in prod.categoria
                ? (prod.categoria as { $id: string }).$id
                : null;

    if (!catId) return null;
    return mapaCategorias.get(catId) || null;
  };

  const copiarSku = (sku: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(sku);
      setSkuCopiado(sku);
      mostrarToast('exito', `SKU ${sku} copiado al portapapeles.`);
      setTimeout(() => setSkuCopiado(null), 2000);
    }
  };

  const cerrarSesion = async () => {
    try {
      await account.deleteSession({ sessionId: 'current' });
    } catch {
      // Ignorar si no había sesión en cliente
    }
    if (typeof document !== 'undefined') {
      const secureAttr =
          typeof window !== 'undefined' && window.location.protocol === 'https:'
              ? '; Secure'
              : '';
      document.cookie = `farmacia_session=; path=/; max-age=0; SameSite=Lax${secureAttr}`;
      document.cookie = `farmacia_rol=; path=/; max-age=0; SameSite=Lax${secureAttr}`;
      document.cookie = `farmacia_jwt=; path=/; max-age=0; SameSite=Lax${secureAttr}`;
      try {
        localStorage.removeItem('farmacia_cart');
        window.dispatchEvent(new Event('farmacia_cart_updated'));
      } catch {
        // Ignorar
      }
    }
    router.push('/login');
  };

  // Renueva o asegura el token JWT antes de peticiones administrativas protegidas
  const asegurarJwt = async () => {
    try {
      const { jwt } = await account.createJWT();
      const secureAttr =
          typeof window !== 'undefined' && window.location.protocol === 'https:'
              ? '; Secure'
              : '';
      document.cookie = `farmacia_jwt=${encodeURIComponent(jwt)}; path=/; max-age=900; SameSite=Lax${secureAttr}`;
    } catch {
      // Ignorar si se usa cookie de sesión nativa
    }
  };

  // Activar medicamento inactivo con un solo clic
  const activarProducto = async (prod: Producto) => {
    try {
      await asegurarJwt();
      const res = await fetch(`/api/productos/${prod.$id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activo: true }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        mostrarToast('error', errorData.error || 'No se pudo activar el medicamento.');
        return;
      }

      mostrarToast('exito', `${prod.nombre} activado para venta.`);
      await recargar();
    } catch {
      mostrarToast('error', 'Error al activar el medicamento.');
    }
  };

  // Abrir modal de edición con los datos del producto
  const abrirEdicion = (prod: Producto) => {
    const stockActual = stockPorId[prod.$id] ?? prod.stock;
    setEditando(prod);
    setFormEditar({
      nombre: prod.nombre,
      precio: prod.precio.toString(),
      stock: stockActual.toString(),
      descripcion: prod.descripcion || '',
      activo: prod.activo,
    });
  };

  // Guardar edición
  const guardarEdicion = async () => {
    if (!editando) return;

    // Validación defensiva previa de datos numéricos y campos obligatorios
    const nombreLimpio = formEditar.nombre.trim();
    if (!nombreLimpio) {
      mostrarToast('error', 'El nombre comercial no puede estar vacío.');
      return;
    }

    const precioNum = parseFloat(formEditar.precio);
    if (isNaN(precioNum) || precioNum < 0) {
      mostrarToast('error', 'Ingresa un precio numérico válido mayor o igual a 0.');
      return;
    }

    const stockNum = parseInt(formEditar.stock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      mostrarToast('error', 'Ingresa un stock entero válido mayor o igual a 0.');
      return;
    }

    setGuardando(true);

    try {
      await asegurarJwt();
      const stockActual = stockPorId[editando.$id] ?? editando.stock;

      // 1. Datos generales editables: nombre, precio, descripcion, activo
      const cambiosGenerales: Record<string, unknown> = {};
      if (nombreLimpio !== editando.nombre) {
        cambiosGenerales.nombre = nombreLimpio;
      }
      if (precioNum !== editando.precio) {
        cambiosGenerales.precio = precioNum;
      }
      if (formEditar.descripcion !== (editando.descripcion || '')) {
        cambiosGenerales.descripcion = formEditar.descripcion;
      }
      if (formEditar.activo !== editando.activo) {
        cambiosGenerales.activo = formEditar.activo;
      }

      if (Object.keys(cambiosGenerales).length > 0) {
        const resGen = await fetch(`/api/productos/${editando.$id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cambiosGenerales),
        });

        if (!resGen.ok) {
          const err = await resGen.json().catch(() => ({}));
          mostrarToast('error', err.error || 'Error al actualizar datos del medicamento.');
          setGuardando(false);
          return;
        }
      }

      // 2. Modificación de existencias absolutas
      if (stockNum !== stockActual) {
        const resStock = await fetch(`/api/productos/${editando.$id}/stock`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stock: stockNum }),
        });

        if (!resStock.ok) {
          const err = await resStock.json().catch(() => ({}));
          mostrarToast('error', err.error || 'Error al actualizar el stock.');
          setGuardando(false);
          return;
        }
      }

      mostrarToast('exito', 'Medicamento actualizado con éxito.');
      setEditando(null);
      await recargar();
    } catch {
      mostrarToast('error', 'Error al guardar los cambios.');
    } finally {
      setGuardando(false);
    }
  };

  // Registrar medicamento
  const registrarMedicamento = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formCrear.nombre.trim() || !formCrear.sku.trim() || !formCrear.precio || !formCrear.stock) {
      mostrarToast('error', 'Completa los campos obligatorios: Nombre, SKU, Precio y Stock.');
      return;
    }

    const precioNum = parseFloat(formCrear.precio);
    if (isNaN(precioNum) || precioNum < 0) {
      mostrarToast('error', 'Ingresa un precio válido mayor o igual a 0.');
      return;
    }

    const stockNum = parseInt(formCrear.stock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      mostrarToast('error', 'Ingresa un stock inicial entero mayor o igual a 0.');
      return;
    }

    const stockMinimoRaw = formCrear.stock_minimo.trim();
    const stockMinimo = stockMinimoRaw === '' ? 5 : Number(stockMinimoRaw);
    if (!Number.isSafeInteger(stockMinimo) || stockMinimo < 0) {
      mostrarToast('error', 'El stock mínimo debe ser un número entero seguro mayor o igual a 0.');
      return;
    }

    setGuardandoCreacion(true);

    try {
      await asegurarJwt();
      const payload = {
        nombre: formCrear.nombre.trim(),
        sku: formCrear.sku.trim(),
        precio: precioNum,
        stock: stockNum,
        stock_minimo: stockMinimo,
        descripcion: formCrear.descripcion.trim() || undefined,
        categoria: formCrear.categoria.trim() || undefined,
        activo: true,
      };

      const res = await fetch('/api/productos', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        mostrarToast('error', err.error || 'No se pudo crear el medicamento.');
        setGuardandoCreacion(false);
        return;
      }

      mostrarToast('exito', 'Medicamento registrado exitosamente.');
      setCreando(false);
      setFormCrear({
        nombre: '',
        sku: '',
        precio: '',
        stock: '',
        stock_minimo: '5',
        categoria: '',
        descripcion: '',
      });
      await recargar();
    } catch {
      mostrarToast('error', 'Error de conexión.');
    } finally {
      setGuardandoCreacion(false);
    }
  };

  // Métricas rápidas para el dashboard (KPIs)
  const metricas = useMemo(() => {
    const total = productos.length;
    let totalStock = 0;
    let pocoStock = 0;
    let agotados = 0;

    for (const prod of productos) {
      const actual = stockPorId[prod.$id] ?? prod.stock;
      totalStock += actual;
      if (actual <= 0) {
        agotados++;
      } else if (actual <= (prod.stock_minimo ?? 5)) {
        pocoStock++;
      }
    }

    return { total, totalStock, pocoStock, agotados };
  }, [productos, stockPorId]);

  // Filtrado reactivo en tiempo real combinando texto, categoría y métrica activa
  const productosFiltrados = useMemo(() => {
    return productos.filter((prod) => {
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

      const coincideCategoria = categoriaFiltro === 'Todas' || catId === categoriaFiltro;

      const stockActual = stockPorId[prod.$id] ?? prod.stock;
      let coincideMetrica = true;
      if (filtroMetrica === 'conStock') coincideMetrica = stockActual > 0;
      if (filtroMetrica === 'poco') coincideMetrica = stockActual > 0 && stockActual <= (prod.stock_minimo ?? 5);
      if (filtroMetrica === 'agotados') coincideMetrica = stockActual <= 0;

      return coincideBusqueda && coincideCategoria && coincideMetrica;
    });
  }, [productos, busqueda, categoriaFiltro, filtroMetrica, stockPorId]);

  return (
      <div className="min-h-screen flex flex-col bg-zinc-50 font-sans dark:bg-black text-black dark:text-zinc-50">
        {/* Barra superior estilo Vercel */}
        <header className="w-full border-b border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black px-6 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            <Link href="/" className="font-semibold tracking-tight text-lg">
              Farmacia
            </Link>
            <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
            / Servidor
          </span>
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-medium border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-900">
            Admin
          </span>
          </div>

          <div className="flex items-center gap-3">
            {usuario && (
                <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>{usuario.name}</span>
                </div>
            )}

            <button
                type="button"
                onClick={() => setTabActiva('ventas')}
                className={`flex h-8 items-center justify-center rounded-full border border-solid px-3.5 text-xs font-medium transition-colors ${
                    tabActiva === 'ventas'
                        ? 'border-black dark:border-white text-black dark:text-white bg-black/[.05] dark:bg-white/[.1]'
                        : 'border-black/[.08] dark:border-white/[.145] text-zinc-600 dark:text-zinc-300 hover:border-black dark:hover:border-white'
                }`}
            >
              Ventas
            </button>

            <Link
                href="/cliente"
                className="flex h-8 items-center justify-center rounded-full border border-solid border-black/[.08] dark:border-white/[.145] hover:border-black dark:hover:border-white px-3.5 text-xs font-medium transition-colors"
            >
              Tienda &rarr;
            </Link>

            <button
                type="button"
                onClick={cerrarSesion}
                className="text-xs text-zinc-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer ml-1"
            >
              Salir
            </button>
          </div>
        </header>

        {/* Contenido principal */}
        <main className="flex-1 w-full max-w-5xl mx-auto p-6 sm:p-10 flex flex-col gap-8">

          {/* Cabecera y Tabs Interiores */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-black/[.08] dark:border-white/[.145]">
            <div className="flex flex-col gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
                  Panel Administrativo
                </h1>
                {tabActiva === 'inventario' && (
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1 flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${conectadoRealtime ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                      Inventario en vivo ({conectadoRealtime ? 'Conectado' : 'Reconectando'})
                    </p>
                )}
              </div>

              <div className="flex gap-6 mt-2">
                <button
                    onClick={() => setTabActiva('inventario')}
                    className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                        tabActiva === 'inventario'
                            ? 'border-black dark:border-white text-black dark:text-white'
                            : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                >
                  Inventario
                </button>
                <button
                    onClick={() => setTabActiva('ventas')}
                    className={`text-sm font-medium pb-2 border-b-2 transition-colors ${
                        tabActiva === 'ventas'
                            ? 'border-black dark:border-white text-black dark:text-white'
                            : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'
                    }`}
                >
                  Monitor de Ventas
                </button>
              </div>
            </div>

            <div className="pb-2">
              {tabActiva === 'inventario' && (
                  <button
                      type="button"
                      onClick={() => setCreando(true)}
                      className="flex h-10 items-center justify-center rounded-full bg-black text-white hover:bg-[#383838] dark:bg-white dark:text-black dark:hover:bg-[#ccc] px-5 text-sm font-medium transition-colors cursor-pointer"
                  >
                    + Registrar Medicamento
                  </button>
              )}
            </div>
          </div>

          {/* --- CONTENIDO SEGÚN LA PESTAÑA ACTIVA --- */}
          {tabActiva === 'inventario' && (
              <>
                {/* Tarjetas de Métricas Rápidas (KPIs Interactivos para Filtrar) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <button
                      type="button"
                      onClick={() => setFiltroMetrica(filtroMetrica === 'todos' ? 'todos' : 'todos')}
                      className={`text-left rounded-2xl border border-solid p-4 flex flex-col gap-1 transition-all cursor-pointer ${
                          filtroMetrica === 'todos'
                              ? 'border-black dark:border-white bg-zinc-50 dark:bg-zinc-900/50 shadow-xs'
                              : 'border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black hover:border-black/[.2] dark:hover:border-white/[.3]'
                      }`}
                  >
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Medicamentos
                </span>
                    <span className="text-2xl font-semibold font-mono tracking-tight">{metricas.total}</span>
                  </button>

                  <button
                      type="button"
                      onClick={() => setFiltroMetrica(filtroMetrica === 'conStock' ? 'todos' : 'conStock')}
                      className={`text-left rounded-2xl border border-solid p-4 flex flex-col gap-1 transition-all cursor-pointer ${
                          filtroMetrica === 'conStock'
                              ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs'
                              : 'border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black hover:border-black/[.2] dark:hover:border-white/[.3]'
                      }`}
                  >
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Stock Total
                </span>
                    <span className="text-2xl font-semibold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                  {metricas.totalStock}
                </span>
                  </button>

                  <button
                      type="button"
                      onClick={() => setFiltroMetrica(filtroMetrica === 'poco' ? 'todos' : 'poco')}
                      className={`text-left rounded-2xl border border-solid p-4 flex flex-col gap-1 transition-all cursor-pointer ${
                          filtroMetrica === 'poco'
                              ? 'border-amber-500 bg-amber-50/30 dark:bg-amber-950/20 shadow-xs'
                              : 'border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black hover:border-black/[.2] dark:hover:border-white/[.3]'
                      }`}
                  >
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Poco Stock
                </span>
                    <span className="text-2xl font-semibold font-mono tracking-tight text-amber-500">
                  {metricas.pocoStock}
                </span>
                  </button>

                  <button
                      type="button"
                      onClick={() => setFiltroMetrica(filtroMetrica === 'agotados' ? 'todos' : 'agotados')}
                      className={`text-left rounded-2xl border border-solid p-4 flex flex-col gap-1 transition-all cursor-pointer ${
                          filtroMetrica === 'agotados'
                              ? 'border-red-500 bg-red-50/30 dark:bg-red-950/20 shadow-xs'
                              : 'border-black/[.08] dark:border-white/[.145] bg-white dark:bg-black hover:border-black/[.2] dark:hover:border-white/[.3]'
                      }`}
                  >
                <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Agotados
                </span>
                    <span className="text-2xl font-semibold font-mono tracking-tight text-red-500">
                  {metricas.agotados}
                </span>
                  </button>
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

                  {filtroMetrica !== 'todos' && (
                      <button
                          type="button"
                          onClick={() => setFiltroMetrica('todos')}
                          className="h-10 px-4 rounded-full border border-dashed border-zinc-400 text-xs font-mono text-zinc-600 dark:text-zinc-400 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                      >
                        Filtro:{' '}
                        {filtroMetrica === 'conStock'
                            ? 'Con Stock'
                            : filtroMetrica === 'poco'
                                ? 'Poco Stock'
                                : 'Agotados'}{' '}
                        &times;
                      </button>
                  )}
                </div>

                {/* Grid de Productos */}
                {cargando ? (
                    <div className="py-20 text-center font-mono text-xs text-zinc-400">
                      Cargando catálogo en vivo...
                    </div>
                ) : productosFiltrados.length === 0 ? (
                    <div className="py-20 text-center font-mono text-xs text-zinc-400 border border-dashed border-black/[.08] dark:border-white/[.145] rounded-2xl">
                      {busqueda || categoriaFiltro !== 'Todas' || filtroMetrica !== 'todos'
                          ? 'No se encontraron medicamentos para los filtros seleccionados.'
                          : 'No hay medicamentos registrados en este momento.'}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {productosFiltrados.map((prod) => {
                        const stockActual = stockPorId[prod.$id] ?? prod.stock;
                        const agotado = stockActual <= 0;
                        const stockMinimo = prod.stock_minimo ?? 5;
                        const pocoStock = stockActual > 0 && stockActual <= stockMinimo;
                        const inactivo = !prod.activo;
                        const nombreCategoria = obtenerNombreCategoria(prod);

                        let alertaClase = 'border-black/[.08] dark:border-white/[.145] hover:border-black/[.2] dark:hover:border-white/[.3]';
                        if (inactivo) {
                          alertaClase = 'border-dashed border-zinc-400/80 dark:border-zinc-700/80 bg-zinc-100/50 dark:bg-zinc-950/40';
                        } else if (agotado) {
                          alertaClase = 'border-red-500/40 dark:border-red-500/40 bg-red-500/[0.015] hover:border-red-500/70';
                        } else if (pocoStock) {
                          alertaClase = 'border-amber-500/40 dark:border-amber-500/40 bg-amber-500/[0.015] hover:border-amber-500/70';
                        }

                        return (
                            <div
                                key={prod.$id}
                                className={`rounded-2xl border border-solid bg-white dark:bg-black p-6 flex flex-col justify-between transition-colors ${alertaClase}`}
                            >
                              <div className={`mb-4 transition-opacity ${inactivo ? 'opacity-50' : ''}`}>
                                <div className="flex items-start justify-between gap-2 mb-2">
                                  <div className="flex flex-col">
                                    <h3 className="font-semibold text-base tracking-tight line-clamp-1">
                                      {prod.nombre}
                                    </h3>
                                    {nombreCategoria && (
                                        <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 mt-0.5">
                                {nombreCategoria}
                              </span>
                                    )}
                                  </div>
                                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full border border-black/[.08] dark:border-white/[.145] text-zinc-600 dark:text-zinc-400">
                            ${prod.precio.toFixed(2)}
                          </span>
                                </div>

                                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-4">
                                  {prod.descripcion || 'Medicamento farmacéutico verificado.'}
                                </p>

                                <div className="flex items-center gap-2">
                                  <button
                                      type="button"
                                      onClick={() => copiarSku(prod.sku)}
                                      className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 hover:text-black dark:hover:text-white transition-colors cursor-pointer"
                                      title="Haz clic para copiar el SKU"
                                  >
                                    SKU: {prod.sku} {skuCopiado === prod.sku ? '✓' : ''}
                                  </button>
                                </div>
                              </div>

                              <div className="pt-3 border-t border-black/[.05] dark:border-white/[.08] flex items-center justify-between gap-2">
                                <div className={`flex flex-col gap-0.5 transition-opacity ${inactivo ? 'opacity-50' : ''}`}>
                          <span className="text-xs font-mono">
                            {inactivo ? (
                                <span className="text-zinc-500 dark:text-zinc-400 font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                                Inactivo {agotado ? '· Agotado (0)' : `· Stock: ${stockActual}`}
                              </span>
                            ) : agotado ? (
                                <span className="text-red-500 font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                Agotado (0)
                              </span>
                            ) : pocoStock ? (
                                <span className="text-amber-500 font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                Poco stock: <strong className="text-black dark:text-white">{stockActual}</strong>
                              </span>
                            ) : (
                                <span className="text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Disponibles: <strong className="text-black dark:text-white">{stockActual}</strong>
                              </span>
                            )}
                          </span>

                                  <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 pl-3">
                            {inactivo ? 'Oculto en tienda' : `Mínimo alerta: ${stockMinimo}`}
                          </span>
                                </div>

                                <div
                                    className={`flex items-center gap-2 shrink-0 ${
                                        inactivo ? 'opacity-80 hover:opacity-100 transition-opacity' : ''
                                    }`}
                                >
                                  <button
                                      type="button"
                                      onClick={() => abrirEdicion(prod)}
                                      className="flex h-8 items-center justify-center rounded-full border border-solid border-black/[.08] dark:border-white/[.145] hover:border-black dark:hover:border-white px-3 text-xs font-medium transition-colors cursor-pointer bg-white dark:bg-black"
                                  >
                                    Editar
                                  </button>

                                  {inactivo && (
                                      <button
                                          type="button"
                                          onClick={() => activarProducto(prod)}
                                          className="flex h-8 items-center justify-center rounded-full bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-400 dark:text-black px-3.5 text-xs font-medium transition-colors cursor-pointer shadow-xs"
                                      >
                                        Activar
                                      </button>
                                  )}
                                </div>
                              </div>
                            </div>
                        );
                      })}
                    </div>
                )}
              </>
          )}

          {/* --- COMPONENTE IMPORTADO DE VENTAS --- */}
          {tabActiva === 'ventas' && (
              <MonitorVentas mostrarToast={mostrarToast} />
          )}
        </main>

        {/* Modal de Edición */}
        {editando && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-black border border-black/[.08] dark:border-white/[.145] rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl flex flex-col gap-6">
                <div>
              <span className="text-[11px] font-mono text-zinc-400">
                SKU: {editando.sku}
              </span>
                  <h3 className="text-xl font-semibold tracking-tight mt-0.5">
                    Editar Medicamento
                  </h3>
                </div>

                <div className="flex flex-col gap-4">
                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-1">
                      Nombre Comercial
                    </label>
                    <input
                        type="text"
                        value={formEditar.nombre}
                        onChange={(e) => setFormEditar({ ...formEditar, nombre: e.target.value })}
                        className="w-full h-10 px-3.5 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-1">
                        Precio ($ MXN)
                      </label>
                      <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formEditar.precio}
                          onChange={(e) => setFormEditar({ ...formEditar, precio: e.target.value })}
                          className="w-full h-10 px-3.5 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-1">
                        Stock Absoluto
                      </label>
                      <input
                          type="number"
                          min="0"
                          value={formEditar.stock}
                          onChange={(e) => setFormEditar({ ...formEditar, stock: e.target.value })}
                          className="w-full h-10 px-3.5 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-1">
                      Descripción
                    </label>
                    <textarea
                        value={formEditar.descripcion}
                        onChange={(e) => setFormEditar({ ...formEditar, descripcion: e.target.value })}
                        rows={2}
                        className="w-full p-3 rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors resize-none"
                    />
                  </div>

                  {/* Interruptor Toggle Switch para Estado Activo/Inactivo */}
                  <div className="flex items-center justify-between p-3.5 rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-zinc-50 dark:bg-zinc-950">
                    <div className="flex flex-col">
                      <span className="text-xs font-medium">Estado del Medicamento</span>
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    {formEditar.activo ? 'Visible en tienda para compras' : 'Desactivado y oculto a clientes'}
                  </span>
                    </div>
                    <button
                        type="button"
                        role="switch"
                        aria-checked={formEditar.activo}
                        onClick={() => setFormEditar({ ...formEditar, activo: !formEditar.activo })}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer focus:outline-none flex items-center p-0.5 ${
                            formEditar.activo ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                        }`}
                    >
                  <span
                      className={`block w-5 h-5 rounded-full bg-white shadow-xs transform transition-transform ${
                          formEditar.activo ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                      type="button"
                      onClick={() => setEditando(null)}
                      disabled={guardando}
                      className="flex h-10 items-center justify-center rounded-full border border-solid border-black/[.08] dark:border-white/[.145] hover:border-black dark:hover:border-white px-5 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                      type="button"
                      onClick={guardarEdicion}
                      disabled={guardando}
                      className="flex h-10 items-center justify-center rounded-full bg-black text-white hover:bg-[#383838] dark:bg-white dark:text-black dark:hover:bg-[#ccc] px-5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
                  >
                    {guardando ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
        )}

        {/* Modal de Creación */}
        {creando && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-black border border-black/[.08] dark:border-white/[.145] rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl flex flex-col gap-6">
                <div>
              <span className="text-[11px] font-mono text-zinc-400">
                Catálogo Farmacéutico
              </span>
                  <h3 className="text-xl font-semibold tracking-tight mt-0.5">
                    Registrar Medicamento
                  </h3>
                </div>

                <form onSubmit={registrarMedicamento} className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-mono text-zinc-500 mb-1">
                        Nombre comercial *
                      </label>
                      <input
                          type="text"
                          required
                          value={formCrear.nombre}
                          onChange={(e) => setFormCrear({ ...formCrear, nombre: e.target.value })}
                          placeholder="Ej. Paracetamol 500mg"
                          className="w-full h-10 px-3.5 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-mono text-zinc-500 mb-1">
                        Código SKU *
                      </label>
                      <input
                          type="text"
                          required
                          value={formCrear.sku}
                          onChange={(e) => setFormCrear({ ...formCrear, sku: e.target.value })}
                          placeholder="Ej. prod-paracetamol-500"
                          className="w-full h-10 px-3.5 font-mono rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-1">
                        Precio ($) *
                      </label>
                      <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={formCrear.precio}
                          onChange={(e) => setFormCrear({ ...formCrear, precio: e.target.value })}
                          placeholder="0.00"
                          className="w-full h-10 px-3.5 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-1">
                        Stock Inicial *
                      </label>
                      <input
                          type="number"
                          min="0"
                          required
                          value={formCrear.stock}
                          onChange={(e) => setFormCrear({ ...formCrear, stock: e.target.value })}
                          placeholder="0"
                          className="w-full h-10 px-3.5 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-mono text-zinc-500 mb-1">
                        Mínimo Alerta
                      </label>
                      <input
                          type="number"
                          min="0"
                          value={formCrear.stock_minimo}
                          onChange={(e) => setFormCrear({ ...formCrear, stock_minimo: e.target.value })}
                          placeholder="5"
                          className="w-full h-10 px-3.5 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-1">
                      Categoría
                    </label>
                    <select
                        value={formCrear.categoria}
                        onChange={(e) => setFormCrear({ ...formCrear, categoria: e.target.value })}
                        aria-label="Seleccionar categoría"
                        className="w-full h-10 px-3.5 rounded-full border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-xs font-mono focus:outline-none focus:border-black dark:focus:border-white transition-colors cursor-pointer"
                    >
                      <option value="">Sin Categoría</option>
                      {categorias.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.nombre || cat.id}
                          </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-mono text-zinc-500 mb-1">
                      Descripción
                    </label>
                    <textarea
                        value={formCrear.descripcion}
                        onChange={(e) => setFormCrear({ ...formCrear, descripcion: e.target.value })}
                        rows={2}
                        placeholder="Detalles del medicamento..."
                        className="w-full p-3 rounded-2xl border border-black/[.08] dark:border-white/[.145] bg-white dark:bg-zinc-950 text-sm focus:outline-none focus:border-black dark:focus:border-white transition-colors resize-none"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={() => setCreando(false)}
                        disabled={guardandoCreacion}
                        className="flex h-10 items-center justify-center rounded-full border border-solid border-black/[.08] dark:border-white/[.145] hover:border-black dark:hover:border-white px-5 text-xs font-medium transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={guardandoCreacion}
                        className="flex h-10 items-center justify-center rounded-full bg-black text-white hover:bg-[#383838] dark:bg-white dark:text-black dark:hover:bg-[#ccc] px-5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-40"
                    >
                      {guardandoCreacion ? 'Registrando...' : 'Registrar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}

        {/* Notificación Flotante Toast */}
        {toast && (
            <div className="fixed bottom-6 right-6 z-50">
              <div
                  className={`px-4 py-2 rounded-full text-xs font-mono shadow-md border ${
                      toast.tipo === 'exito'
                          ? 'bg-black text-white dark:bg-white dark:text-black border-black/[.1] dark:border-white/[.2]'
                          : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-900'
                  }`}
              >
                {toast.mensaje}
              </div>
            </div>
        )}
      </div>
  );
}