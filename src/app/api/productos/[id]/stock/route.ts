
import { NextRequest, NextResponse } from 'next/server';
import {
    APPWRITE_CONFIG,
    createAdminClient,
} from '@/lib/appwrite/server';
import { validarAdmin } from '@/lib/auth/validar-admin';
import { purchaseLockManager } from '@/lib/concurrency/mutex';

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

    if (!id?.trim()) {
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

    if (
        !body ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        !Object.hasOwn(body, 'stock')
    ) {
        return NextResponse.json(
            { error: 'Solo se permite modificar stock' },
            { status: 400 }
        );
    }

    const { stock } = body as { stock: unknown };

    if (
        typeof stock !== 'number' ||
        !Number.isSafeInteger(stock) ||
        stock < 0
    ) {
        return NextResponse.json(
            { error: 'El stock debe ser un entero mayor o igual a cero' },
            { status: 400 }
        );
    }

    try {
        const producto =
            await purchaseLockManager.runPurchaseTransaction(
                [id],
                async () => {
                    const { tablesDB } = createAdminClient();

                    return await tablesDB.updateRow({
                        databaseId: APPWRITE_CONFIG.databaseId,
                        tableId: APPWRITE_CONFIG.tables.productos,
                        rowId: id,
                        data: { stock },
                    });
                }
            );

        return NextResponse.json({
            mensaje: 'Stock actualizado correctamente',
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

        console.error('Error al actualizar stock:', error);

        return NextResponse.json(
            { error: 'No se pudo actualizar el stock' },
            { status: 500 }
        );
    }
}
