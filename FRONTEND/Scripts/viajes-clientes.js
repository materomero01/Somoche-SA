import { cargarNombreChofer, deleteModal, cartaPorteFunc, deleteFactura, setupPaymentTypeSelector, validateInputs } from "./viajes-pagos.js";
import { editingRowId, enterEditMode, handleEdit, mockChoferes, originalEditingData, stagedEditingData} from "./choferes-clientes.js";
import { generarFactura, getViajesCliente, deleteViaje, getPagosCliente, setupChoferAutocomplete, addPagos, deletePago, pagarViajeCliente, updateViaje } from "./api.js";
import { showConfirmModal } from "./apiPublic.js";
import { renderTabla } from "./tabla.js";
import { columnasPagos, columnasViajes, formatFecha, parsePagos, parseViaje, parseImporte } from "./resumenes.js";
import { viaje, initializeFacturaUpload } from "./subir-factura.js";

let loadingSpinner;
let mainContent;

let clienteData = [];
let viajesFacturadosData = [];
let viajesAFacturarData = [];

let viajesHistorialData = [];

let ultimosPagosCliente = [];
let pagosOpen = true;

let currentViajesClientesPage = 1;
let currentViajesHistorialPage = 1;

let currentEditingTable = "viajes";
// Regex for input validation
const regexInputs = {
    'comprobante': /^(\d{4}-\d{8}|\d{11})$/
};

// Acciones para la tabla de viajes
const accionesViajes = [
    {
        icon: "bi bi-pencil",
        tooltip: "Editar viaje",
        classList: ['edit-btn'],
        id: null,
        handler: (item) => {

            enterEditMode({ ...item, clienteCuit: clienteData.cuit }, 'viajesCliente');
        }
    },
    {
        icon: "bi bi-download",
        tooltip:"Descargar archivos",
        classList: ['navigate-btn'],
        id: null,
        handler: (item) => {
            viaje.push(item);
            initializeFacturaUpload( changeDataFactura,
                (cartaPorteFiles) => cartaPorteFunc(cartaPorteFiles,  changeDataDocuments),
                (facturaId) => deleteFactura(facturaId, changeDataDocuments,  'viajeCliente'),
                "viajeCliente");
        }
    },
    {
        icon: "bi bi-trash",
        tooltip: "Eliminar viaje",
        classList: ['delete-btn'],
        id: null,
        handler: (item, tr) => {
            showConfirmModal("¿Estás seguro de eliminar este viaje?", "delete", async () => {
            const result = await deleteViaje(item.id);
            if (result.ok) {
                switch (currentEditingTable){
                    case "viajes":
                        viajesAFacturarData = viajesAFacturarData.filter(v => v.id !== item.id);
                        renderizarTablaVC(viajesAFacturarData);
                        break;
                    case "historial":
                        viajesHistorialData = viajesHistorialData.filter(v => v.id !== item.id);
                        clienteData.balance = parseImporte(clienteData.balance) - parseFloat(parseImporte(item.importe) + parseImporte(item.iva)).toFixed(2);
                        renderizarTablaVC(viajesHistorialData);
                        break;
                    case "viajesFacturados":
                        viajesFacturadosData = viajesFacturadosData.filter(v => v.id !== item.id);
                        clienteData.balance = parseImporte(clienteData.balance) - parseFloat(parseImporte(item.importe) + parseImporte(item.iva)).toFixed(2);
                        renderizarTablaVC(viajesFacturadosData);
                        break;
                    default:
                        console.log("Error al actualizar los datos en local");
                }

                showConfirmModal("Viaje eliminado con éxito");
            } else {
                showConfirmModal(`Error: No se pudo eliminar el viaje`);
            }
        })}
    }
];

const checkboxHeaderAction = {
    icon: 'bi bi-check-all',
    tooltip: 'Marcar todos los seleccionados como pagados',
    id: null,
    classList: [],
    handler: async (selectedRows) => {
        if (selectedRows.length === 0) {
            showConfirmModal('Por favor, seleccione al menos un viaje para marcar como pagado.');
            return;
        }

        showConfirmModal(
            `¿Estás seguro de marcar ${selectedRows.length} viaje(s) como pagado(s)?`,
            "confirm",
            async () => {
                const viajesToMark = selectedRows.map(row => ({
                    viaje_comprobante: row.comprobante,
                    cliente_cuit: clienteData.cuit
                }));

                try {
                    const response = await pagarViajeCliente(viajesToMark);
                    const data = await response.json();
                    if (response.ok){
                        // Update local data
                        viajesFacturadosData = viajesFacturadosData.map(v => {
                            if (selectedRows.some(selected => selected.comprobante === v.comprobante)) {
                                return { ...v, pagado: true, selected: false };
                            }
                            return v;
                        });

                        // Optionally remove paid trips from the table
                        viajesFacturadosData = viajesFacturadosData.filter(v => !v.pagado);

                        // Re-render table and update totals
                        renderizarTablaVC(viajesFacturadosData, 1);
                    }
                    showConfirmModal(data.message);
                } catch (error) {
                    console.log(`Error: ${error.message}`);
                }
            }
        );
    }
}

