import { getResumenCuil, showConfirmModal } from './apiPublic.js';
import { renderTabla } from './tabla.js';
import { viajesFactura } from './subir-factura.js';

let pagosResumenes = [];
let viajesResumenes = [];

let choferData = {};

let descargarFactura = null;

let currentResumenesPage = 1;

// Configuración de columnas para la tabla de viajes
export const columnasViajes = [
    { label: "Fecha", key: "fecha" },
    { label: "Comprobante", key: "comprobante" },
    { label: "Campo", key: "campo" },
    { label: "KM", key: "km" },
    { label: "Tarifa", key: "tarifa" },
    { label: "Variación", key: "variacion" },
    { label: "Toneladas", key: "toneladas" },
    { label: "Cargado", key: "cargado" },
    { label: "Descargado", key: "descargado" },
    { label: "Diferencia", key: "diferencia" },
    { label: "Importe", key: "importe", class: "text-right" },
    { label: "Comisión", key: "comision", class: "text-right" },
    { label: "IVA", key: "iva", class: "text-right" },
];

// Configuración de columnas para la tabla de pagos
export const columnasPagos = [
    { label: "Fecha de Pago", key: "fechaPago" },
    { label: "Tipo", key: "tipo" },
    { label: "Descripción", key: "descripcion" },
    { label: "Importe", key: "importe", class: "text-right" }
];

// Función para formatear fechas ISO a YYYY-MM-DD
export function formatFecha(fecha) {
    return new Date(fecha).toISOString().split('T')[0];
}

export function actualizarValores(resumenViajes, resumenPagos){
    // Calcular totales
    const subtotal = resumenViajes.viajes.reduce((sum, viaje) => sum + (viaje.importe || 0), 0);
    const iva = resumenViajes.viajes.reduce((sum, viaje) => sum + (viaje.iva || 0), 0);
    const totalViajes = subtotal + iva;
    let totalPagos;
    let totalResumen;
    if (resumenPagos) {
        totalPagos = resumenPagos.pagos.reduce((sum, pago) => sum + (pago.importe || 0), 0);
        totalResumen = totalViajes - totalPagos;
        if (Math.abs(totalResumen) < 0.01) totalResumen = 0;
    }

    // Actualizar contenedores de totales
    const subtotalContainer = document.getElementById("subtotal-resumen");
    if (subtotalContainer) {
        subtotalContainer.textContent = `Subtotal: $${subtotal.toFixed(2)}`;
    }
    const ivaContainer = document.getElementById("iva-resumen");
    if (ivaContainer) {
        ivaContainer.textContent = `IVA (21%): $${iva.toFixed(2)}`;
    }
    const totalViajesContainer = document.getElementById("total-viajes-resumen");
    if (totalViajesContainer) {
        totalViajesContainer.textContent = `Total Viajes: $${totalViajes.toFixed(2)}`;
    }
    const totalResumenContainer = document.getElementById("total-resumen");
    if (totalResumenContainer) {
        totalResumenContainer.textContent = `Saldo del Resumen: ${totalResumen >= 0 ? '$' : '-$'}${Math.abs(totalResumen).toFixed(2)}`;
    }
}

// Función para calcular valores derivados en los viajes
function calcularValoresViaje(viaje) {
    viaje.diferencia = parseFloat((viaje.descargado - viaje.cargado).toFixed(2));
    viaje.importe = (parseImporte(viaje.tarifa) - (parseImporte(viaje.tarifa) * viaje.variacion)) * viaje.toneladas;
    viaje.comision = viaje.importe * 0.1;
    viaje.iva = (viaje.importe - viaje.comision) * 0.21;
    return viaje;
}

// Función para parsear el importe (remueve '$' y comas)
export function parseImporte(importe) {
    if (typeof importe === 'string') {
        return parseFloat(importe.replace(/[$,]/g, '')) || 0;
    }
    return parseFloat(importe) || 0;
}

export function parseViaje(viaje) {
    const processed = { ...viaje };
    calcularValoresViaje(processed);
    let retornar = {
        id: processed.comprobante,
        fecha: formatFecha(processed.fecha),
        comprobante: processed.comprobante,
        campo: processed.campo,
        km: processed.kilometros,
        tarifa: parseImporte(processed.tarifa),
        variacion: processed.variacion,
        toneladas: processed.toneladas,
        cargado: processed.cargado,
        descargado: processed.descargado,
        diferencia: processed.diferencia,
        importe: processed.importe,
        comision: processed.comision,
        factura_id: processed.factura_id
    };
    if (choferData.trabajador !== "Monotributista") {
        retornar = {
            ...retornar,
            iva: processed.iva
        };
    }
    return retornar;
}

