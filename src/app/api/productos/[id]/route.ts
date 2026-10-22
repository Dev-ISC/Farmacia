
import { NextRequest, NextResponse } from 'next/server';
import {
    APPWRITE_CONFIG,
    createAdminClient,
} from '@/lib/appwrite/server';
import { validarAdmin } from '@/lib/auth/validar-admin';

type Contexto = {
    params: Promise<{ id: string }>;
};

export async function PATCH(
    request: NextRequest,
    { params }: Contexto
) {
    const accesoDenegado = await validarAdmin(request);
    if (accesoDenegado) return accesoDenegado;

    const { id } = await params;

    if (!id) {
        return NextResponse.json(
            { error: 'ID de producto inválido' },
            { status: 400 }
        );
    }

    let body: unknown;

    try {
        body = await request.json();
    } catch {
        return NextResponse.json(
            { error: 'JSON inválido' },
            { status: 400 }
        );
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return NextResponse.json(
            { error: 'Datos inválidos' },
            { status: 400 }
        );
    }

    const datos = body as Record<string, unknown>;
    const permitidos = ['nombre', 'descripcion', 'precio', 'activo'];
    const campos = Object.keys(datos);

    if (
        campos.length === 0 ||
        campos.some((campo) => !permitidos.includes(campo))
    ) {
        return NextResponse.json(
            { error: 'Campos vacíos o no permitidos' },
            { status: 400 }
        );
    }

    const cambios: Record<string, string | number | boolean> = {};

    if ('nombre' in datos) {
        if (
            typeof datos.nombre !== 'string' ||
            !datos.nombre.trim() ||
            datos.nombre.length > 150
        ) {
            return NextResponse.json(
                { error: 'Nombre inválido' },
                { status: 400 }
            );
        }

        cambios.nombre = datos.nombre.trim();
    }

    if ('descripcion' in datos) {
        if (typeof datos.descripcion !== 'string') {
            return NextResponse.json(
                { error: 'Descripción inválida' },
                { status: 400 }
            );
        }

        cambios.descripcion = datos.descripcion.trim();
    }

    if ('precio' in datos) {
        if (
            typeof datos.precio !== 'number' ||
            !Number.isFinite(datos.precio) ||
            datos.precio < 0
        ) {
            return NextResponse.json(
                { error: 'Precio inválido' },
                { status: 400 }
            );
        }

        cambios.precio = datos.precio;
    }

    if ('activo' in datos) {
        if (typeof datos.activo !== 'boolean') {
            return NextResponse.json(
                { error: 'Estado activo inválido' },
                { status: 400 }
            );
        }

        cambios.activo = datos.activo;
    }

    try {
        const { tablesDB } = createAdminClient();

        const producto = await tablesDB.updateRow({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.productos,
            rowId: id,
            data: cambios,
        });

        return NextResponse.json({
            mensaje: 'Producto actualizado correctamente',
            producto,
        });
    } catch (error) {
        if (
            error !== null &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 404
        ) {
            return NextResponse.json(
                { error: 'Producto no encontrado' },
                { status: 404 }
            );
        }

        console.error('Error actualizando producto:', error);

        return NextResponse.json(
            { error: 'No se pudo actualizar el producto' },
            { status: 500 }
        );
    }
}