const checkboxHeaderActionGenerate = {
    icon: 'bi bi-file-earmark-arrow-up',
    tooltip: 'Generar factura para los viajes seleccionados',
    id: null,
    classList: ['btn-generate-invoice', 'checkbox-cell', 'factura-cell'],
    handler: selectedRows => {
        if (selectedRows.length === 0) {
            showConfirmModal('Por favor, seleccione al menos un viaje para generar la factura.');
            return;
        }

        showConfirmModal(
            `¿Estás seguro de generar la factura para los  ${selectedRows.length} viaje(s) seleccionado(s)?`,
            "confirm",
            () => handleGenerateInvoice(selectedRows)
        );
    }
}

// Acciones para la tabla de pagos
const accionesPagos = [
    {
        icon: "bi bi-trash",
        tooltip: "Eliminar pago",
        classList: ['delete-btn'],
        id: null,
        handler: (item, tr) => {
            showConfirmModal("¿Estás seguro de eliminar este pago?", "delete" , async () => {
                const response = await deletePago(item.id, item.tipo);
                const data = await response.json();
                if(!response.ok){
                    showConfirmModal(data.message);
                    return;
                }
                ultimosPagosCliente = ultimosPagosCliente.filter(p => p.id !== item.id);
                showConfirmModal(data.message);
                clienteData.balance = parseImporte(clienteData.balance) + parseFloat(parseImporte(item.importe));
                renderPagosVC();
                actualizarTotales(viajesFacturadosData);
            });
        }
    }
];

// --- Lógica de la barra de búsqueda ---
function setupSearchBar(searchBarId) {
    const searchInput = document.querySelector(`#${searchBarId} .search-input`);
    const searchIcon = document.querySelector(`#${searchBarId} .search-icon`);

    if (searchInput && searchIcon) {
        const performSearch = () => {
            const searchTerm = searchInput.value.toLowerCase();
            let filteredData = [];
            
            switch (currentEditingTable) {
                case 'viajes':
                    filteredData = viajesAFacturarData.filter(viaje =>
                        formatFecha(viaje.fecha)?.includes(searchTerm) ||
                        viaje.comprobante?.toLowerCase().includes(searchTerm) ||
                        viaje.campo?.toLowerCase().includes(searchTerm)
                    );
                    break;
                case 'historial':
                    filteredData = viajesHistorialData.filter(viaje =>
                        formatFecha(viaje.fecha)?.includes(searchTerm) ||
                        viaje.comprobante?.toLowerCase().includes(searchTerm) ||
                        viaje.campo?.toLowerCase().includes(searchTerm)
                    );
                    break;
                case 'viajesFacturados':
                    filteredData = viajesFacturadosData.filter(viaje =>
                        formatFecha(viaje.fecha)?.includes(searchTerm) ||
                        viaje.comprobante?.toLowerCase().includes(searchTerm) ||
                        viaje.campo?.toLowerCase().includes(searchTerm)
                    );
                    break;
                default:
                    return console.log("Error al setear el serchbar");
            }
            currentViajesClientesPage = 1;
            renderizarTablaVC(filteredData, 1, !pagosOpen? 8 : null);
        };

        searchIcon.addEventListener('click', performSearch);
        searchInput.addEventListener('input', performSearch);
    } else {
        console.warn(`Elementos de la barra de búsqueda para '${searchBarId}' no encontrados.`);
    }
}

