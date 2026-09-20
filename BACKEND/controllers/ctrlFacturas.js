const { generarFactura, IS_HOMOLOGACION } = require('../Factura completo');
const { generarNotaCredito, generarNotaDebito, cbteAsocDesdeNroFactura, serviciosDesdeImporteTotal } = require('../Nota Credito');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const pool = require('../db');
const { PDFDocument, rgb, EncryptedPDFError } = require('pdf-lib');
const { getIO } = require('../socket');

const { extraerMetadatos } = require('../facturas/facturaQRExtractor');
const { renderPdfPagesToImages } = require('../facturas/pdfPageRenderer');

// Date formatting helper
function formatDate(date, separator = '') {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return separator ? `${day}${separator}${month}${separator}${year}` : `${year}${month}${day}`;
}

exports.getFacturasData = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const {facturasToGet, cliente_cuit} = req.body;

    if (!cliente_cuit)
        return res.status(400).json({message: "No se especifico el cliente"});

    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");
        let query = '';
        let params = [];
        if (facturasToGet && facturasToGet.length > 0){
            query = `SELECT id AS factura_id, nro_factura, fecha_vto_pago, importe_total FROM factura_arca WHERE valid = true AND id = ANY($1)`;
            params.push(facturasToGet);
        } else if (!facturasToGet && cliente_cuit){
            query = `WITH facturas_agrupadas AS (
                        -- Para cada nro_factura, recolectar todos los IDs de factura_arca y viajes asociados
                        SELECT
                            fa.nro_factura,
                            MIN(fa.id)            AS id,           -- representante del grupo
                            MIN(fa.create_at)     AS create_at,
                            MIN(fa.fecha_vto_pago) AS fecha_vto_pago,
                            MIN(fa.importe_total)  AS importe_total,
                            BOOL_OR(fa.pagada)    AS pagada,
                            STRING_AGG(vc.viaje_comprobante, ', ' ORDER BY vc.viaje_comprobante) AS viajes_str,
                            ARRAY_AGG(vc.viaje_comprobante ORDER BY vc.viaje_comprobante)        AS viaje_comprobantes
                        FROM factura_arca fa
                        INNER JOIN viaje_cliente vc ON vc.factura_id = fa.id AND vc.valid = true AND vc.cliente_cuit = $1
                        WHERE fa.valid = true
                        GROUP BY fa.nro_factura
                    )
                    SELECT
                        id,
                        'Factura'                              AS tipo,
                        create_at                              AS fecha_pago,
                        nro_factura                            AS comprobante,
                        fecha_vto_pago                         AS fecha_vto,
                        importe_total                          AS importe,
                        'Factura de Fletes: ' || viajes_str    AS detalle,
                        CASE
                            WHEN pagada                                                        THEN 'Pagada'
                            WHEN fecha_vto_pago IS NOT NULL AND CURRENT_DATE > fecha_vto_pago THEN 'Pendiente'
                            ELSE 'Facturada'
                        END                                    AS estado,
                        viaje_comprobantes
                    FROM facturas_agrupadas`;
            params.push(cliente_cuit);
        }
        const response = await client.query(query, params);
        if (response.rowCount === 0 && facturasToGet){
            await client.query("ROLLBACK");
            return res.status(400).json({message: "No se encontraron datos de las facturas solicitadas"});
        }

        await client.query("COMMIT");
        let facturasIndexadas = response.rows;
        if (facturasToGet && facturasToGet.length > 0) {
            facturasIndexadas = response.rows.reduce((acc, factura) => {
                // Extraemos el id y el resto de las propiedades
                const { factura_id, ...datos } = factura;
                
                // Asignamos al acumulador usando el id como clave
                acc[factura_id] = datos;
                
                return acc;
            }, {});
        }

        return res.status(200).send({facturasData: facturasIndexadas});

    } catch (error) {
        if (client)
            await client.query('ROLLBACK');
        console.error('Error en getFacturasData:', error.message, error.stack);
        return res.status(500).json({ error: `Error al obtener los datos de las factura: ${error.message}` });
    } finally {
        if (client) client.release();
    }
}

