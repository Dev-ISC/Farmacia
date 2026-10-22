'use client';

import Image from "next/image";
import { useState } from "react";
import { useRealtimeStock } from "@/hooks/useRealtimeStock";
import Catalogo from "@/componentesCatalogo/Catalogo";


export default function Home() {
  const { stockPorId, conectadoRealtime } = useRealtimeStock();
  const [resultado, setResultado] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const handleApiTest = async () => {
    setProcesando(true);
    setResultado(null);
    try {
      const res = await fetch("/api/comprar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usuarioId: "user-raul",
          direccionEnvio: "Av. Reforma 101, Col. Centro",
          items: [{ productoId: "prod-paracetamol-500", cantidad: 1 }],
        }),
      });
      const data = await res.json();
      setResultado(JSON.stringify(data, null, 2));
    } catch (err) {
      setResultado(String(err));
    } finally {
      setProcesando(false);
    }
  };



  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <Image
          className="dark:invert h-5 w-[100px]"
          src="/next.svg"
          alt="Next.js logo"
          width={100}
          height={20}
          priority
        />
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            Codigo inicial
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Stock Paracetamol 500mg (Realtime{" "}
            {conectadoRealtime ? "🟢" : "⚪"}):{" "}
            <strong className="text-black dark:text-white">
              {stockPorId["prod-paracetamol-500"] ?? "Cargando..."}
            </strong>
          </p>
        </div>
        <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
          <a
            className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc] md:w-[158px]"
            rel="noopener noreferrer"
          >
            <Image
              className="dark:invert h-[14px] w-4"
              src="/vercel.svg"
              alt="Vercel logomark"
              width={16}
              height={14}
            />
            Deploy Now
          </a>
          <button
            type="button"
            onClick={handleApiTest}
            disabled={procesando}
            className="flex h-12 w-full cursor-pointer items-center justify-center rounded-full border border-solid border-black/[.08] px-5 transition-colors hover:border-transparent hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:hover:bg-[#1a1a1a] md:w-[158px]"
          >
            {procesando ? "Comprando..." : "API Test"}
          </button>
        </div>
        {resultado && (
          <pre className="mt-6 w-full overflow-x-auto rounded-lg bg-zinc-100 p-4 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {resultado}
          </pre>
        )}

      </main>
    </div>
  );
}
