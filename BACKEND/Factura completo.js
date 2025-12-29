const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const fetch = require('node-fetch');
const axios = require('axios');
const xml2js = require('xml2js');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { Writable } = require('stream');

// Configuración para parsear XML
const parser = new xml2js.Parser({ explicitArray: false, trim: true });
const parseString = promisify(xml2js.parseString);

// Directorio de certificados y scripts
const certDir = path.join(__dirname, 'cert');

// Función para limpiar el contenido del XML
function limpiarXML(xmlContent) {
  let cleaned = xmlContent.replace(/^\uFEFF+|^[\s\x00-\x1F]+/, '');
  const xmlStartIndex = cleaned.indexOf('<?xml');
  if (xmlStartIndex > 0) {
    cleaned = cleaned.substring(xmlStartIndex);
  }
  return cleaned;
}

function formatDate(dateString) {
  const year = dateString.slice(0, 4);
  const month = dateString.slice(4, 6);
  const day = dateString.slice(6, 8);
  return `${day}/${month}/${year}`;
}

async function generarTA(servicioId) {
  const cuitRepresentada = '20433059221';
  const responseFileSuffix = `-loginTicketResponse_${servicioId}.xml`;
  const scriptName = servicioId === 'wsfe' ? 'scriptFactura.ps1' : 'scriptPadron.ps1';
  const files = fs.readdirSync(certDir).filter(f => f.endsWith(responseFileSuffix)).sort().reverse();
  const latestResponse = files[0];

  if (latestResponse && await esTAValido(latestResponse)) {
    let xmlContent = fs.readFileSync(path.join(certDir, latestResponse), 'utf8');
    xmlContent = limpiarXML(xmlContent);
    const parsed = await parseString(xmlContent, { explicitArray: false });
    const credentials = parsed.loginTicketResponse.credentials;
    console.log(`TA válido encontrado para ${servicioId}: ${latestResponse}`);
    return {
      token: credentials.token,
      sign: credentials.sign,
      cuitRepresentada
    };
  }

  if (latestResponse) {
    const prefix = latestResponse.replace(responseFileSuffix, '');
    const filesToDelete = [
      `${prefix}-LoginTicketRequest_${servicioId}.xml`,
      `${prefix}-LoginTicketRequest_${servicioId}.xml.cms-DER`,
      `${prefix}-LoginTicketRequest_${servicioId}.xml.cms-DER-b64`,
      latestResponse
    ];
    filesToDelete.forEach(file => {
      try {
        const filePath = path.join(certDir, file);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.warn(`Eliminado archivo vencido: ${file}`);
        }
      } catch (error) {
        console.warn(`No se pudo eliminar ${file}: ${error.message}`);
      }
    });
  }

  // CAMBIO PRINCIPAL: Ejecutar bash en lugar de PowerShell
  const scriptPath = path.join(certDir, scriptName);

  // Dar permisos de ejecución al script (por si acaso)
  try {
    execSync(`chmod +x ${scriptPath}`, { cwd: certDir });
  } catch (error) {
    console.warn(`No se pudieron establecer permisos: ${error.message}`);
  }

  // Ejecutar el script bash
  const command = `bash ${scriptPath}`;

  try {
    execSync(command, { stdio: 'inherit', cwd: certDir });
    const newFiles = fs.readdirSync(certDir).filter(f => f.endsWith(responseFileSuffix)).sort().reverse();
    const newResponse = newFiles[0];

    if (!newResponse) {
      throw new Error(`No se encontró el nuevo archivo de respuesta del WSAA para ${servicioId}`);
    }

    let xmlContent = fs.readFileSync(path.join(certDir, newResponse), 'utf8');
    xmlContent = limpiarXML(xmlContent);
    const parsed = await parseString(xmlContent, { explicitArray: false });
    const credentials = parsed.loginTicketResponse.credentials;

    if (!credentials || !credentials.token || !credentials.sign) {
      throw new Error(`No se encontraron token o sign en la respuesta del WSAA para ${servicioId}`);
    }

    console.log(`Nuevo TA generado para ${servicioId}: ${newResponse}`);
    return {
      token: credentials.token,
      sign: credentials.sign,
      cuitRepresentada
    };
  } catch (error) {
    throw new Error(`Error al generar TA para ${servicioId}: ${error.message}`);
  }
}

// También actualiza la función esTAValido para leer UTF-8 en lugar de UTF-16LE
async function esTAValido(responseFile) {
  try {
    let xmlContent = fs.readFileSync(path.join(certDir, responseFile), 'utf8');
    xmlContent = limpiarXML(xmlContent);
    const parsed = await parseString(xmlContent, { explicitArray: false });
    const expirationTime = new Date(parsed.loginTicketResponse.header.expirationTime);
    const now = new Date();
    return expirationTime > now;
  } catch (error) {
    console.warn(`Error al verificar TA en ${responseFile}: ${error.message}`);
    return false;
  }
}