function changeDataDocuments(){
    switch (currentEditingTable){
        case 'viajes':
            if (viajesAFacturarData.length > 0){
                viajesAFacturarData = viajesAFacturarData.filter(v => {
                    if (v.comprobante === viaje[0].comprobante){
                        v.carta_porte = viaje[0].carta_porte;
                        v.factura_id = viaje[0].factura_id? viaje[0].factura_id : null;
                        clienteData.balance = parseImporte(clienteData.balance) + parseFloat((viaje[0].factura_id? parseImporte(v.importe) + parseImporte(v.iva) : -(parseImporte(v.importe) + parseImporte(v.iva))).toFixed(2));
                        return v.factura_id === null;
                    }
                    return true;
                });
            }
            renderizarTablaVC(viajesAFacturarData, currentViajesClientesPage);
            break;
        case 'historial':
            if (viajesHistorialData.length > 0){
                viajesHistorialData.forEach(v => {
                    if (v.comprobante === viaje[0].comprobante){
                        v.carta_porte = viaje[0].carta_porte;
                        v.factura_id = viaje[0].factura_id? viaje[0].factura_id : null;
                    }
                });
            }
            renderizarTablaVC(viajesHistorialData, currentViajesHistorialPage);
            break;
        case 'viajesFacturados':
            if (viajesFacturadosData.length > 0){
                viajesFacturadosData = viajesFacturadosData.filter(v => {
                    if (v.comprobante === viaje[0].comprobante){
                        v.carta_porte = viaje[0].carta_porte;
                        v.factura_id = viaje[0].factura_id? viaje[0].factura_id : null;
                        clienteData.balance = parseImporte(clienteData.balance) + parseFloat((viaje[0].factura_id? parseImporte(v.importe) + parseImporte(v.iva) : -(parseImporte(v.importe) + parseImporte(v.iva))).toFixed(2));
                        console.log(clienteData.balance);
                        return v.factura_id !== null;
                    }
                    return true;
                });
            }
            renderizarTablaVC(viajesFacturadosData, 1, 8);
    }
}

function changeDataFactura(facturaId){
    if (!facturaId) {
        console.warn('No se recibió el facturaId en los encabezados');
    } else {
        switch (currentEditingTable){
            case "viajes":
                viajesAFacturarData = viajesAFacturarData.filter(v => v.comprobante !== viaje[0].comprobante);
                clienteData.balance = parseImporte(clienteData.balance) + parseFloat((parseImporte(viaje[0].importe) + parseImporte(viaje[0].iva)).toFixed(2));
                renderizarTablaVC(viajesAFacturarData, currentViajesClientesPage);
                break;
            case "historial":
                if (viajesHistorialData.length > 0){
                    viajesHistorialData.forEach(v => {
                        if (v.comprobante === viaje[0].comprobante){
                            v.factura_id = facturaId;
                        }
                    });
                }
                renderizarTablaVC(viajesHistorialData, currentViajesHistorialPage);
                break;
            default:
                console.error("Error al actualizar datos al subir la factura");
        }
    }
}

function actualizarTotales(viajes, tablesTab = currentEditingTable) {
    const subtotal = viajes.reduce((sum, viaje) => sum + (viaje.importe || 0), 0);
    const iva = viajes.reduce((sum, viaje) => sum + (viaje.iva || 0), 0);
    const totalViajes = subtotal + iva;

    const subtotalContainer = document.getElementById("subtotal");
    if (subtotalContainer)
        subtotalContainer.textContent = `Subtotal: $${subtotal.toFixed(2)}`;
    const ivaContainer = document.getElementById("iva")
        ivaContainer.textContent = `IVA (21%): $${iva.toFixed(2)}`;
    const totalViajesContainer = document.getElementById("total-viajes");
    if (totalViajesContainer)
        totalViajesContainer.textContent = `Total Viajes: $${totalViajes.toFixed(2)}`;
    const totalPagarContainer = document.getElementById("total-cobrar");
    if (totalPagarContainer){
        if (tablesTab === "historial")
            totalPagarContainer.classList.add('gray');
        else
            totalPagarContainer.classList.remove('gray');
        totalPagarContainer.textContent = `Total a Cobrar: ${('$' + clienteData.balance).replace('$-','-$')}`;
    }
}

