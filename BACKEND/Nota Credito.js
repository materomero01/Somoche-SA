const fetch = require('node-fetch');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const { Writable } = require('stream');

// Reutilizamos TODO lo que ya está resuelto en Factura_completo.js:
// - generarTA: obtiene/renueva el TA (Ticket de Acceso) usando scriptFactura.sh,
//   el mismo mecanismo de certificados que ya usa la facturación.
// - getLastCbteNro: consulta el próximo número de comprobante en AFIP/ARCA.
// - consultarCUIT: padrón A13 (datos del receptor + condición de IVA aproximada).
// - afipHttpsAgent: agente https con el SECLEVEL bajado para el handshake con AFIP.
// - parser / formatDate / parseFechaAFIP: utilidades de parseo y fechas.
const {
  generarTA,
  getLastCbteNro,
  consultarCUIT,
  afipHttpsAgent,
  parser,
  formatDate,
  parseFechaAFIP,
  urlWsfe,
  soapAmbiente,
  cuitRepresentada
} = require('./Factura completo.js');

// Único punto de venta habilitado para tomar facturas como comprobante
// asociado, y también el que se usa para emitir las notas.
const PTO_VTA = 2;

// Tipos de comprobante AFIP relevantes
const CBTE_TIPO_FACTURA_A = 1;
const CBTE_TIPO_NOTA_DEBITO_A = 2;
const CBTE_TIPO_NOTA_CREDITO_A = 3;

// ---------------------------------------------------------------------------
// Helpers para armar los parámetros de generarNotaCredito/generarNotaDebito
// a partir de una fila de la tabla factura_arca.
// ---------------------------------------------------------------------------

/**
 * Parsea "00002-00001234" (columna nro_factura) al formato que pide cbteAsoc.
 * Como el único punto de venta es el 2, tipo siempre es Factura A (1) salvo
 * que se indique lo contrario.
 */
function cbteAsocDesdeNroFactura(nroFactura, tipo = CBTE_TIPO_FACTURA_A) {
  const [ptoVtaStr, nroStr] = String(nroFactura).split('-');
  if (!ptoVtaStr || !nroStr) {
    throw new Error(`nro_factura con formato inesperado: "${nroFactura}" (se espera "PPPPP-NNNNNNNN")`);
  }
  return { tipo, ptoVta: parseInt(ptoVtaStr, 10), nro: parseInt(nroStr, 10) };
}

/**
 * factura_arca (y el QR) sólo guardan el importe TOTAL, no el desglose de
 * neto/IVA por alícuota que exige el WS para armar el bloque <ar:Iva>.
 * Esta función reconstruye ese desglose asumiendo una única alícuota
 * (por defecto 21%, ivaId 5) y sin otros tributos — que es el caso de casi
 * todas las facturas de "Transportes".
 *
 * ⚠️ Válido sólo para notas por el importe TOTAL de una factura con una
 * única alícuota. Si la factura original tuvo varias alícuotas y/o
 * tributos, este cálculo no va a coincidir con el desglose real — en ese
 * caso hay que pasar `servicios`/`tributos` a mano en vez de usar este
 * helper.
 */
function serviciosDesdeImporteTotal(importeTotal, {
  ivaId = 5,
  descripcion = 'Ajuste sobre comprobante asociado',
  codigo = '01',
  // Si ya se conoce el imp_neto real de la factura original (p. ej. extraído de su propio
  // QR/CAE), se usa tal cual en vez de recalcularlo dividiendo el total por 1+alícuota — así
  // la nota reproduce el neto exacto de la factura en vez de arrastrar una diferencia de
  // redondeo de un centavo entre ambos caminos de cálculo.
  impNeto = null
} = {}) {
  const rate = ivaId === 5 ? 0.21 : ivaId === 4 ? 0.105 : 0;
  const total = parseFloat(importeTotal);
  const neto = impNeto != null ? parseFloat(parseFloat(impNeto).toFixed(2)) : parseFloat((total / (1 + rate)).toFixed(2));
  return [{
    codigo,
    descripcion,
    cantidad: 1,
    unidad: 'otras unidades',
    precioUnit: neto.toFixed(2),
    bonif: '0.00',
    subtotal: neto.toFixed(2),
    ivaId,
    subtotalConIVA: total.toFixed(2)
  }];
}