async function getLastCbteNro(token, sign, cuit, ptoVta, cbteTipo) {
  const soapRequest = `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soap:Header>
      <ar:FEHeaderInfo>
        <ambiente>HomologacionExterno - efa</ambiente>
        <fecha>${new Date().toISOString().replace('Z', '-03:00')}</fecha>
        <id>6.1.0.0</id>
      </ar:FEHeaderInfo>
    </soap:Header>
    <soap:Body>
      <ar:FECompUltimoAutorizado>
        <ar:Auth>
          <ar:Token>${token}</ar:Token>
          <ar:Sign>${sign}</ar:Sign>
          <ar:Cuit>${cuit}</ar:Cuit>
        </ar:Auth>
        <ar:PtoVta>${ptoVta}</ar:PtoVta>
        <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
      </ar:FECompUltimoAutorizado>
    </soap:Body>
  </soap:Envelope>`;

  try {
    const response = await fetch('https://wswhomo.afip.gov.ar/wsfev1/service.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado'
      },
      body: soapRequest
    });

    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    const text = await response.text();
    const parsed = await parser.parseStringPromise(text);
    const cbteNro = parsed['soap:Envelope']['soap:Body']
      ?.FECompUltimoAutorizadoResponse?.FECompUltimoAutorizadoResult?.CbteNro;

    if (!cbteNro) throw new Error('No se pudo obtener CbteNro: ' + text);
    return parseInt(cbteNro) + 1;
  } catch (error) {
    console.error('Error en getLastCbteNro:', error.message);
    throw error;
  }
}

