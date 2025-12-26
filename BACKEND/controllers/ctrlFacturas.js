const { generarFactura } = require('../Factura completo');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const pool = require('../db');
const { PDFDocument, rgb } = require('pdf-lib');
const { getIO } = require('../socket');

exports.generarFacturaCtrl = async (req, res) => {
    if (req.user.role === 'chofer') {
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

        const response = await client.query(`INSERT INTO factura_arca(cliente_cuit, factura_pdf) VALUES ($1, $2) RETURNING id`,
            [cuit, pdfBuffer]
        )

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
                    socket.emit('actualizarFacturaCliente', {cuit: cuit, balance: responseClient.rows[0].balance});
                }
            });
        } catch (error){
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
        if ((req.user.role === 'chofer' && req.user.cuil !== req.body.cuil) || (req.user.role === 'chofer' && req.user.type === 'viajeCliente')) {
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
        let query;
        let queryInsert;
        let queryUpdate;
        switch (type) {
            case 'viajeCliente':
                query = 'SELECT cliente_cuit AS chofer_cuil FROM viaje_cliente WHERE viaje_comprobante = $1';
                queryInsert = 'INSERT INTO factura_arca(cliente_cuit, factura_pdf) VALUES ($1, $2) RETURNING id';
                queryUpdate = 'UPDATE viaje_cliente SET factura_id = $1 WHERE valid = true AND viaje_comprobante = $2'
                break;
            case 'ordenProveedor':
                query = 'SELECT proveedor_cuit AS chofer_cuil FROM pagos_gasoil WHERE comprobante = $1';
                queryInsert = 'INSERT INTO factura(proveedor_cuit, factura_pdf) VALUES ($1, $2) RETURNING id';
                queryUpdate = 'UPDATE pagos_gasoil SET factura_id = $1 WHERE valid = true AND comprobante = $2';
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
            return res.status(405).json({ error: "El viaje al que desea cargar la factura no se encuentra registrado"});

        const cuil = responseCuil.rows[0].chofer_cuil;
        // Insertar factura en la base de datos

        const response = await client.query(
            queryInsert,
            [cuil, pdfBuffer]
        );

        if (response.rows.length === 0){
            await client.query('ROLLBACK');
            return res.status(405).json({message: "Ocurrio un error al intentar registrar la factura"});
        }

        // Obtener el factura_id insertado
        const facturaId = response.rows[0].id;
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


        if (viajesError.length === parsedViajeIds.length){
            await client.query('ROLLBACK');
            return res.status(405).json({message:`Los viajes seleccionados no se encuentran registrados`});
        }


        let message = "Factura subida con éxito.";
        if(viajesError.length > 0){
            message+= ` Los siguientes viajes no se encuentran registrados: ${viajesError.join(', ')}`;
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
                        socket.emit('nuevoFactura', {cuil: cuil, facturaId: facturaId, viajesIds: parsedViajeIds.filter(viaje => !viajesError.includes(viaje.id))});
                    else
                        socket.emit('actualizarFacturaCliente', {cuit: cuil, balance: responseClient.rows[0].balance});
                }
            });
        } catch (error){
            console.error("Error al sincronizar los datos en UploadFactura", error.stack);
        }

        // Enviar respuesta
        return res.status(200).json({ message , facturaId });
    } catch (error) {
        if (client)
            await client.query('ROLLBACK');
        console.error('Error en uploadFactura:', error.message, error.stack);
        return res.status(500).json({ error: `Error al subir la factura: ${error.message}` });
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
        const cartaPorteFiles= req.files?.cartaPorte || [];

        // Validar datos
        if (!viajeIds || !cartaPorteFiles) {
            return res.status(400).json({ error: 'Faltan viajeIds o archivo factura' });
        }

        // Iniciar transacción
        client = await pool.connect();
        await client.query('BEGIN');

        const responseCuil = await client.query('SELECT chofer_cuil AS cuil FROM viaje WHERE valid = true AND comprobante = $1',
            [viajeIds]
        )

        if (responseCuil.rowCount === 0){
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

            // Crear un nuevo documento PDF
            const pdfDoc = await PDFDocument.create();
            // Agregar cada archivo al PDF
            for (const file of cartaPorteFiles) {
                if (file.mimetype === 'application/pdf') {
                    // Si es un PDF, copiar sus páginas
                    const sourcePdf = await PDFDocument.load(file.buffer);
                    const copiedPages = await pdfDoc.copyPages(sourcePdf, sourcePdf.getPageIndices());
                    copiedPages.forEach(page => pdfDoc.addPage(page));
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

            // Generar el buffer del PDF combinado
            const combinedPdfBuffer = await pdfDoc.save();

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
                    socket.emit('nuevoCartaPorte', {cuil: responseCuil.rows[0].cuil, comprobante: viajeIds});
                }
            });
        } catch (error){
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

exports.descargarFactura = async (req, res) => {
    const { cuil, id, comprobante } = req.query;
    if (req.user.role === 'chofer' && req.user.cuil !== cuil) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    try{
        let query;
        let params = [];
        if (id && id !== "null" & id !== "undefined"){
            query = 'SELECT factura_pdf FROM factura WHERE valid = true AND id = $1 ';
            params.push(id);
        } else if (comprobante && comprobante !== "null" && comprobante !== "undefined") {
            query = 'SELECT carta_porte_pdf FROM carta_porte WHERE valid = true AND viaje_comprobante = $1'
            params.push(comprobante);
        } else {
            return res.status(405).json({ message: "No se obtuvieron los datos del documento solicitado"});
        }
        let response = await pool.query(query, params);

        if (response.rows.length === 0){
            if (req.user.role !== "chofer" && id && id !== "null" & id !== "undefined")
                response = await pool.query('SELECT factura_pdf FROM factura_arca WHERE valid = true AND id = $1', params);
            if (response.rows.length === 0)
                return res.status(406).json({ message: "No se encontro el documento solicitado para el viaje especificado"});
        }

        const { factura_pdf, carta_porte_pdf } = response.rows[0];

        // Configurar encabezados para visualizar el PDF en el navegador
        res.setHeader('Content-Type', 'application/pdf');
        // Para visualizar en el navegador, usa 'inline'; para descarga, usa 'attachment'
        res.setHeader('Content-Disposition', `inline; filename='facturaCliente'`);
        res.setHeader('Content-Length', factura_pdf? factura_pdf.length : carta_porte_pdf.length);
        
        // Send the PDF directly
        return res.status(200).send(factura_pdf? factura_pdf : carta_porte_pdf);
    } catch (error){
        console.error('Error en descargar en descargarFactura',error.message, error.stack);
        return res.status(500).json({ error: `Error al descargar el documento: ${error.message}` });
    }
}

exports.deleteFactura = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const { id, comprobante, type } = req.query;
    if (!type || type === "null" || type === "undefined")
        return res.status(405).json({message: "No se pudo reconocer los datos del viaje para el que desea eliminar documentación"});

    let client;
    try {
        let query;
        let queryCuil;
        let params = [];
        if (id && id !== "null" & id !== "undefined"){
            switch (type){
                case 'viajeCliente':
                    query = 'UPDATE viaje_cliente SET factura_id = NULL WHERE valid = true AND factura_id = $1 AND viaje_comprobante = $2';
                    queryCuil = 'SELECT cliente_cuit AS cuit FROM viaje_cliente WHERE valid = true AND viaje_comprobante = $1';
                    break;
                case 'ordenProveedor':
                    query = 'UPDATE pagos_gasoil SET factura_id = NULL WHERE valid = true AND factura_id = $1 AND comprobante = $2';
                    queryCuil = 'SELECT proveedor_cuit AS cuil FROM pagos_gasoil WHERE valid = true AND comprobante = $1';
                    break;
                default:
                    query = 'UPDATE viaje SET factura_id = NULL WHERE valid = true AND factura_id = $1 AND comprobante = $2';
                    queryCuil = 'SELECT chofer_cuil AS cuil, cliente_cuit AS cuit FROM viaje WHERE valid = true AND comprobante = $1'
            }
            params.push(id);
        } else if (comprobante && comprobante !== "null" && comprobante !== "undefined") {
            query = 'DELETE FROM carta_porte WHERE viaje_comprobante = $1'
        } else {
            return res.status(405).json({ message: "No se obtuvieron los datos del documento solicitado"});
        }

        params.push(comprobante);
        // Iniciar transacción
        client = await pool.connect();
        await client.query('BEGIN');
        
        await client.query(query, params);

        const responseCuil = await client.query(queryCuil,
            [comprobante]);
        
        let responseClient;
        if (responseCuil.rowCount > 0)
            responseClient = await client.query('SELECT balance FROM cliente WHERE valid = true AND cuit = $1', [responseCuil.rows[0].cuit]);

        await client.query('COMMIT');
        client.release();

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    if (type !== "viajeCliente")
                        socket.emit('deleteFactura', {cuil: responseCuil.rows[0].cuil, facturaId: id, comprobante: comprobante});
                    else
                        if (id && id !== "null" & id !== "undefined")
                            socket.emit('actualizarFacturaCliente', {cuit: responseCuil.rows[0].cuit, balance: responseClient.rows[0].balance});
                        else
                            socket.emit('deleteCartaPorte', {cuit: responseCuil.rows[0].cuit, comprobante: comprobante});
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en deleteFactura", error.stack);
        }

        return res.status(204).json({ message:`${id? "Factura": "Carta de porte"} eliminada con exito` });
        
    } catch (error){
        if (client) client.release();
        console.error('Error en deleteFactura ',error.message, error.stack);
        return res.status(500).json({ error: `Error al eliminar el documento: ${error.message}` });
    }
}