'use client';

import { useState } from 'react';

const medicamentosFalsos = [
  { 
    id: "prod-complejo-b", 
    nombre: "Complejo B Forte", 
    categoria: "Vitaminas y sumplementos", 
    descripcion: "Caja con 20 tabletas de 500mg para alivio de dolor y fiebre.",
    stock: 6, 
    precio: 45.50 
  },
  { 
    id: "prod-ibuprofeno-400", 
    nombre: "Ibuprofeno 400mg", 
    categoria: "Analgesicos", 
    descripcion: "Caja con 10 cápsulas de gel blando de 400mg, acción rápida antiinflamatoria.",
    stock: 15, 
    precio: 68.00 
  },
  { 
    id: "prod-amoxicilina-500", 
    nombre: "Amoxicilina 500mg", 
    categoria: "cat-antibioticos", 
    descripcion: "Caja con 12 cápsulas de 500mg. Antibiótico de amplio espectro.",
    stock: 8, 
    precio: 135.00 
  },
  { 
    id: "prod-azitromicina-500", 
    nombre: "Azitromicina 500mg", 
    categoria: "cat-antibioticos", 
    descripcion: "Caja con 3 tabletas recubiertas de 500mg.",
    stock: 4, 
    precio: 189.00 
  },
  { 
    id: "prod-vitamina-c-1g", 
    nombre: "Vitamina C 1g Efervescente", 
    categoria: "cat-vitaminas", 
    descripcion: "Tubo con 10 tabletas efervescentes sabor naranja + Zinc.",
    stock: 25, 
    precio: 95.00 
  }
];
  

export default function PantallaCatalogo() {
  const [busqueda, setBusqueda] = useState('');
  const [categoria, setCategoria] = useState('Todas');

  const categoriasUnicas = Array.from(new Set(medicamentosFalsos.map((med) => med.categoria)));

  const medicamentosFiltrados = medicamentosFalsos.filter((med) => {
    const coincideBusqueda = med.nombre.toLowerCase().includes(busqueda.toLowerCase());
    const coincideCategoria = categoria === 'Todas' || med.categoria === categoria;
    return coincideBusqueda && coincideCategoria;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto text-black dark:text-white">
      <h1 className="text-3xl font-bold mb-6">Catálogo de Farmacia</h1>

      {/* BUSCADOR Y FILTROS */}
      <div className="flex gap-4 mb-8">
        <input 
          type="text" 
          placeholder="Buscar medicamento..." 
          className="border p-3 flex-1 rounded-lg text-black bg-white dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        
        <select 
          className="border p-3 rounded-lg text-black bg-white dark:bg-zinc-800 dark:text-white dark:border-zinc-700"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        >
          <option value="Todas">Todas las categorías</option>
          {categoriasUnicas.map((categoria) => (
            <option key={categoria} value={categoria}>
              {categoria}
            </option>
          ))}
        </select>
      </div>

      {/* GRID DE MEDICAMENTOS */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {medicamentosFiltrados.map((med) => (
          <div key={med.id} className="border rounded-xl p-5 shadow-sm bg-white dark:bg-zinc-900 dark:border-zinc-800 transition-transform hover:scale-105 flex flex-col justify-between">
            
            {/* Información del medicamento */}
            <div>
              <h2 className="text-xl font-semibold mb-1">{med.nombre}</h2>
              <p className="text-blue-600 dark:text-blue-400 font-medium mb-2 text-sm">{(med.categoria)}</p>
              
              {/* 👇 AQUÍ AGREGAMOS LA DESCRIPCIÓN 👇 */}
              <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm leading-relaxed">
                {med.descripcion}
              </p>
              
              <p className="text-2xl font-bold mb-4">${med.precio.toFixed(2)}</p>
            </div>
            
            {/* Lógica de Stock y Botón */}
            {med.stock > 0 ? (
              <div className="mt-auto">
                <span className="text-green-600 dark:text-green-400 font-bold block mb-3 text-sm">
                  Disponibles: {med.stock}
                </span>
                <button className="w-full bg-blue-600 text-white font-medium py-2 rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
                  Agregar al Carrito
                </button>
              </div>
            ) : (
              <div className="mt-auto">
                <span className="text-red-600 dark:text-red-400 font-bold block mb-3 text-sm">
                  Agotado
                </span>
                <button disabled className="w-full bg-gray-200 text-gray-500 font-medium py-2 rounded-lg cursor-not-allowed dark:bg-zinc-800 dark:text-zinc-600">
                  Sin stock
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}