function generateFacturaAXML({ token, sign, cuit, ptoVta, cbteNro, docNro, servicios, tributos = [] }) {
  // Consolidar alícuotas de IVA
  const ivaMap = servicios.reduce((acc, servicio) => {
    const ivaId = servicio.ivaId;
    const baseImp = parseFloat(servicio.baseImp);
    const ivaRate = ivaId === 5 ? 0.21 : ivaId === 4 ? 0.105 : 0;
    const importe = parseFloat((baseImp * ivaRate).toFixed(2));
    if (!acc[ivaId]) acc[ivaId] = { baseImp: 0, importe: 0 };
    acc[ivaId].baseImp += baseImp;
    acc[ivaId].importe += importe;
    return acc;
  }, {});

  // Calcular importes
  const impNeto = parseFloat(servicios.reduce((sum, s) => sum + parseFloat(s.baseImp), 0).toFixed(2));
  const impIVA = parseFloat(Object.values(ivaMap).reduce((sum, iva) => sum + iva.importe, 0).toFixed(2));
  const impTrib = parseFloat(tributos.reduce((sum, t) => sum + parseFloat(t.importe), 0).toFixed(2));
  const impTotal = parseFloat((impNeto + impIVA + impTrib).toFixed(2));

  // Generar bloque IVA
  const ivaXML = Object.entries(ivaMap).map(([ivaId, { baseImp, importe }]) => `
              <ar:AlicIva>
                <ar:Id>${ivaId}</ar:Id>
                <ar:BaseImp>${baseImp.toFixed(2)}</ar:BaseImp>
                <ar:Importe>${importe.toFixed(2)}</ar:Importe>
              </ar:AlicIva>`).join('');

  // Generar bloque Tributos (si hay)
  const tributosXML = tributos.length > 0 ? `
            <ar:Tributos>
              ${tributos.map(t => `
              <ar:Tributo>
                <ar:Id>${t.id}</ar:Id>
                <ar:Desc>${t.desc}</ar:Desc>
                <ar:BaseImp>${parseFloat(t.baseImp).toFixed(2)}</ar:BaseImp>
                <ar:Alic>${parseFloat(t.alic).toFixed(2)}</ar:Alic>
                <ar:Importe>${parseFloat(t.importe).toFixed(2)}</ar:Importe>
              </ar:Tributo>`).join('')}
            </ar:Tributos>` : '';

  // Generar XML
  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soap:Header>
      <ar:FEHeaderInfo>
        <ambiente>HomologacionExterno - efa</ambiente>
        <fecha>${new Date().toISOString().replace('Z', '-03:00')}</fecha>
        <id>6.1.0.0</id>
      </ar:FEHeaderInfo>
    </soap:Header>
    <soap:Body>
      <ar:FECAESolicitar>
        <ar:Auth>
          <ar:Token>${token}</ar:Token>
          <ar:Sign>${sign}</ar:Sign>
          <ar:Cuit>${cuit}</ar:Cuit>
        </ar:Auth>
        <ar:FeCAEReq>
          <ar:FeCabReq>
            <ar:CantReg>1</ar:CantReg>
            <ar:PtoVta>${ptoVta}</ar:PtoVta>
            <ar:CbteTipo>1</ar:CbteTipo>
          </ar:FeCabReq>
          <ar:FeDetReq>
            <ar:FECAEDetRequest>
              <ar:Concepto>1</ar:Concepto>
              <ar:DocTipo>80</ar:DocTipo>
              <ar:DocNro>${docNro.replace(/-| /g, '')}</ar:DocNro>
              <ar:CbteDesde>${cbteNro}</ar:CbteDesde>
              <ar:CbteHasta>${cbteNro}</ar:CbteHasta>
              <ar:CbteFch>${new Date().toISOString().split('T')[0].replaceAll('-', '')}</ar:CbteFch>
              <ar:ImpTotal>${impTotal.toFixed(2)}</ar:ImpTotal>
              <ar:ImpTotConc>0</ar:ImpTotConc>
              <ar:ImpNeto>${impNeto.toFixed(2)}</ar:ImpNeto>
              <ar:ImpOpEx>0</ar:ImpOpEx>
              <ar:ImpTrib>${impTrib.toFixed(2)}</ar:ImpTrib>
              <ar:ImpIVA>${impIVA.toFixed(2)}</ar:ImpIVA>
              <ar:FchServDesde></ar:FchServDesde>
              <ar:FchServHasta></ar:FchServHasta>
              <ar:FchVtoPago></ar:FchVtoPago>
              <ar:MonId>PES</ar:MonId>
              <ar:MonCotiz>1</ar:MonCotiz>
              <ar:CondicionIVAReceptorId>1</ar:CondicionIVAReceptorId>
              ${tributosXML}
              <ar:Iva>${ivaXML}</ar:Iva>
            </ar:FECAEDetRequest>
          </ar:FeDetReq>
        </ar:FeCAEReq>
      </ar:FECAESolicitar>
    </soap:Body>
  </soap:Envelope>`;
}

async function emitirFacturaA({ ptoVta, docNro, servicios, tributos = [] }) {
  let text = null;
  try {
    // Obtener token, sign y cuit desde generarTA para wsfe
    const authWsfe = await generarTA('wsfe');
    const { token, sign, cuitRepresentada: cuit } = authWsfe;

    // Obtener el próximo CbteNro
    const cbteNro = await getLastCbteNro(token, sign, cuit, ptoVta, 1);

    // Generar XML
    const xml = generateFacturaAXML({ token, sign, cuit, ptoVta, cbteNro, docNro, servicios, tributos });
    console.log(xml);

    // Enviar solicitud SOAP
    const response = await fetch('https://wswhomo.afip.gov.ar/wsfev1/service.asmx', {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAESolicitar'
      },
      body: xml
    });
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    text = await response.text();

    // Parsear respuesta SOAP
    const parsed = await parser.parseStringPromise(text);
    const result = parsed['soap:Envelope']['soap:Body']
      ?.FECAESolicitarResponse?.FECAESolicitarResult;

    if (!result) throw new Error('No se encontró FECAESolicitarResult en la respuesta');
    console.log(result);
    const feDetResp = result.FeDetResp?.FECAEDetResponse;
    const cae = feDetResp?.CAE;
    const caeFchVto = feDetResp?.CAEFchVto;
    const errors = result.Errors;
    const observations = feDetResp?.Observaciones;

    return {
      cae,
      caeFchVto,
      cbteNro,
      errors: errors ? JSON.stringify(errors) : null,
      observations: observations ? JSON.stringify(observations) : null,
      response: text
    };
  } catch (error) {
    console.error('Error emitiendo factura:', error.message);
    return { error: error.message, response: text };
  }
}

async function consultarCUIT(cuit) {
  const serviceUrl = 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA5';
  try {
    const authPadron = await generarTA('ws_sr_constancia_inscripcion');
    const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soap-env:Envelope xmlns:soap-env="http://schemas.xmlsoap.org/soap/envelope/">
  <soap-env:Body>
    <ns0:getPersona_v2 xmlns:ns0="http://a5.soap.ws.server.puc.sr/">
      <token>${authPadron.token}</token>
      <sign>${authPadron.sign}</sign>
      <cuitRepresentada>${authPadron.cuitRepresentada}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </ns0:getPersona_v2>
  </soap-env:Body>
</soap-env:Envelope>`;

    console.log('XML enviado a ws_sr_padron_a5:', soapRequest);
    const response = await axios.post(serviceUrl, soapRequest, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://a5.soap.ws.server.puc.sr/getPersona_v2'
      }
    });

    const parsedResult = await parseString(response.data, { explicitArray: false });
    console.log('Respuesta SOAP de ws_sr_padron_a5:', JSON.stringify(parsedResult, null, 2));

    const persona = parsedResult['soap:Envelope']['soap:Body']['ns2:getPersona_v2Response']['personaReturn']['datosGenerales'];
    if (!persona || parsedResult['soap:Envelope']['soap:Body']['ns2:getPersona_v2Response']['personaReturn']['errorConstancia']) {
      const error = parsedResult['soap:Envelope']['soap:Body']['ns2:getPersona_v2Response']['personaReturn']['errorConstancia']?.error || 'CUIT no encontrado o inactivo';
      throw new Error(error);
    }

    const datosRegimenGeneral = parsedResult['soap:Envelope']['soap:Body']['ns2:getPersona_v2Response']['personaReturn']['datosRegimenGeneral'];
    let condicionIVA = 'No Informado';
    if (datosRegimenGeneral?.impuesto) {
      const impuesto = Array.isArray(datosRegimenGeneral.impuesto) ? datosRegimenGeneral.impuesto : [datosRegimenGeneral.impuesto];
      const ivaImpuesto = impuesto.find(i => i.idImpuesto === '30');
      condicionIVA = ivaImpuesto ? {
        'AC': 'IVA Responsable Inscripto',
        'EX': 'Exento',
        'NA': 'No Alcanzado',
        'XN': 'No Inscripto',
        'AN': 'No Responsable',
        'NI': 'No Informado'
      }[ivaImpuesto.estadoImpuesto] || 'No Informado' : 'No Informado';
    }

    return {
      cuitCliente: cuit,
      razonSocialCliente: persona.razonSocial || `${persona.apellido || ''} ${persona.nombre || ''}`.trim(),
      domicilioCliente: `${persona.domicilioFiscal?.direccion || ''} - ${persona.domicilioFiscal?.localidad || ''}, ${persona.domicilioFiscal?.descripcionProvincia || ''} (${persona.domicilioFiscal?.codPostal || ''})`.trim(),
      condicionIVACliente: condicionIVA
    };
  } catch (error) {
    throw new Error(`Error al consultar CUIT: ${error.message}`);
  }
}