export async function handleSaveEditViajesCliente() {
    const comprobanteOriginal = originalEditingData.comprobante;
    const payload = {
        [comprobanteOriginal]: {
            fecha: stagedEditingData.fecha || null,
            comprobante: stagedEditingData.comprobante || null,
            campo: stagedEditingData.campo || null,
            kilometros: parseInt(stagedEditingData.km) || null,
            tarifa: parseImporte(stagedEditingData.tarifa) || null,
            variacion: parseFloat(stagedEditingData.variacion) > 1? parseFloat(stagedEditingData.variacion) /100 : parseFloat(stagedEditingData.variacion) || 0.1,
            toneladas: parseFloat(stagedEditingData.toneladas) || null,
            cargado: parseFloat(stagedEditingData.cargado) || null,
            descargado: parseFloat(stagedEditingData.descargado) || null,
            tabla: "viaje_clienteV"
        }
    };

    if (!validateInputs(payload[comprobanteOriginal], {
        comprobante: 'Comprobante',
        campo: 'Campo',
        kilometros: 'Kilómetro',
        tarifa: 'Tarifa',
        toneladas: 'Toneladas',
    })) return;

    if (!regexInputs.comprobante.test(payload[comprobanteOriginal].comprobante)) {
        showConfirmModal('El comprobante debe tener el formato "XXXX-XXXXXXXX" o ser un número de 11 dígitos.');
        return;
    }

    const numericFields = {
        kilometros: 'Kilómetro',
        tarifa: 'Tarifa',
        toneladas: 'Toneladas',
        cargado: 'Cargado',
        descargado: 'Descargado'
    };
    for (const [key, label] of Object.entries(numericFields)) {
        if (isNaN(payload[comprobanteOriginal][key]) || payload[comprobanteOriginal][key] <= 0) {
            showConfirmModal(`${label} debe ser un número mayor a 0.`, 'error');
            return;
        }
    }

    const response = await updateViaje(payload);
    if (response) {
        showConfirmModal('Los cambios se realizaron con exito.');
        const viajeIndex = viajesAFacturarData.findIndex(v => v.comprobante === comprobanteOriginal);
        if (viajeIndex !== -1)
            viajesAFacturarData[viajeIndex] = parseViaje({...payload[comprobanteOriginal], factura_id: stagedEditingData.factura_id});
    } else {
        showConfirmModal('Error al guardar los cambios del viaje.');
    }
}

export function renderizarTablaVC(viajesDataRender = viajesAFacturarData, currentPage = 1, itemsPerPage = 5){

    let scrollable = false;
    let checkbox = true;
    let actions = accionesViajes;
    let headerAction = null;
    switch (currentEditingTable){
        case "viajes":
            currentViajesClientesPage = currentPage;
            headerAction = checkboxHeaderActionGenerate;
            break;
        case "historial":
            currentViajesHistorialPage = currentPage;
            checkbox = false;
            actions = actions.filter( accion => !(accion.tooltip.includes("Editar") || accion.tooltip.includes("Eliminar")));
            break;
        case "viajesFacturados":
            scrollable = true;
            itemsPerPage = pagosOpen? 3 : 8;
            actions = actions.filter( accion => !(accion.tooltip.includes("Editar")));
            headerAction = checkboxHeaderAction;
            break;
    }

    let columnas = columnasViajes;

    if (editingRowId){
        columnas = columnasViajes.filter(col => !["faltante", "importe", "comision", "iva"].includes(col.key));
    } else
        columnas = columnasViajes.filter(col => !["cargado", "descargado"].includes(col.key));

    renderTabla({
        containerId: 'clientesViajes-table',
        paginacionContainerId: 'paginacion-viajes',
        datos: viajesDataRender.map(v => ({
                        id: v.id,
                        cuil: clienteData.cuit,
                        fecha: v.fecha,
                        comprobante: v.comprobante,
                        campo: v.campo,
                        km: v.km,
                        tarifa: !editingRowId? `$${v.tarifa}`: v.tarifa,
                        variacion: !editingRowId? `${v.variacion * 100}%` : v.variacion,
                        toneladas: v.toneladas,
                        cargado: v.cargado,
                        descargado: v.descargado,
                        faltante: v.faltante,
                        importe: `$${v.importe.toFixed(2)}`,
                        iva: `$${(v.importe * 0.21 ).toFixed(2)}`,
                        factura_id: v.factura_id,
                        carta_porte: v.carta_porte
    })),
        columnas: columnas.filter(col => !["comision", "saldo"].includes(col.key)),
        itemsPorPagina: itemsPerPage,
        actions: actions,
        editingRowId: currentEditingTable === 'viajes'? editingRowId : null,
        onEdit: currentEditingTable === 'viajes'? (id, field, value) => handleEdit(id, field, value, 'viajesCliente') : null,
        tableType: currentEditingTable !== 'viajesFacturados'? 'viajesCliente' : 'viajesFacturados',
        checkboxColumn: checkbox,
        checkboxColumnPosition: "end",
        checkboxHeaderAction: headerAction,
        currentPage: currentPage,
        onPageChange: (page) => { currentEditingTable === 'viajes'? currentViajesClientesPage = page : currentViajesHistorialPage = page; },
        useScrollable: scrollable
    });

    actualizarTotales(viajesDataRender);
}

function renderPagosVC(pagosData = ultimosPagosCliente){
    renderTabla({
        containerId: "pagos-table",
        datos: pagosData.map(p => ({
            id: p.id,
            fechaPago: p.fechaPago,
            tipo: p.tipo,
            descripcion: p.descripcion,
            importe: `$${p.importe.toFixed(2)}`.replace('$-',"-$")
    })),
        columnas: columnasPagos,
        actions: accionesPagos,
        tableType: 'pagos',
        useScrollable: true
    });
}