// ---------------------------------------------------------------------------
// Armado del XML / emisión — genérico para Nota de Crédito y Nota de Débito A
// ---------------------------------------------------------------------------

function generateNotaAjusteAXML({
  token, sign, cuit, ptoVta, cbteTipo, cbteNro, docNro,
  servicios, tributos = [], fechaEmision,
  periodoDesde, periodoHasta, fechaVtoPago,
  cbteAsoc
}) {
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

  if (!cbteAsoc || !cbteAsoc.tipo || !cbteAsoc.ptoVta || !cbteAsoc.nro) {
    throw new Error('cbteAsoc { tipo, ptoVta, nro } es obligatorio para emitir una Nota de Crédito/Débito');
  }
  const cbtesAsocXML = `
            <ar:CbtesAsoc>
              <ar:CbteAsoc>
                <ar:Tipo>${cbteAsoc.tipo}</ar:Tipo>
                <ar:PtoVta>${cbteAsoc.ptoVta}</ar:PtoVta>
                <ar:Nro>${cbteAsoc.nro}</ar:Nro>
              </ar:CbteAsoc>
            </ar:CbtesAsoc>`;

  return `<?xml version="1.0" encoding="utf-8"?>
  <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:ar="http://ar.gov.afip.dif.FEV1/">
    <soap:Header>
      <ar:FEHeaderInfo>
        <ambiente>${soapAmbiente()}</ambiente>
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
            <ar:CbteTipo>${cbteTipo}</ar:CbteTipo>
          </ar:FeCabReq>
          <ar:FeDetReq>
            <ar:FECAEDetRequest>
              <ar:Concepto>2</ar:Concepto>
              <ar:DocTipo>80</ar:DocTipo>
              <ar:DocNro>${docNro.replace(/-| /g, '')}</ar:DocNro>
              <ar:CbteDesde>${cbteNro}</ar:CbteDesde>
              <ar:CbteHasta>${cbteNro}</ar:CbteHasta>
              <ar:CbteFch>${fechaEmision}</ar:CbteFch>
              <ar:ImpTotal>${impTotal.toFixed(2)}</ar:ImpTotal>
              <ar:ImpTotConc>0</ar:ImpTotConc>
              <ar:ImpNeto>${impNeto.toFixed(2)}</ar:ImpNeto>
              <ar:ImpOpEx>0</ar:ImpOpEx>
              <ar:ImpTrib>${impTrib.toFixed(2)}</ar:ImpTrib>
              <ar:ImpIVA>${impIVA.toFixed(2)}</ar:ImpIVA>
              <ar:FchServDesde>${periodoDesde}</ar:FchServDesde>
              <ar:FchServHasta>${periodoHasta}</ar:FchServHasta>
              <ar:FchVtoPago>${fechaVtoPago}</ar:FchVtoPago>
              <ar:MonId>PES</ar:MonId>
              <ar:MonCotiz>1</ar:MonCotiz>
              ${cbtesAsocXML}
              ${tributosXML}
              <ar:Iva>${ivaXML}</ar:Iva>
              <ar:CondicionIVAReceptorId>1</ar:CondicionIVAReceptorId>
            </ar:FECAEDetRequest>
          </ar:FeDetReq>
        </ar:FeCAEReq>
      </ar:FECAESolicitar>
    </soap:Body>
  </soap:Envelope>`;
}

async function emitirNotaAjusteA({
  cbteTipo, ptoVta = PTO_VTA, docNro, servicios, tributos = [],
  fechaEmision, periodoDesde, periodoHasta, fechaVtoPago, cbteAsoc
}) {
  let text = null;
  try {
    const authWsfe = await generarTA('wsfe');
    const { token, sign, cuitRepresentada: cuit } = authWsfe;

    const cbteNro = await getLastCbteNro(token, sign, cuit, ptoVta, cbteTipo);

    const xml = generateNotaAjusteAXML({
      token, sign, cuit, ptoVta, cbteTipo, cbteNro, docNro, servicios, tributos,
      fechaEmision, periodoDesde, periodoHasta, fechaVtoPago, cbteAsoc
    });
    console.log(xml);

    const response = await fetch(urlWsfe(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://ar.gov.afip.dif.FEV1/FECAESolicitar'
      },
      body: xml,
      agent: afipHttpsAgent
    });
    if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

    text = await response.text();

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
      ptoVta,
      cbteTipo,
      errors: errors ? JSON.stringify(errors) : null,
      observations: observations ? JSON.stringify(observations) : null,
      response: text
    };
  } catch (error) {
    console.error('Error emitiendo nota:', error.message);
    return { error: error.message, response: text };
  }
}