exports.generarFacturaCtrl = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    let client;
    try {
        const invoiceData = req.body;
        console.log('Received invoice data:', JSON.stringify(invoiceData, null, 2));

        // Validate required fields
        const requiredFields = ['ptoVta', 'docNro', 'servicios', 'fechaEmision', 'periodoDesde', 'periodoHasta', 'fechaVtoPago', 'condicionVenta', 'comprobante'];
        const missingFields = requiredFields.filter(field => !invoiceData[field] || (typeof invoiceData[field] === 'string' && invoiceData[field].trim() === ''));
        if (missingFields.length > 0) {
            console.error('Missing required fields:', missingFields);
            return res.status(400).json({ error: `Faltan campos obligatorios: ${missingFields.join(', ')}` });
        }

        // Validate docNro (CUIT)
        const cleanDocNro = invoiceData.docNro.replace(/[^0-9]/g, '');
        if (cleanDocNro.length !== 11) {
            console.error('Invalid CUIT:', invoiceData.docNro);
            return res.status(400).json({ error: 'CUIT inválido: debe tener 11 dígitos' });
        }
        const cuit = invoiceData.docNro;
        invoiceData.docNro = invoiceData.docNro.replace(/[^0-9]/g, '');

        // Validate servicios
        if (!Array.isArray(invoiceData.servicios) || invoiceData.servicios.length === 0) {
            console.error('Invalid servicios:', invoiceData.servicios);
            return res.status(400).json({ error: 'Servicios debe ser un arreglo no vacío' });
        }
        for (const servicio of invoiceData.servicios) {
            const requiredServicioFields = ['subtotal', 'ivaId', 'precioUnit', 'cantidad', 'subtotalConIVA'];
            const missingServicioFields = requiredServicioFields.filter(field => !servicio[field]);
            if (missingServicioFields.length > 0) {
                console.error('Missing servicio fields:', missingServicioFields, 'in', servicio);
                return res.status(400).json({ error: `Faltan campos en servicio: ${missingServicioFields.join(', ')}` });
            }
            // Validate numeric fields
            const numericFields = ['subtotal', 'precioUnit', 'cantidad', 'subtotalConIVA'];
            for (const field of numericFields) {
                //console.log(`Validating field ${field} with value:`, servicio[field]);
                const value = typeof servicio[field] === 'string' ? parseFloat(servicio[field].replace(/[^0-9.]/g, '')) : parseFloat(servicio[field]);
                if (isNaN(value)) {
                    console.error(`Invalid ${field} in servicio:`, servicio[field]);
                    return res.status(400).json({ error: `Campo ${field} inválido en servicio: ${servicio[field]}` });
                }
            }
        }

        // Ensure directories exist
        const facturasDir = path.join(__dirname, '../facturas');
        const certDir = path.join(__dirname, '../cert');
        if (!fs.existsSync(facturasDir)) {
            fs.mkdirSync(facturasDir, { recursive: true });
            console.log(`Created directory: ${facturasDir}`);
        }
        if (!fs.existsSync(certDir)) {
            fs.mkdirSync(certDir, { recursive: true });
            console.log(`Created directory: ${certDir}`);
        }

        // Call generarFactura
        const result = await generarFactura(invoiceData);
        const { pdfBuffer } = result;

        if (result.error || !result.cae) {
            console.error('Factura generation failed:', result.error || 'No CAE', 'Response:', result.response);
            return res.status(500).json({ error: `Error al emitir factura: ${result.error || 'No se obtuvo CAE'}` });
        }

        // Validar el buffer
        if (!pdfBuffer || pdfBuffer.length === 0) {
            throw new Error('El buffer del PDF está vacío o inválido');
        }

        client = await pool.connect();
        await client.query('BEGIN');
        // Setear el usuario de la app en la sesión de PostgreSQL para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        let valoresPdf;
        if (result.metadatosQR) {
            valoresPdf = result.metadatosQR;
        } else {
            // fallback por si hay facturas antiguas
            valoresPdf = await extraerMetadatos(pdfBuffer);
        }
        
        const response = await client.query(`INSERT INTO factura_arca(cliente_cuit, factura_pdf, fecha_vto_pago, nro_factura, importe_total, imp_neto, imp_iva, cae) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [cuit, pdfBuffer, valoresPdf.fechaVtoPago, valoresPdf.nroFactura, valoresPdf.importeTotal, valoresPdf.impNeto, valoresPdf.impIVA, valoresPdf.cae]
        );

        // Obtener el factura_id insertado
        const facturaId = response.rows[0].id;
        const viajesIds = [];

        // Actualizar la tabla viaje con el factura_id para cada comprobante
        for (const c of invoiceData.comprobante) {
            await client.query(
                'UPDATE viaje_cliente SET factura_id = $1 WHERE viaje_comprobante = $2',
                [facturaId, c.id]
            );
            viajesIds.push(c.id);
        }

        const responseClient = await client.query('SELECT balance FROM cliente WHERE valid = true AND cuit = $1', [cuit]);

        await client.query('COMMIT');
        client.release();
        client = null;
        // Configurar encabezados para visualizar el PDF en el navegador
        res.setHeader('Content-Type', 'application/pdf');
        // Para visualizar en el navegador, usa 'inline'; para descarga, usa 'attachment'
        res.setHeader('Content-Disposition', `inline; filename='facturaCliente'`);
        res.setHeader('Content-Length', pdfBuffer.length);
        // Incluir facturaId en un encabezado personalizado
        res.setHeader('X-Factura-Id', facturaId.toString());

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('actualizarFacturaCliente', { cuit: cuit, balance: responseClient.rows[0].balance });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en UploadFactura", error.stack);
        }


        // Send the PDF directly
        return res.status(200).send(pdfBuffer);
    } catch (error) {
        client?.query('ROLLBACK');
        client?.release();
        console.error('Error in generarFacturaCtrl:', error.message, error.stack);
        res.status(500).json({ error: `Error al generar factura: ${error.message}` });
    }
};

exports.uploadFactura = async (req, res) => {
    let client;
    try {
        // Verificar autorización
        if ((req.user.role === 'chofer' && req.user.cuil !== req.body.cuil) || (req.user.role === 'chofer' && req.body.type === 'viajeCliente')) {
            return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
        }

        // Obtener datos del FormData
        const { viajeIds, type } = req.body;
        const facturaFile = req.files?.factura;

        // Validar datos
        if (!viajeIds || !facturaFile || !type) {
            return res.status(400).json({ error: 'Faltan viajeIds o archivo factura' });
        }

        // Parsear viajeIds (enviado como string JSON)
        let parsedViajeIds;
        try {
            parsedViajeIds = JSON.parse(viajeIds);
            if (!Array.isArray(parsedViajeIds) || parsedViajeIds.length === 0) {
                return res.status(400).json({ error: 'viajeIds debe ser un arreglo no vacío' });
            }
        } catch (error) {
            return res.status(400).json({ error: 'Formato de viajeIds inválido' });
        }

        // Validar tipo de archivo
        if (!['application/pdf', 'image/jpeg', 'image/png'].includes(facturaFile[0].mimetype)) {
            return res.status(400).json({ error: 'El archivo debe ser PDF, JPG o PNG' });
        }

        let pdfBuffer = facturaFile[0].buffer;
        if (facturaFile.length > 0 && ['image/jpeg', 'image/png'].includes(facturaFile[0].mimetype)) {
            // Crear un nuevo documento PDF
            const pdfDoc = await PDFDocument.create();
            // Si es una imagen, agregarla como una página
            const imageBytes = facturaFile[0].buffer;
            let image;
            if (facturaFile[0].mimetype === 'image/jpeg') {
                image = await pdfDoc.embedJpg(imageBytes);
            } else {
                image = await pdfDoc.embedPng(imageBytes);
            }
            const page = pdfDoc.addPage([600, 800]); // Tamaño de página (ajústalos según necesites)
            page.drawImage(image, {
                x: 0,
                y: 0,
                width: 600,
                height: 800,
            });
            pdfBuffer = await pdfDoc.save();
        }

        // Validar el buffer
        if (!pdfBuffer || pdfBuffer.length === 0) {
            return res.status(400).json({ error: 'El buffer del archivo está vacío o inválido' });
        }

        // Iniciar transacción
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        let query;
        let queryInsert;
        let queryUpdate;
        let params = [];
        switch (type) {
            case 'viajeCliente':
                query = 'SELECT cliente_cuit AS chofer_cuil FROM viaje_cliente WHERE viaje_comprobante = $1';
                queryInsert = 'INSERT INTO factura_arca(cliente_cuit, factura_pdf) VALUES ($1, $2) RETURNING id';
                queryUpdate = 'UPDATE viaje_cliente SET factura_id = $1 WHERE valid = true AND viaje_comprobante = $2'
                break;
            case 'ordenProveedorGasoil':
            case 'ordenProveedorOtro':
                let table_modify = type === 'ordenProveedorGasoil'? 'pagos_gasoil' : 'pagos_otro';
                query = `SELECT proveedor_cuit AS chofer_cuil FROM ${table_modify} WHERE comprobante = $1`;
                queryInsert = 'INSERT INTO factura(proveedor_cuit, factura_pdf) VALUES ($1, $2) RETURNING id';
                queryUpdate = `UPDATE ${table_modify} SET factura_id = $1 WHERE valid = true AND comprobante = $2`;
                break;
            default:
                query = 'SELECT chofer_cuil FROM viaje WHERE comprobante = $1';
                queryInsert = 'INSERT INTO factura(cuil, factura_pdf) VALUES ($1, $2) RETURNING id';
                queryUpdate = 'UPDATE viaje SET factura_id = $1 WHERE valid = true AND comprobante = $2';
        }

        const responseCuil = await client.query(query,
            [parsedViajeIds[0]]
        )

        if (!(responseCuil.rows.length > 0))
            return res.status(405).json({ error: "El viaje al que desea cargar la factura no se encuentra registrado" });

        const cuil = responseCuil.rows[0].chofer_cuil;
        // Insertar factura en la base de datos
        params.push(cuil)
        params.push(pdfBuffer);

        let estado = null;
        let facturaId;
        if (type === "viajeCliente"){
            const valoresPdf = await extraerMetadatos(pdfBuffer);
            console.log(valoresPdf);
            if (valoresPdf){
                // Si ya existe una factura cargada con ese nro_factura, se reutiliza en vez de
                // insertar una entrada duplicada (evita tener varias filas de factura_arca para
                // el mismo comprobante).
                const facturaExistente = await client.query(
                    'SELECT id FROM factura_arca WHERE valid = true AND nro_factura = $1',
                    [valoresPdf.nroFactura]
                );
                if (facturaExistente.rows.length > 0) {
                    facturaId = facturaExistente.rows[0].id;
                } else {
                    queryInsert = `INSERT INTO factura_arca(cliente_cuit, factura_pdf, fecha_vto_pago, nro_factura, importe_total, imp_neto, imp_iva, cae) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`;
                    params.push(valoresPdf.fechaVtoPago);
                    params.push(valoresPdf.nroFactura);
                    params.push(valoresPdf.importeTotal);
                    params.push(valoresPdf.impNeto);
                    params.push(valoresPdf.impIVA);
                    params.push(valoresPdf.cae);
                }
                estado = new Date() > valoresPdf.fechaVtoPago? "Pendiente" : "Facturada";
            }
        }

        if (facturaId === undefined) {
            const response = await client.query(
                queryInsert,
                params
            );

            if (response.rows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(405).json({ message: "Ocurrio un error al intentar registrar la factura" });
            }

            // Obtener el factura_id insertado
            facturaId = response.rows[0].id;
        }
        const viajesError = [];

        // Actualizar la tabla viaje con el factura_id
        for (const id of parsedViajeIds) {
            const viajeResponse = await client.query(
                queryUpdate,
                [facturaId, id]
            );
            if (viajeResponse.rowCount === 0)
                viajesError.push(id);
        }


        if (viajesError.length === parsedViajeIds.length) {
            await client.query('ROLLBACK');
            return res.status(405).json({ message: `Los viajes seleccionados no se encuentran registrados` });
        }


        let message = "Factura subida con éxito.";
        if (viajesError.length > 0) {
            message += ` Los siguientes viajes no se encuentran registrados: ${viajesError.join(', ')}`;
        }

        const responseClient = await client.query('SELECT balance FROM cliente WHERE valid = true AND cuit = $1', [cuil]);

        // Confirmar transacción
        await client.query('COMMIT');

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    if (type !== "viajeCliente")
                        socket.emit('nuevoFactura', { cuil: cuil, facturaId: facturaId, viajesIds: parsedViajeIds.filter(viaje => !viajesError.includes(viaje.id)) });
                    else
                        socket.emit('actualizarFacturaCliente', { cuit: cuil, balance: responseClient.rows[0].balance });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en UploadFactura", error.stack);
        }

        // Enviar respuesta
        return res.status(200).json({ message, facturaId, ...(type === "viajeCliente" && {estado: estado}) });
    } catch (error) {
        if (client)
            await client.query('ROLLBACK');
        console.error('Error en uploadFactura:', error.message, error.stack);
        return res.status(500).json({ error: `Error al subir la factura: ${error.message}` });
    } finally {
        if (client) client.release();
    }
}

// Si a la factura le faltan imp_neto/imp_iva (p. ej. se cargó manualmente sin extracción
// de metadatos), se recalculan a partir del importe_total igual que en "Nota Credito.js",
// y se persisten para TODAS las filas de factura_arca que compartan ese mismo nro_factura
// (nro_factura ya combina punto de venta y número, "PPPPP-NNNNNNNN") en vez de solo la fila
// puntual por id, porque un mismo comprobante puede tener más de una entrada.
async function asegurarImpNetoIVA(client, facturaData) {
    if (facturaData.imp_neto != null && facturaData.imp_iva != null) return facturaData;

    const [servicioCalculado] = serviciosDesdeImporteTotal(facturaData.importe_total);
    const impNeto = parseFloat(servicioCalculado.subtotal);
    const impIVA = parseFloat((parseFloat(servicioCalculado.subtotalConIVA) - impNeto).toFixed(2));

    await client.query(
        'UPDATE factura_arca SET imp_neto = $1, imp_iva = $2 WHERE valid = true AND nro_factura = $3',
        [impNeto, impIVA, facturaData.nro_factura]
    );

    return { ...facturaData, imp_neto: impNeto, imp_iva: impIVA };
}

exports.generarNotaCredito = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const { facturaId, motivo, cuit } = req.body;

    if (!facturaId || !motivo || !cuit) {
        return res.status(400).json({ error: 'Faltan facturaId, motivo o cuit' });
    }

    // El motivo usa los mismos códigos de comprobante que AFIP: 2 = Nota de Débito A, 3 = Nota de Crédito A
    const tipoNota = Number(motivo);
    if (tipoNota !== 2 && tipoNota !== 3) {
        return res.status(400).json({ error: 'El motivo debe ser 2 (Nota de Débito) o 3 (Nota de Crédito)' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        const response = await client.query('SELECT * FROM factura_arca WHERE id = $1 AND valid = true', [facturaId]);
        if (response.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: `No se encontró la factura con ID ${facturaId}` });
        }

        let facturaData = response.rows[0];

        // El punto de venta habilitado para facturar depende del ambiente de AFIP (2 en
        // producción, 12 en homologación); si la factura a ajustar pertenece a otro, no se
        // genera la nota.
        const ptoVtaFactura = parseInt(facturaData.nro_factura.split('-')[0], 10);
        const ptoVtaEsperado = IS_HOMOLOGACION ? 12 : 2;
        if (ptoVtaFactura !== ptoVtaEsperado) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: `No se puede generar la nota: la factura pertenece al punto de venta ${ptoVtaFactura}, distinto del habilitado en este ambiente (${ptoVtaEsperado})` });
        }

        facturaData = await asegurarImpNetoIVA(client, facturaData);

        // fecha_vto_pago siempre se calcula como un mes después del periodoHasta de la factura
        // (ver handleGenerateInvoice en el frontend), así que el período facturado original se
        // puede reconstruir a partir de ese dato sin necesidad de guardarlo aparte: periodoHasta
        // es fecha_vto_pago menos un mes, y periodoDesde es el primer día de ese mes.
        const periodoHasta = new Date(facturaData.fecha_vto_pago);
        periodoHasta.setMonth(periodoHasta.getMonth() - 1);
        const periodoDesde = new Date(periodoHasta.getFullYear(), periodoHasta.getMonth(), 1);

        const fechaHoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
        const fechaVencimiento = new Date(fechaHoy);
        fechaVencimiento.setMonth(fechaHoy.getMonth() + 1);

        const cbteAsoc = cbteAsocDesdeNroFactura(facturaData.nro_factura);
        const servicios = serviciosDesdeImporteTotal(facturaData.importe_total, {
            descripcion: `ERROR DE FACTURA NRO ${cbteAsoc.nro}`,
            impNeto: facturaData.imp_neto
        });

        const notaData = {
            ptoVta: ptoVtaFactura,
            docNro: cuit.replace(/[^0-9]/g, ''),
            servicios,
            fechaEmision: formatDate(fechaHoy),
            periodoDesde: formatDate(periodoDesde),
            periodoHasta: formatDate(fechaHoy),
            fechaVtoPago: formatDate(fechaVencimiento),
            condicionVenta: 'Cuenta Corriente',
            cbteAsoc
        };

        const emitirNota = tipoNota === 3 ? generarNotaCredito : generarNotaDebito;
        const resultado = await emitirNota(notaData);

        if (resultado.error || !resultado.cae) {
            await client.query('ROLLBACK');
            return res.status(500).json({ error: `Error al emitir la nota: ${resultado.error || 'No se obtuvo CAE'}` });
        }

        // La nota se guarda como "otro archivo" vinculado a cada uno de los viajes que
        // estaban asignados a la factura que se está ajustando, para que quede accesible
        // desde la sección "Otros Archivos" de esos mismos viajes. El PDF se inserta una
        // única vez en "archivo"; cada viaje afectado solo agrega una fila liviana en la
        // tabla puente "archivo_viaje" apuntando al mismo archivo_id, sin duplicar el binario.
        const descripcionArchivo = `Nota de ${tipoNota === 3 ? 'Crédito' : 'Débito'} generada de Factura Nro ${facturaData.nro_factura}`;
        const { rows: viajesAfectados } = await client.query(
            'SELECT viaje_comprobante, cliente_cuit FROM viaje_cliente WHERE valid = true AND factura_id = $1',
            [facturaId]
        );

        const { rows: [archivoInsertado] } = await client.query(
            'INSERT INTO archivo (descripcion, archivo_pdf) VALUES ($1, $2) RETURNING id',
            [descripcionArchivo, resultado.pdfBuffer]
        );

        const archivosCreados = [];
        for (const viajeAfectado of viajesAfectados) {
            // Siempre viene de viaje_cliente, así que es de cliente: chofer_cuil queda null.
            await client.query(
                'INSERT INTO archivo_viaje (archivo_id, viaje_comprobante, cliente_cuit, chofer_cuil) VALUES ($1, $2, $3, NULL)',
                [archivoInsertado.id, viajeAfectado.viaje_comprobante, viajeAfectado.cliente_cuit]
            );
            archivosCreados.push({
                comprobante: viajeAfectado.viaje_comprobante,
                clienteCuit: viajeAfectado.cliente_cuit,
                id: archivoInsertado.id,
                descripcion: descripcionArchivo
            });
        }

        await client.query('COMMIT');

        // La sincronización con otros administradores conectados ya la hace el deleteFactura
        // ('facturaCompleta') que el frontend dispara justo después de descargar esta nota: ese
        // sí persiste el desvínculo de factura_id y el balance, y emite 'actualizarFacturaCliente'
        // con datos ya confirmados en la base. Emitir un socket aparte acá solo duplicaba el
        // aviso/render en el cliente sin aportar nada que ese otro evento no cubra ya.

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename='nota'`);
        res.setHeader('Content-Length', resultado.pdfBuffer.length);
        res.setHeader('X-Archivos-Nota', JSON.stringify(archivosCreados));
        return res.status(200).send(resultado.pdfBuffer);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error en generarNotaCredito:', error.message, error.stack);
        return res.status(500).json({ error: `Error al generar la nota de crédito: ${error.message}` });
    } finally {
        if (client) client.release();
    }
}