const setupAddPagoBtn = () => {
    const btn = document.getElementById('addPagoBtn');
    setupChoferAutocomplete('choferCheque', mockChoferes);
    const cuitChofer = document.getElementById('choferCheque');
    
    btn?.addEventListener('click', async () => {
        const tipoPago = document.getElementById('tipoPago')?.value;
        const fechaPagoInput = document.getElementById('fechaPago')?.value;
        let fechaPago;
        try {
            fechaPago = fechaPagoInput ? new Date(`${fechaPagoInput}T00:00:00-03:00`).toISOString() : new Date().toISOString();
        } catch (error) {
            showConfirmModal('La fecha de pago ingresada no es válida');
            return;
        }

        let payload = {
            cliente_cuit: clienteData?.cuit,
        };

        switch (tipoPago) {
            case 'cheque':
                const fechaChequeInput = document.getElementById('fechaCheque')?.value;
                let fechaCheque;
                try {
                    fechaCheque = fechaChequeInput ? new Date(`${fechaChequeInput}T00:00:00-03:00`).toISOString() : new Date().toISOString();
                } catch (error) {
                    showConfirmModal('La fecha del cheque ingresada no es válida');
                    return;
                }
                payload = {
                    ...payload,
                    pagos: {
                        tipo: 'Cheque',
                        fechaPago: fechaPago,
                        fechaCheque: fechaCheque,
                        nroCheque: document.getElementById('nroCheque')?.value,
                        tercero: document.getElementById('terceroCheque')?.value,
                        destinatario: document.getElementById('destinatarioCheque')?.value,
                        importe: document.getElementById('importeCheque')?.value,
                        chofer_cuil: cuitChofer?.dataset.selectedChoferCuil
                    }
                };

                if (isNaN(payload.pagos.importe) || payload.pagos.importe <= 0) {
                    showConfirmModal(`El importe ingresado no es válido`);
                    return;
                }
                break;
            case 'otro':
                payload = {
                    ...payload,
                    pagos: {
                        tipo: 'Otro',
                        fechaPago: fechaPago,
                        comprobante: document.getElementById('comprobanteOtro')?.value,
                        detalle: document.getElementById('detalleOtro')?.value,
                        importe: document.getElementById('importeOtro')?.value,
                    }
                };

                if (!payload.pagos.comprobante){
                    showConfirmModal('Ingrese el comprobante para el pago');
                    return;
                }
                
                if (isNaN(payload.pagos.importe) || payload.pagos.importe <= 0) {
                    showConfirmModal(`El valor ingresado para el importe no es válido`);
                    return;
                }
                break;
            default:
                console.warn('Tipo de pago no reconocido:', tipoPago);
                return;
        }

        try {
            const response = await addPagos(payload);
            const data = await response.json();
            showConfirmModal(data.message);
            ultimosPagosCliente.push(parsePagos({id: data.pagoId.id, fecha_cheque: payload.pagos.fechaCheque, fecha_pago: payload.pagos.fechaPago, ...payload.pagos}));
            renderPagosVC();
        } catch (error) {
            console.error('Error en addPagos:', error.message);
        }
    });
};

