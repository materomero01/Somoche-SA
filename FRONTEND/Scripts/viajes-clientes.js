import { cargarNombreChofer, deleteModal, cartaPorteFunc, deleteFactura, setupPaymentTypeSelector, validateInputs } from "./viajes-pagos.js";
import { mockChoferes, mockProveedores, renderCurrentTable, setupSearchBar } from "./choferes-clientes.js";
import { generarFactura, getViajesCliente, deleteViaje, getPagosCliente, setupChoferAutocomplete, addPagos, deletePago, pagarViajeCliente, updateViaje, socket, getViajeComprobante, tarifasCatac, setupClienteAutocomplete, redondear, pagarFacturaCliente, getFacturasData, createActionModal } from "./api.js";
import { changeSpinnerText, createLoadingSpinner, showConfirmModal, toggleSpinnerVisible } from "./apiPublic.js";
import { renderTables, originalEditingData, resetEditingState, stagedEditingData, editingRowId, enterEditMode, handleEdit } from "./tabla.js";
import { columnasPagos, columnasViajes, formatFecha, parsePagos, parseViaje, parseImporte } from "./resumenes.js";
import { viaje, initializeFacturaUpload, updateViajeStatus, closeModalFactura } from "./subir-factura.js";

let mainContent;

let clienteData = [];
let viajesFacturadosData = [];
let viajesAFacturarData = [];

let dataCuentaCorriente = [];

let viajesHistorialData = [];

let ultimosPagosCliente = [];
let pagosOpen = true;
let vistaFacturas = false;

let currentViajesClientesPage = 1;

let currentEditingTable = "viajes";
// Regex for input validation
const regexInputs = {
    'comprobante': /^(\d{4}-\d{8}|\d{11})$/
};

let viajesFacturadosContent;
let facturasBtn;
let historialBtn;
let closeButton;
let paginacionContainer;
let backFacturasBtn;
let backHistorialBtn;
let searchInput;
let searchInputFacturas;

let esMonotributista = false;

// Configuración de columnas para la tabla de facturas
export const columnasCuentaCorriente = [
    { label: "Fecha", key: "fecha_pago", class: [] },
    { label: "Tipo", key: "tipo", class: [] },
    { label: "Comprobante", key: "comprobante", class: [] },
    { label: "Concepto", key: "descripcion", class: [] },
    { label: "Fecha Vto", key: "fecha_vto", class: []},
    { label: "Importe", key: "importe", class: ['text-right', 'bold'], modify: (content) => { return `$${content.toFixed(2)}`.replace('$-','-$') } },
    { label: "Saldo", key: "saldo", class: ['text-right', 'bold'],  modify: (content) => { return `$${content.toFixed(2)}`.replace('$-','-$') }},
];

// Acciones para la tabla de viajes
const accionesViajes = [
    {
        icon: "bi bi-pencil",
        tooltip: "Editar viaje",
        classList: ['edit-btn'],
        id: null,
        handler: (item) => {
            enterEditMode({ ...item, clienteCuit: clienteData.cuit }, 'viajesCliente',
                () => renderTables(!esMonotributista? viajesAFacturarData : viajesFacturadosData, currentViajesClientesPage, !esMonotributista? optionsViajes: optionsViajesMonotributista, actualizarTotales), handleSaveEditViajesCliente);
        }
    },
    {
        icon: "bi bi-download",
        tooltip: "Descargar archivos",
        classList: ['navigate-btn'],
        id: null,
        handler: (item) => {
            viaje.push(item);
            initializeFacturaUpload(changeDataFactura,
                (cartaPorteFiles) => cartaPorteFunc(cartaPorteFiles, changeDataDocuments),
                (facturaId) => deleteFactura(facturaId, changeDataDocuments, 'viajeCliente'),
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
                    const currentData = getCurrentData();
                    const filtered = currentData.filter(v => v.id !== item.id);
                    if (currentEditingTable === "viajes") viajesAFacturarData = filtered;
                    else if (currentEditingTable === "viajesFacturados") viajesFacturadosData = filtered;
                    if (esMonotributista){
                        clienteData.balance = redondear(clienteData.balance - redondear(item.importe));
                        renderCurrentTable();
                    } 
                    renderTables(filtered, currentViajesClientesPage, getCurrentOptions(), actualizarTotales);
                    showConfirmModal("Viaje eliminado con éxito");
                } else {
                    const data = await result.json();
                    showConfirmModal(`Error: ${data.message}`);
                }
            })
        }
    }
];

const accionesFacturas = [{
        icon: "bi bi-download",
        tooltip: "Descargar archivos",
        classList: ['navigate-btn'],
        required: ["factura_id"],
        id: null,
        handler: (item) => {
            viaje.push(item);
            initializeFacturaUpload(changeDataFactura,
                null,
                (facturaId) => deleteFactura(item.comprobante, changeDataDocuments, 'facturaCompleta'),
                "viajeCliente", [], false, true);
        }
    }]


const modifyCellEstado = (item, td) => {
    if (item.estado === "Pendiente") td.classList.add("yellow");
    else if (item.estado === "Pagada") td.classList.add("green");
};

function refreshOrReloadFacturas(data = getCurrentData(), page = currentViajesClientesPage) {
    if (vistaFacturas) facturasBtn.click();
    else renderTables(data, page, getCurrentOptions(), actualizarTotales);
}