exports.uploadCartaPorte = async (req, res) => {
    let client;
    try {
        // Verificar autorización
        if (req.user.role === 'chofer') {
            return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
        }

        // Obtener datos del FormData
        const { viajeIds } = req.body;
        const cartaPorteFiles = req.files?.cartaPorte || [];

        // Validar datos
        if (!viajeIds || !cartaPorteFiles) {
            return res.status(400).json({ error: 'Faltan viajeIds o archivo factura' });
        }

        // Iniciar transacción
        client = await pool.connect();
        await client.query('BEGIN');
        // Setear el usuario de la app en la sesión de PostgreSQL para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        const responseCuil = await client.query('SELECT chofer_cuil AS cuil FROM viaje WHERE valid = true AND comprobante = $1',
            [viajeIds]
        )

        if (responseCuil.rowCount === 0) {
            client.release();
            return res.status(405).json({ message: `El viaje con comprobante ${viajeIds} no se encuentra registrado` });
        }

        // Procesar cartas de porte si se enviaron
        if (cartaPorteFiles.length > 0) {
            // Validar tipo de archivo para todos los archivos
            const invalidFile = cartaPorteFiles.find(file => !['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype));
            if (invalidFile) {
                return res.status(400).json({ error: 'Uno o más archivos de carta de porte deben ser PDF, JPG o PNG' });
            }

            let combinedPdfBuffer;

            if (cartaPorteFiles.length === 1 && cartaPorteFiles[0].mimetype === 'application/pdf') {
                // Un único PDF: se guarda tal cual, igual que en factura/otros archivos, sin
                // pasar por pdf-lib. No hace falta combinar nada, así que tampoco importa si el
                // PDF tiene algún tipo de seguridad/encriptación aplicada (pdf-lib no la maneja,
                // pero al guardarlo crudo el navegador lo abre sin problema).
                combinedPdfBuffer = cartaPorteFiles[0].buffer;
            } else {
                // Varios archivos (o una sola imagen): hay que armar un único PDF combinado.
                // Para los PDF de origen no usamos pdf-lib (PDFDocument.load + copyPages), porque
                // no sabe leer PDFs con seguridad aplicada aunque abran sin pedir contraseña, y
                // terminan copiándose páginas con el contenido ilegible (se ven en blanco).
                // En cambio, renderizamos cada página del PDF como imagen con pdfjs-dist (que sí
                // sabe abrir esos PDFs, igual que hace cualquier lector) y la insertamos como una
                // página más, con el mismo criterio que las imágenes sueltas.
                const pdfDoc = await PDFDocument.create();
                for (const file of cartaPorteFiles) {
                    if (file.mimetype === 'application/pdf') {
                        let paginasRenderizadas;
                        try {
                            paginasRenderizadas = await renderPdfPagesToImages(file.buffer);
                        } catch (renderError) {
                            await client.query('ROLLBACK');
                            if (renderError.name === 'PasswordException') {
                                return res.status(400).json({ error: 'Uno de los PDF de la carta de porte requiere contraseña para abrirse y no se puede combinar con otros archivos.' });
                            }
                            return res.status(400).json({ error: 'No se pudo leer uno de los PDF de la carta de porte, puede estar dañado' });
                        }
                        for (const { buffer, width, height } of paginasRenderizadas) {
                            const image = await pdfDoc.embedPng(buffer);
                            const page = pdfDoc.addPage([width, height]);
                            page.drawImage(image, { x: 0, y: 0, width, height });
                        }
                    } else if (['image/jpeg', 'image/png'].includes(file.mimetype)) {
                        // Si es una imagen, agregarla como una página
                        const imageBytes = file.buffer;
                        let image;
                        if (file.mimetype === 'image/jpeg') {
                            image = await pdfDoc.embedJpg(imageBytes);
                        } else {
                            image = await pdfDoc.embedPng(imageBytes);
                        }
                        const page = pdfDoc.addPage([600, 800]); // Tamaño de página (ajústalos según necesites)
                        page.drawImage(image, {
                            x: 0,
                            y: 0,
                            width: 600,
                            height: 800,
                        });
                    }
                }
                combinedPdfBuffer = await pdfDoc.save();
            }

            // Insertar el PDF combinado en la base de datos
            await client.query(
                'INSERT INTO carta_porte (viaje_comprobante, carta_porte_pdf) VALUES ($1, $2)',
                [viajeIds, combinedPdfBuffer]
            );
        }

        // Confirmar transacción
        await client.query('COMMIT');

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('nuevoCartaPorte', { cuil: responseCuil.rows[0].cuil, comprobante: viajeIds });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en UploadFactura", error.stack);
        }

        // Enviar respuesta
        return res.status(200).json({ message: 'Carta de porte subida con éxito' });
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
            client.release();
        }
        console.error('Error en uploadCartaPorte:', error.message, error.stack);
        return res.status(500).json({ error: `Error al subir la carta de porte: ${error.message}` });
    } finally {
        if (client) client.release();
    }
}

