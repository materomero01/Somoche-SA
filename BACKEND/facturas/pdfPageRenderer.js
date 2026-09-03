/**
 * pdfPageRenderer.js
 * ==================
 * Renderiza cada página de un PDF como imagen (PNG) usando pdfjs-dist + @napi-rs/canvas,
 * igual que factura_arca_qr para leer el QR. A diferencia de pdf-lib (que solo puede copiar
 * páginas de PDFs sin ningún tipo de seguridad aplicada), pdfjs-dist sabe abrir y renderizar
 * PDFs con encriptación estándar de usuario vacío (el caso típico de "PDF protegido pero que
 * abre sin pedir contraseña"), así que sirve para combinar ese tipo de archivos sin perder
 * el contenido.
 */

import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

pdfjsLib.GlobalWorkerOptions.workerSrc = "pdfjs-dist/legacy/build/pdf.worker.mjs";

/**
 * @param {Buffer|Uint8Array} pdfBytes
 * @param {number} [scale=2] Resolución de renderizado respecto al tamaño real de la página.
 * @returns {Promise<{buffer: Buffer, width: number, height: number}[]>} Una imagen PNG por página,
 *   con el ancho/alto en puntos PDF (tamaño real de página, no en píxeles) para poder ubicarla en
 *   una página nueva con las proporciones correctas.
 */
export async function renderPdfPagesToImages(pdfBytes, scale = 2) {
  const data = new Uint8Array(pdfBytes);
  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl: "node_modules/pdfjs-dist/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "node_modules/pdfjs-dist/standard_fonts/"
  });

  const pdf = await loadingTask.promise;
  const paginas = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewportBase = page.getViewport({ scale: 1 });
    const viewportRender = page.getViewport({ scale });

    const canvas = createCanvas(viewportRender.width, viewportRender.height);
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport: viewportRender }).promise;

    paginas.push({
      buffer: canvas.toBuffer("image/png"),
      width: viewportBase.width,
      height: viewportBase.height
    });
  }

  return paginas;
}