function closeModalGenerate() {
    const modalGenerate = document.getElementById("documentGenerateModal");
    if (modalGenerate) modalGenerate.remove();
}

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

        const modal = createActionModal('documentGenerateModal', '¿Que acción desea realizar?', [
            { id: 'payViajesBtn',      class: 'btn-primary', label: 'Marcar Viajes como Pagados' },
            { id: 'payFacturasBtn',    class: 'btn-success', label: 'Marcar Facturas como Pagadas' },
            { id: 'uploadDocumentsBtn',class: 'btn-yellow',  label: 'Subir Factura Manualmente', hidden: true },
        ]);

        const payViaje = document.getElementById("payViajesBtn")
        const payFactura = document.getElementById("payFacturasBtn");
        const uploadFactura = document.getElementById("uploadDocumentsBtn");
        const cancelBtn = document.getElementById("modalCancelBtn");

        payViaje.onclick = null;
        payFactura.onclick = null;
        uploadFactura.onclick = null;
        cancelBtn.onclick = null;
        if (vistaFacturas)
            payViaje.classList.add("hidden");       

        payViaje.onclick = () => {
            modal.classList.remove("active");
            showConfirmModal(
                `¿Estás seguro de marcar ${selectedRows.length} viaje(s) como pagado(s)?`,
                "confirm",
                async () => {
                    const viajesToMark = selectedRows.map(row => ({
                        viaje_comprobante: row.comprobante,
                        cliente_cuit: clienteData.cuit
                    }));
                    modal.remove();
                    try {
                        const response = await pagarViajeCliente(viajesToMark);
                        const data = await response.json();
                        if (response.ok) {
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
                            renderTables(viajesFacturadosData, 1, !esMonotributista? optionsViajesFacturados : optionsViajesMonotributista, actualizarTotales);
                        }
                        showConfirmModal(data.message);
                    } catch (error) {
                        console.log(`Error: ${error.message}`);
                    }
                },
                () => {
                    modal.classList.add("active");
                }
            );
        };

        const facturasToMark = Array.from(
            new Set(
                selectedRows
                    .filter(row => row.factura_id && row.estado !== "Pagada")
                    .map(row => row.factura_id)
            )
        );
        
        if (facturasToMark && facturasToMark.length === 0){
            payFactura.disabled = true;
            payFactura.title = "Esta función se encuentra deshabilitada para estos viajes";
        } else {
            payFactura.title = "";
        }

        payFactura.onclick = () => {
            modal.classList.remove("active");
            showConfirmModal(
                `¿Estás seguro de marcar ${selectedRows.length} viaje(s) como pagado(s)?`,
                "confirm",
                async () => {
                    modal.remove();
                    try {
                        const response = await pagarFacturaCliente(facturasToMark, clienteData.cuit);
                        const data = await response.json();
                        if (response.ok) {
                            // Update local data
                            viajesFacturadosData = viajesFacturadosData.map(v => {
                                if (data.idFacturas.some(selected => selected.factura_id === v.factura_id)) {
                                    return { ...v, estado: "Pagada", selected: false };
                                }
                                v.selected = false;
                                return v;
                            });

                            if (vistaFacturas){
                                dataCuentaCorriente.forEach(factura => {
                                    if (data.idFacturas.some(selected => selected.factura_id === factura.factura_id)) {
                                        factura.estado = "Pagada";
                                    }
                                    factura.selected = false;
                                });
                                renderTables(dataCuentaCorriente, 1, optionsCuentaCorriente);
                            } else 
                                renderTables(viajesFacturadosData, 1, !esMonotributista? optionsViajesFacturados : optionsViajesMonotributista, actualizarTotales);
                        }
                        showConfirmModal(data.message);
                    } catch (error) {
                        console.log(`Error: ${error.message}`);
                    }
                },
                () => {
                    modal.classList.add("active");
                }
            );
        };

        const facturasToUpload = selectedRows.filter(row => row.factura_id === null);
        
        if (facturasToUpload && facturasToUpload.length === 0){
            uploadFactura.disabled = true;
            uploadFactura.title = "Esta función se encuentra deshabilitada para estos viajes";
        } else {
            uploadFactura.title = "";
        }

        if (esMonotributista){
            uploadFactura.classList.remove("hidden");
            uploadFactura.onclick = () => {
                modal.remove();
                initializeFacturaUpload(changeDataFactura, null, null, "viajeCliente", facturasToUpload, false);
            }
        }

        cancelBtn.onclick = () => {
            modal.remove();
        }
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

        if (!esMonotributista){
            const modal = createActionModal('documentGenerateModal', '¿Que acción desea realizar?', [
                { id: 'generateDocumentsBtn', class: 'btn-primary', label: 'Generar Factura Automaticamente' },
                { id: 'uploadDocumentsBtn',   class: 'btn-success', label: 'Subir Factura Manualmente' },
            ]);

            const generateFactura = document.getElementById("generateDocumentsBtn");
            const uploadFactura = document.getElementById("uploadDocumentsBtn");
            const cancelBtn = document.getElementById("modalCancelBtn");

            generateFactura.onclick = null;
            uploadFactura.onclick = null;
            cancelBtn.onclick = null;

            generateFactura.onclick = () => {
                modal.classList.remove("active");
                showConfirmModal(
                    `¿Estás seguro de generar la factura para los  ${selectedRows.length} viaje(s) seleccionado(s)?`,
                    "confirm",
                    () => {
                        modal.remove();
                        handleGenerateInvoice(selectedRows);
                    },
                    () => {
                        modal.classList.add("active");
                    }
                );
            };

            uploadFactura.onclick = () => {
                modal.remove();
                initializeFacturaUpload(changeDataFactura, null, null, "viajeCliente", selectedRows);
            }

            cancelBtn.onclick = () => {
                modal.remove();
            }
        } else {
            initializeFacturaUpload(changeDataFactura, null, null, "viajeCliente", selectedRows);
        }
    }
}

const optionsGeneral = {
    containerId: 'clientesViajes-table',
    paginacionContainerId: 'paginacion-viajes',
    checkboxColumnPosition: 'end',
    uploadFactura: null,
    onCheckboxChange: null
}

const optionsViajes = {
    ...optionsGeneral,
    columnas: [columnasViajes.filter(col => !["cargado", "descargado", "comision", "saldo"].includes(col.key)), columnasViajes.filter(col => !["faltante", "importe", "comision", "iva", "saldo"].includes(col.key))],
    itemsPorPagina: () => 8,
    actions: accionesViajes,
    onEdit: (id, field, value) => handleEdit(id, field, value, 'viajesCliente', () => { return tarifasCatac }),
    tableType: 'viajesCliente',
    onPageChange: (page) => { currentViajesClientesPage = page; },
    checkboxColumn: true,
    checkboxHeaderAction: checkboxHeaderActionGenerate,
    useScrollable: false,
};

const optionsViajesFacturados = {
    ...optionsGeneral,
    columnas: [columnasViajes.filter(col => !["cargado", "descargado", "comision", "saldo"].includes(col.key))],
    itemsPorPagina: () => pagosOpen ? 3 : 8,
    actions: [accionesViajes[1]],
    onEdit: null,
    tableType: 'viajesFacturados',
    onPageChange: null,
    checkboxColumn: true,
    checkboxHeaderAction: checkboxHeaderAction,
    useScrollable: true,
    modifyCell: modifyCellEstado
};

const optionsViajesMonotributista = {
    ...optionsGeneral,
    columnas: [columnasViajes.filter(col => !["cargado", "descargado", "comision", "saldo", "iva"].includes(col.key)), columnasViajes.filter(col => !["faltante", "importe", "comision", "iva", "saldo"].includes(col.key))],
    itemsPorPagina: () => 8,
    actions: accionesViajes,
    onEdit: (id, field, value) => handleEdit(id, field, value, 'viajesCliente', () => { return tarifasCatac }),
    tableType: 'viajesCliente',
    onPageChange: null,
    checkboxColumn: true,
    checkboxHeaderAction: checkboxHeaderAction,
    useScrollable: true,
    modifyCell:modifyCellEstado
}

const optionsCuentaCorriente = {
    ...optionsGeneral,
    columnas: [columnasCuentaCorriente],
    itemsPorPagina: () => 8,
    actions: accionesFacturas,
    onEdit: null,
    tableType: 'viajesCliente',
    onPageChange: null,
    checkboxColumn: true,
    checkboxRequired: (item) => {
        return item.factura_id;
    },
    checkboxHeaderAction: checkboxHeaderAction,
    useScrollable: true,
    modifyCell: modifyCellEstado
}

const columnasViajesHistorial = columnasViajes.filter(col => !["cargado", "descargado", "comision", "saldo"].includes(col.key));
const optionsHistorial = {
    ...optionsGeneral,
    get columnas() {
        return !esMonotributista? [columnasViajesHistorial] : [columnasViajesHistorial.filter(col => !["iva"].includes(col.key))]
    },
    itemsPorPagina: () => pagosOpen ? 3 : 8,
    actions: [accionesViajes[1]],
    onEdit: null,
    tableType: 'viajesCliente',
    onPageChange: null,
    checkboxColumn: false,
    checkboxHeaderAction: null,
    useScrollable: true
};

