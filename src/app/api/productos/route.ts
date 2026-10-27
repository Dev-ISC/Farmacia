
import { NextResponse } from 'next/server';
import {
    createAdminClient,
    APPWRITE_CONFIG,
    Query,
} from '@/lib/appwrite/server';

import { NextRequest } from 'next/server';
import { ID } from '@/lib/appwrite/server';
import { validarAdmin } from '@/lib/auth/validar-admin';

export async function GET() {
    try {
        const { tablesDB } = createAdminClient();

        const resultado = await tablesDB.listRows({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.productos,
            queries: [
                Query.equal('activo', true),
                Query.select(['*', 'categoria.*']),
                Query.limit(100),
            ],
        });


        const productos = resultado.rows.map((producto) => {
            const categoria = producto.categoria;

            return {
                id: producto.$id,
                nombre: producto.nombre,
                descripcion: producto.descripcion,
                sku: producto.sku,
                precio: producto.precio,
                stock: producto.stock,
                stock_minimo: producto.stock_minimo ?? 5,
                activo: producto.activo,
                categoria:
                    typeof categoria === 'string'
                        ? { id: categoria, nombre: null }
                        : categoria && typeof categoria === 'object'
                            ? {
                                id: categoria.$id,
                                nombre: categoria.nombre,
                            }
                            : null,
            };
        });

        return NextResponse.json({
            total: resultado.total,
            productos,
        });

    } catch (error) {
        console.error('Error al obtener productos:', error);

        return NextResponse.json(
            { error: 'No se pudieron obtener los productos' },
            { status: 500 }
        );
    }
}


export async function POST(request: NextRequest) {
    const accesoDenegado = await validarAdmin(request);
    if (accesoDenegado) return accesoDenegado;

    try {
        const body: unknown = await request.json();

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return NextResponse.json(
                { error: 'Datos inválidos' },
                { status: 400 }
            );
        }

        const datos = body as Record<string, unknown>;

        const nombre = datos.nombre;
        const sku = datos.sku;
        const precio = datos.precio;
        const stock = datos.stock;

        if (
            typeof nombre !== 'string' ||
            !nombre.trim() ||
            nombre.length > 150 ||
            typeof sku !== 'string' ||
            !sku.trim() ||
            sku.length > 50 ||
            typeof precio !== 'number' ||
            !Number.isFinite(precio) ||
            precio < 0 ||
            typeof stock !== 'number' ||
            !Number.isSafeInteger(stock) ||
            stock < 0
        ) {
            return NextResponse.json(
                { error: 'Nombre, SKU, precio o stock inválidos' },
                { status: 400 }
            );
        }

        if (
            datos.descripcion !== undefined &&
            typeof datos.descripcion !== 'string'
        ) {
            return NextResponse.json(
                { error: 'Descripción inválida' },
                { status: 400 }
            );
        }

        if (
            datos.categoria !== undefined &&
            (typeof datos.categoria !== 'string' ||
                !datos.categoria.trim())
        ) {
            return NextResponse.json(
                { error: 'Categoría inválida' },
                { status: 400 }
            );
        }

        const { tablesDB } = createAdminClient();

        const existentes = await tablesDB.listRows({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.productos,
            queries: [
                Query.equal('sku', sku.trim()),
                Query.limit(1),
            ],
        });

        if (existentes.total > 0) {
            return NextResponse.json(
                { error: 'Ya existe un producto con ese SKU' },
                { status: 409 }
            );
        }

        let stockMinimo = 5;
        if (datos.stock_minimo !== undefined) {
            if (
                typeof datos.stock_minimo !== 'number' ||
                !Number.isSafeInteger(datos.stock_minimo) ||
                datos.stock_minimo < 0
            ) {
                return NextResponse.json(
                    { error: 'Stock mínimo inválido' },
                    { status: 400 }
                );
            }
            stockMinimo = datos.stock_minimo;
        }

        const producto = await tablesDB.createRow({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.productos,
            rowId: ID.unique(),
            data: {
                nombre: nombre.trim(),
                sku: sku.trim(),
                precio,
                stock,
                stock_minimo: stockMinimo,
                activo: true,
                ...(datos.descripcion !== undefined && {
                    descripcion: datos.descripcion,
                }),
                ...(typeof datos.categoria === 'string' && {
                    categoria: datos.categoria.trim(),
                }),
            },
        });

        return NextResponse.json(
            { mensaje: 'Producto registrado', producto },
            { status: 201 }
        );
    } catch (error) {
        if (error instanceof SyntaxError) {
            return NextResponse.json(
                { error: 'JSON inválido' },
                { status: 400 }
            );
        }

        if (
            error !== null &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 409 &&
            'type' in error &&
            error.type === 'row_unique_constraint_violation'
        ) {
            return NextResponse.json(
                { error: 'Ya existe un producto con ese SKU' },
                { status: 409 }
            );
        }

        console.error('Error al registrar producto:', error);

        return NextResponse.json(
            { error: 'No se pudo registrar el producto' },
            { status: 500 }
        );
    }
}