exports.getArchivosViaje = async (req, res) => {
    const { comprobante, clienteCuit, cuil } = req.query;

    // Verificar autorización
    if ((req.user.role === 'chofer' && req.user.cuil !== cuil) || (req.user.role === 'chofer' && clienteCuit !== "null")) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    if (!comprobante || comprobante === "null" || comprobante === "undefined") {
        return res.status(400).json({ message: "Falta el comprobante del viaje" });
    }

    try {
        // Cuando el ítem representa una factura agrupada (varios viajes bajo el mismo
        // comprobante de factura), el frontend manda varios viaje_comprobante separados por coma.
        // Una nota de crédito/débito puede tener una fila de archivo_viaje POR CADA viaje
        // afectado, pero todas apuntan al mismo archivo_id (el PDF no está duplicado), así que
        // agrupar por a.id alcanza para que aparezca una sola vez aunque comparta varios viajes.
        const comprobantes = comprobante.split(',');
        const cuit = clienteCuit && clienteCuit !== "null" && clienteCuit !== "undefined" ? clienteCuit : null;
        const { rows } = await pool.query(
            `SELECT a.id, a.descripcion
             FROM archivo_viaje av
             JOIN archivo a ON a.id = av.archivo_id AND a.valid = true
             WHERE av.valid = true AND av.viaje_comprobante = ANY($1) AND av.cliente_cuit IS NOT DISTINCT FROM $2
             GROUP BY a.id, a.descripcion
             ORDER BY MIN(av.create_at) ASC`,
            [comprobantes, cuit]
        );
        return res.status(200).json({ archivos: rows });
    } catch (error) {
        console.error('Error en getArchivosViaje:', error.message, error.stack);
        return res.status(500).json({ error: `Error al obtener los archivos del viaje: ${error.message}` });
    }
};

