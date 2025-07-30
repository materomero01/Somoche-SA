const { generarFactura } = require('../Factura completo');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const pool = require('../db');

exports.generarFacturaCtrl = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    let client;
    try {
        const invoiceData = req.body;
        console.log('Received invoice data:', JSON.stringify(invoiceData, null, 2));

        // Validate required fields
        const requiredFields = ['ptoVta', 'docNro', 'servicios', 'fechaEmision', 'periodoDesde', 'periodoHasta', 'fechaVtoPago', 'condicionVenta'];
        const missingFields = requiredFields.filter(field => !invoiceData[field] || (typeof invoiceData[field] === 'string' && invoiceData[field].trim() === ''));
        if (missingFields.length > 0) {
            console.error('Missing required fields:', missingFields);
            return res.status(400).json({ error: `Faltan campos obligatorios: ${missingFields.join(', ')}` });
        }

        // Validate docNro (CUIT)
        const cleanDocNro = invoiceData.docNro.replace(/[^0-9]/g, '');
        console.log
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

        const response = await client.query(`INSERT INTO factura(cuil, factura_pdf, fecha_subida) VALUES ($1, $2, $3) RETURNING id`,
            [cuit, pdfBuffer, new Date()]
        )

        // Obtener el factura_id insertado
        const facturaId = response.rows[0].id;

        // Actualizar la tabla viaje con el factura_id para cada comprobante
        for (const c of invoiceData.comprobante) {
            await client.query(
                'UPDATE viaje SET factura_id = $1 WHERE comprobante = $2',
                [facturaId, c.id]
            );
        }

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
        if (req.user.role !== 'admin' && req.user.cuil !== req.body.cuil) {
            return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
        }

        // Obtener datos del FormData
        const { viajeIds, cuil } = req.body;
        const facturaFile = req.files?.factura;

        // Validar datos
        if (!viajeIds || !facturaFile || !cuil) {
            return res.status(400).json({ error: 'Faltan viajeIds, archivo factura o cuil' });
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

        // Convertir archivo a buffer
        const pdfBuffer = facturaFile[0].buffer;

        // Validar el buffer
        if (!pdfBuffer || pdfBuffer.length === 0) {
            return res.status(400).json({ error: 'El buffer del archivo está vacío o inválido' });
        }

        // Iniciar transacción
        client = await pool.connect();
        await client.query('BEGIN');

        // Insertar factura en la base de datos
        const response = await client.query(
            'INSERT INTO factura(cuil, factura_pdf, fecha_subida) VALUES ($1, $2, $3) RETURNING id',
            [cuil, pdfBuffer, new Date()]
        );

        // Obtener el factura_id insertado
        const facturaId = response.rows[0].id;

        // Actualizar la tabla viaje con el factura_id
        for (const id of parsedViajeIds) {
            const viajeResponse = await client.query(
                'UPDATE viaje SET factura_id = $1 WHERE comprobante = $2',
                [facturaId, id]
            );
        }

        // Confirmar transacción
        await client.query('COMMIT');

        // Enviar respuesta
        return res.status(200).json({ message: 'Factura subida con éxito', facturaId });
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
            client.release();
        }
        console.error('Error en uploadFactura:', error.message, error.stack);
        return res.status(500).json({ error: `Error al subir la factura: ${error.message}` });
    } finally {
        if (client) client.release();
    }
}

exports.descargarFactura = async (req, res) => {
    const { cuil, id } = req.query;
    if (req.user.role !== 'admin' && req.user.cuil !== cuil) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    try{
        // const response = await pool.query('SELECT factura_pdf FROM factura WHERE id = $1 AND cuil = $2',
        //     [id, cuil]
        // );

        const response = await pool.query('SELECT factura_pdf FROM factura WHERE id = $1',
            [id]
        );

        if (response.rows.length === 0){
            return res.status(406).json({ message: "No se encontro la factura para el viaje especificado"});
        }

        const { factura_pdf } = response.rows[0];

        // Configurar encabezados para visualizar el PDF en el navegador
        res.setHeader('Content-Type', 'application/pdf');
        // Para visualizar en el navegador, usa 'inline'; para descarga, usa 'attachment'
        res.setHeader('Content-Disposition', `inline; filename='facturaCliente'`);
        res.setHeader('Content-Length', factura_pdf.length);
        
        // Send the PDF directly
        return res.status(200).send(factura_pdf);
    } catch (error){

    }
}