export function parsePagos(pago){
    let descripcion;
    switch (pago.tipo) {
        case "Cheque":
            const fechaCheque = formatFecha(pago.fecha_cheque);
            descripcion = `Cobro: ${fechaCheque} / nro ${pago.id} ${pago.tercero}`;
            break;
        case "Gasoil":
            const precio = parseImporte(pago.importe) / pago.litros;
            descripcion = `${pago.litros}L a $${precio.toFixed(2)} c/L`;
            break;
        case "Otro":
            descripcion = pago.descripcion? pago.descripcion : pago.detalle;
            break;
        default:
            descripcion = "Sin descripción";
    }
    return {
        id: pago.id,
        fechaPago: formatFecha(pago.fecha_pago),
        tipo: pago.tipo,
        descripcion: descripcion,
        importe: parseImporte(pago.importe)
    };
}

export async function setHistorial(chofer, descargar) {
    choferData = chofer;
    descargarFactura = descargar;
    const cantidad = document.getElementById("selectResumenes").value;
    if (!cantidad) {
        showConfirmModal("Seleccione una cantidad de resúmenes válida.");
        return;
    }

    try {
        const response = await getResumenCuil(choferData.cuil, parseInt(cantidad));
        const data = await response.json();
        // Organizar resúmenes por grupo
        pagosResumenes = data.pagos.map(resumen => ({
            group: resumen.group,
            pagos: resumen.pagos.map(p => parsePagos(p))
        }));

        console.log(pagosResumenes);
        viajesResumenes = data.viajes.map(resumen => ({
            group: resumen.group,
            viajes: resumen.viajes.map(v => parseViaje(v))
        }));
        console.log(viajesResumenes);
        renderTablasResumenes();
    } catch (error) {
        showConfirmModal(`Ocurrió un error al obtener los últimos ${cantidad} resúmenes`);
        console.error('Error en setHistorial:', error.message);
    }
}

export function handleFacturaActualization(facturaId){
    if (viajesResumenes && viajesResumenes.length > 0 && facturaId){
        viajesResumenes[currentResumenesPage - 1].viajes.forEach(r => {
            if (viajesFactura.includes(r.id))
                r.factura_id = facturaId;
        });
        renderTablasResumenes(currentResumenesPage);
    }
}

// Función para renderizar las tablas de resúmenes
function renderTablasResumenes(currentPage = 1) {
    // Obtener todos los grupos únicos, ordenados de más reciente a más antiguo
    const grupos = [...new Set([
        ...viajesResumenes.map(v => v.group),
        ...pagosResumenes.map(p => p.group)
    ])].sort().reverse();

    // Seleccionar el grupo actual según la página (1-based index)
    const grupoActual = grupos[Math.min(currentPage - 1, grupos.length - 1)];
    currentResumenesPage = currentPage;

    // Filtrar viajes y pagos para el grupo actual
    const resumenViajes = viajesResumenes.find(r => r.group === grupoActual) || { viajes: [] };
    const resumenPagos = pagosResumenes.find(r => r.group === grupoActual) || { pagos: [] };

    // Renderizar tabla de viajes
    let columnasViajesResumen = choferData.trabajador !== 'Monotributista'
        ? columnasViajes
        : columnasViajes.filter(col => col.key !== "iva");

    renderTabla({
        containerId: "viajes-table-resumenes",
        columnas: columnasViajesResumen,
        datos: resumenViajes.viajes.map(v => ({
            id: v.id,
            fecha: v.fecha,
            comprobante: v.comprobante,
            campo: v.campo,
            km: v.km,
            tarifa: `$${parseFloat(v.tarifa).toFixed(2)}`,
            variacion: `${(v.variacion * 100).toFixed(2)}%`,
            toneladas: v.toneladas,
            cargado: v.cargado,
            descargado: v.descargado,
            diferencia: v.diferencia,
            importe: `$${v.importe.toFixed(2)}`,
            comision: `$${v.comision.toFixed(2)}`,
            iva: v.iva ? `$${v.iva.toFixed(2)}` : undefined,
            factura_id: v.factura_id
        })),
        itemsPorPagina: resumenViajes.viajes.length || 1, // Mostrar todos los viajes del grupo
        currentPage: currentPage,
        actions: [], // Sin acciones de edición
        tableType: "viajes",
        checkboxColumn: true,
        checkboxColumnPosition: "end",
        useScrollable: true,
        descargarFactura: descargarFactura,
        changeDataFactura: handleFacturaActualization,
        onCheckboxChange: (itemId, itemChecked) => { 
            if (itemChecked)
                viajesFactura.push(itemId); 
            else
                viajesFactura.pop(itemId);
        }
    });

    // Renderizar tabla de pagos
    renderTabla({
        containerId: "pagos-table-resumenes",
        columnas: columnasPagos,
        datos: resumenPagos.pagos.map(p => ({
            id: p.id,
            fechaPago: p.fechaPago,
            tipo: p.tipo,
            descripcion: p.descripcion,
            importe: `$${p.importe.toFixed(2)}`.replace("$-","-$")
        })),
        itemsPorPagina: resumenPagos.pagos.length || 1, // Mostrar todos los pagos del grupo
        currentPage: currentPage,
        actions: [], // Sin acciones
        tableType: "pagos",
        useScrollable: true
    });

    actualizarValores(resumenViajes, resumenPagos);

    // Renderizar paginación
    renderPaginacionResumenes(currentPage, grupos.length > 0? grupos.length : 1);
}

