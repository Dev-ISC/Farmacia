
import { NextRequest, NextResponse } from 'next/server';
import {
    APPWRITE_CONFIG,
    createAdminClient,
    Query,
} from '@/lib/appwrite/server';
import { validarAdmin } from '@/lib/auth/validar-admin';
import type {
    Pedido,
    DetallePedido,
    EstadoPedido,
} from '@/types/database';

type Contexto = {
    params: Promise<{ id: string }>;
};

export async function GET(
    request: NextRequest,
    { params }: Contexto
) {
    const accesoDenegado = await validarAdmin(request);
    if (accesoDenegado) return accesoDenegado;

    const { id } = await params;

    if (!id?.trim()) {
        return NextResponse.json(
            { error: 'ID del pedido inválido' },
            { status: 400 }
        );
    }

    try {
        const { tablesDB } = createAdminClient();

        // Obtener pedido específico
        const pedido = await tablesDB.getRow<Pedido>({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.pedidos,
            rowId: id,
        });

        // Consultar los detalles relacionados
        const resultado = await tablesDB.listRows<DetallePedido>({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.detallePedido,
            queries: [
                Query.equal('pedidos_id', id),
                Query.limit(100),
                Query.select(['*', 'producto_id.nombre', 'producto_id.stock']),
            ],
        });

        const detalles = resultado.rows.map((detalle) => {
            const prod = detalle.producto_id;
            const productoObj = typeof prod === 'object' && prod !== null ? prod : null;
            return {
                id: detalle.$id,
                producto: {
                    id: productoObj?.$id ?? (typeof prod === 'string' ? prod : undefined),
                    nombre: productoObj?.nombre ?? 'Medicamento',
                    stock: productoObj?.stock,
                },
                cantidad: detalle.cantidad,
                precioUnitario: detalle.precio_unitario,
                subtotal: detalle.cantidad * detalle.precio_unitario,
            };
        });

        return NextResponse.json({
            pedido: {
                id: pedido.$id,
                usuario: pedido.usuario_id,
                total: pedido.total,
                estado: pedido.estado,
                direccionEnvio: pedido.direccion_envio,
                fecha: pedido.$createdAt,
            },
            totalDetalles: resultado.total,
            detalles,
        });

    } catch (error) {
        if (
            error !== null &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 404
        ) {
            return NextResponse.json(
                { error: 'Pedido no encontrado' },
                { status: 404 }
            );
        }

        console.error('Error al consultar pedido:', error);

        return NextResponse.json(
            { error: 'No se pudo consultar el pedido' },
            { status: 500 }
        );
    }
}


const transiciones: Record<EstadoPedido, EstadoPedido[]> = {
    pendiente: ['pagado', 'cancelado'],
    pagado: ['enviado', 'cancelado'],
    enviado: ['entregado'],
    entregado: [],
    cancelado: [],
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
            { error: 'ID del pedido inválido' },
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
        !('estado' in body)
    ) {
        return NextResponse.json(
            { error: 'Solo se permite modificar el estado' },
            { status: 400 }
        );
    }

    const estado = body.estado;

    const estadosValidos: EstadoPedido[] = [
        'pendiente',
        'pagado',
        'enviado',
        'entregado',
        'cancelado',
    ];

    if (
        typeof estado !== 'string' ||
        !estadosValidos.includes(estado as EstadoPedido)
    ) {
        return NextResponse.json(
            { error: 'Estado de pedido inválido' },
            { status: 400 }
        );
    }

    const nuevoEstado = estado as EstadoPedido;

    try {
        const { tablesDB } = createAdminClient();

        const pedido = await tablesDB.getRow<Pedido>({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.pedidos,
            rowId: id,
        });

        if (
            pedido.estado !== nuevoEstado &&
            !transiciones[pedido.estado].includes(nuevoEstado)
        ) {
            return NextResponse.json(
                { error: 'Transición de estado no permitida' },
                { status: 409 }
            );
        }

        if (pedido.estado === nuevoEstado) {
            return NextResponse.json({
                mensaje: 'El pedido ya tiene ese estado',
                pedido,
            });
        }

        const actualizado = await tablesDB.updateRow<Pedido>({
            databaseId: APPWRITE_CONFIG.databaseId,
            tableId: APPWRITE_CONFIG.tables.pedidos,
            rowId: id,
            data: { estado: nuevoEstado },
        });

        return NextResponse.json({
            mensaje: 'Estado actualizado correctamente',
            pedido: actualizado,
        });

    } catch (error) {
        if (
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 404
        ) {
            return NextResponse.json(
                { error: 'Pedido no encontrado' },
                { status: 404 }
            );
        }

        console.error('Error al actualizar pedido:', error);

        return NextResponse.json(
            { error: 'No se pudo actualizar el pedido' },
            { status: 500 }
        );
    }
}