async function generarEnlaceQR(datos, impTotal) {
  // Convertir fechaEmision de YYYYMMDD a YYYY-MM-DD
  const fechaISO = datos.fechaEmision;
  const [year, month, day] = [fechaISO.slice(0, 4), fechaISO.slice(4, 6), fechaISO.slice(6, 8)];
  const fechaFormatted = `${year}-${month}-${day}`;

  const qrData = {
    ver: 1,
    fecha: fechaFormatted,
    cuit: 20433059221,
    ptoVta: parseInt(datos.ptoVta, 10),
    tipoCmp: 1,
    nroCmp: parseInt(datos.cbteNro, 10),
    importe: parseFloat(impTotal),
    moneda: 'PES',
    ctz: 1,
    tipoCodAut: 'E',
    codAut: parseInt(datos.cae, 10)

  };
  const qrJson = JSON.stringify(qrData);
  const qrBase64 = Buffer.from(qrJson).toString('base64');
  const qrUrl = `https://www.afip.gob.ar/fe/qr/?p=${qrBase64}`;

  // Imprimir datos decodificados para facilitar la constatación
  console.log('Datos del QR (decodificados):');
  console.log(`  Versión: ${qrData.ver}`);
  console.log(`  Fecha: ${qrData.fecha}`);
  console.log(`  CUIT Emisor: ${qrData.cuit}`);
  console.log(`  Punto de Venta: ${qrData.ptoVta}`);
  console.log(`  Tipo de Comprobante: ${qrData.tipoCmp}`);
  console.log(`  Número de Comprobante: ${qrData.nroCmp}`);
  console.log(`  Importe: ${qrData.importe}`);
  console.log(`  Moneda: ${qrData.moneda}`);
  console.log(`  Cotización: ${qrData.ctz}`);
  console.log(`  Tipo de Código de Autorización: ${qrData.tipoCodAut}`);
  console.log(`  CAE: ${qrData.codAut}`);
  console.log('QR JSON:', qrJson);
  console.log('QR Base64:', qrBase64);
  console.log('QR URL:', qrUrl);

  // Generar enlace de constatación directa
  const constatacionUrl = `https://servicioscf.afip.gob.ar/publico/comprobantes/cae.aspx?cuit=${qrData.cuit}&cae=${qrData.codAut}&fchEmi=${fechaFormatted.replace(/-/g, '')}`;
  console.log('Enlace de constatación directa:', constatacionUrl);

  return { qrUrl, constatacionUrl };
}

