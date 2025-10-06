import { getResumenCuil, showConfirmModal } from './apiPublic.js';
import { renderTabla } from './tabla.js';
import { viajesFactura, viaje, initializeFacturaUpload } from './subir-factura.js';

let pagosResumenes = [];
export let viajesResumenes = [];

let choferData = {};

export let currentResumenesPage = 1;

let saldosResumenes = [];

let cartaPorteFunc;
let deleteFactura;

const accionesViajes = [
    {
        icon: "bi bi-download",
        tooltip:"Descargar archivos",
        classList: ['navigate-btn'],
        id: null,
        handler: (item) => {
            viaje.push(item); // Establece el viaje actual
            initializeFacturaUpload(
                handleFacturaActualization,
                cartaPorteFunc? (cartaPorteFiles) => cartaPorteFunc(cartaPorteFiles, changeDataDocuments) : null,
                deleteFactura? (facturaId) => deleteFactura(facturaId, changeDataDocuments) : null,
                "resumenes"
            );
        }
    }
];

// Configuración de columnas para la tabla de viajes
export const columnasViajes = [
    { label: "Fecha", key: "fecha", class: [] },
    { label: "Comprobante", key: "comprobante", class: [] },
    { label: "Campo", key: "campo", class: [] },
    { label: "KM", key: "km", class: [] },
    { label: "Tarifa", key: "tarifa", class: [] },
    { label: "Variación", key: "variacion", class: [] },
    { label: "Toneladas", key: "toneladas", class: [] },
    { label: "Faltante", key: "faltante", class: [] },
    { label: "Cargado", key: "cargado" },
    { label: "Descargado", key: "descargado" },
    { label: "Importe", key: "importe", class: ['text-right'] },
    { label: "Comisión", key: "comision", class: ['text-right'] },
    { label: "Saldo", key: "saldo", class: ['text-right', 'bold']},
    { label: "IVA", key: "iva", class: ['text-right'] },
];

// Configuración de columnas para la tabla de pagos
export const columnasPagos = [
    { label: "Fecha de Pago", key: "fechaPago", class: [] },
    { label: "Tipo", key: "tipo", class: [] },
    { label: "Comprobante", key: "id", class: []},
    { label: "Descripción", key: "descripcion", class: [] },
    { label: "Importe", key: "importe", class: ['text-right'] }
];

const checkboxHeaderActionUpload = {
    icon: 'bi bi-file-earmark-arrow-up',
    tooltip: 'Subir factura para los viajes seleccionados',
    id: 'facturaBtn',
    classList: ['btn-upload', 'checkbox-cell', 'factura-cell'],
    handler: selectedRows => {
        if (selectedRows.length === 0) {
            showConfirmModal('Por favor, seleccione al menos un viaje para subir la factura.');
            return;
        }

        initializeFacturaUpload(handleFacturaActualization, null, null, "resumenes", selectedRows.map( r =>  r.comprobante));
    }
}

// Función para formatear fechas ISO a YYYY-MM-DD
export function formatFecha(fecha) {
    return new Date(fecha).toISOString().split('T')[0];
}

export function actualizarValores(resumenViajes, resumenPagos, resumenSaldo){
    // Calcular totales
    const subtotal = resumenViajes.viajes.reduce((sum, viaje) => sum + (viaje.saldo || 0), 0);
    const iva = resumenViajes.viajes.reduce((sum, viaje) => sum + (viaje.iva || 0), 0);
    let totalViajes = subtotal + iva;
    let totalPagos;
    let totalResumen;
    if (resumenPagos) {
        totalPagos = resumenPagos.pagos.reduce((sum, pago) => sum + (pago.importe || 0), 0);
        totalResumen = totalViajes - totalPagos;
        if (Math.abs(totalResumen) < 0.01) totalResumen = 0;
    }
    
    const subtotalContainer = document.getElementById("subtotal-resumen");
    const ivaContainer = document.getElementById("iva-resumen");
    ivaContainer.classList.remove("hidden");
    subtotalContainer.classList.remove("hidden");
    console.log(parseImporte(resumenSaldo.saldo).toFixed(2));
    console.log(totalResumen.toFixed(2));
    if (parseImporte(resumenSaldo.saldo).toFixed(2) !== totalResumen.toFixed(2)){
        totalViajes = totalViajes - iva;
        totalResumen = totalViajes - totalPagos;
        if (Math.abs(totalResumen) < 0.01) totalResumen = 0;
        ivaContainer.classList.add("hidden");
        subtotalContainer.classList.add("hidden");
    }

    // Actualizar contenedores de totales
    
    if (subtotalContainer) {
        subtotalContainer.textContent = `Subtotal: $${subtotal.toFixed(2)}`;
    }
    
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

function changeDataDocuments(){
    if (viajesResumenes.length > 0){
        //console.log(viajesResumenes);
        viajesResumenes[currentResumenesPage - 1].viajes.forEach( v => {
            if (v.comprobante === viaje[0].comprobante){
                v.carta_porte = viaje[0].carta_porte;
                v.factura_id = viaje[0].factura_id? viaje[0].factura_id : null;
            }
        });
        renderizarTablasResumenes(currentResumenesPage);
    }
}

// Función para calcular valores derivados en los viajes
function calcularValoresViaje(viaje) {
    viaje.faltante = parseFloat((viaje.descargado - viaje.cargado).toFixed(3));
    viaje.importe = (parseImporte(viaje.tarifa) - (parseImporte(viaje.tarifa) * viaje.variacion)) * viaje.toneladas;
    viaje.comision = - (viaje.importe * 0.1);
    viaje.iva = (viaje.importe + viaje.comision) * 0.21;
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
        faltante: processed.faltante,
        importe: processed.importe,
        comision: processed.comision,
        saldo: processed.importe + processed.comision,
        iva: processed.iva,
        factura_id: processed.factura_id,
        cuil: processed.cuil,
        carta_porte: processed.carta_porte
    };
    return retornar;
}

