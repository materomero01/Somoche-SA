import { cargarNombreChofer, deleteModal, cartaPorteFunc, deleteFactura, setupPaymentTypeSelector, validateInputs } from "./viajes-pagos.js";
import { mockChoferes, mockProveedores, renderCurrentTable, setupSearchBar } from "./choferes-clientes.js";
import { generarFactura, getViajesCliente, deleteViaje, getPagosCliente, setupChoferAutocomplete, addPagos, deletePago, pagarViajeCliente, updateViaje, socket, getViajeComprobante, tarifasCatac, setupClienteAutocomplete } from "./api.js";
import { changeSpinnerText, createLoadingSpinner, showConfirmModal, toggleSpinnerVisible } from "./apiPublic.js";
import { renderTables, originalEditingData, resetEditingState, stagedEditingData, editingRowId, enterEditMode, handleEdit } from "./tabla.js";
import { columnasPagos, columnasViajes, formatFecha, parsePagos, parseViaje, parseImporte } from "./resumenes.js";
import { viaje, initializeFacturaUpload, updateViajeStatus, closeModalFactura } from "./subir-factura.js";

let mainContent;

let clienteData = [];
let viajesFacturadosData = [];
let viajesAFacturarData = [];

let viajesHistorialData = [];

let ultimosPagosCliente = [];
let pagosOpen = true;