async function generarFactura({ ptoVta, docNro, servicios, tributos = [], fechaEmision, periodoDesde, periodoHasta, fechaVtoPago, condicionVenta }) {
  const requiredFields = ['ptoVta', 'docNro', 'servicios', 'fechaEmision', 'periodoDesde', 'periodoHasta', 'fechaVtoPago', 'condicionVenta'];
  for (const field of requiredFields) {
    if (!arguments[0][field]) {
      throw new Error(`Falta el campo obligatorio: ${field}`);
    }
  }

  // Estandarizar servicios para emitirFacturaA y generarFactura
  const serviciosWsfe = servicios.map(s => ({
    baseImp: parseFloat(s.subtotal),
    ivaId: s.ivaId
  }));

  // Emitir factura para obtener cae, caeFchVto, cbteNro
  const facturaResult = await emitirFacturaA({ ptoVta, docNro, servicios: serviciosWsfe, tributos });
  if (facturaResult.error || !facturaResult.cae) {
    throw new Error(`Error al emitir factura: ${facturaResult.error || 'No se obtuvo CAE'}`);
  }

  // Consultar datos del cliente
  let clienteDatos;
  try {
    clienteDatos = await consultarCUIT(docNro);
  } catch (error) {
    console.error(error.message);
    throw new Error('No se pudieron obtener los datos del cliente desde AFIP');
  }

  // Calcular importes para el PDF
  const impNeto = servicios.reduce((sum, s) => sum + parseFloat(s.subtotal), 0).toFixed(2);
  const ivaMap = servicios.reduce((acc, s) => {
    const ivaId = s.ivaId;
    const baseImp = parseFloat(s.subtotal);
    const ivaRate = ivaId === 5 ? 0.21 : ivaId === 4 ? 0.105 : 0;
    const importe = parseFloat((baseImp * ivaRate).toFixed(2));
    if (!acc[ivaId]) acc[ivaId] = { baseImp: 0, importe: 0 };
    acc[ivaId].baseImp += baseImp;
    acc[ivaId].importe += importe;
    return acc;
  }, {});
  const impIVA = parseFloat(Object.values(ivaMap).reduce((sum, iva) => sum + iva.importe, 0).toFixed(2));
  const impTrib = parseFloat(tributos.reduce((sum, t) => sum + parseFloat(t.importe), 0).toFixed(2));
  const impTotal = parseFloat(parseFloat(impNeto) + impIVA + impTrib).toFixed(2);

  // Preparar datos para el PDF
  const datosFactura = {
    ptoVta,
    cbteNro: facturaResult.cbteNro,
    fechaEmision,
    periodoDesde,
    periodoHasta,
    fechaVtoPago,
    condicionVenta,
    cae: facturaResult.cae,
    caeFchVto: facturaResult.caeFchVto,
    cuitCliente: clienteDatos.cuitCliente,
    razonSocialCliente: clienteDatos.razonSocialCliente,
    domicilioCliente: clienteDatos.domicilioCliente,
    condicionIVACliente: clienteDatos.condicionIVACliente,
    servicios,
    tributos
  };

  // Generar PDF en un buffer
  const doc = new PDFDocument({ size: 'A4', margin: 0 });
  const chunks = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });
  doc.pipe(stream);

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const PADDING_X = 28.35;

  doc.font('Helvetica').fontSize(9);

  let currentY = PADDING_X;

  // ORIGINAL header
  doc.lineWidth(1.5);
  doc.rect(PADDING_X, currentY, PAGE_WIDTH - (2 * PADDING_X), 20).stroke();
  doc.font('Helvetica-Bold').fontSize(16).text('ORIGINAL', PADDING_X, currentY + 3, { align: 'center', width: PAGE_WIDTH - (2 * PADDING_X) });
  currentY += 21;

  // Box structure for company and invoice details
  const headerBoxWidth = (PAGE_WIDTH - (2 * PADDING_X)) / 2;
  const headerBoxStartY = currentY;
  const headerBoxMinHeight = 105;

  // Somoche S.A. Box
  doc.rect(PADDING_X, headerBoxStartY, headerBoxWidth, headerBoxMinHeight).stroke();
  doc.font('Helvetica-Bold').fontSize(20).text('SOMOCHE S.A.', PADDING_X, headerBoxStartY + 5, { align: 'center', width: headerBoxWidth });
  doc.font('Helvetica').fontSize(10);
  let somocheTextY = headerBoxStartY + 45;
  doc.font('Helvetica-Bold').text(`Razón Social: `, PADDING_X + 5, somocheTextY, { continued: true, width: headerBoxWidth - 10, align: 'left' }).font('Helvetica').text(`SOMOCHE S.A.`, { width: headerBoxWidth - 10 });
  somocheTextY += 12;
  doc.font('Helvetica-Bold').text(`Domicilio Comercial: `, PADDING_X + 5, somocheTextY, { continued: true, width: headerBoxWidth - 10, align: 'left' }).font('Helvetica').text(`541 2050 - Quequen, Buenos Aires`, { width: headerBoxWidth - 10 });
  somocheTextY += 12;
  doc.font('Helvetica-Bold').text(`Condición frente al IVA: `, PADDING_X + 5, somocheTextY, { continued: true, width: headerBoxWidth - 10, align: 'left' }).font('Helvetica').text(`IVA Responsable Inscripto`, { width: headerBoxWidth - 10 });

  // FACTURA Box
  doc.rect(PADDING_X + headerBoxWidth, headerBoxStartY, headerBoxWidth, headerBoxMinHeight).stroke();
  doc.font('Helvetica-Bold').fontSize(24).text('FACTURA', PADDING_X + headerBoxWidth, headerBoxStartY + 5, { align: 'center', width: headerBoxWidth });
  doc.font('Helvetica').fontSize(10);
  let facturaTextY = headerBoxStartY + 45;
  doc.font('Helvetica-Bold').text(`Punto de Venta: `, PADDING_X + headerBoxWidth + 5, facturaTextY, { continued: true, align: 'left' }).font('Helvetica').text(`${datosFactura.ptoVta.toString().padStart(5, '0')}    Comp. Nro: ${datosFactura.cbteNro.toString().padStart(8, '0')}`);
  facturaTextY += 12;
  doc.font('Helvetica-Bold').text(`Fecha de Emisión: `, PADDING_X + headerBoxWidth + 5, facturaTextY, { continued: true, align: 'left' }).font('Helvetica').text(formatDate(datosFactura.fechaEmision));
  facturaTextY += 12;
  doc.font('Helvetica-Bold').text(`CUIT: `, PADDING_X + headerBoxWidth + 5, facturaTextY, { continued: true, align: 'left' }).font('Helvetica').text(`30714965006`);
  facturaTextY += 12;
  doc.font('Helvetica-Bold').text(`Ingresos Brutos: `, PADDING_X + headerBoxWidth + 5, facturaTextY, { continued: true, align: 'left' }).font('Helvetica').text(`30714965006`);
  facturaTextY += 12;
  doc.font('Helvetica-Bold').text(`Fecha de Inicio de Actividades: `, PADDING_X + headerBoxWidth + 5, facturaTextY, { continued: true, align: 'left' }).font('Helvetica').text(`01/11/2015`);

  // Floating 'A COD. 01' Box
  const floatingBoxWidth = 75;
  const floatingBoxHeight = 44;
  const floatingBoxX = PADDING_X + (PAGE_WIDTH - (2 * PADDING_X) - floatingBoxWidth) / 2;
  doc.lineWidth(1.5);
  doc.rect(floatingBoxX, headerBoxStartY - 1, floatingBoxWidth, floatingBoxHeight).fill('white');
  doc.fillColor('black');
  doc.rect(floatingBoxX, headerBoxStartY - 1, floatingBoxWidth, floatingBoxHeight).stroke();
  doc.fillColor('black');
  doc.font('Helvetica-Bold').fontSize(36).text('A', floatingBoxX, headerBoxStartY + 2, { align: 'center', width: floatingBoxWidth });
  doc.fontSize(10).text('COD. 01', floatingBoxX, headerBoxStartY + 34, { align: 'center', width: floatingBoxWidth });

  currentY = headerBoxStartY + headerBoxMinHeight;

  // Periodo Facturado y Fecha Vto. Pago
  currentY += 1;
  const periodosHeight = 20;
  doc.rect(PADDING_X, currentY, PAGE_WIDTH - (2 * PADDING_X), periodosHeight).stroke();
  doc.font('Helvetica-Bold').fontSize(11).text(`Período Facturado Desde: `, PADDING_X + 5, currentY + 5, { continued: true }).font('Helvetica').text(`01${datosFactura.periodoDesde.slice(2)}  `, { continued: true });
  doc.font('Helvetica-Bold').text(`Hasta: `, { continued: true }).font('Helvetica').text(`${datosFactura.periodoHasta}  `, { continued: true });
  doc.font('Helvetica-Bold').text(`Fecha de Vto. para el pago: `, { continued: true }).font('Helvetica').text(`${datosFactura.fechaVtoPago}`);
  currentY += periodosHeight + 1;

  // Datos del Cliente
  const clientBoxHeight = 65;
  doc.rect(PADDING_X, currentY, PAGE_WIDTH - (2 * PADDING_X), clientBoxHeight).stroke();
  doc.font('Helvetica').fontSize(10);
  let clientTextY = currentY + 5;
  const clientBoxInnerWidth = PAGE_WIDTH - (2 * PADDING_X) - 10;

  const cuitSectionWidth = clientBoxInnerWidth * 0.3;
  const razonSocialSectionWidth = clientBoxInnerWidth * 0.7;

  doc.font('Helvetica-Bold').text(`CUIT: `, PADDING_X + 5, clientTextY, { continued: true });
  let currentTextX = doc.x;
  doc.font('Helvetica').text(`${datosFactura.cuitCliente}`, currentTextX, clientTextY, { width: cuitSectionWidth - (currentTextX - (PADDING_X + 5)), align: 'left' });

  const razonSocialLabelX = PADDING_X + 5 + cuitSectionWidth;
  doc.font('Helvetica-Bold').text(`Apellido y Nombre / Razón Social: `, razonSocialLabelX, clientTextY, { continued: true });
  currentTextX = doc.x;
  doc.font('Helvetica').text(`${datosFactura.razonSocialCliente}`, currentTextX, clientTextY, { width: razonSocialSectionWidth - (currentTextX - razonSocialLabelX), align: 'left' });

  clientTextY += 14;

  const condicionIvaSectionWidth = clientBoxInnerWidth * 0.7;
  const domicilioSectionWidth = clientBoxInnerWidth * 0.3;
  const domicilioLabelX = PADDING_X + 5 + condicionIvaSectionWidth - 30;

  doc.font('Helvetica-Bold').text(`Condición frente al IVA: `, PADDING_X + 5, clientTextY, { continued: true });
  currentTextX = doc.x;
  doc.font('Helvetica').text(`${datosFactura.condicionIVACliente}`, currentTextX, clientTextY, { width: condicionIvaSectionWidth - (currentTextX - (PADDING_X + 5)), align: 'left' });

  doc.font('Helvetica-Bold').text(`Domicilio: `, domicilioLabelX, clientTextY, { continued: true });
  currentTextX = doc.x;
  const formattedDomicilio = datosFactura.domicilioCliente.replace(/ - /, ' -\n');
  doc.font('Helvetica').text(formattedDomicilio, currentTextX, clientTextY, { width: domicilioSectionWidth - (currentTextX - domicilioLabelX), align: 'left' });

  clientTextY += 14;

  doc.font('Helvetica-Bold').text(`Condición de venta: `, PADDING_X + 5, clientTextY, { continued: true }).font('Helvetica').text(`${datosFactura.condicionVenta}`);
  clientTextY += 14;
  currentY += clientBoxHeight + 5;

  // Tabla de servicios con salto automático de página
  const tableHeaders = ['Código', 'Producto / Servicio', 'Cantidad', 'U. Medida', 'Precio Unit.', '% Bonif', 'Subtotal', 'Alícuota IVA', 'Subtotal c/IVA'];
  const tableColumnWidths = [40, 100, 50, 50, 55, 40, 60, 60, 80];
  const tableStartX = PADDING_X;
  const tableWidth = PAGE_WIDTH - (2 * PADDING_X);
  const headerRowHeight = 24;
  const dataRowHeight = 40;

  function drawTableHeader(y) {
    doc.lineWidth(1);
    doc.rect(tableStartX, y, tableWidth, headerRowHeight).fill('#ccc').stroke();
    doc.fillColor('black').font('Helvetica-Bold').fontSize(9);
    let currentColumnX = tableStartX;
    tableHeaders.forEach((header, i) => {
      doc.text(header, currentColumnX + 2, y + 5, { width: tableColumnWidths[i] - 4, align: 'center' });
      currentColumnX += tableColumnWidths[i];
    });
    doc.stroke();
    return y + headerRowHeight;
  }

  currentY = drawTableHeader(currentY);

  doc.font('Helvetica').fontSize(8);
  datosFactura.servicios.forEach((s, index) => {
    if (currentY + dataRowHeight > PAGE_HEIGHT - PADDING_X - 150) {
      doc.addPage({ margin: 0 });
      currentY = PADDING_X;
      currentY = drawTableHeader(currentY);
    }

    const ivaRateDisplay = s.ivaId === 5 ? '21%' : s.ivaId === 4 ? '10.5%' : '0%';
    const rowData = [
      s.codigo,
      s.descripcion,
      s.cantidad,
      s.unidad,
      s.precioUnit,
      s.bonif,
      s.subtotal,
      ivaRateDisplay,
      s.subtotalConIVA
    ];

    let currentColumnX = tableStartX;
    rowData.forEach((cellData, j) => {
      let align = 'center';
      if (j === 0 || j === 1) align = 'left';
      if (j >= 2 && j <= 8) align = 'right';
      doc.text(cellData, currentColumnX + 2, currentY + 5, { width: tableColumnWidths[j] - 4, align: align });
      currentColumnX += tableColumnWidths[j];
    });
    currentY += dataRowHeight;
  });

  currentY += 20;

  // Otros Tributos y Totales
  const footerSectionStartY = currentY;
  const footerBoxWidth = PAGE_WIDTH - (2 * PADDING_X);
  const tributosTableWidth = footerBoxWidth * 0.55;
  const totalesBoxWidth = footerBoxWidth * 0.40;
  const gapBetweenTributosAndTotales = footerBoxWidth - tributosTableWidth - totalesBoxWidth - 10;

  const tributosHeaderHeight = 25;
  const tributosRowHeight = 18;
  const minTributosRows = 4;
  const actualTributosRows = datosFactura.tributos.length > 0 ? datosFactura.tributos.length : minTributosRows;
  const tributosTableHeight = tributosHeaderHeight + (actualTributosRows * tributosRowHeight);

  const totalLines = Math.max(Object.keys(ivaMap).length, 6) + 2;
  const totalesHeight = totalLines * 16 + 20;
  const overallFooterBoxHeight = Math.max(tributosTableHeight + 20, totalesHeight + 20);
  doc.rect(PADDING_X, footerSectionStartY, footerBoxWidth, overallFooterBoxHeight).stroke();

  // Otros Tributos
  doc.font('Helvetica-Bold').fontSize(10).text('Otros tributos', PADDING_X + 5, footerSectionStartY + 5);
  let tributosCurrentY = footerSectionStartY + 20;

  const tributosColWidths = [tributosTableWidth * 0.45, tributosTableWidth * 0.25, tributosTableWidth * 0.15, tributosTableWidth * 0.15];
  const tributosHeaders = ['Descripción', 'Detalle', 'Alíc. %', 'Importe'];

  doc.rect(PADDING_X + 5, tributosCurrentY, tributosTableWidth - 1, tributosHeaderHeight).fill('#ccc').stroke();
  doc.fillColor('black').font('Helvetica-Bold').fontSize(10);
  let currentTributoColX = PADDING_X + 5;
  tributosHeaders.forEach((header, i) => {
    doc.text(header, currentTributoColX + 2, tributosCurrentY + 5, { width: tributosColWidths[i] - 4, align: i === 3 ? 'right' : 'left' });
    currentTributoColX += tributosColWidths[i];
  });
  tributosCurrentY += tributosHeaderHeight;

  doc.font('Helvetica').fontSize(9);
  const displayTributos = datosFactura.tributos.length > 0 ? datosFactura.tributos : [
    { desc: 'Per./Ret. de Impuesto a las Ganancias', detalle: '', alic: '', importe: '0,00' },
    { desc: 'Per./Ret. de IVA', detalle: '', alic: '', importe: '0,00' },
    { desc: 'Impuestos Internos', detalle: '', alic: '', importe: '0,00' },
    { desc: 'Impuestos Municipales', detalle: '', alic: '', importe: '0,00' }
  ];

  displayTributos.forEach((t) => {
    let currentTributoColX = PADDING_X + 5;
    const row = [t.desc, t.detalle, t.alic, t.importe];
    row.forEach((cell, j) => {
      doc.text(cell || '', currentTributoColX + 2, tributosCurrentY + 5, { width: tributosColWidths[j] - 4, align: j === 3 ? 'right' : 'left' });
      currentTributoColX += tributosColWidths[j];
    });
    tributosCurrentY += tributosRowHeight;
  });

  // Totales Box
  let totalesCurrentY = footerSectionStartY + 10;
  const totalesLabelWidth = totalesBoxWidth * 0.65;
  const totalesValueWidth = totalesBoxWidth * 0.35;
  const totalesBoxX = PADDING_X + tributosTableWidth + gapBetweenTributosAndTotales;

  doc.rect(totalesBoxX, footerSectionStartY + 5, totalesBoxWidth, totalesHeight).stroke();
  doc.font('Helvetica-Bold').fontSize(11);
  doc.text(`Importe Neto Gravado: $`, totalesBoxX + 5, totalesCurrentY, { align: 'right', width: totalesLabelWidth - 5 });
  doc.font('Helvetica').text(`${impNeto}`, totalesBoxX + totalesLabelWidth, totalesCurrentY, { align: 'right', width: totalesValueWidth - 10 });
  totalesCurrentY += 16;

  const ivaPercentagesOrder = ['27%', '21%', '10.5%', '5%', '2.5%', '0%'];
  const ivaIdToPercentage = {
    '5': '21%',
    '4': '10.5%',
    '3': '27%',
    '6': '5%',
    '8': '2.5%',
    '9': '0%'
  };

  const displayedIvaTypes = new Set();

  Object.entries(ivaMap).forEach(([ivaId, { importe }]) => {
    const percentage = ivaIdToPercentage[ivaId] || `${ivaId}%`;
    displayedIvaTypes.add(percentage);
    doc.font('Helvetica-Bold').text(`IVA ${percentage}: $`, totalesBoxX + 5, totalesCurrentY, { align: 'right', width: totalesLabelWidth });
    doc.font('Helvetica').text(`${importe.toFixed(2)}`, totalesBoxX + totalesLabelWidth, totalesCurrentY, { align: 'right', width: totalesValueWidth - 10 });
    totalesCurrentY += 16;
  });

  ivaPercentagesOrder.forEach(percentage => {
    if (!displayedIvaTypes.has(percentage)) {
      doc.font('Helvetica-Bold').text(`IVA ${percentage}: $`, totalesBoxX + 5, totalesCurrentY, { align: 'right', width: totalesLabelWidth });
      doc.font('Helvetica').text(`0,00`, totalesBoxX + totalesLabelWidth, totalesCurrentY, { align: 'right', width: totalesValueWidth - 10 });
      totalesCurrentY += 16;
    }
  });

  doc.font('Helvetica-Bold').text(`Importe Otros Tributos: $`, totalesBoxX + 5, totalesCurrentY, { align: 'right', width: totalesLabelWidth });
  doc.font('Helvetica').text(`${impTrib.toFixed(2)}`, totalesBoxX + totalesLabelWidth, totalesCurrentY, { align: 'right', width: totalesValueWidth - 10 });
  totalesCurrentY += 16;

  doc.font('Helvetica-Bold').text(`Importe Total: $`, totalesBoxX + 5, totalesCurrentY, { align: 'right', width: totalesLabelWidth });
  doc.font('Helvetica').text(`${impTotal}`, totalesBoxX + totalesLabelWidth, totalesCurrentY, { align: 'right', width: totalesValueWidth - 10 });
  totalesCurrentY += 16;

  currentY = footerSectionStartY + overallFooterBoxHeight + 3;

  // Bottom section (QR, AFIP text, CAE)
  const qrWidth = (PAGE_WIDTH - (2 * PADDING_X)) * 0.20;
  const afipInfoWidth = (PAGE_WIDTH - (2 * PADDING_X)) * 0.45;
  const caeInfoWidth = (PAGE_WIDTH - (2 * PADDING_X)) * 0.35;

  if (currentY + 100 > PAGE_HEIGHT - PADDING_X) {
    doc.addPage({ margin: 0 });
    currentY = PADDING_X;
  }

  const bottomSectionStartY = currentY;

  // caja de "tansportes"
  const transportesBoxWidth = (PAGE_WIDTH - (2 * PADDING_X));
  const transportesBoxX = PADDING_X;
  const transportesBoxY = bottomSectionStartY;
  const transportesText = '"Transportes"';
  doc.font('Helvetica-Bold').fontSize(11);
  const transportesTextHeight = doc.heightOfString(transportesText, { width: transportesBoxWidth, align: 'center' });
  const transportesBoxHeight = transportesTextHeight + 6// 6px padding arriba y abajo

  doc.rect(transportesBoxX, transportesBoxY, transportesBoxWidth, transportesBoxHeight).stroke();
  doc.text(transportesText, transportesBoxX, transportesBoxY + 6, {
    width: transportesBoxWidth,
    align: 'center'
  });



  // Generar e insertar el QR
  try {
    const { qrUrl, constatacionUrl } = await generarEnlaceQR(datosFactura, impTotal);
    console.log('QR generado para el PDF');
    const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 120, margin: 6, errorCorrectionLevel: 'M', scale: 8 });
    doc.image(qrBuffer, PADDING_X + 5, bottomSectionStartY + 25, { width: 120 });

  } catch (e) {
    console.warn('Error al generar el QR:', e.message || e);
  }


  // AFIP text (centrado)
  const afipInfoX = (PAGE_WIDTH - afipInfoWidth) / 2;
  doc.font('Helvetica-BoldOblique').fontSize(11).text('Comprobante Autorizado', afipInfoX, bottomSectionStartY + 65, { width: afipInfoWidth, align: 'left' });
  doc.font('Helvetica-Oblique').fontSize(8).text('Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación', afipInfoX, bottomSectionStartY + 80, { width: afipInfoWidth, align: 'left' });

  // CAE Info
  const caeInfoX = PADDING_X + qrWidth + afipInfoWidth - 40;
  doc.font('Helvetica-Bold').fontSize(10);
  let caeTextY = bottomSectionStartY + 35;
  const caeLabelOffsetX = 5;
  const caeValueOffsetX = 120;

  doc.text(`CAE N°:`, caeInfoX + caeLabelOffsetX, caeTextY,);
  doc.font('Helvetica').text(`${datosFactura.cae}`, caeInfoX + caeValueOffsetX, caeTextY, { width: 100 });
  caeTextY += 12;


  doc.font('Helvetica-Bold').text(`Fecha de Vto. de CAE:`, caeInfoX + caeLabelOffsetX, caeTextY);
  doc.font('Helvetica').text(formatDate(datosFactura.caeFchVto), caeInfoX + caeValueOffsetX, caeTextY, { width: 100 });

  // Page 1/1
  const pageCount = doc.bufferedPageRange().count;
  doc.font('Helvetica-Bold').fontSize(10).text(`Pág ${pageCount}/${pageCount}`, PADDING_X, PAGE_HEIGHT - PADDING_X - 10, { align: 'center', width: PAGE_WIDTH - (2 * PADDING_X) });

  doc.end();

  // Esperar a que el stream termine y devolver el buffer
  await new Promise((resolve) => stream.on('finish', resolve));
  const pdfBuffer = Buffer.concat(chunks);

  console.log(`✅ PDF generado en memoria, tamaño: ${pdfBuffer.length} bytes`);

  return { ...facturaResult, ...clienteDatos, pdfBuffer };
}

module.exports = { generarFactura, emitirFacturaA, consultarCUIT };