// Acciones para la tabla de pagos
const accionesPagos = [
    {
        icon: "bi bi-trash",
        tooltip: "Eliminar pago",
        classList: ['delete-btn'],
        id: null,
        handler: (item, tr) => {
            showConfirmModal("¿Estás seguro de eliminar este pago?", "delete", async () => {
                const response = await deletePago(item.id, item.tipo);
                const data = await response.json();
                if (!response.ok) {
                    showConfirmModal(data.message);
                    return;
                }
                ultimosPagosCliente = ultimosPagosCliente.filter(p => p.id !== item.id);
                showConfirmModal(data.message);
                clienteData.balance = parseFloat(parseImporte(clienteData.balance) + redondear(item.importe));
                renderTables(ultimosPagosCliente, 1, optionsPagos);
                actualizarTotales(viajesFacturadosData);
                renderCurrentTable();
            });
        }
    }
];

const optionsPagos = {
    containerId: 'pagos-table',
    paginacionContainerId: '',
    columnas: [columnasPagos],
    itemsPorPagina: () => 3,
    actions: accionesPagos,
    onEdit: null,
    tableType: 'pagos',
    onPageChange: null,
    checkboxColumn: false,
    checkboxColumnPosition: 'end',
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: true
};

function getCurrentData() {
    switch (currentEditingTable) {
        case "viajes":
            return viajesAFacturarData;
        case "viajesFacturados":
            return vistaFacturas? dataCuentaCorriente : viajesFacturadosData;
        case "historial":
            return viajesHistorialData;
    }
}

function getCurrentOptions() {
    switch (currentEditingTable) {
        case "viajes":
            return optionsViajes;
        case "viajesFacturados":
            return !esMonotributista? optionsViajesFacturados : optionsViajesMonotributista;
        case "historial":
            return optionsHistorial;
    }
}

export function getClienteCuit() {
    return clienteData.cuit;
}

function changeDataDocuments() {
    switch (currentEditingTable) {
        case 'historial':
            if (viajesHistorialData.length > 0) {
                viajesHistorialData.forEach(v => {
                    if (v.comprobante === viaje[0].comprobante) {
                        v.carta_porte = viaje[0].carta_porte;
                        v.factura_id = viaje[0].factura_id ? viaje[0].factura_id : null;
                    }
                });
            }
            renderTables(viajesHistorialData, 1, optionsHistorial, actualizarTotales);
            break;
        case 'viajesFacturados':
            if (vistaFacturas){
                if (viaje[0].viaje_comprobantes && viaje[0].viaje_comprobantes.length > 0){
                    if (esMonotributista){
                        viajesFacturadosData.forEach(v => {
                            if (viaje[0].viaje_comprobantes.some(c => c === v.comprobante)){
                                v.factura_id = null;
                                v.estado = "Sin Facturar";
                                v.selected = false;
                            }
                        })
                    } else {
                        viajesFacturadosData = viajesFacturadosData.filter(v => {
                            const cond = viaje[0].viaje_comprobantes.some(c => c === v.comprobante);
                            if (cond){
                                v.factura_id = null;
                                const importeTotal = parseImporte(v.importe) + parseImporte(v.iva);
                                clienteData.balance = redondear(parseImporte(clienteData.balance) - importeTotal);
                                viajesAFacturarData.push(v);
                            }
                            return !cond;
                        })
                    }
                }
                dataCuentaCorriente = dataCuentaCorriente.filter(f => f.comprobante !== viaje[0].comprobante);
                normalizeSaldo(dataCuentaCorriente);
                closeModalFactura();
            } else {
                if (viajesFacturadosData.length > 0) {
                    viajesFacturadosData = viajesFacturadosData.filter(v => {
                        if (v.comprobante === viaje[0].comprobante) {
                            v.carta_porte = viaje[0].carta_porte;
                            v.factura_id = viaje[0].factura_id ? viaje[0].factura_id : null;
                            if (!v.factura_id) v.estado = "Sin Facturar";
                            if (!esMonotributista){
                                const importeTotal = parseImporte(v.importe) + parseImporte(v.iva);
                                clienteData.balance = redondear(parseImporte(clienteData.balance) + (viaje[0].factura_id ? importeTotal : -importeTotal));
                            }
                            return esMonotributista || v.factura_id !== null;
                        }
                        return true;
                    });
                }
            }
            if (vistaFacturas)
                renderTables(dataCuentaCorriente, 1, optionsCuentaCorriente, actualizarTotales);
            else
                renderTables(viajesFacturadosData, currentViajesClientesPage, getCurrentOptions(), actualizarTotales);
            renderCurrentTable();
    }
}

function changeDataFactura(facturaId, selectedRows, estado = null) {
    if (!facturaId) {
        console.warn('No se recibió el facturaId en los encabezados');
    } else {
        switch (currentEditingTable) {
            case "viajes":
                clienteData.balance = parseFloat((parseImporte(clienteData.balance) + parseFloat(selectedRows.reduce((sum, viaje) => {
                    const importe = parseImporte(viaje.importe);
                    const iva = clienteData.categoria !== "Monotributista" ? parseImporte(viaje.iva) : 0;
                    return sum + importe + iva;
                }, 0))).toFixed(2));
                viajesAFacturarData = viajesAFacturarData.filter(v => !selectedRows.some(row => row.id === v.id));
                renderTables(viajesAFacturarData, currentViajesClientesPage, optionsViajes, actualizarTotales);
                renderCurrentTable();
                break;
            case "viajesFacturados":
                if (esMonotributista){
                    viajesFacturadosData.forEach(v => {
                        if (selectedRows.some(row => row.comprobante === v.comprobante)){
                            v.factura_id = facturaId;
                            v.estado = estado;
                            v.selected = false;
                        }
                    });
                    refreshOrReloadFacturas();
                }
                break;
            case "historial":
                if (viajesHistorialData.length > 0) {
                    viajesHistorialData.forEach(v => {
                        if (v.comprobante === viaje[0].comprobante) {
                            v.factura_id = facturaId;
                        }
                    });
                }
                refreshOrReloadFacturas();
                break;
            default:
                console.error("Error al actualizar datos al subir la factura");
        }
    }
}

function actualizarTotales(viajes, tablesTab = currentEditingTable) {
    const subtotal = viajes.reduce((sum, viaje) => sum + (redondear(viaje.importe) || 0), 0);
    const iva = esMonotributista ? 0 : viajes.reduce((sum, viaje) => sum + (viaje.iva || 0), 0);
    const totalViajes = subtotal + iva;

    const subtotalContainer = document.getElementById("subtotal");
    if (subtotalContainer)
        if (esMonotributista)
            subtotalContainer.classList.add("hidden");
        else
            subtotalContainer.textContent = `Subtotal: $${subtotal.toFixed(2)}`;

    const ivaContainer = document.getElementById("iva");
    if (ivaContainer) {
        if (esMonotributista) {
            ivaContainer.classList.add('hidden');
        } else {
            ivaContainer.classList.remove('hidden');
            ivaContainer.textContent = `IVA (21%): $${iva.toFixed(2)}`;
        }
    }

    const totalViajesContainer = document.getElementById("total-viajes");
    if (totalViajesContainer)
        totalViajesContainer.textContent = `Total Viajes: $${totalViajes.toFixed(2)}`;

    const totalPagarContainer = document.getElementById("total-cobrar");
    if (totalPagarContainer) {
        if (tablesTab === "historial")
            totalPagarContainer.classList.add('gray');
        else
            totalPagarContainer.classList.remove('gray');
        if (vistaFacturas)
            totalPagarContainer.textContent = `Total Cuenta Corriente: ${dataCuentaCorriente.length > 0? ('$' + dataCuentaCorriente[dataCuentaCorriente.length - 1].saldo).replace('$-', '-$'): '$0.00'}`;
        else
            totalPagarContainer.textContent = `Total a Cobrar: ${`${clienteData.balance}`.includes('$') ? clienteData.balance : ('$' + clienteData.balance).replace('$-', '-$')}`;
    }
}