export function parsePagos(pago){
    let descripcion;
    switch (pago.tipo) {
        case "Cheque":
            const fechaCheque = formatFecha(pago.fecha_cheque? pago.fecha_cheque : pago.fechaCheque);
            descripcion = `${pago.tercero} - Fecha de Cobro: ${fechaCheque} `;
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
        fechaPago: formatFecha(pago.fecha_pago? pago.fecha_pago : pago.fechaPago),
        tipo: pago.tipo,
        descripcion: descripcion,
        importe: parseImporte(pago.importe)
    };
}

export async function setHistorial(chofer, cartaPorte = null, deleteFunc = null) {
    choferData = chofer;
    cartaPorteFunc = cartaPorte;
    deleteFactura = deleteFunc;
    const selectCantidad = document.getElementById("selectResumenes");

    const cantidad = selectCantidad.value !== "Otro"? selectCantidad.value : document.getElementById("inputSelectResumenes").value;
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

        viajesResumenes = data.viajes.map(resumen => ({
            group: resumen.group,
            viajes: resumen.viajes.map(v => parseViaje(v))
        }));

        saldosResumenes = data.saldos;
        console.log(data);
        renderizarTablasResumenes();
    } catch (error) {
        console.error('Error en setHistorial:', error.message);
    }
}

export function handleFacturaActualization(facturaId, selectedRows){
    if (viajesResumenes && viajesResumenes.length > 0 && facturaId){
        viajesResumenes[currentResumenesPage - 1].viajes.forEach(r => {
            if (selectedRows.includes(r.id))
                r.factura_id = facturaId;
        });
        renderizarTablasResumenes(currentResumenesPage);
    }
}

// Función para renderizar las tablas de resúmenes
function renderizarTablasResumenes(currentPage = 1) {
    // Obtener todos los grupos únicos, ordenados de más reciente a más antiguo
    const grupos = [...new Set([
        ...viajesResumenes.map(v => v.group),
        ...pagosResumenes.map(p => p.group),
        ...saldosResumenes.map(s => s.group)
    ])].sort().reverse();

    // Seleccionar el grupo actual según la página (1-based index)
    const grupoActual = grupos[Math.min(currentPage - 1, grupos.length - 1)];
    currentResumenesPage = currentPage;

    // Filtrar viajes y pagos para el grupo actual
    const resumenViajes = viajesResumenes.find(r => r.group === grupoActual) || { viajes: [] };
    const resumenPagos = pagosResumenes.find(r => r.group === grupoActual) || { pagos: [] };
    const resumenSaldo = saldosResumenes.find (s => s.group === grupoActual) || { saldo: 0};

    // Renderizar tabla de viajes
    let columnasViajesResumen = choferData.trabajador !== 'Monotributista'
        ? columnasViajes
        : columnasViajes.filter(col => col.key !== "iva");

    renderTabla({
        containerId: "viajes-table-resumenes",
        columnas: columnasViajesResumen.filter(col => !["cargado", "descargado"].includes(col.key)),
        datos: resumenViajes.viajes.map(v => ({
            id: v.id,
            cuil: v.cuil,
            fecha: v.fecha,
            comprobante: v.comprobante,
            campo: v.campo,
            km: v.km,
            tarifa: `$${parseFloat(v.tarifa).toFixed(2)}`,
            variacion: `${(v.variacion * 100).toFixed(2)}%`,
            toneladas: v.toneladas,
            cargado: v.cargado,
            descargado: v.descargado,
            faltante: v.faltante,
            importe: `$${v.importe.toFixed(2)}`,
            comision: `$${v.comision.toFixed(2)}`.replace('$-','-$'),
            saldo: `$${v.saldo.toFixed(2)}`,
            iva: v.iva ? `$${v.iva.toFixed(2)}` : undefined,
            factura_id: v.factura_id,
            carta_porte: v.carta_porte
        })),
        itemsPorPagina: null, // Mostrar todos los viajes del grupo
        currentPage: currentPage,
        actions: accionesViajes, // Sin acciones de edición
        tableType: "viajes",
        checkboxColumn: true,
        checkboxColumnPosition: "end",
        useScrollable: true,
        uploadFactura: true,
        checkboxHeaderAction: checkboxHeaderActionUpload,
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
        itemsPorPagina: null, // Mostrar todos los pagos del grupo
        currentPage: currentPage,
        actions: [], // Sin acciones
        tableType: "pagos",
        useScrollable: true
    });

    actualizarValores(resumenViajes, resumenPagos, resumenSaldo);

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
    btnPrev.onclick = () => renderizarTablasResumenes(currentPage - 1);
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
    btnNext.onclick = () => renderizarTablasResumenes(currentPage + 1);
    paginacionContainer.appendChild(btnNext);
}

function botonPaginaResumen(n, currentPage) {
    const btn = document.createElement("button");
    btn.textContent = n;
    btn.classList.add("pagination-button");
    if (n === currentPage) {
        btn.classList.add("active");
    }
    btn.onclick = () => renderizarTablasResumenes(n);
    return btn;
}