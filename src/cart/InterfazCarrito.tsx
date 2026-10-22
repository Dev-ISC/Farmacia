'use client';

import { useState } from "react";
import type { ComprarResponse } from "@/types/database";

export default function InterfazCarrito() {
  // 1. Estados de la interfaz
  const [estaAbierto, setEstaAbierto] = useState(false);
  const [cantidad, setCantidad] = useState(1);
  const [comprando, setComprando] = useState(false);
  const [respuestaCompra, setRespuestaCompra] = useState<ComprarResponse | null>(null);

  // Stock del producto en el carrito para validar que la cantidad no lo supere
  const productoId = "prod-paracetamol-500";
  const stockDisponible = 10;

  // 2. Lógica de validación del input
  const manejarCambioCantidad = (e: React.ChangeEvent<HTMLInputElement>) => {
    let nuevaCantidad = parseInt(e.target.value);

    // Si borran el número o ponen negativo, lo regresamos a 1
    if (isNaN(nuevaCantidad) || nuevaCantidad < 1) {
      nuevaCantidad = 1;
    }
    // AQUÍ ESTÁ LA REGLA: Si intentan poner más del stock, lo topamos al máximo disponible
    else if (nuevaCantidad > stockDisponible) {
      nuevaCantidad = stockDisponible;
    }

    setCantidad(nuevaCantidad);
  };

  // Leer el usuario activo desde la cookie `farmacia_session`
  const obtenerUsuarioIdDeCookie = (): string => {
    if (typeof document === "undefined") return "user-juan";
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith("farmacia_session="));
    return match ? match.split("=")[1] : "user-juan";
  };

  // 3. Enviar compra hacia POST /api/comprar (mostrando recibo en 201 o alerta en 409)
  const confirmarCompra = async () => {
    setComprando(true);
    setRespuestaCompra(null);

    try {
      const usuarioId = obtenerUsuarioIdDeCookie();

      const res = await fetch("/api/comprar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuarioId,
          direccionEnvio: "Av. Principal #123, Entrega a Domicilio",
          items: [{ productoId, cantidad }],
        }),
      });

      const data = (await res.json()) as ComprarResponse;
      setRespuestaCompra(data);
    } catch {
      setRespuestaCompra({
        ok: false,
        error: "Error de red al intentar procesar la compra.",
        codigo: "ERROR_PROCESAMIENTO",
      });
    } finally {
      setComprando(false);
    }
  };

  return (
    <div>
      {/* Boton para abrir el Drawer*/}
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

            {/* 4. Lista de Items (Carrito_items) */}
            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="border rounded-lg p-4 bg-gray-50 dark:bg-zinc-800 dark:border-zinc-700">
                <h3 className="font-semibold text-gray-800 dark:text-zinc-100 mb-1">
                  Paracetamol 500mg
                </h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400 mb-3">
                  Stock disponible: {stockDisponible}
                </p>

                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-zinc-300">
                    Cantidad:
                  </label>
                  <input
                    type="number"
                    value={cantidad}
                    onChange={manejarCambioCantidad}
                    className="border border-gray-300 rounded-md w-20 p-1.5 text-center dark:bg-zinc-700 dark:text-white dark:border-zinc-600 focus:ring-2 focus:ring-blue-500 outline-none"
                    min="1"
                    max={stockDisponible}
                  />
                </div>

                {/* Mensaje de advertencia visual si alcanzan el tope */}
                {cantidad === stockDisponible && (
                  <p className="text-orange-500 text-xs mt-2 font-medium">
                    Límite de stock alcanzado
                  </p>
                )}
              </div>

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

              {/* Respuesta HTTP 409: Alerta de stock agotado / conflicto */}
              {respuestaCompra && !respuestaCompra.ok && (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/50 border border-red-500 text-red-800 dark:text-red-200 text-sm">
                  <p className="font-bold mb-1">Stock agotado / No disponible</p>
                  <p>{respuestaCompra.error}</p>
                </div>
              )}
            </div>

            {/* 5. Pie del carrito (Botón de Confirmar Compra) */}
            <div className="mt-auto pt-4 border-t dark:border-zinc-700">
              <button
                onClick={confirmarCompra}
                disabled={comprando}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-zinc-600 text-white font-bold py-3 px-4 rounded-lg transition-colors cursor-pointer"
              >
                {comprando ? "Confirmando..." : "Confirmar Compra"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