// Handler for Generate Invoice button
async function handleGenerateInvoice(data) {
    const selectedRows = data;
    console.log('Selected rows:', JSON.stringify(selectedRows, null, 2));
    if (selectedRows.length === 0) {
        showConfirmModal('Por favor, seleccione al menos un viaje para generar la factura.');
        return;
    }

    // Get client CUIT from localStorage
    const selectedClientCUIT = clienteData.cuit;
    console.log('Selected client CUIT:', selectedClientCUIT);

    if (!selectedClientCUIT || selectedClientCUIT.replace(/[^0-9]/g, '').length !== 11) {
        showConfirmModal('Error: CUIT del cliente no disponible o inválido. Por favor, seleccione un cliente en la tabla de clientes.');
        return;
    }

    // Validate and clean fields
    for (const row of selectedRows) {
        const tarifa = parseFloat(row.tarifa?.replace(/[^0-9.]/g, '')); // Clean tarifa
        const importe = parseFloat(row.importe?.replace(/[^0-9.]/g, '')); // Clean importe
        const iva = parseFloat(row.iva?.replace(/[^0-9.]/g, '')); // Clean iva
        if (isNaN(tarifa)) {
            showConfirmModal(`Error: Tarifa inválida en viaje: ${row.campo || 'Sin campo'}`);
            return;
        }
        if (isNaN(importe)) {
            showConfirmModal(`Error: Importe inválido en viaje: ${row.campo || 'Sin campo'}`);
            return;
        }
        if (isNaN(iva)) {
            showConfirmModal(`Error: IVA inválido en viaje: ${row.campo || 'Sin campo'}`);
            return;
        }
    }

    const servicios = selectedRows.map((row, index) => {
        const importe = parseFloat(row.importe.replace(/[^0-9.]/g, '')); // Clean importe
        const iva = parseFloat(row.iva.replace(/[^0-9.]/g, '')); // Clean iva
        const subtotal = importe; // Importe is the subtotal
        const subtotalConIVA = (importe + iva).toFixed(2); // Subtotal + IVA
        return {
            codigo: `V${index + 1}`,
            descripcion: `Transporte - ${row.campo || 'Sin campo'} (${row.fecha})`,
            cantidad: row.toneladas, // Per trip; change to row.cargado if billing by tonnage
            unidad: 'Toneladas',
            precioUnit: importe.toFixed(2),
            bonif: '0.00',
            subtotal: subtotal.toFixed(2),
            ivaId: 5, // 21% IVA
            subtotalConIVA: subtotalConIVA
        };
    });

    const invoiceData = {
        ptoVta: 12,
        docNro: selectedClientCUIT,
        comprobante: selectedRows.map(r => ({ id: r.id })),
        servicios,
        tributos: [],
        fechaEmision: formatDate(new Date()), // AAAAMMDD
        periodoDesde: formatDate(new Date(), '/'), // DD/MM/YYYY
        periodoHasta: formatDate(new Date(), '/'), // DD/MM/YYYY
        fechaVtoPago: formatDate(new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), '/'), // 10 days
        condicionVenta: 'Efectivo'
    };

    console.log('Invoice data to send:', JSON.stringify(invoiceData, null, 2));

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        showConfirmModal('Error: No se encontró token de autenticación. Por favor, inicia sesión nuevamente.');
        return;
    }

    try {
        const response = await generarFactura(invoiceData);

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error al generar factura');
        }
        console.log('Encabezados recibidos:', Object.fromEntries(response.headers));
        // Obtener el facturaId desde el encabezado
        const facturaId = response.headers.get('X-Factura-Id');
        if (!facturaId) {
            console.warn('No se recibió el facturaId en los encabezados');
        } else {
            console.log('Factura ID:', facturaId);
        }

        clienteData.balance = parseImporte(clienteData.balance) + parseFloat(selectedRows.reduce((sum, viaje) => sum + (parseImporte(viaje.importe) + parseImporte(viaje.iva) || 0), 0).toFixed(2));

        viajesAFacturarData = viajesAFacturarData.filter(v => !selectedRows.some(row => row.id === v.id));

        renderizarTablaVC(viajesAFacturarData, currentViajesClientesPage);
        const data = await response.blob();

        const url = window.URL.createObjectURL(data);

        // Abrir el PDF en una nueva pestaña
        const pdfWindow = window.open(url, '_blank');

        
        
        // Liberar la URL del blob después de abrir la pestaña
        if (!pdfWindow) {
            console.error('No se pudo abrir la ventana del navegador');
            // Opcional: Mostrar un mensaje al usuario
            showConfirmModal('No se pudo abrir la pestaña para mostrar el PDF');
        }
    } catch (error) {
        console.error('Error:', error.message);
        showConfirmModal('Error al generar la factura: ' + error.message);
        // No realizar ninguna acción que cause un refresco
    }
}

// Date formatting helper
function formatDate(date, separator = '') {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return separator ? `${day}${separator}${month}${separator}${year}` : `${year}${month}${day}`;
}

function setupTabSelectorCliente(){
    const tabSelector = document.getElementById('facturasSelector');
    if (!tabSelector) {
        console.warn("Elemento #facturasSelector no encontrado. La funcionalidad de pestañas no se inicializará.");
        return;
    }

    const tabItems = tabSelector.querySelectorAll('.tab-item');

    tabItems.forEach(item => {
        item.addEventListener('click', function () {
            tabItems.forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');

            const selectedTab = this.dataset.tab;
            handleTabContentDisplay(selectedTab);
        });
    });

    const initialActive = tabSelector.querySelector('.tab-item.active');
    if (initialActive) {
        handleTabContentDisplay(initialActive.dataset.tab);
    } else if (tabItems.length > 0) {
        tabItems[0].classList.add('active');
        handleTabContentDisplay(tabItems[0].dataset.tab);
    }
}