async function generarEnlaceQRNota(datos, impTotal, cbteTipo) {
  const fechaISO = datos.fechaEmision;
  const [year, month, day] = [fechaISO.slice(0, 4), fechaISO.slice(4, 6), fechaISO.slice(6, 8)];
  const fechaFormatted = `${year}-${month}-${day}`;

  const qrData = {
    ver: 1,
    fecha: fechaFormatted,
    cuit: parseInt(cuitRepresentada(), 10),
    ptoVta: parseInt(datos.ptoVta, 10),
    tipoCmp: cbteTipo,
    nroCmp: parseInt(datos.cbteNro, 10),
    importe: parseFloat(impTotal),
    moneda: 'PES',
    ctz: 1,
    tipoDocRec: 80,
    nroDocRec: parseInt(datos.cuitCliente),
    tipoCodAut: 'E',
    codAut: parseInt(datos.cae, 10)
  };
  const qrJson = JSON.stringify(qrData);
  const qrBase64 = Buffer.from(qrJson).toString('base64');
  const qrUrl = `https://www.arca.gob.ar/fe/qr/?p=${qrBase64}`;
  const constatacionUrl = `https://servicioscf.afip.gob.ar/publico/comprobantes/cae.aspx?cuit=${qrData.cuit}&cae=${qrData.codAut}&fchEmi=${fechaFormatted.replace(/-/g, '')}`;

  return { qrUrl, constatacionUrl };
}

// ---------------------------------------------------------------------------
// PDF — compartido entre Nota de Crédito y Nota de Débito, sólo cambia el
// título y el código de comprobante que se muestran.
// ---------------------------------------------------------------------------

