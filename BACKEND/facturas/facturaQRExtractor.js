/**
 * factura_arca_qr.mjs
 * ====================
 * Extrae los metadatos de una factura ARCA usando pdfjs-dist + @napi-rs/canvas
 * (100% Node.js, sin binarios externos)
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import { readFileSync } from "fs";

// ←←← IMPORTANTE: Configuración del worker (una sola vez)
pdfjsLib.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";

// ---------------------------------------------------------------------------
// Función principal
// ---------------------------------------------------------------------------

/**
 * @param {Buffer|Uint8Array} pdfBytes
 * @param {number} [scale=3]
 * @returns {Promise<FacturaQR>}
 */
export async function extraerMetadatos(pdfBytes, scale = 3) {
  // ←←← FIX DEL ERROR: convertir Buffer → Uint8Array
  const data = new Uint8Array(pdfBytes);

  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: "node_modules/pdfjs-dist/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/"
  });

  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const context = canvas.getContext("2d");

  await page.render({ canvasContext: context, viewport }).promise;

  // Convertir canvas a PNG y leer QR
  const pngBuffer = canvas.toBuffer("image/png");
  const png = PNG.sync.read(pngBuffer);

  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);

  if (!code) {
    throw new Error("No se encontró un QR válido en el PDF.");
  }

  const url = code.data;
  if (!url.includes("arca.gob.ar/fe/qr/")) {
    throw new Error(`El QR encontrado no corresponde a ARCA: ${url}`);
  }

  const b64 = url.split("?p=")[1];
  const qr = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));

  return buildFacturaQR(qr);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFacturaQR(qr) {
  const ptoVta = parseInt(qr.ptoVta);
  const nroCmp = parseInt(qr.nroCmp);
  const fechaEmision = new Date(qr.fecha + "T00:00:00");
  const fechaVtoPago = new Date(fechaEmision);
  fechaVtoPago.setMonth(fechaVtoPago.getMonth() + 1);
  return {
    fechaVtoPago: fechaVtoPago,
    nroFactura: `${String(ptoVta).padStart(5, "0")}-${String(nroCmp).padStart(8, "0")}`,
    importeTotal: qr.importe,
    cae: String(qr.codAut),
  };
}