async function handleSaveEditViajesCliente() {
    const comprobanteOriginal = originalEditingData.comprobante;
    const payload = {
        [comprobanteOriginal]: {
            fecha: stagedEditingData.fecha || null,
            comprobante: stagedEditingData.comprobante || null,
            campo: stagedEditingData.campo || null,
            producto: stagedEditingData.producto || null,
            kilometros: parseInt(stagedEditingData.km) || null,
            tarifa: parseImporte(stagedEditingData.tarifa) || null,
            variacion: parseFloat(stagedEditingData.variacion) > 1 ? parseFloat(stagedEditingData.variacion) / 100 : parseFloat(stagedEditingData.variacion),
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
    if (response.ok) {
        showConfirmModal('Los cambios se realizaron con exito.');
        const dataViajes = getCurrentData();
        const viajeIndex = dataViajes.findIndex(v => v.comprobante === comprobanteOriginal);
        if (viajeIndex !== -1){
            dataViajes[viajeIndex] = parseViaje({ ...payload[comprobanteOriginal], factura_id: stagedEditingData.factura_id, carta_porte: stagedEditingData.carta_porte }, !esMonotributista, false);
            if (esMonotributista){
                if (dataViajes[viajeIndex].importe !== stagedEditingData.importe) clienteData.balance = redondear(clienteData.balance + (dataViajes[viajeIndex].importe - stagedEditingData.importe));
                resetEditingState();
                renderCurrentTable();
            }
            renderTables(dataViajes, 1, getCurrentOptions(), actualizarTotales);
        }
    } else {
        const data = await response.json();
        showConfirmModal(data.message);
    }
}

const setupAddPagoBtn = () => {
    const btn = document.getElementById('addPagoBtn');
    setupChoferAutocomplete('choferCheque', mockChoferes);
    setupClienteAutocomplete('proveedorCheque', mockProveedores);
    const cuitChofer = document.getElementById('choferCheque');
    const cuitProveedor = document.getElementById('proveedorCheque');

    const asignar = document.getElementById('tipoAsignarSelect');
    asignar?.addEventListener('change', () => {
        switch (asignar.value) {
            case 'chofer':
                document.getElementById('asignarChofer')?.classList.remove("hidden");
                document.getElementById('asignarProveedor')?.classList.add("hidden");
                break;
            case 'proveedor':
                document.getElementById('asignarChofer')?.classList.add("hidden");
                document.getElementById('asignarProveedor')?.classList.remove("hidden");
                break;
            default:
                document.getElementById('asignarChofer')?.classList.add("hidden");
                document.getElementById('asignarProveedor')?.classList.add("hidden");
        }
    })

    btn?.addEventListener('click', async () => {
        const tipoPago = document.getElementById('tipoPago')?.value;
        const fechaPagoInput = document.getElementById('fechaPago')?.value;

        const tipoOtro = document.getElementById('tipoOtro');
        const comprobante = document.getElementById('comprobanteOtro');
        const detalle = document.getElementById('detalleOtro');
        const importeOtro = document.getElementById('importeOtro');

        const nroCheque = document.getElementById('nroCheque');
        const tercero = document.getElementById('terceroCheque');
        const destinatario = document.getElementById('destinatarioCheque');
        const importe = document.getElementById('importeCheque');

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
                        fecha_pago: fechaPago,
                        fecha_cheque: fechaCheque,
                        nroCheque: nroCheque?.value,
                        tercero: tercero?.value,
                        destinatario: destinatario?.value,
                        importe: importe?.value,
                        chofer_cuil: cuitChofer?.dataset.selectedChoferCuil,
                        proveedor_cuit: cuitProveedor?.dataset.selectedClienteCuit
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
                        tipo: tipoOtro?.value && tipoOtro?.value !== ''? tipoOtro.value : 'Otro',
                        fecha_pago: fechaPago,
                        comprobante: comprobante?.value,
                        detalle: detalle?.value,
                        importe: importeOtro?.value,
                        proveedor_cuit: null
                    }
                };

                if (!payload.pagos.comprobante) {
                    showConfirmModal('Ingrese el comprobante para el pago');
                    return;
                }

                if (isNaN(payload.pagos.importe)) {
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
            if (response.ok) {
                const data = await response.json();
                showConfirmModal(data.message);
                clienteData.balance = redondear(parseImporte(clienteData.balance) - redondear(payload.pagos.importe));
                ultimosPagosCliente.push(parsePagos({ id: data.pagoId.id, ...payload.pagos }));
                renderTables(ultimosPagosCliente, 1, optionsPagos);
                actualizarTotales(viajesFacturadosData);
                renderCurrentTable();
                [comprobante, detalle, importeOtro, nroCheque, tercero, destinatario, importe, cuitChofer, cuitProveedor].forEach(input => {
                    input.value = '';
                    input.removeAttribute('data-selected-chofer-nombre');
                    input.removeAttribute('data-selected-chofer-cuil')
                    input.removeAttribute('data-selected-cliente-nombre');
                    input.removeAttribute('data-selected-cliente-cuit');
                });
            } else {
                const dataError = await response.json();
                showConfirmModal(dataError.message);
            }
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
        const tarifa = typeof row.tarifa !== "number" ? parseFloat(row.tarifa?.replace(/[^0-9.]/g, '')) : row.tarifa; // Clean tarifa
        const importe = typeof row.importe !== "number" ? parseFloat(row.importe?.replace(/[^0-9.]/g, '')) : row.importe; // Clean importe
        const iva = typeof row.iva !== "number" ? parseFloat(row.iva?.replace(/[^0-9.]/g, '')) : row.iva; // Clean iva
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

    const servicios = await Promise.all(selectedRows.map(async (row, index) => {
        const importe = typeof row.importe !== "number" ? parseFloat(row.importe?.replace(/[^0-9.]/g, '')) : row.importe; // Clean importe
        const iva = typeof row.iva !== "number" ? parseFloat(row.iva?.replace(/[^0-9.]/g, '')) : row.iva; // Clean iva
        const subtotal = importe; // Importe is the subtotal
        const subtotalConIVA = (importe + iva).toFixed(2); // Subtotal + IVA
        const tarifa = typeof row.tarifa !== "number" ? parseFloat(row.tarifa?.replace(/[^0-9.]/g, '')) : row.tarifa; // Clean tarifa
        let choferNombre = '';
        try {
            const response = await getViajeComprobante(row.comprobante);
            const data = await response.json();
            if (response.ok)
                choferNombre = ` CHOFER ${data.nombre}`;
            else
                console.log(data.message);
        } catch (error) {
            console.error("Error al obtener el nombre del chofer:", error);
        }


        function formatearCodigo(codigo) {
            let codigoStr = String(codigo);
            return codigoStr.padStart(2, '0');
        }

        return {
            codigo: `${formatearCodigo(index + 1)}`,
            descripcion: `FLETE ${row.producto} ${row.comprobante.length !== 13 ? "CTG" : "CRE"} ${row.comprobante}${choferNombre} CAMPO ${row.campo || 'Sin campo'} KM ${row.km}`.toUpperCase(),
            cantidad: parseFloat(row.toneladas).toFixed(2), // Per trip; change to row.cargado if billing by tonnage
            unidad: 'Toneladas',
            precioUnit: (tarifa - (tarifa * parseFloat(row.variacion.replace('%', '')))).toFixed(2),
            bonif: '0.00',
            subtotal: subtotal.toFixed(2),
            ivaId: 5, // 21% IVA
            subtotalConIVA: subtotalConIVA
        };
    }));

    const fechaHoy = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Argentina/Buenos_Aires"}));
    const primerDiaMes = new Date(fechaHoy.getFullYear(), fechaHoy.getMonth(), 1);
    const fechaVencimiento = new Date(fechaHoy);
    fechaVencimiento.setMonth(fechaHoy.getMonth() + 1);

    const invoiceData = {
        ptoVta: 2,
        docNro: selectedClientCUIT,
        comprobante: selectedRows.map(r => ({ id: r.id })),
        servicios,
        tributos: [],
        fechaEmision: formatDate(fechaHoy), // AAAAMMDD
        periodoDesde: formatDate(primerDiaMes), // DD/MM/YYYY
        periodoHasta: formatDate(fechaHoy), // DD/MM/YYYY
        fechaVtoPago: formatDate(fechaVencimiento), // 30 days
        condicionVenta: 'Cuenta Corriente'
    };

    console.log('Invoice data to send:', JSON.stringify(invoiceData, null, 2));

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        showConfirmModal('Error: No se encontró token de autenticación. Por favor, inicia sesión nuevamente.');
        return;
    }
    changeSpinnerText(mainContent, "Generando Factura...");
    toggleSpinnerVisible(mainContent);
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
        }

        await changeDataFactura(facturaId, selectedRows);
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
    toggleSpinnerVisible(mainContent);
    changeSpinnerText(mainContent);
}

// Date formatting helper
function formatDate(date, separator = '') {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return separator ? `${day}${separator}${month}${separator}${year}` : `${year}${month}${day}`;
}

function setupTabSelectorCliente() {
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

async function setUltimosPagos(cantidad) {
    const responsePagos = await getPagosCliente(clienteData.cuit, cantidad);
    if (responsePagos.ok) {
        const data = await responsePagos.json();
        ultimosPagosCliente = data.map(p => {
            return parsePagos(p);
        });
        renderTables(ultimosPagosCliente, 1, optionsPagos);

    } else {
        showConfirmModal("No se obtuvieron los ultimos pagos del cliente");
    }
}

async function renderViajesClienteIVA(selectedTab){
    try {
        if (selectedTab === 'aFacturar') {
            const response = await getViajesCliente(clienteData.cuit, false, null);
            if (response.ok) {
                backFacturasBtn.click();
                backHistorialBtn.click();
                historialBtn.classList.add("hidden");
                facturasBtn.classList.add("hidden");
                viajesFacturadosContent.classList.add('hidden');
                document.getElementById("total-cobrar")?.classList.add("hidden");
                const data = await response.json();
                viajesAFacturarData = data.viajes.map(c => parseViaje(c, true, false));
                paginacionContainer.classList.remove("hidden");
                currentEditingTable = "viajes";
                await renderTables(viajesAFacturarData, 1, optionsViajes, actualizarTotales);
            } else {
                showConfirmModal("Ocurrio un error al cargar los viajes del cliente");
                closeButton.click();
            }
        } else if (selectedTab === 'facturados') {
            const response = await getViajesCliente(clienteData.cuit, true, null);
            if (response.ok) {
                backFacturasBtn.click();
                backHistorialBtn.click();
                paginacionContainer.classList.add("hidden");
                viajesFacturadosContent.classList.remove('hidden');
                document.getElementById("total-cobrar")?.classList.remove("hidden");
                const data = await response.json();
                viajesFacturadosData = data.viajes.map(c => parseViaje(c, true, false));
                currentEditingTable = "viajesFacturados";
                await renderTables(viajesFacturadosData, 1, optionsViajesFacturados, actualizarTotales);
            } else {
                showConfirmModal("Ocurrio un error al cargar los viajes del cliente");
                closeButton.click();
            }

            const selectPagos = document.getElementById("selectPagos");
            const selectCantidad = selectPagos?.value !== "Otro" ? selectPagos.value : document.getElementById('inputSelectPago')?.value;
            await setUltimosPagos(selectCantidad);
        }
    } catch (error) {
        console.log(error.message);
        closeButton.click();
    }
}

async function renderViajesClienteSinIVA(){
    document.getElementById('facturasSelector').classList.add("hidden");
    try {
        const response = await getViajesCliente(clienteData.cuit, null, null);
        if (response.ok) {
            viajesFacturadosContent.classList.remove('hidden');
            backFacturasBtn.click();
            backHistorialBtn.click();
            paginacionContainer.classList.add('hidden');
            const data = await response.json();
            viajesFacturadosData = data.viajes.map(c => parseViaje(c, false, false));
            currentEditingTable = "viajesFacturados";
            await renderTables(viajesFacturadosData, 1, optionsViajesMonotributista, actualizarTotales);
        } else {
            showConfirmModal("Ocurrio un error al cargar los viajes del cliente");
            closeButton.click();
        }
        const selectPagos = document.getElementById("selectPagos");
        const selectCantidad = selectPagos?.value !== "Otro" ? selectPagos.value : document.getElementById('inputSelectPago')?.value;
        await setUltimosPagos(selectCantidad);
    } catch (error) {
        console.log(error.message);
        closeButton.click();
    }
}

async function handleTabContentDisplay(selectedTab) {
    viajesFacturadosContent = document.getElementById('content-viajes-facturados');
    facturasBtn = document.getElementById("facturas");
    historialBtn = document.getElementById("historial");
    paginacionContainer = document.getElementById("paginacion-viajes");
    backFacturasBtn = document.getElementById("back-facturasBtn");
    backHistorialBtn = document.getElementById("back-historialBtn");
    searchInput = document.getElementById('searchInput');
    searchInputFacturas = document.getElementById('searchInputFacturas');

    if (searchInput) searchInput.value = '';
    if (searchInputFacturas) searchInputFacturas.value = '';

    toggleSpinnerVisible(mainContent);
    try {
        if (!esMonotributista)
            await renderViajesClienteIVA(selectedTab);
        else
            await renderViajesClienteSinIVA();
        
    } catch (error) {
        closeButton.click();
    }
    toggleSpinnerVisible(mainContent);
}

async function setHistorial() {
    const selectCantidad = document.getElementById("selectResumenes");
    const cantidad = selectCantidad.value !== "Otro" ? selectCantidad.value : document.getElementById('inputSelectViaje')?.value;
    if (!cantidad) {
        showConfirmModal("Seleccione una cantidad de resúmenes válida.");
        return;
    }

    try {
        const response = await getViajesCliente(clienteData.cuit, clienteData.categoria !== "Monotributista"? true : null, cantidad, true);
        const data = await response.json();
        if (!response.ok) {
            showConfirmModal("Error al cargar el historial del cliente");
            viajesHistorialData = null;
            return;
        }

        viajesHistorialData = data.viajes.map(c => parseViaje(c, !esMonotributista, false));

        currentEditingTable = "historial";
        renderTables(viajesHistorialData, 1, optionsHistorial, actualizarTotales);
    } catch (error) {
        console.error('Error en setHistorial:', error.message);
    }
}

function normalizeSaldo(data){
    if (!Array.isArray(data) || data.length === 0) return;
    data.sort((a, b) => new Date(a.fecha_pago) - new Date(b.fecha_pago));
    data[0].saldo = data[0].importe;
    for (let i = 1; i < data.length; i++){
        data[i].saldo = redondear(data[i-1].saldo + data[i].importe);
    }
}

// Inicializar
export async function inicializarModaCliente(data) {
    document.body.classList.add("no-scroll");
    clienteData = data;

    cargarNombreChofer(clienteData.nombre);
    esMonotributista = clienteData.categoria === "Monotributista";
    pagosOpen = true;
    closeButton = document.getElementById("closeBtnViaje");

    if (closeButton) {
        closeButton.onclick = () => {

            deleteModal("viajesClientesModal", "contentModalViajes", () => {
                viajesFacturadosData = [];
                viajesAFacturarData = [];
                dataCuentaCorriente = [];
                clienteData = [];
                viajesHistorialData = [];
                currentViajesClientesPage = 1;
                viajesFacturadosContent = null;
                historialBtn = null;
                paginacionContainer = null;
                backHistorialBtn = null;
                esMonotributista = false;
                

                socket.off('nuevoViaje');
                socket.off('nuevoCartaPorte');
                socket.off('actualizarFacturaCliente');
                socket.off('deleteViaje');
                socket.off('deleteFactura');
                socket.off('payFactura');
                socket.off('deleteCliente', manejarDeleteCliente);
                socket.off('deleteCartaPorte');
                socket.off('deletePagoCliente');
                socket.off('updateCliente', manejarUpdateCliente);
                socket.off('updatePagados');
                socket.off('nuevoPago');
                
            });

        };
    }

    mainContent = document.getElementById('content-clientesViajes');

    createLoadingSpinner(mainContent);

    const fields = {
        cheque: document.getElementById('chequeFields'),
        otro: document.getElementById('otroFields')
    };

    function manejarDeleteCliente(client) {
        if (client.cuit === clienteData.cuit) {
            closeModalFactura();
            document.getElementById('documentGenerateModal')?.remove();
            showConfirmModal(`El cliente ${clienteData.nombre} fue eliminado`);
            closeButton.click();
        }
    }
    socket.on('deleteCliente', manejarDeleteCliente);

    async function manejarUpdateCliente(client) {
        if (client && client.cuitOriginal === clienteData.cuit) {
            console.log(`Cliente con cuit ${client.cuitOriginal} modificado`);
            closeModalFactura();
            if (currentEditingTable === "viajes" && editingRowId) resetEditingState();
            await renderTables(getCurrentData(), currentViajesClientesPage, getCurrentOptions(), actualizarTotales);
            showConfirmModal("Se actualizaron los datos del cliente");
        }
    }
    socket.on('updateCliente', manejarUpdateCliente);

    function setCartaPorte(cartaPorte, setValue) {
        let viajeEditado = false;
        let currentData = getCurrentData();
        currentData.forEach(viaje => {
            if (viaje.comprobante === cartaPorte.comprobante) {
                viaje.carta_porte = setValue;
                viajeEditado = true;
            }
        });

        if (!viajeEditado && currentEditingTable === "historial") {
            viajesFacturadosData.forEach(viaje => {
                if (viaje.comprobante === cartaPorte.comprobante) {
                    viaje.carta_porte = setValue;
                    viajeEditado = true;
                }
            });
        }

        if (viajeEditado) {
            if (viaje.length > 0 && viaje[0].id === cartaPorte.comprobante) {
                viaje[0].carta_porte = setValue;
                updateViajeStatus();
            }
            showConfirmModal("Se actualizaron los documentos del cliente");
            if (currentEditingTable === "viajes" && editingRowId) return;
            if (vistaFacturas)
                return;
            else
                renderTables(currentData, currentViajesClientesPage, getCurrentOptions(), actualizarTotales);
        }
    }

    socket.on('nuevoCartaPorte', (cartaPorte) => {
        setCartaPorte(cartaPorte, true);
    });

    socket.on('deleteCartaPorte', (cartaPorte) => {
        if (cartaPorte.cuit === clienteData.cuit) {
            setCartaPorte(cartaPorte, false);
        }
    });

    socket.on('updatePagados', (pagados) => {
        if (pagados.cuit === clienteData.cuit && currentEditingTable !== "viajes") {
            viajesFacturadosData = viajesFacturadosData.filter(viaje => {
                if (pagados.viajesPagados.includes(viaje.comprobante))
                    viajesHistorialData.push(viaje);
                return !pagados.viajesPagados.includes(viaje.comprobante);
            });
            showConfirmModal("Se actualizaron los viajes del cliente");
            closeModalGenerate();
            refreshOrReloadFacturas();
        }
    });

    socket.on('nuevoPago', async (pago) => {
        if (pago.cuit === clienteData.cuit) {
            pago.pagosArray.forEach(p => {
                ultimosPagosCliente.push(parsePagos(p));
                const pagoParseadoCorriente = parsePagos(p, true);
                pagoParseadoCorriente.importe = - pagoParseadoCorriente.importe;
                dataCuentaCorriente.push(pagoParseadoCorriente);
                clienteData.balance = redondear(parseImporte(clienteData.balance) - redondear(p.importe));
            });
            if (vistaFacturas){
                normalizeSaldo(dataCuentaCorriente);
                renderTables(dataCuentaCorriente, 1, optionsCuentaCorriente, actualizarTotales);
            }
            await renderTables(ultimosPagosCliente, 1, optionsPagos);
            showConfirmModal("Se actualizaron los pagos del cliente");
            if (currentEditingTable !== "viajes")
                actualizarTotales(viajesFacturadosData);
            renderCurrentTable();
        }
    });

    socket.on('deletePagoCliente', async (pago) => {
        if (pago.cuit && pago.cuit === clienteData.cuit) {
            clienteData.balance = redondear(parseImporte(clienteData.balance) + redondear(pago.importe));
            ultimosPagosCliente = ultimosPagosCliente.filter(p => {
                const cond = p.id === pago.id && p.tipo === pago.tipo;
                return !cond;
            });

            if (vistaFacturas){
                dataCuentaCorriente = dataCuentaCorriente.filter(p => {
                    const cond = p.id === pago.id && p.tipo === pago.tipo;
                    return !cond;
                });
                normalizeSaldo(dataCuentaCorriente);
                renderTables(dataCuentaCorriente, 1, optionsCuentaCorriente, actualizarTotales);
            }

            await renderTables(ultimosPagosCliente, 1, optionsPagos);
            showConfirmModal("Se actualizaron los pagos del cliente");
            if (currentEditingTable !== "viajes")
                actualizarTotales(viajesFacturadosData);
            renderCurrentTable();
        }
    });

    socket.on('deleteViaje', async (viaje) => {
        if (viaje.cuit !== clienteData.cuit) return;

        if (esMonotributista && currentEditingTable === "viajesFacturados") {
            const length = viajesFacturadosData.length;
            let viajeEliminado = null;
            viajesFacturadosData = viajesFacturadosData.filter(v => {
                const viajeAEliminar = v.id === viaje.comprobante;
                if (viajeAEliminar) viajeEliminado = v;
                return !viajeAEliminar;
            });

            if (length !== viajesFacturadosData.length) {
                clienteData.balance = redondear(clienteData.balance - viajeEliminado.importe);
                showConfirmModal("Se actualizaron los viajes del cliente");
                renderTables(viajesFacturadosData, currentViajesClientesPage, getCurrentOptions(), actualizarTotales);
                closeModalGenerate();
                renderCurrentTable();
            }
        } else if (!esMonotributista && currentEditingTable === "viajes") {
            const length = viajesAFacturarData.length;
            viajesAFacturarData = viajesAFacturarData.filter(v => v.id !== viaje.comprobante);
            if (length !== viajesAFacturarData.length) {
                showConfirmModal("Se actualizaron los viajes del cliente");
                if (editingRowId){
                    if (editingRowId === viaje.comprobante)
                        resetEditingState();
                    else
                        return;
                }
                closeModalGenerate();
                renderTables(viajesAFacturarData, currentViajesClientesPage, getCurrentOptions(), actualizarTotales);
            }
        }
    });

    socket.on('nuevoViaje', async (viaje) => {
        if (viaje.cuit !== clienteData.cuit) return;

        viaje.variacion = 0;
        if (esMonotributista) {
            let viajeParseado = parseViaje(viaje, false, false);
            viajesFacturadosData.push(viajeParseado);
            clienteData.balance = redondear(clienteData.balance + viajeParseado.importe);
            renderCurrentTable();
        } else if (!esMonotributista && currentEditingTable === "viajes") {
            viajesAFacturarData.push(parseViaje(viaje, true, false));
            
        }
        showConfirmModal("Se actualizaron los viajes del cliente");
        if (editingRowId) return;
        refreshOrReloadFacturas();
    });

    socket.on('updateViajeCliente', async (viaje) => {
        if (viaje.updatedData.cuit !== clienteData.cuit) return;
        const activeTable = esMonotributista ? "viajesFacturados" : "viajes";
        if (currentEditingTable === activeTable) {
            const data = esMonotributista ? viajesFacturadosData : viajesAFacturarData;
            const index = data.findIndex(v => v.comprobante === viaje.comprobanteOriginal);
            if (index !== -1) {
                console.log(`Se modifico el viaje con comprobante ${viaje.comprobanteOriginal}`);
                let amountBefore = redondear(data[index].importe)
                data[index] = parseViaje(viaje.updatedData, !esMonotributista, false);
                if (esMonotributista && amountBefore !== data[index].importe){
                    clienteData.balance = redondear(clienteData.balance + (data[index].importe - amountBefore));
                    renderCurrentTable();
                }

                if (editingRowId) {
                    if (editingRowId === viaje.comprobanteOriginal)
                        resetEditingState();
                    else
                        return;
                }
                closeModalGenerate();
                showConfirmModal("Se actualizaron los viajes del cliente");
                refreshOrReloadFacturas(data);
            }
        }
    });

    socket.on('payFactura', async (facturas) => {
        if (facturas.cuit !== clienteData.cuit || currentEditingTable == "viajes") return;

        const currentData = getCurrentData();
        currentData.forEach(viaje => {
            if (facturas.facturasPagadas.some(factura => factura.factura_id === viaje.factura_id))
                viaje.estado = "Pagada";
        });

        if (vistaFacturas){
            dataCuentaCorriente.forEach(f => {
                if (facturas.facturasPagadas.some(factura => factura.factura_id === f.factura_id))
                    f.estado = "Pagada";
            });
            return renderTables(dataCuentaCorriente, 1, optionsCuentaCorriente);
        }
        renderTables(currentData, 1, getCurrentOptions());
    });


    const selectPagosCantidad = document.getElementById("selectPagos");
    const pagosHeader = document.getElementById('headerPagos');
    const tablaPagos = document.getElementById('pagos-table');
    const clienteAddPago = document.getElementById('cliente-pagos-wrapper');
    const togglePagosArea = document.getElementById('togglePagosArea');

    // Toggle pagos area
    togglePagosArea?.addEventListener('click', () => {
        togglePagosArea.classList.toggle('active');
        pagosHeader.classList.toggle('hidden');
        tablaPagos.classList.toggle('hidden');
        clienteAddPago.classList.toggle('hidden');
        if (searchInput) searchInput.value = '';
        pagosOpen = !pagosOpen;
        renderTables(getCurrentData(), 1, getCurrentOptions(), actualizarTotales);
    });


    try {
        setupTabSelectorCliente();
        setupSearchBar("clientesViajesSearchBar",
            (searchTerm) => {
                currentViajesClientesPage = 1;
                let currentData = getCurrentData();
                return currentData.filter(viaje =>
                    formatFecha(viaje.fecha)?.includes(searchTerm) ||
                    viaje.comprobante?.toLowerCase().includes(searchTerm) ||
                    viaje.campo?.toLowerCase().includes(searchTerm)
                );
            },
            (filteredData) => renderTables(filteredData, 1, getCurrentOptions(), actualizarTotales)
        );
        setupSearchBar("clientesFacturasSearchBar",
            (searchTerm) => {
                return dataCuentaCorriente.filter(factura =>
                    formatFecha(factura.fecha_pago)?.includes(searchTerm) ||
                    factura.tipo?.toLowerCase().includes(searchTerm) ||
                    factura.comprobante?.toLowerCase().includes(searchTerm) ||
                    formatFecha(factura.fecha_vto)?.includes(searchTerm) ||
                    factura.descripcion?.toLowerCase().includes(searchTerm) || 
                    factura.importe?.toString().includes(searchTerm)
                );
            },
            (filteredData) => {
                if (filteredData.length > 0) normalizeSaldo(filteredData);
                const totalBox = document.getElementById('total-cobrar');
                renderTables(filteredData, 1, optionsCuentaCorriente);
                totalBox.textContent = `Total Cuenta Corriente: ${filteredData.length > 0? ('$' + filteredData[filteredData.length - 1].saldo).replace('$-', '-$'): '$0.00'}`;
            }
        )
        setupAddPagoBtn();
        setupPaymentTypeSelector(fields);

        const headerModal = document.getElementById("headerModal");
        const selectCantidad = document.getElementById("selectResumenes");
        const summaryBoxes = document.getElementById('summaryBoxes');
        const inputCantPagos = document.getElementById('inputSelectPago');
        const inputCantViajes = document.getElementById('inputSelectViaje');

        socket.on('actualizarFacturaCliente', async (factura) => {
            console.log(factura);
            if (factura.cuit !== clienteData.cuit) return;
            closeModalFactura();
            closeModalGenerate();
            changeSpinnerText(mainContent, "Actualizando datos del cliente...");
            toggleSpinnerVisible(mainContent);
            clienteData.balance = parseImporte(factura.balance);
            renderCurrentTable();
            if (vistaFacturas) backFacturasBtn.click();
            const errorMsg = "Ocurrio un error al actualizar los datos del cliente";
            const onError = () => closeButton.click();

            try {
                if (!esMonotributista) {
                    // Recargar viajes a facturar (solo para no-Monotributista)
                    const response = await getViajesCliente(clienteData.cuit, false, null);
                    if (!response.ok) return showConfirmModal(errorMsg, "aviso", onError);
                    const data = await response.json();
                    viajesAFacturarData = data.viajes.map(c => parseViaje(c, true, false));
                }

                // Recargar viajes facturados
                const responseFacturados = await getViajesCliente(clienteData.cuit, esMonotributista ? null : true, null);
                if (!responseFacturados.ok) return showConfirmModal(errorMsg, "aviso", onError);
                const dataFacturados = await responseFacturados.json();
                viajesFacturadosData = dataFacturados.viajes.map(c => parseViaje(c, !esMonotributista, false));

                // Recargar historial
                inputCantViajes.value = '';
                selectCantidad.value = "10";
                const responseHistorial = await getViajesCliente(clienteData.cuit, esMonotributista ? null : true, selectCantidad.value, true);
                if (!responseHistorial.ok) return showConfirmModal(errorMsg, "aviso", onError);
                const dataHistorial = await responseHistorial.json();
                viajesHistorialData = dataHistorial.viajes.map(c => parseViaje(c, !esMonotributista, false));
                showConfirmModal("Se actualizaron las facturas del Cliente");
            } catch (error) {
                console.error(error.message, error.stack);
                return showConfirmModal(errorMsg, "aviso", onError);
            }

            await renderTables(getCurrentData(), currentViajesClientesPage, getCurrentOptions(), actualizarTotales);
            toggleSpinnerVisible(mainContent);
            changeSpinnerText(mainContent);

        });

        const cardPagos = document.getElementById("addPagoCard");
        document.getElementById("agregar-pago")?.addEventListener("click", () => {
            cardPagos.classList.toggle('hidden');
        });

        selectPagosCantidad?.addEventListener("change", () => {
            if (selectPagosCantidad.value !== "Otro") {
                inputCantPagos.classList.add('hidden');
                inputCantPagos.value = '';
                setUltimosPagos(selectPagosCantidad.value);
            } else {
                inputCantPagos.classList.remove('hidden');
            }
        })

        inputCantPagos?.addEventListener("change", () => {
            if (inputCantPagos.value > 0)
                setUltimosPagos(inputCantPagos.value);
        })


        selectCantidad?.addEventListener("change", () => {
            if (selectCantidad.value !== "Otro") {
                inputCantViajes.classList.add("hidden");
                inputCantViajes.value = '';
                historialBtn.click();
            } else
                inputCantViajes.classList.remove("hidden");
        })

        inputCantViajes?.addEventListener("change", () => {
            historialBtn.click();
        })

        facturasBtn?.addEventListener("click", async () =>{
            vistaFacturas = true;
            changeSpinnerText(mainContent, "Cargando datos Cuenta Corriente...");
            toggleSpinnerVisible(mainContent);
            document.getElementById('content-viajes-facturados')?.classList.add("hidden");
            document.getElementById('summaryBoxes')?.classList.add("hidden");
            try {
                const response = await getFacturasData(null, clienteData.cuit);
                const dataFacturas = await response.json();
                const responsePagos = await getPagosCliente(clienteData.cuit, null);
                const dataTotalPagos = await responsePagos.json();
                dataCuentaCorriente = [];
                if (response.ok && responsePagos.ok && (dataFacturas.facturasData.length > 0 || dataTotalPagos.length > 0)){
                    dataFacturas.facturasData.forEach(factura => {
                        const facturaParseada = parsePagos(factura, true);
                        facturaParseada.estado = factura.estado;
                        facturaParseada.factura_id = factura.id;
                        facturaParseada.viaje_comprobantes = factura.viaje_comprobantes;
                        dataCuentaCorriente.push(facturaParseada);
                    });

                    dataTotalPagos.forEach(pago => {
                        const pagoParseado = parsePagos(pago, true);
                        pagoParseado.importe = - pagoParseado.importe;
                        dataCuentaCorriente.push(pagoParseado);
                    });

                    await normalizeSaldo(dataCuentaCorriente);

                    renderTables(dataCuentaCorriente, 1, optionsCuentaCorriente, actualizarTotales);
                    backFacturasBtn.classList.remove("hidden");
                    facturasBtn.classList.add("hidden");
                    document.getElementById("clientesViajesSearchBar")?.classList.add("hidden");
                    document.getElementById("clientesFacturasSearchBar")?.classList.remove("hidden");
                } else {
                    renderTables(dataCuentaCorriente, 1, optionsCuentaCorriente, actualizarTotales);
                }
            } catch (error){
                showConfirmModal("Ocurrio un error al obtener los datos de la Cuenta Corriente del cliente");
                console.log(error);
                backFacturasBtn.click();
            } finally {
                toggleSpinnerVisible(mainContent);
                changeSpinnerText(mainContent);
                
            }
        });

        backFacturasBtn?.addEventListener("click", () =>{
            backFacturasBtn.classList.add("hidden");
            facturasBtn.classList.remove("hidden");
            vistaFacturas = false;
            document.getElementById('content-viajes-facturados')?.classList.remove("hidden");
            document.getElementById('summaryBoxes')?.classList.remove("hidden");
            document.getElementById("clientesViajesSearchBar")?.classList.remove("hidden");
            document.getElementById("clientesFacturasSearchBar")?.classList.add("hidden");
            renderTables(getCurrentData(), 1, getCurrentOptions(), actualizarTotales);
        })

        historialBtn?.addEventListener("click", async () => {
            changeSpinnerText(mainContent, "Cargando historial...");
            toggleSpinnerVisible(mainContent);
            backFacturasBtn.click();
            facturasBtn.classList.add("hidden");
            summaryBoxes.classList.add("hidden");
            if (pagosOpen && currentEditingTable !== "historial") togglePagosArea.click();
            await setHistorial();
            toggleSpinnerVisible(mainContent);
            changeSpinnerText(mainContent);
            document.getElementById("back-historial").classList.remove("hidden");
            headerModal.textContent = "Viajes - Historial";
            historialBtn.classList.add("hidden");
            if (!viajesHistorialData) {
                backHistorialBtn?.click();
            }
        });

        backHistorialBtn?.addEventListener("click", () => {
            document.getElementById("back-historial").classList.add("hidden");
            headerModal.textContent = "Viajes";
            historialBtn.classList.remove("hidden");
            currentEditingTable = "viajesFacturados";
            renderTables(viajesFacturadosData, 1, esMonotributista? optionsViajesMonotributista : optionsViajesFacturados, actualizarTotales);
            summaryBoxes.classList.remove("hidden");
            facturasBtn.classList.remove("hidden");
        });

    } catch (error) {
        console.error('Error de red o desconocido al obtener datos de los viajes:', error);
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    } finally {
        toggleSpinnerVisible(mainContent);
    }
}