async function renderNotaPDF(datosNota, notaResult, { titulo, codDoc, ivaMap, impNeto, impIVA, impTrib, impTotal, cbteTipo }) {
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

  doc.lineWidth(1.5);
  doc.rect(PADDING_X, currentY, PAGE_WIDTH - (2 * PADDING_X), 20).stroke();
  doc.font('Helvetica-Bold').fontSize(16).text('ORIGINAL', PADDING_X, currentY + 3, { align: 'center', width: PAGE_WIDTH - (2 * PADDING_X) });
  currentY += 21;

  const headerBoxWidth = (PAGE_WIDTH - (2 * PADDING_X)) / 2;
  const headerBoxStartY = currentY;
  const headerBoxMinHeight = 105;

  doc.rect(PADDING_X, headerBoxStartY, headerBoxWidth, headerBoxMinHeight).stroke();
  doc.font('Helvetica-Bold').fontSize(15).text('SOMOCHE S.A.', PADDING_X, headerBoxStartY + 5, { align: 'center', width: headerBoxWidth });
  doc.font('Helvetica').fontSize(10);
  let somocheTextY = headerBoxStartY + 45;
  doc.font('Helvetica-Bold').text(`Razón Social: `, PADDING_X + 5, somocheTextY, { continued: true, width: headerBoxWidth - 10, align: 'left' }).font('Helvetica').text(`SOMOCHE S.A.`, { width: headerBoxWidth - 10 });
  somocheTextY += 12;
  doc.font('Helvetica-Bold').text(`Domicilio Comercial: `, PADDING_X + 5, somocheTextY, { continued: true, width: headerBoxWidth - 10, align: 'left' }).font('Helvetica').text(`541 2050 - Quequen, Buenos Aires`, { width: headerBoxWidth - 10 });
  somocheTextY += 12;
  doc.font('Helvetica-Bold').text(`Condición frente al IVA: `, PADDING_X + 5, somocheTextY, { continued: true, width: headerBoxWidth - 10, align: 'left' }).font('Helvetica-Bold').text(`IVA Responsable Inscripto`, { width: headerBoxWidth - 10 });

  doc.rect(PADDING_X + headerBoxWidth, headerBoxStartY, headerBoxWidth, headerBoxMinHeight).stroke();
  doc.font('Helvetica-Bold').fontSize(18).text(titulo, PADDING_X + headerBoxWidth, headerBoxStartY + 5, { align: 'center', width: headerBoxWidth });
  doc.font('Helvetica').fontSize(10);
  let ncTextY = headerBoxStartY + 45;
  doc.font('Helvetica-Bold').text(`Punto de Venta: `, PADDING_X + headerBoxWidth + 5, ncTextY, { continued: true, align: 'left' }).font('Helvetica-Bold').text(`${datosNota.ptoVta.toString().padStart(5, '0')}    Comp. Nro: ${datosNota.cbteNro.toString().padStart(8, '0')}`);
  ncTextY += 12;
  doc.font('Helvetica-Bold').text(`Fecha de Emisión: `, PADDING_X + headerBoxWidth + 5, ncTextY, { continued: true, align: 'left' }).font('Helvetica-Bold').text(formatDate(datosNota.fechaEmision));
  ncTextY += 12;
  doc.font('Helvetica-Bold').text(`CUIT: `, PADDING_X + headerBoxWidth + 5, ncTextY, { continued: true, align: 'left' }).font('Helvetica').text(`30714965006`);
  ncTextY += 12;
  doc.font('Helvetica-Bold').text(`Ingresos Brutos: `, PADDING_X + headerBoxWidth + 5, ncTextY, { continued: true, align: 'left' }).font('Helvetica').text(`30714965006`);
  ncTextY += 12;
  doc.font('Helvetica-Bold').text(`Fecha de Inicio de Actividades: `, PADDING_X + headerBoxWidth + 5, ncTextY, { continued: true, align: 'left' }).font('Helvetica').text(`01/11/2015`);

  const floatingBoxWidth = 75;
  const floatingBoxHeight = 44;
  const floatingBoxX = PADDING_X + (PAGE_WIDTH - (2 * PADDING_X) - floatingBoxWidth) / 2;
  doc.lineWidth(1.5);
  doc.rect(floatingBoxX, headerBoxStartY - 1, floatingBoxWidth, floatingBoxHeight).fill('white');
  doc.fillColor('black');
  doc.rect(floatingBoxX, headerBoxStartY - 1, floatingBoxWidth, floatingBoxHeight).stroke();
  doc.fillColor('black');
  doc.font('Helvetica-Bold').fontSize(36).text('A', floatingBoxX, headerBoxStartY + 2, { align: 'center', width: floatingBoxWidth });
  doc.fontSize(10).text(`COD. ${codDoc}`, floatingBoxX, headerBoxStartY + 34, { align: 'center', width: floatingBoxWidth });

  currentY = headerBoxStartY + headerBoxMinHeight;

  currentY += 1;
  const periodosHeight = 20;
  doc.rect(PADDING_X, currentY, PAGE_WIDTH - (2 * PADDING_X), periodosHeight).stroke();
  doc.font('Helvetica-Bold').fontSize(11).text(`Período Facturado Desde: `, PADDING_X + 5, currentY + 5, { continued: true }).font('Helvetica').text(`${formatDate(datosNota.periodoDesde)}  `, { continued: true });
  doc.font('Helvetica-Bold').text(`Hasta: `, { continued: true }).font('Helvetica').text(`${formatDate(datosNota.periodoHasta)}  `, { continued: true });
  doc.font('Helvetica-Bold').text(`Fecha de Vto. para el pago: `, { continued: true }).font('Helvetica').text(formatDate(datosNota.fechaVtoPago));
  currentY += periodosHeight + 1;

  doc.font('Helvetica').fontSize(9);
  const clientBoxInnerWidth = PAGE_WIDTH - (2 * PADDING_X) - 10;
  const leftColWidth = 230;
  const rightColX = PADDING_X + 5 + leftColWidth;
  const rightColWidth = clientBoxInnerWidth - leftColWidth;

  doc.font('Helvetica-Bold').fontSize(9);
  const razonSocialLabel = 'Apellido y Nombre / Razón Social: ';
  const razonSocialLabelWidth = doc.widthOfString(razonSocialLabel);
  const availWidthRazonSocial = rightColWidth - razonSocialLabelWidth - 5;

  doc.font('Helvetica').fontSize(9);
  const razonSocialHeight = doc.heightOfString(datosNota.razonSocialCliente, {
    width: availWidthRazonSocial,
    align: 'left'
  });
  const row1Height = Math.max(14, razonSocialHeight + 2);
  const clientBoxHeight = row1Height + 14 + 14 + 10;

  doc.rect(PADDING_X, currentY, PAGE_WIDTH - (2 * PADDING_X), clientBoxHeight).stroke();

  let clientTextY = currentY + 5;

  doc.font('Helvetica-Bold').fontSize(9).text(`CUIT: `, PADDING_X + 5, clientTextY, { continued: true });
  doc.font('Helvetica').text(`${datosNota.cuitCliente}`, { width: leftColWidth - 30 });

  doc.font('Helvetica-Bold').text(razonSocialLabel, rightColX, clientTextY, { continued: true });
  doc.font('Helvetica').text(`${datosNota.razonSocialCliente}`, { width: availWidthRazonSocial, align: 'left' });

  clientTextY += row1Height;

  doc.font('Helvetica-Bold').text(`Condición frente al IVA: `, PADDING_X + 5, clientTextY, { continued: true, width: leftColWidth - 10 });
  doc.font('Helvetica').text(`${datosNota.condicionIVACliente}`);

  const domicilioLabel = 'Domicilio Comercial: ';
  doc.font('Helvetica-Bold').text(domicilioLabel, rightColX, clientTextY, { continued: true });
  const domicilioLabelWidth = doc.widthOfString(domicilioLabel);
  doc.font('Helvetica').text(`${datosNota.domicilioCliente}`, {
    width: rightColWidth - domicilioLabelWidth - 5,
    align: 'left'
  });

  clientTextY += 14;

  doc.font('Helvetica-Bold').text(`Condición de venta: `, PADDING_X + 5, clientTextY, { continued: true })
    .font('Helvetica').text(`${datosNota.condicionVenta}`);

  // El comprobante asociado se muestra junto a la condición de venta, como "Fac. A: PPPPP-NNNNNNNN"
  // (igual que en una factura real), en vez de un cuadro aparte.
  const cbteAsoc = datosNota.cbteAsoc;
  const cbteAsocLetra = { 1: 'A', 6: 'B', 11: 'C' }[cbteAsoc.tipo] || cbteAsoc.tipo;
  doc.font('Helvetica-Bold').text(`Fac. ${cbteAsocLetra}: `, rightColX, clientTextY, { continued: true });
  doc.font('Helvetica').text(`${String(cbteAsoc.ptoVta).padStart(5, '0')}-${String(cbteAsoc.nro).padStart(8, '0')}`);

  currentY += clientBoxHeight + 5;

  const tableHeaders = ['Código', 'Producto / Servicio', 'Cantidad', 'U. Medida', 'Precio Unit.', '% Bonif', 'Subtotal', 'Alícuota IVA', 'Subtotal c/IVA'];
  const tableColumnWidths = [40, 160, 40, 45, 55, 35, 55, 40, 70];
  const tableStartX = PADDING_X;
  const tableWidth = PAGE_WIDTH - (2 * PADDING_X);
  const headerRowHeight = 24;
  const dataRowHeight = 40;

  function drawTableHeader(y) {
    doc.lineWidth(1);
    doc.rect(tableStartX, y, tableWidth, headerRowHeight).fill('#ccc').stroke();
    doc.fillColor('black').font('Helvetica-Bold').fontSize(8);
    let currentColumnX = tableStartX;
    tableHeaders.forEach((header, i) => {
      doc.text(header, currentColumnX + 2, y + 5, { width: tableColumnWidths[i] - 4, align: `${i === 1 ? 'left' : 'center'}` });
      currentColumnX += tableColumnWidths[i];
    });
    doc.stroke();
    return y + headerRowHeight;
  }

  currentY = drawTableHeader(currentY);

  doc.font('Helvetica').fontSize(8);
  datosNota.servicios.forEach((s) => {
    if (currentY + dataRowHeight > PAGE_HEIGHT - PADDING_X - 150) {
      doc.addPage({ margin: 0 });
      currentY = PADDING_X;
      currentY = drawTableHeader(currentY);
    }

    const ivaRateDisplay = s.ivaId === 5 ? '21%' : s.ivaId === 4 ? '10.5%' : '0%';
    const rowData = [s.codigo, s.descripcion, s.cantidad, s.unidad, s.precioUnit, s.bonif, s.subtotal, ivaRateDisplay, s.subtotalConIVA];

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

  const footerSectionStartY = currentY;
  const footerBoxWidth = PAGE_WIDTH - (2 * PADDING_X);
  const tributosTableWidth = footerBoxWidth * 0.55;
  const totalesBoxWidth = footerBoxWidth * 0.40;
  const gapBetweenTributosAndTotales = footerBoxWidth - tributosTableWidth - totalesBoxWidth - 10;

  const tributosHeaderHeight = 25;
  const tributosRowHeight = 18;
  const minTributosRows = 4;
  const actualTributosRows = datosNota.tributos.length > 0 ? datosNota.tributos.length : minTributosRows;
  const tributosTableHeight = tributosHeaderHeight + (actualTributosRows * tributosRowHeight);

  const totalLines = Math.max(Object.keys(ivaMap).length, 6) + 2;
  const totalesHeight = totalLines * 16 + 20;
  const overallFooterBoxHeight = Math.max(tributosTableHeight + 20, totalesHeight + 20);
  doc.rect(PADDING_X, footerSectionStartY, footerBoxWidth, overallFooterBoxHeight).stroke();

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
  const displayTributos = datosNota.tributos.length > 0 ? datosNota.tributos : [
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
  const ivaIdToPercentage = { '5': '21%', '4': '10.5%', '3': '27%', '6': '5%', '8': '2.5%', '9': '0%' };

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

  const qrWidth = (PAGE_WIDTH - (2 * PADDING_X)) * 0.20;
  const afipInfoWidth = (PAGE_WIDTH - (2 * PADDING_X)) * 0.45;

  if (currentY + 100 > PAGE_HEIGHT - PADDING_X) {
    doc.addPage({ margin: 0 });
    currentY = PADDING_X;
  }

  const bottomSectionStartY = currentY;

  const transportesBoxWidth = (PAGE_WIDTH - (2 * PADDING_X));
  const transportesBoxX = PADDING_X;
  const transportesBoxY = bottomSectionStartY;
  const transportesText = '"Transportes"';
  doc.font('Helvetica-Bold').fontSize(11);
  const transportesTextHeight = doc.heightOfString(transportesText, { width: transportesBoxWidth, align: 'center' });
  const transportesBoxHeight = transportesTextHeight + 6;

  doc.rect(transportesBoxX, transportesBoxY, transportesBoxWidth, transportesBoxHeight).stroke();
  doc.text(transportesText, transportesBoxX, transportesBoxY + 6, { width: transportesBoxWidth, align: 'center' });

  try {
    const { qrUrl } = await generarEnlaceQRNota(datosNota, impTotal, cbteTipo);
    console.log(`QR generado para el PDF de ${titulo}`);
    const qrBuffer = await QRCode.toBuffer(qrUrl, { width: 300, margin: 4, errorCorrectionLevel: 'M' });
    doc.image(qrBuffer, PADDING_X + 5, bottomSectionStartY + 25, { width: 120 });
  } catch (e) {
    console.warn('Error al generar el QR:', e.message || e);
  }

  const afipInfoX = (PAGE_WIDTH - afipInfoWidth) / 2;
  doc.font('Helvetica-BoldOblique').fontSize(11).text('Comprobante Autorizado', afipInfoX, bottomSectionStartY + 65, { width: afipInfoWidth, align: 'left' });
  doc.font('Helvetica-Oblique').fontSize(8).text('Esta Agencia no se responsabiliza por los datos ingresados en el detalle de la operación', afipInfoX, bottomSectionStartY + 80, { width: afipInfoWidth, align: 'left' });

  const caeInfoX = PADDING_X + qrWidth + afipInfoWidth - 40;
  doc.font('Helvetica-Bold').fontSize(10);
  let caeTextY = bottomSectionStartY + 35;
  const caeLabelOffsetX = 5;
  const caeValueOffsetX = 120;

  doc.text(`CAE N°:`, caeInfoX + caeLabelOffsetX, caeTextY);
  doc.font('Helvetica').text(`${datosNota.cae}`, caeInfoX + caeValueOffsetX, caeTextY, { width: 100 });
  caeTextY += 12;

  doc.font('Helvetica-Bold').text(`Fecha de Vto. de CAE:`, caeInfoX + caeLabelOffsetX, caeTextY);
  doc.font('Helvetica').text(formatDate(datosNota.caeFchVto), caeInfoX + caeValueOffsetX, caeTextY, { width: 100 });

  const pageCount = doc.bufferedPageRange().count;
  doc.font('Helvetica-Bold').fontSize(10).text(`Pág ${pageCount}/${pageCount}`, PADDING_X, PAGE_HEIGHT - PADDING_X - 10, { align: 'center', width: PAGE_WIDTH - (2 * PADDING_X) });

  doc.end();

  await new Promise((resolve) => stream.on('finish', resolve));
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// Función núcleo — genera y emite tanto Nota de Crédito como Nota de Débito
// ---------------------------------------------------------------------------

async function generarNotaAjuste({
  cbteTipo, titulo, codDoc,
  ptoVta = PTO_VTA, docNro, servicios, tributos = [],
  fechaEmision, periodoDesde, periodoHasta, fechaVtoPago,
  condicionVenta, cbteAsoc
}) {
  const requiredFields = ['docNro', 'servicios', 'fechaEmision', 'periodoDesde', 'periodoHasta', 'fechaVtoPago', 'condicionVenta', 'cbteAsoc'];
  for (const field of requiredFields) {
    if (!arguments[0][field]) {
      throw new Error(`Falta el campo obligatorio: ${field}`);
    }
  }
  if (!cbteAsoc.tipo || !cbteAsoc.ptoVta || !cbteAsoc.nro) {
    throw new Error('cbteAsoc debe incluir { tipo, ptoVta, nro } del comprobante que se ajusta');
  }

  const serviciosWsfe = servicios.map(s => ({
    baseImp: parseFloat(s.subtotal),
    ivaId: s.ivaId
  }));

  let clienteDatos;
  try {
    clienteDatos = await consultarCUIT(docNro);
  } catch (error) {
    console.error(error.message);
    throw new Error('No se pudieron obtener los datos del cliente desde AFIP');
  }

  const notaResult = await emitirNotaAjusteA({
    cbteTipo, ptoVta, docNro, servicios: serviciosWsfe, tributos,
    fechaEmision, periodoDesde, periodoHasta, fechaVtoPago, cbteAsoc
  });
  if (notaResult.error || !notaResult.cae) {
    throw new Error(`Error al emitir ${titulo.toLowerCase()}: ${notaResult.error || 'No se obtuvo CAE'}`);
  }

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

  const datosNota = {
    ptoVta: notaResult.ptoVta,
    cbteNro: notaResult.cbteNro,
    fechaEmision,
    periodoDesde,
    periodoHasta,
    fechaVtoPago,
    condicionVenta,
    cae: notaResult.cae,
    caeFchVto: notaResult.caeFchVto,
    cuitCliente: clienteDatos.cuitCliente,
    razonSocialCliente: clienteDatos.razonSocialCliente,
    domicilioCliente: clienteDatos.domicilioCliente,
    condicionIVACliente: clienteDatos.condicionIVACliente,
    servicios,
    tributos,
    cbteAsoc
  };

  const pdfBuffer = await renderNotaPDF(datosNota, notaResult, {
    titulo, codDoc, ivaMap, impNeto, impIVA, impTrib, impTotal, cbteTipo
  });

  console.log(`✅ PDF de ${titulo} generado en memoria, tamaño: ${pdfBuffer.length} bytes`);

  return {
    ...notaResult,
    ...clienteDatos,
    pdfBuffer,
    metadatosQR: {
      fechaVtoPago: parseFechaAFIP(datosNota.fechaVtoPago),
      nroFactura: `${String(datosNota.ptoVta).padStart(5, '0')}-${String(datosNota.cbteNro).padStart(8, '0')}`,
      importeTotal: parseFloat(impTotal),
      cae: notaResult.cae
    }
  };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

function generarNotaCredito(params) {
  return generarNotaAjuste({ ...params, cbteTipo: CBTE_TIPO_NOTA_CREDITO_A, titulo: 'NOTA DE CRÉDITO', codDoc: '03' });
}

function generarNotaDebito(params) {
  return generarNotaAjuste({ ...params, cbteTipo: CBTE_TIPO_NOTA_DEBITO_A, titulo: 'NOTA DE DÉBITO', codDoc: '02' });
}

module.exports = {
  generarNotaCredito,
  generarNotaDebito,
  cbteAsocDesdeNroFactura,
  serviciosDesdeImporteTotal,
  PTO_VTA
};