async function setUltimosPagos(cantidad){
    const responsePagos = await getPagosCliente(clienteData.cuit, cantidad);
    if (responsePagos.ok){
        const data = await responsePagos.json();
        ultimosPagosCliente = data.map(p => {
            return parsePagos(p);
        });
        renderPagosVC(ultimosPagosCliente)
    } else {
        showConfirmModal("No se obtuvieron los ultimos pagos del cliente");
    }
}

async function handleTabContentDisplay(selectedTab){
        const viajesFacturadosContent = document.getElementById('content-viajes-facturados');
        const historialBtn = document.getElementById("historial");
        const closeButton = document.getElementById("closeBtnViaje");
        const paginacionContainer = document.getElementById("paginacion-viajes");
        const backHistorialBtn = document.getElementById("back-historialBtn");
        const searchInput = document.getElementById('searchInput');

        if (searchInput) searchInput.value = '';
        if (loadingSpinner) {
            loadingSpinner.classList.remove("hidden");
            loadingSpinner.childNodes[2].textContent = "Cargando datos...";
        }
        if (mainContent) mainContent.classList.add("hidden")
        try {
            if (selectedTab === 'aFacturar') {
                const response = await getViajesCliente(clienteData.cuit, false, null);
                if (response.ok){
                    viajesFacturadosContent.classList.add('hidden');
                    backHistorialBtn.click();
                    historialBtn.classList.add("hidden");
                    const data = await response.json();
                    
                    viajesAFacturarData = data.viajes.map(c => {
                        const viaje = parseViaje(c);
                        viaje.iva = viaje.importe * 0.21;
                        return viaje;
                    });
                    paginacionContainer.classList.remove("hidden");
                    console.log("viajes a facturar cargados");
                    console.log(viajesAFacturarData);
                    currentEditingTable = "viajes";
                    await renderizarTablaVC(viajesAFacturarData);
                } else {
                    showConfirmModal("Ocurrio un error al cargar los viajes del cliente");
                    closeButton.click();
                }
            } else if (selectedTab === 'facturados') {
                const response = await getViajesCliente(clienteData.cuit, true, null);
                if (response.ok){
                    viajesFacturadosContent.classList.remove('hidden');
                    backHistorialBtn.click();
                    paginacionContainer.classList.add("hidden");
                    const data = await response.json();
                    viajesFacturadosData = data.viajes.map(c => {
                        const viaje = parseViaje(c);
                        viaje.iva = viaje.importe * 0.21;
                        return viaje;
                    });
                    console.log(viajesFacturadosData);
                    currentEditingTable = "viajesFacturados";
                    await renderizarTablaVC(viajesFacturadosData, 1);
                } else {
                    showConfirmModal("Ocurrio un error al cargar los viajes del cliente");
                    closeButton.click();
                }

                const selectPagos = document.getElementById("selectPagos");
                const selectCantidad = selectPagos?.value !== "Otro"? selectPagos.value : document.getElementById('inputSelectPago')?.value;
            
                await setUltimosPagos(selectCantidad);
            }
        } catch (error){
            console.log(error.message);
            closeButton.click();
        }
        if (loadingSpinner) {
            loadingSpinner.classList.add("hidden");
            loadingSpinner.childNodes[2].textContent = "Cargando datos...";
        }
        if (mainContent) mainContent.classList.remove("hidden")
}

async function setHistorial() {
    const selectCantidad = document.getElementById("selectResumenes");
    const cantidad = selectCantidad.value !== "Otro"? selectCantidad.value : document.getElementById('inputSelectViaje')?.value;
    if (!cantidad) {
        showConfirmModal("Seleccione una cantidad de resúmenes válida.");
        return;
    }

    try {
        const response = await getViajesCliente(clienteData.cuit, true, cantidad, true);
        const data = await response.json();
        if (!response.ok) {
            showConfirmModal("Error al cargar el historial del cliente");
            viajesHistorialData = null;
            return;
        }

        viajesHistorialData = data.viajes.map(c => {
            const viaje = parseViaje(c);
            viaje.iva = viaje.importe * 0.21;
            return viaje;
        });

        currentEditingTable = "historial";
        renderizarTablaVC(viajesHistorialData, 1, 10);
    } catch (error) {
        console.error('Error en setHistorial:', error.message);
    }
}