exports.buscarArchivosTermino = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const { termino } = req.query;
    if (!termino || termino.trim() === '') {
        return res.status(400).json({ message: 'Se debe proporcionar un término de búsqueda' });
    }

    const like = `%${termino.trim()}%`;

    try {
        const query = `
            WITH facturas_agrupadas AS (
                -- Facturas viejas pueden tener varias filas de factura_arca compartiendo el
                -- mismo nro_factura (una por viaje, de antes de que uploadFactura empezara a
                -- deduplicar), así que hay que agruparlas para no repetir la misma factura
                -- una vez por cada viaje que tenga asociado. Se agrupa por nro_factura Y
                -- cliente_cuit: si el mismo nro_factura quedó repetido para clientes distintos
                -- (pasa en datos viejos, no debería ser el mismo comprobante real), esas SÍ
                -- tienen que quedar como entradas separadas.
                SELECT
                    nro_factura,
                    cliente_cuit,
                    MIN(id) AS id,
                    ARRAY_AGG(id) AS ids,
                    MIN(create_at) AS create_at,
                    BOOL_OR(valid) AS valid
                FROM factura_arca
                WHERE nro_factura ILIKE $1
                GROUP BY nro_factura, cliente_cuit
            )

            -- "Otros archivos": matchea por descripcion (incluye las notas de crédito/débito,
            -- cuya descripcion ya trae "...generada de Factura Nro X").
            SELECT
                a.id,
                a.descripcion,
                a.create_at AS fecha,
                (
                    SELECT CASE
                        WHEN av.cliente_cuit IS NOT NULL THEN 'Cliente (' || av.cliente_cuit || ')'
                        WHEN av.chofer_cuil IS NOT NULL THEN 'Chofer (' || av.chofer_cuil || ')'
                        ELSE NULL
                    END
                    FROM archivo_viaje av
                    WHERE av.archivo_id = a.id AND av.valid = true
                    LIMIT 1
                ) AS asignado,
                (
                    SELECT STRING_AGG(av.viaje_comprobante, ', ' ORDER BY av.viaje_comprobante)
                    FROM archivo_viaje av
                    WHERE av.archivo_id = a.id AND av.valid = true
                ) AS comprobantes,
                a.valid,
                'Archivo' AS tipo
            FROM archivo a
            WHERE a.descripcion ILIKE $1

            UNION ALL

            -- Facturas: matchea por nro_factura (no tienen columna de descripción propia),
            -- ya agrupadas por factura real (ver facturas_agrupadas arriba).
            SELECT
                fg.id,
                'Factura Nro. ' || fg.nro_factura AS descripcion,
                fg.create_at AS fecha,
                CASE WHEN fg.cliente_cuit IS NOT NULL THEN 'Cliente (' || fg.cliente_cuit || ')' ELSE NULL END AS asignado,
                (
                    SELECT STRING_AGG(vc.viaje_comprobante, ', ' ORDER BY vc.viaje_comprobante)
                    FROM viaje_cliente vc
                    WHERE vc.factura_id = ANY(fg.ids) AND vc.valid = true
                ) AS comprobantes,
                fg.valid,
                'Factura' AS tipo
            FROM facturas_agrupadas fg

            ORDER BY fecha DESC
        `;
        const { rows } = await pool.query(query, [like]);

        return res.status(200).json({ files: rows });
    } catch (error) {
        console.error('Error en buscarArchivosTermino:', error.message, error.stack);
        return res.status(500).json({ error: `Error al buscar archivos: ${error.message}` });
    }
};