let currentViajesClientesPage = 1;

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
            enterEditMode({ ...item, clienteCuit: clienteData.cuit }, 'viajesCliente',
                () => renderTables(viajesAFacturarData, currentViajesClientesPage, optionsViajes, actualizarTotales), handleSaveEditViajesCliente);
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
                    viajesAFacturarData = viajesAFacturarData.filter(v => v.id !== item.id);
                    renderTables(viajesAFacturarData, currentViajesClientesPage, optionsViajes, actualizarTotales);
                    showConfirmModal("Viaje eliminado con éxito");
                } else {
                    const data = await result.json();
                    showConfirmModal(`Error: ${data.message}`);
                }
            })
        }
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
                        renderTables(viajesFacturadosData, 1, optionsViajesFacturados, actualizarTotales);
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

        const modal = document.createElement('div');
        modal.id = 'documentGenerateModal';
        modal.className = 'modal';
        modal.classList.add('active');
        modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <h2 style="margin-top: 0"> ¿Que acción desea realizar? </h2>
            <div class="modal-actions-vertical">
                <button id="generateDocumentsBtn" class="btn btn-primary">Generar Factura Automaticamente</button>
                <button id="uploadDocumentsBtn" class="btn btn-success">Subir Factura Manualmente</button>   
            </div>
            <button id="modalCancelBtn" class="btn btn-danger" style="margin-top: 12px;">Cancelar</button>
        </div>
        `;
        document.body.appendChild(modal);

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
    useScrollable: false
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
    useScrollable: true
};

const optionsHistorial = {
    ...optionsGeneral,
    columnas: [columnasViajes.filter(col => !["cargado", "descargado", "comision", "saldo"].includes(col.key))],
    itemsPorPagina: () => pagosOpen ? 3 : 8,
    actions: accionesViajes[1],
    onEdit: null,
    tableType: 'viajesCliente',
    onPageChange: null,
    checkboxColumn: false,
    checkboxHeaderAction: checkboxHeaderAction,
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
                clienteData.balance = parseImporte(clienteData.balance) + parseFloat(parseImporte(item.importe));
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
            return viajesFacturadosData;
        case "historial":
            return viajesHistorialData;
    }
}

function getCurrentOptions() {
    switch (currentEditingTable) {
        case "viajes":
            return optionsViajes;
        case "viajesFacturados":
            return optionsViajesFacturados;
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
            if (viajesFacturadosData.length > 0) {
                viajesFacturadosData = viajesFacturadosData.filter(v => {
                    if (v.comprobante === viaje[0].comprobante) {
                        v.carta_porte = viaje[0].carta_porte;
                        v.factura_id = viaje[0].factura_id ? viaje[0].factura_id : null;
                        clienteData.balance = parseFloat((parseImporte(clienteData.balance) + (viaje[0].factura_id ? parseImporte(v.importe) + parseImporte(v.iva) : -(parseImporte(v.importe) + parseImporte(v.iva)))).toFixed(2));
                        return v.factura_id !== null;
                    }
                    return true;
                });
            }
            renderTables(viajesFacturadosData, currentViajesClientesPage, optionsViajesFacturados, actualizarTotales);
            renderCurrentTable();
    }
}

function changeDataFactura(facturaId, selectedRows) {
    if (!facturaId) {
        console.warn('No se recibió el facturaId en los encabezados');
    } else {
        switch (currentEditingTable) {
            case "viajes":
                clienteData.balance = parseImporte(clienteData.balance) + parseFloat(selectedRows.reduce((sum, viaje) => sum + (parseImporte(viaje.importe) + parseImporte(viaje.iva) || 0), 0).toFixed(2));
                viajesAFacturarData = viajesAFacturarData.filter(v => !selectedRows.some(row => row.id === v.id));
                renderTables(viajesAFacturarData, currentViajesClientesPage, optionsViajes, actualizarTotales);
                renderCurrentTable();
                break;
            case "historial":
                if (viajesHistorialData.length > 0) {
                    viajesHistorialData.forEach(v => {
                        if (v.comprobante === viaje[0].comprobante) {
                            v.factura_id = facturaId;
                        }
                    });
                }
                renderTables(viajesHistorialData, 1, optionsHistorial, actualizarTotales);
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
    if (totalPagarContainer) {
        if (tablesTab === "historial")
            totalPagarContainer.classList.add('gray');
        else
            totalPagarContainer.classList.remove('gray');
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
        const viajeIndex = viajesAFacturarData.findIndex(v => v.comprobante === comprobanteOriginal);
        if (viajeIndex !== -1)
            viajesAFacturarData[viajeIndex] = parseViaje({ ...payload[comprobanteOriginal], factura_id: stagedEditingData.factura_id, carta_porte: stagedEditingData.carta_porte });
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
                        tipo: 'Otro',
                        fecha_pago: fechaPago,
                        comprobante: comprobante?.value,
                        detalle: detalle?.value,
                        importe: importeOtro?.value,
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
                clienteData.balance = parseImporte(clienteData.balance) - parseFloat(parseImporte(payload.pagos.importe));
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
        console.log(typeof row.tarifa);
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
    fechaVencimiento.setDate(fechaHoy.getDate() + 30);

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
        } else {
            console.log('Factura ID:', facturaId);
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

async function handleTabContentDisplay(selectedTab) {
    const viajesFacturadosContent = document.getElementById('content-viajes-facturados');
    const historialBtn = document.getElementById("historial");
    const closeButton = document.getElementById("closeBtnViaje");
    const paginacionContainer = document.getElementById("paginacion-viajes");
    const backHistorialBtn = document.getElementById("back-historialBtn");
    const searchInput = document.getElementById('searchInput');

    if (searchInput) searchInput.value = '';
    toggleSpinnerVisible(mainContent);
    try {
        if (selectedTab === 'aFacturar') {
            const response = await getViajesCliente(clienteData.cuit, false, null);
            if (response.ok) {
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
                currentEditingTable = "viajes";
                await renderTables(viajesAFacturarData, 1, optionsViajes, actualizarTotales);

            } else {
                showConfirmModal("Ocurrio un error al cargar los viajes del cliente");
                closeButton.click();
            }
        } else if (selectedTab === 'facturados') {
            const response = await getViajesCliente(clienteData.cuit, true, null);
            if (response.ok) {
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
        renderTables(viajesHistorialData, 1, optionsHistorial, actualizarTotales);
    } catch (error) {
        console.error('Error en setHistorial:', error.message);
    }
}

// Inicializar
export async function inicializarModaCliente(data) {
    document.body.classList.add("no-scroll");
    clienteData = data;

    cargarNombreChofer(clienteData.nombre);

    pagosOpen = true;
    const closeButton = document.getElementById('closeBtnViaje');
    if (closeButton) {
        closeButton.onclick = () => {

            deleteModal("viajesClientesModal", "contentModalViajes", () => {
                viajesFacturadosData = [];
                viajesAFacturarData = [];
                clienteData = [];
                viajesHistorialData = [];
                currentViajesClientesPage = 1;

                socket.off('nuevoViaje');
                socket.off('nuevoCartaPorte');
                socket.off('actualizarFacturaCliente');
                socket.off('deleteViaje');
                socket.off('deleteFactura');
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
            renderTables(getCurrentData(), currentViajesClientesPage, getCurrentOptions(), actualizarTotales);
        }
    });

    socket.on('nuevoPago', async (pago) => {
        if (pago.cuit === clienteData.cuit) {
            console.log("nuevo pago: " + pago.cuit);
            pago.pagosArray.forEach(p => {
                ultimosPagosCliente.push(parsePagos(p));
                clienteData.balance = parseImporte(clienteData.balance) - parseFloat(parseImporte(p.importe));
            });
            await renderTables(ultimosPagosCliente, 1, optionsPagos);
            showConfirmModal("Se actualizaron los pagos del cliente");
            if (currentEditingTable !== "viajes")
                actualizarTotales(viajesFacturadosData);
            renderCurrentTable();
        }
    });

    socket.on('deletePagoCliente', async (pago) => {
        if (pago.cuit && pago.cuit === clienteData.cuit) {
            const lenght = ultimosPagosCliente.lenght;
            ultimosPagosCliente = ultimosPagosCliente.filter(p => {
                const cond = p.id === pago.id && p.tipo === pago.tipo;
                if (cond)
                    clienteData.balance = parseImporte(clienteData.balance) + parseFloat(parseImporte(p.importe));
                return !cond;
            });
            if (lenght !== ultimosPagosCliente.length) {
                await renderTables(ultimosPagosCliente, 1, optionsPagos);
                showConfirmModal("Se actualizaron los pagos del cliente");
                if (currentEditingTable !== "viajes")
                    actualizarTotales(viajesFacturadosData);
                renderCurrentTable();
            }
        }
    });

    socket.on('deleteViaje', async (viaje) => {
        if (viaje.cuit === clienteData.cuit && currentEditingTable === "viajes") {
            const lenght = viajesAFacturarData.length;
            viajesAFacturarData = viajesAFacturarData.filter(v => v.id !== viaje.comprobante);
            if (lenght !== viajesAFacturarData.length) {
                showConfirmModal("Se actualizaron los viajes del cliente");
                if (editingRowId && editingRowId === viaje.comprobante)
                    resetEditingState();
                else
                    return;
                renderTables(viajesAFacturarData, currentViajesClientesPage, optionsViajes, actualizarTotales);
            }
        }
    });

    socket.on('nuevoViaje', async (viaje) => {
        if (viaje.cliente_cuit === clienteData.cuit && currentEditingTable === "viajes") {
            viaje.variacion = 0;
            let viajeParseado = parseViaje(viaje);
            viajesAFacturarData.push(viajeParseado);
            showConfirmModal("Se actualizaron los viajes del cliente");
            if (editingRowId) return;
            renderTables(viajesAFacturarData, currentViajesClientesPage, optionsViajes, actualizarTotales);
        }
    });

    socket.on('updateViajeCliente', async (viaje) => {
        if (viaje.updatedData.cuit === clienteData.cuit && currentEditingTable === "viajes") {
            const index = viajesAFacturarData.findIndex(v => v.id === viaje.comprobanteOriginal);
            if (index !== -1) {
                // viajesAFacturarData[index] = parseViaje(viaje.updatedData);
                console.log(`Se modifico el viaje con comprobante ${viaje.comprobanteOriginal}`);
                if (editingRowId)
                    if (editingRowId === viaje.comprobanteOriginal)
                        resetEditingState();
                    else
                        return;
                showConfirmModal("Se actualizaron los viajes del cliente");
                renderTables(viajesAFacturarData, currentViajesClientesPage, optionsViajes, actualizarTotales);
            }
        }
    });


    const selectPagosCantidad = document.getElementById("selectPagos");
    const pagosHeader = document.getElementById('headerPagos');
    const tablaPagos = document.getElementById('pagos-table');
    const clienteAddPago = document.getElementById('cliente-pagos-wrapper');
    const searchInput = document.getElementById('searchInput');
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
        setupAddPagoBtn();
        setupPaymentTypeSelector(fields);

        const historialBtn = document.getElementById("historial");
        const backHistorialBtn = document.getElementById("back-historialBtn");
        const headerModal = document.getElementById("headerModal");
        const selectCantidad = document.getElementById("selectResumenes");
        const summaryBoxes = document.getElementById('summaryBoxes');
        const inputCantPagos = document.getElementById('inputSelectPago');
        const inputCantViajes = document.getElementById('inputSelectViaje');

        socket.on('actualizarFacturaCliente', async (factura) => {
            if (factura.cuit === clienteData.cuit) {
                closeModalFactura();
                changeSpinnerText(mainContent, "Actualizando datos del cliente...");
                toggleSpinnerVisible(mainContent);
                clienteData.balance = parseImporte(factura.balance);
                renderCurrentTable();
                try {
                    const response = await getViajesCliente(clienteData.cuit, false, null);
                    if (response.ok) {
                        const data = await response.json();
                        viajesAFacturarData = data.viajes.map(c => {
                            const viaje = parseViaje(c);
                            viaje.iva = viaje.importe * 0.21;
                            return viaje;
                        });
                    } else {
                        return showConfirmModal("Ocurrio un error al actualizar los datos del cliente", "aviso", () => { closeButton.click() });
                    }
                    const responseFacturados = await getViajesCliente(clienteData.cuit, true, null);
                    if (responseFacturados.ok) {
                        const data = await responseFacturados.json();
                        viajesFacturadosData = data.viajes.map(c => {
                            const viaje = parseViaje(c);
                            viaje.iva = viaje.importe * 0.21;
                            return viaje;
                        });
                    } else {
                        return showConfirmModal("Ocurrio un error al actualizar los datos del cliente", "aviso", () => { closeButton.click() });
                    }
                    inputCantViajes.value = '';
                    selectCantidad.value = "10";
                    const responseHistorial = await getViajesCliente(clienteData.cuit, true, selectCantidad.value, true);
                    if (responseHistorial.ok) {
                        const data = await responseHistorial.json();
                        viajesHistorialData = data.viajes.map(c => {
                            const viaje = parseViaje(c);
                            viaje.iva = viaje.importe * 0.21;
                            return viaje;
                        });
                    } else {
                        return showConfirmModal("Ocurrio un error al actualizar los datos del cliente", "aviso", () => { closeButton.click() });
                    }
                } catch (error) {
                    console.error(error.message, error.stack);
                    return showConfirmModal("Ocurrio un error al actualizar los datos del cliente", "aviso", () => { closeButton.click() });
                }
                await renderTables(getCurrentData(), currentViajesClientesPage, getCurrentOptions(), actualizarTotales);
                toggleSpinnerVisible(mainContent);
                changeSpinnerText(mainContent);
            }
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

        historialBtn?.addEventListener("click", async () => {
            changeSpinnerText(mainContent, "Cargando historial...");
            toggleSpinnerVisible(mainContent);
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
            renderTables(viajesFacturadosData, 1, optionsViajesFacturados, actualizarTotales);
            summaryBoxes.classList.remove("hidden");
        });

    } catch (error) {
        console.error('Error de red o desconocido al obtener datos de los viajes:', error);
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    } finally {
        toggleSpinnerVisible(mainContent);
    }
}
