const pool = require('../db');

exports.getLogs = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización.' });
    }

    try {
        const query = `
            WITH viaje_cliente_logs AS (
                -- Seleccionar logs de viaje_cliente INSERT/UPDATE para agregarlos como relacionados
                SELECT 
                    id,
                    created_at,
                    operation,
                    before_data,
                    after_data
                FROM audit_logs
                WHERE table_name = 'viaje_cliente' AND operation IN ('INSERT', 'UPDATE')
            ),
            chofer_logs AS (
                -- Seleccionar logs de chofer para agregarlos como relacionados al usuario
                SELECT 
                    id,
                    created_at,
                    entity_id,
                    operation,
                    before_data,
                    after_data
                FROM audit_logs
                WHERE table_name = 'chofer'
            )
            SELECT 
                main.id,
                main.created_at AS timestamp,
                main.table_name,
                main.operation,
                CASE 
                    -- Pagos (soft delete)
                    WHEN main.table_name = 'pagos_cheque' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar pago (cheque)'
                    WHEN main.table_name = 'pagos_gasoil' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar pago (gasoil)'
                    WHEN main.table_name = 'pagos_otro' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar pago (otro)'
                    -- Cheque marcado como pagado
                    WHEN main.table_name = 'pagos_cheque' AND main.operation = 'UPDATE' AND (main.before_data->>'pagado')::boolean = false AND (main.after_data->>'pagado')::boolean = true THEN 'Marcar cheque como pagado'
                    -- Pagos
                    WHEN main.table_name = 'pagos_cheque' AND main.operation = 'INSERT' THEN 'Crear pago (cheque)'
                    WHEN main.table_name = 'pagos_cheque' AND main.operation = 'UPDATE' THEN 'Editar pago (cheque)'
                    WHEN main.table_name = 'pagos_cheque' AND main.operation = 'DELETE' THEN 'Eliminar pago (cheque)'
                    WHEN main.table_name = 'pagos_gasoil' AND main.operation = 'INSERT' THEN 'Crear pago (gasoil)'
                    WHEN main.table_name = 'pagos_gasoil' AND main.operation = 'UPDATE' THEN 'Editar pago (gasoil)'
                    WHEN main.table_name = 'pagos_gasoil' AND main.operation = 'DELETE' THEN 'Eliminar pago (gasoil)'
                    WHEN main.table_name = 'pagos_otro' AND main.operation = 'INSERT' THEN 'Crear pago (otro)'
                    WHEN main.table_name = 'pagos_otro' AND main.operation = 'UPDATE' THEN 'Editar pago (otro)'
                    WHEN main.table_name = 'pagos_otro' AND main.operation = 'DELETE' THEN 'Eliminar pago (otro)'
                    -- Usuarios/Choferes (soft delete)
                    WHEN main.table_name = 'usuario' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar chofer'
                    -- Usuarios/Choferes
                    WHEN main.table_name = 'usuario' AND main.operation = 'INSERT' THEN 'Crear chofer'
                    WHEN main.table_name = 'usuario' AND main.operation = 'UPDATE' THEN 'Editar chofer'
                    WHEN main.table_name = 'usuario' AND main.operation = 'DELETE' THEN 'Eliminar chofer'
                    -- Clientes (soft delete)
                    WHEN main.table_name = 'cliente' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar cliente'
                    -- Cliente: actualización automática de balance (solo cambió el balance y update_at)
                    WHEN main.table_name = 'cliente' AND main.operation = 'UPDATE' 
                         AND (main.before_data->>'balance') IS DISTINCT FROM (main.after_data->>'balance')
                         AND (main.before_data - 'balance' - 'update_at') = (main.after_data - 'balance' - 'update_at')
                         THEN 'Actualización de balance'
                    -- Clientes
                    WHEN main.table_name = 'cliente' AND main.operation = 'INSERT' THEN 'Crear cliente'
                    WHEN main.table_name = 'cliente' AND main.operation = 'UPDATE' AND main.user_cuil IS NULL THEN 'Cliente actualizado (automático)'
                    WHEN main.table_name = 'cliente' AND main.operation = 'UPDATE' THEN 'Editar cliente'
                    WHEN main.table_name = 'cliente' AND main.operation = 'DELETE' THEN 'Eliminar cliente'
                    -- Viajes (soft delete)
                    WHEN main.table_name = 'viaje' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar viaje'
                    WHEN main.table_name = 'viaje_cliente' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar viaje cliente'
                    -- Viajes
                    WHEN main.table_name = 'viaje' AND main.operation = 'INSERT' THEN 'Crear viaje'
                    WHEN main.table_name = 'viaje' AND main.operation = 'UPDATE' THEN 'Editar viaje'
                    WHEN main.table_name = 'viaje' AND main.operation = 'DELETE' THEN 'Eliminar viaje'
                    WHEN main.table_name = 'viaje_cliente' AND main.operation = 'UPDATE' THEN 'Editar viaje cliente'
                    WHEN main.table_name = 'viaje_cliente' AND main.operation = 'DELETE' THEN 'Eliminar viaje cliente'
                    -- Facturas (soft delete)
                    WHEN main.table_name = 'factura' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar factura'
                    WHEN main.table_name = 'factura_arca' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar factura (ARCA)'
                    -- Facturas
                    WHEN main.table_name = 'factura' AND main.operation = 'INSERT' THEN 'Cargar factura'
                    WHEN main.table_name = 'factura' AND main.operation = 'UPDATE' THEN 'Editar factura'
                    WHEN main.table_name = 'factura' AND main.operation = 'DELETE' THEN 'Eliminar factura'
                    WHEN main.table_name = 'factura_arca' AND main.operation = 'INSERT' THEN 'Cargar factura (cliente)'
                    WHEN main.table_name = 'factura_arca' AND main.operation = 'UPDATE' THEN 'Editar factura (cliente)'
                    WHEN main.table_name = 'factura_arca' AND main.operation = 'DELETE' THEN 'Eliminar factura (cliente)'
                    -- Carta de porte (soft delete)
                    WHEN main.table_name = 'carta_porte' AND main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false THEN 'Eliminar carta de porte'
                    -- Carta de porte
                    WHEN main.table_name = 'carta_porte' AND main.operation = 'INSERT' THEN 'Crear carta de porte'
                    WHEN main.table_name = 'carta_porte' AND main.operation = 'UPDATE' THEN 'Editar carta de porte'
                    WHEN main.table_name = 'carta_porte' AND main.operation = 'DELETE' THEN 'Eliminar carta de porte'
                    -- CATAC (tarifas)
                    WHEN main.table_name = 'catac' AND main.operation = 'UPDATE' THEN 'Actualizar tarifas CATAC'
                    -- Resumen (cerrar cuenta)
                    WHEN main.table_name = 'saldo_resumen' AND main.operation = 'INSERT' THEN 'Cerrar resumen'
                    -- Default
                    ELSE initcap(main.operation) || ' en ' || main.table_name
                END AS action,
                main.user_cuil,
                CASE 
                    -- Para actualizaciones de balance, mostrar "Sistema"
                    WHEN main.table_name = 'cliente' AND main.operation = 'UPDATE' 
                         AND (main.before_data->>'balance') IS DISTINCT FROM (main.after_data->>'balance')
                         AND (main.before_data - 'balance' - 'update_at') = (main.after_data - 'balance' - 'update_at')
                         THEN 'Sistema'
                    ELSE COALESCE(main.user_name, main.user_cuil, 'Sistema')
                END AS nombre_apellido,
                jsonb_build_object(
                    'before', COALESCE(main.before_data, '{}'::jsonb),
                    'after',  COALESCE(main.after_data, '{}'::jsonb)
                ) AS details,
                -- Agregar logs relacionados de viaje_cliente para viajes INSERT/UPDATE
                CASE 
                    WHEN main.table_name = 'viaje' AND main.operation IN ('INSERT', 'UPDATE') THEN (
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'id', vcl.id,
                                'operation', vcl.operation,
                                'cliente_cuit', COALESCE(vcl.after_data->>'cliente_cuit', vcl.before_data->>'cliente_cuit'),
                                'before', COALESCE(vcl.before_data, '{}'::jsonb),
                                'after', COALESCE(vcl.after_data, '{}'::jsonb),
                                'is_soft_delete', (vcl.before_data->>'valid')::boolean = true AND (vcl.after_data->>'valid')::boolean = false
                            )
                        ), '[]'::jsonb)
                        FROM viaje_cliente_logs vcl
                        WHERE vcl.created_at = main.created_at
                          AND vcl.operation = main.operation
                    )
                    ELSE NULL
                END AS related_viaje_clientes,
                -- Agregar viajes relacionados para logs de factura (crear y eliminar)
                CASE 
                    WHEN main.table_name = 'factura' AND (
                        main.operation = 'INSERT' OR 
                        main.operation = 'DELETE' OR
                        (main.operation = 'UPDATE' AND (main.before_data->>'valid')::boolean = true AND (main.after_data->>'valid')::boolean = false)
                    ) THEN (
                        SELECT COALESCE(jsonb_agg(
                            jsonb_build_object(
                                'comprobante', COALESCE(v.after_data->>'comprobante', v.before_data->>'comprobante'),
                                'chofer_cuil', COALESCE(v.after_data->>'chofer_cuil', v.before_data->>'chofer_cuil'),
                                'factura_id', COALESCE(v.after_data->>'factura_id', v.before_data->>'factura_id'),
                                'data', COALESCE(v.after_data, v.before_data)
                            )
                        ), '[]'::jsonb)
                        FROM audit_logs v
                        WHERE v.table_name = 'viaje' 
                          AND v.operation = 'UPDATE'
                          AND v.created_at = main.created_at
                          AND (v.before_data->>'factura_id') IS DISTINCT FROM (v.after_data->>'factura_id')
                    )
                    ELSE NULL
                END AS related_viajes,
                -- Agregar datos del chofer para logs de usuario
                CASE 
                    WHEN main.table_name = 'usuario' THEN (
                        SELECT jsonb_build_object(
                            'id', cl.id,
                            'before', COALESCE(cl.before_data, '{}'::jsonb),
                            'after', COALESCE(cl.after_data, '{}'::jsonb)
                        )
                        FROM chofer_logs cl
                        WHERE cl.created_at = main.created_at
                          AND cl.entity_id = main.entity_id
                          AND cl.operation = main.operation
                        LIMIT 1
                    )
                    ELSE NULL
                END AS related_chofer_data,
                -- Agregar datos relacionados para logs de cerrar resumen
                CASE 
                    WHEN main.table_name = 'saldo_resumen' AND main.operation = 'INSERT' THEN (
                        SELECT jsonb_build_object(
                            'chofer_cuil', main.after_data->>'chofer_cuil',
                            'saldo', COALESCE(main.after_data->>'saldo', '0'),
                            'group_r', main.after_data->>'group_r',
                            'viajes', COALESCE((
                                SELECT jsonb_agg(
                                    jsonb_build_object(
                                        'comprobante', v.after_data->>'comprobante',
                                        'tarifa', v.after_data->>'tarifa',
                                        'variacion', v.after_data->>'variacion'
                                    )
                                )
                                FROM audit_logs v
                                WHERE v.table_name = 'viaje' 
                                  AND v.operation = 'UPDATE'
                                  AND v.created_at = main.created_at
                                  AND (v.before_data->>'group_r') IS DISTINCT FROM (v.after_data->>'group_r')
                            ), '[]'::jsonb),
                            'pagos', COALESCE((
                                SELECT jsonb_agg(
                                    jsonb_build_object(
                                        'comprobante', COALESCE(p.after_data->>'comprobante', p.after_data->>'nro', p.after_data->>'id'),
                                        'importe', COALESCE(p.after_data->>'importe', p.after_data->>'monto', '0')
                                    )
                                )
                                FROM audit_logs p
                                WHERE p.table_name IN ('pagos_cheque', 'pagos_gasoil', 'pagos_otro') 
                                  AND p.operation = 'UPDATE'
                                  AND p.created_at = main.created_at
                                  AND (p.before_data->>'group_r') IS DISTINCT FROM (p.after_data->>'group_r')
                            ), '[]'::jsonb),
                            'pago_saldo', (
                                SELECT jsonb_build_object(
                                    'detalle', ps.after_data->>'detalle',
                                    'importe', ps.after_data->>'importe'
                                )
                                FROM audit_logs ps
                                WHERE ps.table_name = 'pagos_otro' 
                                  AND ps.operation = 'INSERT'
                                  AND ps.created_at = main.created_at
                                LIMIT 1
                            )
                        )
                    )
                    ELSE NULL
                END AS related_resumen_data
            FROM audit_logs main
            WHERE NOT (main.table_name = 'viaje_cliente' AND main.operation IN ('INSERT', 'UPDATE'))
              AND NOT (main.table_name = 'chofer' AND EXISTS (
                  SELECT 1 FROM audit_logs u 
                  WHERE u.table_name = 'usuario' 
                    AND u.created_at = main.created_at 
                    AND u.entity_id = main.entity_id
                    AND u.operation = main.operation
              ))
              -- Ocultar viajes UPDATE que solo cambiaron factura_id (automático al cargar factura)
              AND NOT (main.table_name = 'viaje' AND main.operation = 'UPDATE'
                  AND (main.before_data - 'factura_id' - 'update_at') = (main.after_data - 'factura_id' - 'update_at')
                  AND (main.before_data->>'factura_id') IS DISTINCT FROM (main.after_data->>'factura_id')
              )
              -- Ocultar viaje_cliente UPDATE que solo cambiaron factura_id 
              AND NOT (main.table_name = 'viaje_cliente' AND main.operation = 'UPDATE'
                  AND (main.before_data - 'factura_id' - 'update_at') = (main.after_data - 'factura_id' - 'update_at')
                  AND (main.before_data->>'factura_id') IS DISTINCT FROM (main.after_data->>'factura_id')
              )
              -- Ocultar viaje UPDATE que solo cambian group_r (parte de cerrar resumen)
              AND NOT (main.table_name = 'viaje' AND main.operation = 'UPDATE'
                  AND (main.before_data - 'group_r' - 'update_at') = (main.after_data - 'group_r' - 'update_at')
                  AND (main.before_data->>'group_r') IS DISTINCT FROM (main.after_data->>'group_r')
                  AND EXISTS (
                      SELECT 1 FROM audit_logs sr 
                      WHERE sr.table_name = 'saldo_resumen' 
                        AND sr.operation = 'INSERT'
                        AND sr.created_at = main.created_at
                  )
              )
              -- Ocultar pagos UPDATE que solo cambian group_r (parte de cerrar resumen)
              AND NOT (main.table_name IN ('pagos_cheque', 'pagos_gasoil', 'pagos_otro') AND main.operation = 'UPDATE'
                  AND (main.before_data - 'group_r' - 'update_at') = (main.after_data - 'group_r' - 'update_at')
                  AND (main.before_data->>'group_r') IS DISTINCT FROM (main.after_data->>'group_r')
                  AND EXISTS (
                      SELECT 1 FROM audit_logs sr 
                      WHERE sr.table_name = 'saldo_resumen' 
                        AND sr.operation = 'INSERT'
                        AND sr.created_at = main.created_at
                  )
              )
              -- Ocultar pagos_otro INSERT que es el pago de saldo (parte de cerrar resumen)
              AND NOT (main.table_name = 'pagos_otro' AND main.operation = 'INSERT'
                  AND EXISTS (
                      SELECT 1 FROM audit_logs sr 
                      WHERE sr.table_name = 'saldo_resumen' 
                        AND sr.operation = 'INSERT'
                        AND sr.created_at = main.created_at
                  )
              )
            ORDER BY main.created_at DESC
            LIMIT 200
        `;


        const result = await pool.query(query);

        res.status(200).json({ logs: result.rows });
    } catch (error) {
        console.error("Error al obtener logs:", error);
        res.status(500).json({ message: 'Error interno al obtener logs.' });
    }
};