// Función para renderizar la paginación de resúmenes
function renderPaginacionResumenes(currentPage, totalPaginas) {
    const paginacionContainer = document.getElementById("paginacion-resumenes");
    if (!paginacionContainer) {
        console.error("Contenedor de paginación 'paginacion-resumenes' no encontrado.");
        return;
    }

    paginacionContainer.innerHTML = "";

    const btnPrev = document.createElement("button");
    btnPrev.textContent = "<";
    btnPrev.classList.add("pagination-button");
    btnPrev.disabled = currentPage === 1;
    btnPrev.onclick = () => renderTablasResumenes(currentPage - 1);
    paginacionContainer.appendChild(btnPrev);

    const maxButtonsToShow = 5;
    let startPageNum, endPageNum;

    if (totalPaginas <= maxButtonsToShow) {
        startPageNum = 1;
        endPageNum = totalPaginas;
    } else {
        if (currentPage <= Math.ceil(maxButtonsToShow / 2)) {
            startPageNum = 1;
            endPageNum = maxButtonsToShow;
        } else if (currentPage + Math.floor(maxButtonsToShow / 2) >= totalPaginas) {
            startPageNum = totalPaginas - maxButtonsToShow + 1;
            endPageNum = totalPaginas;
        } else {
            startPageNum = currentPage - Math.floor(maxButtonsToShow / 2);
            endPageNum = currentPage + Math.floor(maxButtonsToShow / 2);
        }
    }

    if (startPageNum > 1) {
        paginacionContainer.appendChild(botonPaginaResumen(1, currentPage));
        if (startPageNum > 2) {
            const ellipsis = document.createElement("span");
            ellipsis.textContent = "...";
            ellipsis.classList.add("pagination-ellipsis");
            paginacionContainer.appendChild(ellipsis);
        }
    }

    for (let i = startPageNum; i <= endPageNum; i++) {
        paginacionContainer.appendChild(botonPaginaResumen(i, currentPage));
    }

    if (endPageNum < totalPaginas) {
        if (endPageNum < totalPaginas - 1) {
            const ellipsis = document.createElement("span");
            ellipsis.textContent = "...";
            ellipsis.classList.add("pagination-ellipsis");
            paginacionContainer.appendChild(ellipsis);
        }
        paginacionContainer.appendChild(botonPaginaResumen(totalPaginas, currentPage));
    }

    const btnNext = document.createElement("button");
    btnNext.textContent = ">";
    btnNext.classList.add("pagination-button");
    btnNext.disabled = currentPage === totalPaginas;
    btnNext.onclick = () => renderTablasResumenes(currentPage + 1);
    paginacionContainer.appendChild(btnNext);
}

function botonPaginaResumen(n, currentPage) {
    const btn = document.createElement("button");
    btn.textContent = n;
    btn.classList.add("pagination-button");
    if (n === currentPage) {
        btn.classList.add("active");
    }
    btn.onclick = () => renderTablasResumenes(n);
    return btn;
}