exports.descargarArchivoViaje = async (req, res) => {
    const { id } = req.query;
    if (!id || id === "null" || id === "undefined") {
        return res.status(400).json({ message: "Falta el id del archivo" });
    }

    let validos;
    if (req.user.role === 'chofer')
        validos = true;
    else
        validos = req.query.validos === 'false' ? false : true;

    try {
        const { rows } = await pool.query(`SELECT archivo_pdf FROM archivo WHERE ${validos ? `valid = true AND` : ''} id = $1`, [id]);
        if (rows.length === 0) {
            return res.status(404).json({ message: "No se encontró el archivo solicitado" });
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename='archivo'`);
        res.setHeader('Content-Length', rows[0].archivo_pdf.length);
        return res.status(200).send(rows[0].archivo_pdf);
    } catch (error) {
        console.error('Error en descargarArchivoViaje:', error.message, error.stack);
        return res.status(500).json({ error: `Error al descargar el archivo: ${error.message}` });
    }
};

exports.uploadArchivoViaje = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    try {
        const { comprobante, clienteCuit, descripcion } = req.body;
        const archivoFile = req.files?.archivo;

        if (!comprobante || !descripcion || !archivoFile) {
            return res.status(400).json({ error: 'Faltan comprobante, descripción o archivo' });
        }

        if (!['application/pdf', 'image/jpeg', 'image/png'].includes(archivoFile[0].mimetype)) {
            return res.status(400).json({ error: 'El archivo debe ser PDF, JPG o PNG' });
        }

        let pdfBuffer = archivoFile[0].buffer;
        if (['image/jpeg', 'image/png'].includes(archivoFile[0].mimetype)) {
            const pdfDoc = await PDFDocument.create();
            const imageBytes = archivoFile[0].buffer;
            const image = archivoFile[0].mimetype === 'image/jpeg'
                ? await pdfDoc.embedJpg(imageBytes)
                : await pdfDoc.embedPng(imageBytes);
            const page = pdfDoc.addPage([600, 800]);
            page.drawImage(image, { x: 0, y: 0, width: 600, height: 800 });
            pdfBuffer = await pdfDoc.save();
        }

        const cuit = clienteCuit && clienteCuit !== "null" && clienteCuit !== "undefined" ? clienteCuit : null;

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);
            const { rows: [archivo] } = await client.query(
                'INSERT INTO archivo (descripcion, archivo_pdf) VALUES ($1, $2) RETURNING id',
                [descripcion, pdfBuffer]
            );
            // Un archivo es de un cliente o de un chofer, nunca de ambos: si no vino cliente_cuit
            // se completa chofer_cuil desde el viaje; si vino cliente_cuit, chofer_cuil queda null.
            let choferCuil = null;
            if (!cuit) {
                const { rows: [viajeRow] } = await client.query(
                    'SELECT chofer_cuil FROM viaje WHERE comprobante = $1',
                    [comprobante]
                );
                choferCuil = viajeRow?.chofer_cuil ?? null;
            }
            await client.query(
                'INSERT INTO archivo_viaje (archivo_id, viaje_comprobante, cliente_cuit, chofer_cuil) VALUES ($1, $2, $3, $4)',
                [archivo.id, comprobante, cuit, choferCuil]
            );
            await client.query('COMMIT');
            socketEvent = 'actualizarArchivoViaje';
            socketPayload = { cuil: choferCuil, cuit: cuit, comprobantes: [comprobante] };
            emitSocket(req.user.cuil, socketEvent, socketPayload);

            return res.status(200).json({ message: 'Archivo subido con éxito', id: archivo.id });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error en uploadArchivoViaje:', error.message, error.stack);
        return res.status(500).json({ error: `Error al subir el archivo: ${error.message}` });
    }
};

exports.pagarFacturas = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const {facturasToMark, cuit} = req.body;

    if (!facturasToMark || facturasToMark.length < 1){
        return res.status(400).json({ message: 'Ocurrio un error al obtener las facturas para marcar como pagadas'});
    }

    let client;
    try{
        // Iniciar transacción
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        // 2. Buscamos todos los nro_factura asociados y luego 
        // actualizamos todas las facturas que compartan esos números.
        // Usamos una Subconsulta para marcar "por número de factura" como pediste.
        const updateFacturasQuery = `
            UPDATE factura_arca
            SET 
                pagada = true
            WHERE nro_factura IN (
                SELECT nro_factura 
                FROM factura_arca 
                WHERE id = ANY($1)
            )
            RETURNING id AS factura_id;
        `;
        
        const resFacturas = await client.query(updateFacturasQuery, [facturasToMark]);
        if (resFacturas.rowCount === 0){
            await client.query('ROLLBACK');
            return res.status(400).json({message: "No se logro marcar las facturas como pagadas"});
        }
        const idsActualizados = resFacturas.rows;

        await client.query('COMMIT');

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('payFactura', { cuit: cuit, facturasPagadas: idsActualizados });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en deleteFactura", error.stack);
        }

        res.status(200).json({
            message: "Facturas marcadas como pagadas con éxito",
            idFacturas: idsActualizados
        });

    } catch (error){
        await client.query('ROLLBACK');
        console.error('Error en pagarFacturas', error.message, error.stack);
        return res.status(500).json({ error: `Error al marcar las facturas como pagadas` });
    } finally {
        if (client) client.release();
    }
}

exports.descargarFactura = async (req, res) => {
    const { cuil, id, comprobante} = req.query;
    if (req.user.role === 'chofer' && req.user.cuil !== cuil) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    let validos;
    if (req.user.role === 'chofer')
        validos = true;
    else
        validos = req.query.validos === 'false' ? false : true;

    try {
        let query;
        let params = [];
        if (id && id !== "null" && id !== "undefined") {
            query = `SELECT factura_pdf FROM factura WHERE ${validos ? `valid = true AND` : ''} id = $1 `;
            params.push(id);
        } else if (comprobante && comprobante !== "null" && comprobante !== "undefined") {
            query = `SELECT carta_porte_pdf FROM carta_porte WHERE ${validos ? `valid = true AND` : ''} viaje_comprobante = $1`;
            params.push(comprobante);
        } else {
            return res.status(405).json({ message: "No se obtuvieron los datos del documento solicitado" });
        }
        let response = await pool.query(query, params);
        if (response.rows.length === 0) {
            if (req.user.role !== "chofer" && id && id !== "null" && id !== "undefined")
                response = await pool.query(`SELECT factura_pdf FROM factura_arca WHERE ${validos ? `valid = true AND` : ''} id = $1`, params);
            if (response.rows.length === 0)
                return res.status(406).json({ message: "No se encontro el documento solicitado para el viaje especificado" });
        }

        const { factura_pdf, carta_porte_pdf } = response.rows[0];

        // Configurar encabezados para visualizar el PDF en el navegador
        res.setHeader('Content-Type', 'application/pdf');
        // Para visualizar en el navegador, usa 'inline'; para descarga, usa 'attachment'
        res.setHeader('Content-Disposition', `inline; filename='facturaCliente'`);
        res.setHeader('Content-Length', factura_pdf ? factura_pdf.length : carta_porte_pdf.length);

        // Send the PDF directly
        return res.status(200).send(factura_pdf ? factura_pdf : carta_porte_pdf);
    } catch (error) {
        console.error('Error en descargar en descargarFactura', error.message, error.stack);
        return res.status(500).json({ error: `Error al descargar el documento: ${error.message}` });
    }
}

exports.deleteFactura = async (req, res) => {
    if (req.user.role === 'chofer')
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });

    const { id, comprobante, type } = req.query;
    if (!type || type === "null" || type === "undefined")
        return res.status(405).json({ message: "No se pudo reconocer los datos del viaje para el que desea eliminar documentación" });

    // Configuración por tipo: qué tabla actualizar y cómo obtener el cuit para el socket
    const CONFIG = {
        viajes:              { table: 'viaje',       cuitQuery: 'SELECT chofer_cuil AS cuil, cliente_cuit AS cuit FROM viaje WHERE valid = true AND comprobante = $1',        socketEvent: 'deleteFactura' },
        viajeCliente:        { table: 'viaje_cliente', cuitQuery: 'SELECT cliente_cuit AS cuit FROM viaje_cliente WHERE valid = true AND viaje_comprobante = $1',              socketEvent: 'actualizarFacturaCliente' },
        ordenProveedorGasoil:{ table: 'pagos_gasoil', cuitQuery: 'SELECT proveedor_cuit AS cuil FROM pagos_gasoil WHERE valid = true AND comprobante = $1',                   socketEvent: 'deleteFactura' },
        ordenProveedorOtro:  { table: 'pagos_otro',   cuitQuery: 'SELECT proveedor_cuit AS cuil FROM pagos_otro WHERE valid = true AND comprobante = $1',                     socketEvent: 'deleteFactura' },
    };

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        // ── Eliminación masiva por nro_factura ───────────────────────────────
        // "id" es el id numérico de CUALQUIER fila de factura_arca de esa factura (el mismo
        // facturaId que ya tiene el frontend, venga de la vista de un solo viaje o de la vista
        // agrupada); se resuelve su nro_factura y se afecta a TODAS las filas que lo comparten,
        // por si hay duplicados de antes de que uploadFactura empezara a deduplicar por nro_factura.
        if (type === 'facturaCompleta') {
            if (!id || id === "null" || id === "undefined")
                return res.status(405).json({ message: "Se requiere el id de factura para esta operación" });

            const { rows: facturaRows } = await client.query(
                `SELECT id, cliente_cuit FROM factura_arca
                 WHERE valid = true AND nro_factura = (SELECT nro_factura FROM factura_arca WHERE id = $1)`,
                [id]
            );
            if (facturaRows.length === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: `No se encontró la factura con ID ${id}` });
            }
            const cliente_cuit = facturaRows[0].cliente_cuit;
            const facturasIds = facturaRows.map(r => r.id);

            const { rows: viajeRows } = await client.query(
                'SELECT viaje_comprobante FROM viaje_cliente WHERE valid = true AND factura_id = ANY($1)', [facturasIds]
            );
            const comprobantesAfectados = viajeRows.map(r => r.viaje_comprobante);

            await client.query('UPDATE viaje_cliente SET factura_id = NULL WHERE valid = true AND factura_id = ANY($1)', [facturasIds]);

            const { rows: [{ balance }] } = await client.query(
                'SELECT balance FROM cliente WHERE valid = true AND cuit = $1', [cliente_cuit]
            );
            await client.query('COMMIT');

            emitSocket(req.user.cuil, 'actualizarFacturaCliente', { cuit: cliente_cuit, balance, facturasEliminadas: facturasIds, comprobantesAfectados });

            return res.status(200).json({ message: "Factura eliminada con exito" });
        }

        // ── Eliminación de "otro archivo" asociado a un viaje ─────────────────
        if (type === 'archivoViaje') {
            if (!id || id === "null" || id === "undefined") {
                await client.query('ROLLBACK');
                return res.status(405).json({ message: "Se requiere el id del archivo para esta operación" });
            }

            // Un mismo archivo puede estar vinculado a varios viajes (p. ej. una nota de crédito
            // que afecta a más de un viaje), así que hay que avisar por todos, no solo por el
            // comprobante que tenga abierto quien está eliminando.
            const { rows: viajesAfectados } = await client.query(
                'SELECT viaje_comprobante, cliente_cuit, chofer_cuil FROM archivo_viaje WHERE valid = true AND archivo_id = $1',
                [id]
            );
            const comprobantesAfectados = viajesAfectados.map(v => v.viaje_comprobante);
            const cuitAfectado = viajesAfectados.find(v => v.cliente_cuit)?.cliente_cuit ?? null;
            const cuilAfectado = viajesAfectados.find(v => v.chofer_cuil)?.chofer_cuil ?? null;

            // El PDF vive una única vez en "archivo"; invalidarlo ahí alcanza para que deje de
            // aparecer en TODOS los viajes que lo comparten (archivo_viaje es solo el vínculo,
            // getArchivosViaje ya filtra por archivo.valid = true en el JOIN).
            await client.query('UPDATE archivo SET valid = false WHERE valid = true AND id = $1', [id]);
            await client.query('COMMIT');

            emitSocket(req.user.cuil, 'actualizarArchivoViaje', { cuit: cuitAfectado, cuil: cuilAfectado, comprobantes: comprobantesAfectados });
            return res.status(204).send();
        }

        // ── Eliminación individual ───────────────────────────────────────────
        const hasId = id && id !== "null" && id !== "undefined";
        const hasComprobante = comprobante && comprobante !== "null" && comprobante !== "undefined";

        if (!hasId && !hasComprobante) {
            await client.query('ROLLBACK');
            return res.status(405).json({ message: "No se obtuvieron los datos del documento solicitado" });
        }

        const cfg = CONFIG[type] ?? CONFIG.viajes;

        // Sin id → es carta de porte
        const query = hasId
            ? `UPDATE ${cfg.table} SET factura_id = NULL WHERE valid = true AND factura_id = $1 AND ${type === 'viajeCliente' ? 'viaje_comprobante' : 'comprobante'} = $2`
            : 'DELETE FROM carta_porte WHERE viaje_comprobante = $1';
        const params = hasId ? [id, comprobante] : [comprobante];

        await client.query(query, params);

        const { rows: cuitRows } = await client.query(cfg.cuitQuery, [comprobante]);
        const cuitData = cuitRows[0] ?? {};

        let balance;
        if (cuitData.cuit) {
            const { rows: [cliente] } = await client.query(
                'SELECT balance FROM cliente WHERE valid = true AND cuit = $1', [cuitData.cuit]
            );
            balance = cliente?.balance;
        }

        await client.query('COMMIT');

        const socketPayload = type === 'viajeCliente'
            ? (hasId ? { cuit: cuitData.cuit, balance } : { cuit: cuitData.cuit, comprobante })
            : { cuil: cuitData.cuil, facturaId: id, comprobante };
        const socketEvent = type === 'viajeCliente' && !hasId ? 'deleteCartaPorte' : cfg.socketEvent;

        emitSocket(req.user.cuil, socketEvent, socketPayload);

        return res.status(204).send();

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error en deleteFactura:', error.message, error.stack);
        return res.status(500).json({ error: `Error al eliminar el documento: ${error.message}` });
    } finally {
        client?.release();
    }
};

// Helper para no repetir el try/catch del socket en cada rama
function emitSocket(userCuil, event, payload) {
    try {
        const io = getIO();
        io.sockets.sockets.forEach(socket => {
            if (socket.cuil !== userCuil) socket.emit(event, payload);
        });
    } catch (err) {
        console.error(`Error al emitir socket '${event}':`, err.stack);
    }
}
