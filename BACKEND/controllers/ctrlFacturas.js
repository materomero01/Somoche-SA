const { generarFactura } = require('../Factura completo');
const path = require('path');
const fs = require('fs');

const generarFacturaCtrl = async (req, res) => {
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
        if (cleanDocNro.length !== 11) {
            console.error('Invalid CUIT:', invoiceData.docNro);
            return res.status(400).json({ error: 'CUIT inválido: debe tener 11 dígitos' });
        }

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
        const outputPath = path.join(facturasDir, `factura_${cleanDocNro}_${invoiceData.fechaEmision}.pdf`);
        const result = await generarFactura(invoiceData, outputPath);

        if (result.error || !result.cae) {
            console.error('Factura generation failed:', result.error || 'No CAE', 'Response:', result.response);
            return res.status(500).json({ error: `Error al emitir factura: ${result.error || 'No se obtuvo CAE'}` });
        }

        // Return JSON response
        res.json({
            message: 'Factura generada exitosamente',
            pdfPath: outputPath,
            cae: result.cae,
            cuitCliente: result.cuitCliente,
            razonSocialCliente: result.razonSocialCliente
        });
    } catch (error) {
        console.error('Error in generarFacturaCtrl:', error.message, error.stack);
        res.status(500).json({ error: `Error al generar factura: ${error.message}` });
    }
};

module.exports = { generarFactura: generarFacturaCtrl };