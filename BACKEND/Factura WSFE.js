const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { promisify } = require('util');
const fetch = require('node-fetch');
const xml2js = require('xml2js');

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

// Función para verificar si el TA es válido (no vencido)
async function esTAValido(responseFile) {
  try {
    let xmlContent = fs.readFileSync(path.join(certDir, responseFile), 'utf16le');
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

// Función para generar o leer el TA
async function generarTA() {
  const cuitRepresentada = '20433059221';
  const files = fs.readdirSync(certDir).filter(f => f.endsWith('-loginTicketResponse_wsfe.xml')).sort().reverse();
  const latestResponse = files[0];

  if (latestResponse && await esTAValido(latestResponse)) {
    let xmlContent = fs.readFileSync(path.join(certDir, latestResponse), 'utf16le');
    xmlContent = limpiarXML(xmlContent);
    const parsed = await parseString(xmlContent, { explicitArray: false });
    const credentials = parsed.loginTicketResponse.credentials;
    console.log(`TA válido encontrado: ${latestResponse}`);
    return {
      token: credentials.token,
      sign: credentials.sign,
      cuitRepresentada
    };
  }

  if (latestResponse) {
    const prefix = latestResponse.replace('-loginTicketResponse_wsfe.xml', '');
    const filesToDelete = [
      `${prefix}-LoginTicketRequest_wsfe.xml`,
      `${prefix}-LoginTicketRequest_wsfe.xml.cms-DER`,
      `${prefix}-LoginTicketRequest_wsfe.xml.cms-DER-b64`,
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

  const command = `powershell -File ${path.join(certDir, 'scriptFactura.ps1')}`;
  try {
    execSync(command, { stdio: 'inherit', cwd: certDir });
    const newFiles = fs.readdirSync(certDir).filter(f => f.endsWith('-loginTicketResponse_wsfe.xml')).sort().reverse();
    const newResponse = newFiles[0];
    if (!newResponse) {
      throw new Error('No se encontró el nuevo archivo de respuesta del WSAA');
    }
    let xmlContent = fs.readFileSync(path.join(certDir, newResponse), 'utf16le');
    xmlContent = limpiarXML(xmlContent);
    const parsed = await parseString(xmlContent, { explicitArray: false });
    const credentials = parsed.loginTicketResponse.credentials;
    if (!credentials || !credentials.token || !credentials.sign) {
      throw new Error('No se encontraron token o sign en la respuesta del WSAA');
    }
    console.log(`Nuevo TA generado: ${newResponse}`);
    return {
      token: credentials.token,
      sign: credentials.sign,
      cuitRepresentada
    };
  } catch (error) {
    throw new Error(`Error al generar TA: ${error.message}`);
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
              <ar:DocNro>${docNro}</ar:DocNro>
              <ar:CbteDesde>${cbteNro}</ar:CbteDesde>
              <ar:CbteHasta>${cbteNro}</ar:CbteHasta>
              <ar:CbteFch>20250721</ar:CbteFch>
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
    // Obtener token, sign y cuit desde generarTA
    const auth = await generarTA();
    const { token, sign, cuitRepresentada: cuit } = auth;

    // Obtener el próximo CbteNro
    const cbteNro = await getLastCbteNro(token, sign, cuit, ptoVta, 1);
    
    // Generar XML
    const xml = generateFacturaAXML({ token, sign, cuit, ptoVta, cbteNro, docNro, servicios, tributos });
    
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

// Ejemplo de procedimiento
const config = {
  ptoVta: 12,
  docNro: '20111111112',
  servicios: [
    { baseImp: 100, ivaId: 5 }, // $100 con 21% IVA
    { baseImp: 50, ivaId: 4 }, // $50 con 10.5% IVA
    { baseImp: 80, ivaId: 5 }  // $80 con 21%
  ],
  tributos: [
    { id: 99, desc: 'Impuesto Municipal Matanza', baseImp: 230, alic: 5.2, importe: 100.00 }
  ]
};

emitirFacturaA(config)
  .then(result => {
    console.log('Resultado:', {
      cae: result.cae,
      caeFchVto: result.caeFchVto,
      cbteNro: result.cbteNro,
      errors: result.errors,
      observations: result.observations
    });
    console.log('Respuesta completa:', result.response);
  })
  .catch(error => console.error('Error:', error));