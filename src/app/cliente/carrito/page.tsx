import InterfazCarrito from '@/components/cliente/InterfazCarrito';

export default function VistaDelCarritoCliente() {
  return (
    <main className="min-h-screen bg-zinc-50 font-sans dark:bg-black p-4 sm:p-8 flex items-center justify-center">
      <InterfazCarrito modo="pagina" />
    </main>
  );
}
