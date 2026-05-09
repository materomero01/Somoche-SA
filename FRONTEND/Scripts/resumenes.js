import { getResumenCuil, showConfirmModal } from './apiPublic.js';
import { renderTables } from './tabla.js';
import { viaje, initializeFacturaUpload } from './subir-factura.js';

let pagosResumenes = [];
export let viajesResumenes = [];

let choferData = {};

export let currentResumenesPage = 1;

let saldosResumenes = [];

// Vista activa: 'general' o 'chofer'
let vistaActual = 'general';

let choferIva = true;

let cartaPorteFunc;
let deleteFactura;

const accionesViajes = [
    {
        icon: "bi bi-download",
        tooltip: "Descargar archivos",
        classList: ['navigate-btn'],
        id: null,
        handler: (item) => {
            viaje.push(item); // Establece el viaje actual
            initializeFacturaUpload(
                handleFacturaActualization,
                cartaPorteFunc ? (cartaPorteFiles) => cartaPorteFunc(cartaPorteFiles, changeDataDocuments) : null,
                deleteFactura ? (facturaId) => deleteFactura(facturaId, changeDataDocuments) : null,
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
    { label: "Producto", key: "producto", class: [] },
    { label: "KM", key: "km", class: [] },
    { label: "Tarifa", key: "tarifa", class: [], modify: (content, editingRowId) => { return !editingRowId ? `$${content}` : content } },
    { label: "Variación", key: "variacion", class: [], modify: (content, editingRowId) => { return !editingRowId ? `${content * 100}%` : content } },
    { label: "Toneladas", key: "toneladas", class: [], },
    { label: "Faltante", key: "faltante", class: [] },
    { label: "Cargado", key: "cargado" },
    { label: "Descargado", key: "descargado" },
    { label: "Importe", key: "importe", class: ['text-right'], modify: (content) => { return `$${content.toFixed(2)}` } },
    { label: "Comisión", key: "comision", class: ['text-right'], modify: (content) => { return `$${content.toFixed(2)}`.replace('$-', '-$') } },
    { label: "Saldo", key: "saldo", class: ['text-right', 'bold'], modify: (content) => { return `$${content.toFixed(2)}` } },
    { label: "IVA", key: "iva", class: ['text-right'], modify: (content) => { return `$${content.toFixed(2)}` } },
];

// Configuración de columnas para la tabla de pagos
export const columnasPagos = [
    { label: "Fecha de Pago", key: "fecha_pago", class: [] },
    { label: "Tipo", key: "tipo", class: [] },
    { label: "Comprobante", key: "id", class: [] },
    { label: "Descripción", key: "descripcion", class: [] },
    { label: "Importe", key: "importe", class: ['text-right'], modify: (content) => { return `$${content.toFixed(2)}`.replace('$-', "-$") } }
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

        initializeFacturaUpload(handleFacturaActualization, null, null, "resumenes", selectedRows.map(r => r.comprobante));
    }
}

function columnasViajesResumenes() {
    console.log(choferIva);
    if (choferIva)
        return columnasViajes.filter(col => !["cargado", "descargado"].includes(col.key));
    else
        return columnasViajes.filter(col => !["cargado", "descargado", "iva"].includes(col.key));
}

const optionsViajes = {
    containerId: 'viajes-table-resumenes',
    paginacionContainerId: '',
    get columnas() {
        return [columnasViajesResumenes()];
    },
    itemsPorPagina: () => 10,
    actions: accionesViajes,
    onEdit: null,
    tableType: 'viajes',
    onPageChange: null,
    checkboxColumn: true,
    checkboxColumnPosition: 'end',
    checkboxHeaderAction: checkboxHeaderActionUpload,
    onCheckboxChange: null,
    uploadFactura: true,
    useScrollable: true
};

const optionsPagos = {
    containerId: 'pagos-table-resumenes',
    paginacionContainerId: '',
    columnas: [columnasPagos],
    itemsPorPagina: () => 3,
    actions: [],
    onEdit: null,
    tableType: 'pagos',
    onPageChange: null,
    checkboxColumn: null,
    checkboxColumnPosition: null,
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: true
}

// Función para formatear fechas ISO a YYYY-MM-DD
export function formatFecha(fecha) {
    return new Date(fecha).toISOString().split('T')[0];
}

function actualizarValores(resumenViajes, resumenPagos, resumenSaldo) {
    // Calcular totales
    const subtotal = resumenViajes.viajes.reduce((sum, viaje) => sum + (viaje.saldo || 0), 0);
    let iva = 0;
    if (choferIva) iva = resumenViajes.viajes.reduce((sum, viaje) => sum + (viaje.iva || 0), 0);
    let totalViajes = subtotal + iva;

    const subtotalContainer = document.getElementById("subtotal-resumen");
    const ivaContainer = document.getElementById("iva-resumen");
    if (choferIva) {
        ivaContainer.classList.remove("hidden");
        subtotalContainer.classList.remove("hidden");
    } else {
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
    const porcentajeChoferResumen = document.getElementById("porcentaje-chofer-resumen");
    if (porcentajeChoferResumen && choferData.trabajador === "Chofer") {
        porcentajeChoferResumen.classList.remove("hidden");
        porcentajeChoferResumen.textContent = `Porcentaje Chofer: $${(totalViajes * 0.2).toFixed(2)}`;
    }

    const totalResumenContainer = document.getElementById("total-resumen");
    if (totalResumenContainer) {
        totalResumenContainer.textContent = `Saldo del Resumen ${vistaActual === "chofer"? " del Chofer" : ""}: ${('$' +parseImporte(resumenSaldo.saldo)).replace('$-', '-$')}`;
    }
}

function changeDataDocuments() {
    if (viajesResumenes.length > 0) {
        //console.log(viajesResumenes);
        viajesResumenes[currentResumenesPage - 1].viajes.forEach(v => {
            if (v.comprobante === viaje[0].comprobante) {
                v.carta_porte = viaje[0].carta_porte;
                v.factura_id = viaje[0].factura_id ? viaje[0].factura_id : null;
                v.selected = false;
            }
        });
        renderizarTablasResumenes(currentResumenesPage);
    }
}

// Función para calcular valores derivados en los viajes
function calcularValoresViaje(viaje, comision) {
    viaje.faltante = parseFloat((viaje.descargado - viaje.cargado).toFixed(3));
    viaje.importe = (parseImporte(viaje.tarifa) - (parseImporte(viaje.tarifa) * viaje.variacion)) * viaje.toneladas;
    viaje.comision = - (viaje.importe * 0.1);
    const baseImponible = comision
        ? (viaje.importe + viaje.comision) 
        : viaje.importe;
    viaje.iva = baseImponible * 0.21;
    return viaje;
}

// Función para parsear el importe (remueve '$' y comas)
export function parseImporte(importe) {
    if (typeof importe === 'string') {
        return parseFloat(importe.replace(/[$,]/g, '')) || 0;
    }
    return parseFloat(importe) || 0;
}

export function parseViaje(viaje, iva = true, comision = true) {
    const processed = { ...viaje };
    calcularValoresViaje(processed, comision);
    let retornar = {
        id: processed.comprobante,
        fecha: formatFecha(processed.fecha),
        comprobante: processed.comprobante,
        campo: processed.campo,
        producto: processed.producto,
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
        ...(iva && {iva: processed.iva}),
        ...(processed.estado && {estado: processed.estado}),
        factura_id: processed.factura_id,
        cuil: processed.cuil,
        carta_porte: processed.carta_porte
    };
    return retornar;
}

export function parsePagos(pago, cuentaCorriente = false) {
    let descripcion;
    let fecha_vto = formatFecha(pago.fecha_pago);
    switch (pago.tipo.toLowerCase()) {
        case "cheque":
            const fechaCheque = formatFecha(pago.fecha_cheque);
            descripcion = `${pago.tercero} - Fecha de Cobro: ${fechaCheque} `;
            fecha_vto = fechaCheque;
            if (cuentaCorriente) descripcion = `Cheque ${pago.tercero}`;
            break;
        case "gasoil":
            const precio = parseImporte(pago.importe) / pago.litros;
            descripcion = `${pago.litros}L a $${precio.toFixed(2)} c/L`;
            break;
        default:
            try {
                descripcion = pago.descripcion ? pago.descripcion : pago.detalle;
            } catch (error){
                descripcion = "Sin descripción";
            }
    }
    return {
        id: pago.id,
        ...(cuentaCorriente && {fecha_vto: fecha_vto}),
        ...(cuentaCorriente && {comprobante: pago.comprobante || pago.id}),
        fecha_pago: formatFecha(pago.fecha_pago),
        tipo: pago.tipo,
        descripcion: descripcion,
        importe: parseImporte(pago.importe),
        ...(pago.destino && {destino: pago.destino})
    };
}

export async function setHistorial(chofer, cartaPorte = null, deleteFunc = null) {
    choferData = chofer;
    if (choferData.trabajador !== "Responsable Inscripto")
        choferIva = false;
    else
        choferIva = true;

    pagosResumenes = [];
    viajesResumenes = [];
    currentResumenesPage = 1;
    saldosResumenes = [];
    vistaActual = 'general';

    cartaPorteFunc = cartaPorte;
    deleteFactura = deleteFunc;
    const selectCantidad = document.getElementById("selectResumenes");
    const cantidad = selectCantidad.value !== "Otro" ? selectCantidad.value : document.getElementById("inputSelectResumenes").value;
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

        // Si el usuario autenticado es el propio chofer, siempre usamos vista 'chofer' sin toggle
        const esUsuarioChofer = choferData.trabajador === 'Chofer';

        const btnToggle = document.getElementById('btnChoferViewResumenes');
        if (btnToggle) {
            if (!esUsuarioChofer) {
                // El chofer solo ve su propia vista, ocultamos/desactivamos el toggle permanentemente
                btnToggle.disabled = true;
                btnToggle.classList.add('hidden');
            } else {
                btnToggle.classList.remove('hidden');
                // El estado disabled del botón se actualiza en cada página en renderizarTablasResumenes
                btnToggle.onclick = () => {
                    vistaActual = vistaActual === 'general' ? 'chofer' : 'general';
                    renderizarTablasResumenes(currentResumenesPage);
                };
            }
        } else 
            vistaActual = 'chofer';

        renderizarTablasResumenes();
    } catch (error) {
        console.error('Error en setHistorial:', error.message);
    }
}

export function handleFacturaActualization(facturaId, selectedRows) {
    if (viajesResumenes && viajesResumenes.length > 0 && facturaId) {
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
    const resumenPagosRaw = pagosResumenes.find(r => r.group === grupoActual) || { pagos: [] };

    // Obtener saldos del grupo actual (nuevo formato: array de { saldo, iva, destino })
    const resumenSaldoEntry = saldosResumenes.find(s => s.group === grupoActual);
    const saldosDelGrupo = resumenSaldoEntry ? resumenSaldoEntry.saldos : [];

    // Determinar si este resumen tiene vista de chofer disponible
    const tieneVistaChofer = saldosDelGrupo.some(s => s.destino === 'chofer');

    // Habilitar/deshabilitar el botón toggle según el resumen actual
    const btnToggle = document.getElementById('btnChoferViewResumenes');
    if (btnToggle){
        btnToggle.disabled = !tieneVistaChofer
        if (!tieneVistaChofer && vistaActual === 'chofer') vistaActual = 'general';
    }

    // Seleccionar el saldo correspondiente a la vista activa
    const saldoActivo = saldosDelGrupo.find(s => s.destino === vistaActual)
        || saldosDelGrupo.find(s => s.destino === 'general')
        || { saldo: 0 };

    // Actualizar choferIva desde el saldo activo
    if (saldosDelGrupo.length > 0 && typeof saldoActivo.iva === 'boolean') {
        choferIva = saldoActivo.iva;
    }

    // Filtrar pagos según la vista activa:
    // - vista 'general': todos los pagos excepto tipo='Resumen' con destino='chofer'
    // - vista 'chofer': solo pagos con destino='chofer'
    let pagosFiltrados;
    if (vistaActual === 'chofer') {
        pagosFiltrados = resumenPagosRaw.pagos.filter(p => p.destino === 'chofer');
    } else {
        pagosFiltrados = resumenPagosRaw.pagos.filter(p =>
            !(p.tipo === 'Resumen' && p.destino === 'chofer')
        );
    }
    const resumenPagos = { ...resumenPagosRaw, pagos: pagosFiltrados };

    renderTables(resumenViajes.viajes, currentResumenesPage, optionsViajes);
    renderTables(resumenPagos.pagos, currentResumenesPage, optionsPagos);

    actualizarValores(resumenViajes, resumenPagos, saldoActivo);

    // Renderizar paginación
    renderPaginacionResumenes(currentPage, grupos.length > 0 ? grupos.length : 1);
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