const fetch = require('node-fetch');
const xml2js = require('xml2js');

const parser = new xml2js.Parser({ explicitArray: false, trim: true });

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
    throw new Error(`Error en getLastCbteNro: ${error.message}`);
  }
}

function generateFacturaAXML({ token, sign, cuit, ptoVta, cbteNro, docNro, servicios, tributos = [] }) {
  if (!servicios || !Array.isArray(servicios) || servicios.length === 0) {
    throw new Error('Se requiere al menos un servicio');
  }
  servicios.forEach((s, i) => {
    if (!s.baseImp || s.baseImp <= 0 || ![4, 5].includes(s.ivaId)) {
      throw new Error(`Servicio ${i + 1} inválido: baseImp debe ser positivo, ivaId debe ser 4 o 5`);
    }
  });
  tributos.forEach((t, i) => {
    if (!t.id || !t.desc || !t.baseImp || !t.alic || !t.importe || Math.abs(t.importe - (t.baseImp * t.alic / 100)) > 0.01) {
      throw new Error(`Tributo ${i + 1} inválido: todos los campos son requeridos y importe debe ser baseImp * alic / 100`);
    }
  });

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

  const impNeto = parseFloat(servicios.reduce((sum, s) => sum + parseFloat(s.baseImp), 0).toFixed(2));
  const impIVA = parseFloat(Object.values(ivaMap).reduce((sum, iva) => sum + iva.importe, 0).toFixed(2));
  const impTrib = parseFloat(tributos.reduce((sum, t) => sum + parseFloat(t.importe), 0).toFixed(2));
  const impTotal = parseFloat((impNeto + impIVA + impTrib).toFixed(2));

  const ivaXML = Object.entries(ivaMap).map(([ivaId, { baseImp, importe }]) => `
              <ar:AlicIva>
                <ar:Id>${ivaId}</ar:Id>
                <ar:BaseImp>${baseImp.toFixed(2)}</ar:BaseImp>
                <ar:Importe>${importe.toFixed(2)}</ar:Importe>
              </ar:AlicIva>`).join('');

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

async function emitirFacturaA(req, res) {
  const { token, sign, cuit, ptoVta, docNro, servicios, tributos = [] } = req.body;
  console.log('Datos recibidos:', { token: token?.slice(0, 20) + '...', sign: sign?.slice(0, 20) + '...', cuit, ptoVta, docNro, servicios, tributos });
  let text = null;
  try {
    // Validar entrada
    const missingFields = [];
    if (!token) missingFields.push('token');
    if (!sign) missingFields.push('sign');
    if (!cuit) missingFields.push('cuit');
    if (!ptoVta) missingFields.push('ptoVta');
    if (!docNro) missingFields.push('docNro');
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Faltan parámetros: ${missingFields.join(', ')}`
      });
    }

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

    res.json({
      success: true,
      cae,
      caeFchVto,
      cbteNro,
      errors: errors ? JSON.stringify(errors) : null,
      observations: observations ? JSON.stringify(observations) : null,
      response: text
    });
  } catch (error) {
    console.error('Error en emitirFacturaA:', error.message);
    res.status(500).json({ success: false, error: error.message, response: text });
  }
}

module.exports = { emitirFacturaA };