// Inicializar
export async function inicializarModaCliente(data) {
    document.body.classList.add("no-scroll");
    clienteData = data;

    cargarNombreChofer(clienteData.nombre);

    const closeButton = document.getElementById('closeBtnViaje');
    if (closeButton) {
        closeButton.onclick = () => {
            deleteModal("viajesClientesModal","contentModalViajes");
            viajesFacturadosData = [];
            viajesAFacturarData = [];
            clienteData = [];
            viajesHistorialData = [];
            currentViajesClientesPage = 1;
            currentViajesHistorialPage = 1;
        };
    }

    loadingSpinner = document.getElementById('loading-spinner');
    mainContent = document.getElementById('content-clientesViajes');

    if (loadingSpinner) loadingSpinner.classList.remove("hidden");
    if (mainContent) mainContent.classList.add("hidden");

    const fields = {
        cheque: document.getElementById('chequeFields'),
        otro: document.getElementById('otroFields')
    };

    const selectPagosCantidad = document.getElementById("selectPagos");
    const pagosHeader = document.getElementById('headerPagos');
    const tablaPagos = document.getElementById('pagos-table');
    const clienteAddPago = document.getElementById('cliente-pagos-wrapper');
    const searchInput = document.getElementById('searchInput');
    const togglePagosArea = document.getElementById('togglePagosArea');
    togglePagosArea.style.cursor = 'pointer';

    // Toggle pagos area
    togglePagosArea?.addEventListener('click', () => {
        togglePagosArea.classList.toggle('active');
        pagosHeader.classList.toggle('hidden');
        tablaPagos.classList.toggle('hidden');
        clienteAddPago.classList.toggle('hidden');
        if (searchInput) searchInput.value = '';
        pagosOpen = !pagosOpen;
        if (pagosOpen)
            renderizarTablaVC(currentEditingTable !== "historial" ? viajesFacturadosData : viajesHistorialData, 1);
        else
            renderizarTablaVC(currentEditingTable !== "historial" ? viajesFacturadosData : viajesHistorialData, 1, 8);
    });


    try {
        setupTabSelectorCliente();
        setupSearchBar("clientesViajesSearchBar");
        setupAddPagoBtn();
        setupPaymentTypeSelector(fields);
        
        const historialBtn = document.getElementById("historial");
        const backHistorialBtn = document.getElementById("back-historialBtn");
        const headerModal = document.getElementById("headerModal");
        const selectCantidad = document.getElementById("selectResumenes");
        const summaryBoxes = document.getElementById('summaryBoxes');
        const inputCantPagos = document.getElementById('inputSelectPago');
        const inputCantViajes = document.getElementById('inputSelectViaje');

        const cardPagos = document.getElementById("addPagoCard");
        document.getElementById("agregar-pago")?.addEventListener("click", () => {
            cardPagos.classList.toggle('hidden');
        });

        selectPagosCantidad?.addEventListener("change", () => {
            if (selectPagosCantidad.value !== "Otro"){
                inputCantPagos.classList.add('hidden');
                setupTabSelectorCliente();
            } else {
                inputCantPagos.classList.remove('hidden');
            }
        })

        inputCantPagos?.addEventListener("change", () => {
            if (inputCantPagos.value > 0)
                setupTabSelectorCliente();
        })


        selectCantidad?.addEventListener("change", () => {
            if (selectCantidad.value !== "Otro"){
                inputCantViajes.classList.add("hidden");
                historialBtn.click();
            } else
                inputCantViajes.classList.remove("hidden");
        })

        inputCantViajes?.addEventListener("change", () => {
            historialBtn.click();
        })

        historialBtn?.addEventListener("click", async () =>{
            if (loadingSpinner) {
                loadingSpinner.classList.remove("hidden");
                loadingSpinner.childNodes[2].textContent = "Cargando resumenes...";
            }
            if (mainContent) mainContent.classList.add("hidden");
            summaryBoxes.classList.add("hidden");
            if (pagosOpen && currentEditingTable !== "historial") togglePagosArea.click();
            await setHistorial();
            if (loadingSpinner) {
                loadingSpinner.classList.add("hidden");
                loadingSpinner.childNodes[2].textContent = "Cargando datos...";
            }
            if (mainContent) mainContent.classList.remove("hidden");
            document.getElementById("back-historial").classList.remove("hidden");
            headerModal.textContent = "Viajes - Historial";
            historialBtn.classList.add("hidden");
            if (!viajesHistorialData){
                backHistorialBtn?.click();
            }
        });

        backHistorialBtn?.addEventListener("click", () =>{
            document.getElementById("back-historial").classList.add("hidden");
            headerModal.textContent = "Viajes";
            historialBtn.classList.remove("hidden");
            currentEditingTable = "viajesFacturados";
            renderizarTablaVC(viajesFacturadosData);
            summaryBoxes.classList.remove("hidden");
        });

    } catch (error) {
        console.error('Error de red o desconocido al obtener datos de los viajes:', error);
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    } finally {
        if (loadingSpinner) loadingSpinner.classList.add("hidden");
        if (mainContent) mainContent.classList.remove("hidden");
    }
}