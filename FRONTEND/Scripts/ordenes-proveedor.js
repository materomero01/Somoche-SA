import { cargarNombreChofer, deleteModal, setupPaymentTypeSelector, deleteFactura } from "./viajes-pagos.js";
import { createLoadingSpinner, toggleSpinnerVisible, showConfirmModal, changeSpinnerText } from "./apiPublic.js";
import { mockClientes, setupSearchBar, renderCurrentTable } from "./choferes-clientes.js";
import { renderTables } from "./tabla.js";
import { initializeFacturaUpload, viaje, closeModalFactura, updateViajeStatus } from "./subir-factura.js";
import { formatFecha, columnasPagos, parsePagos, parseImporte } from "./resumenes.js";
import { deletePago, getPagosProveedor, getOrdenesProveedor, setupClienteAutocomplete, addPagos, pagarOrdenesProveedor, socket } from "./api.js";

let mainContent;

let proveedorData = [];

let ordenesProveedor = [];
let ultimosPagosProveedor = [];
let ordenesProveedorHistorial = [];

let currentEditingTableType = 'ordenes';

let pagosOpen = true;

const ordenesColumns = [
    { key: 'fecha_pago', label: 'Fecha', class: [] },
    { key: 'comprobante', label: 'Comprobante', class: [] },
    { key: 'nombre', label: 'Para', class: []},
    { key: 'litros', label: 'Litros', class: [] },
    { key: 'precio', label: 'Precio', class: [], modify: (content) => {return `$${parseImporte(content).toFixed(2)}`} },
    { key: 'importe', label: 'Importe', class: ['text-right', 'bold'], modify: (content) => {return `$${parseImporte(content).toFixed(2)}`} },
];

const checkboxHeaderAction = {
    icon: 'bi bi-check-all',
    tooltip: 'Marcar pagadas / Subir Facturas',
    id: null,
    classList: [],
    handler: async (selectedRows) => {
        if (selectedRows.length === 0) {
            showConfirmModal('Por favor, seleccione al menos una orden de gasoil para marcar como pagada o subir su factura.');
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
                <button id="payOrdersBtn" class="btn btn-primary">Marcar Ordenes como pagadas</button>
                <button id="uploadDocumentsBtn" class="btn btn-success">Subir Factura</button>   
            </div>
            <button id="modalCancelBtn" class="btn btn-danger" style="margin-top: 12px;">Cancelar</button>
        </div>
        `;
        document.body.appendChild(modal);
        
        const payOrders = document.getElementById("payOrdersBtn");
        const uploadFactura = document.getElementById("uploadDocumentsBtn");
        const cancelBtn = document.getElementById("modalCancelBtn");
        selectedRows = selectedRows.map( r =>  r.comprobante);

        payOrders.onclick = null;
        uploadFactura.onclick = null;
        cancelBtn.onclick = null;

        payOrders.onclick = () => {
            modal.classList.remove("active");
            showConfirmModal(
            `¿Estás seguro de marcar ${selectedRows.length} orden(es) de gasoil como pagada(s)?`,
            "confirm",
            async () => { 
                modal.remove();
                const ordenesToMark = selectedRows.map(row => ({
                    comprobante: row,
                    proveedor_cuit: proveedorData.cuit
                }));

                try {
                    const response = await pagarOrdenesProveedor(ordenesToMark);
                    const data = await response.json();
                    if (response.ok){
                        // Update local data
                        ordenesProveedor = ordenesProveedor.map(o => {
                            if (selectedRows.includes(o.comprobante)) {
                                return { ...o, pagado: true, selected: false };
                            }
                            return o;
                        });

                        // Optionally remove paid trips from the table
                        ordenesProveedor = ordenesProveedor.filter(o => {
                            if (o.pagado) ordenesProveedorHistorial.push(o);
                            return !o.pagado
                        });

                        // Re-render table and update totals
                        renderTables(ordenesProveedor, 1, optionsOrdenes, actualizarTotales);
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

        uploadFactura.onclick = () => {
            modal.remove();
            initializeFacturaUpload(changeDataFactura, null, null, "ordenProveedor", selectedRows);
        }

        cancelBtn.onclick = () => {
            modal.remove();
        }

    }
}

const checkboxHeaderActionUpload = {
    icon: 'bi bi-file-earmark-arrow-up',
    tooltip: 'Subir factura para las ordenes seleccionadas',
    id: 'facturaBtn',
    classList: ['btn-upload', 'checkbox-cell', 'factura-cell'],
    handler: selectedRows => {
        if (selectedRows.length === 0) {
            showConfirmModal('Por favor, seleccione al menos una orden gasoil para subir la factura.');
            return;
        }

        initializeFacturaUpload(changeDataFactura, null, null, "ordenProveedor", selectedRows.map( r =>  r.comprobante));
    }
}

// Acciones para la tabla de viajes
const ordenesActions = [
    {
        icon: "bi bi-download",
        tooltip:"Descargar archivos",
        classList: ['navigate-btn'],
        id: null,
        handler: (item) => {
            viaje.push(item);
            initializeFacturaUpload( changeDataFactura,
                null,
                (facturaId) => deleteFactura(facturaId, changeDataDocuments,  'ordenProveedor'),
                "ordenProveedor");
        }
    },
    {
        icon: "bi bi-trash",
        tooltip: "Eliminar orden",
        classList: ['delete-btn'],
        id: null,
        handler: (item, tr) => {
            showConfirmModal("¿Estás seguro de eliminar esta orden de gasoil?", "delete", async () => {
            const result = await deletePago(item.id, 'Gasoil');
            if (result.ok) {
                ordenesProveedor = ordenesProveedor.filter(o => o.id !== item.id);
                proveedorData.balance = parseImporte(proveedorData.balance) - parseImporte(item.importe);
                renderTables(ordenesProveedor, 1, optionsOrdenes, actualizarTotales);
                renderCurrentTable();
                showConfirmModal("Orden de gasoil eliminada con éxito");
            } else {
                const data = await result.json();
                showConfirmModal(`Error: ${data.message}`);
            }
        })}
    }
];

const optionsOrdenes = {
    containerId: 'proveedoresOrden-table',
    paginacionContainerId: '',
    columnas: [ordenesColumns],
    itemsPorPagina: () => pagosOpen? 3 : 10,
    actions: ordenesActions,
    onEdit: null,
    tableType: 'ordenes',
    onPageChange: null,
    checkboxColumn: true,
    checkboxColumnPosition: 'end',
    checkboxHeaderAction: checkboxHeaderAction,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: true
};

const optionsOrdenesHistorial = {
    containerId: 'proveedoresOrden-table',
    paginacionContainerId: '',
    columnas: [ordenesColumns],
    itemsPorPagina: () => pagosOpen? 3 : 10,
    actions: [ordenesActions[0]],
    onEdit: null,
    tableType: 'historial',
    onPageChange: null,
    checkboxColumn: true,
    checkboxColumnPosition: 'end',
    checkboxHeaderAction: checkboxHeaderActionUpload,
    onCheckboxChange: null,
    uploadFactura: true,
    useScrollable: true
};

// Acciones para la tabla de pagos
const pagosActions = [
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
                ultimosPagosProveedor = ultimosPagosProveedor.filter(p => p.tipo !== item.tipo || p.id !== item.id);
                showConfirmModal(data.message);
                proveedorData.balance = parseImporte(proveedorData.balance) + parseImporte(item.importe);
                renderTables(ultimosPagosProveedor, 1, optionsPagos);
                renderCurrentTable();
                actualizarTotales(ordenesProveedor);
            });
        }
    }
];

const optionsPagos = {
    containerId: 'pagos-table',
    paginacionContainerId: '',
    columnas: [columnasPagos],
    itemsPorPagina: () => 3,
    actions: pagosActions,
    onEdit: null,
    tableType: 'pagos',
    onPageChange: null,
    checkboxColumn: false,
    checkboxColumnPosition: null,
    checkboxHeaderAction: null,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: true
};

function getCurrentData(){
    switch (currentEditingTableType){
        case "ordenes":
            return ordenesProveedor;
        case "historial":
            return ordenesProveedorHistorial;
    }
}

function getCurrentOptions() {
    switch (currentEditingTableType){
        case "ordenes":
            return optionsOrdenes;
        case "historial":
            return optionsOrdenesHistorial;
    }
}

export function getProveedorCuit(){
    return proveedorData.cuit;
}

function changeDataFactura(facturaId, selectedRows){
    if (!facturaId) {
        console.warn('No se recibió el facturaId en los encabezados');
    } else {
        const currentData = getCurrentData();
        currentData.forEach(o=>{
            if (selectedRows.includes(o.id))
                o.factura_id = facturaId;
                o.selected = false;
        });

        renderTables(currentData, 1, getCurrentOptions());
    }
}

function changeDataDocuments(){
    const currentData = getCurrentData();
    if (currentData.length > 0){
        currentData.forEach(o => {
            if (o.comprobante === viaje[0].comprobante){
                o.factura_id = viaje[0].factura_id? viaje[0].factura_id : null;
            }
        })
        renderTables(currentData, 1, getCurrentOptions());
    }
}

function actualizarTotales(ordenes) {
    const totalOrdenes = ordenes.reduce((sum, orden) => sum + (parseImporte(orden.importe) || 0), 0);

    const totalOrdenesContainer = document.getElementById("total-viajes");
    if (totalOrdenesContainer)
        totalOrdenesContainer.textContent = `Total Ordenes: $${totalOrdenes.toFixed(2)}`;
    const totalPagarContainer = document.getElementById("total-cobrar");
    if (totalPagarContainer){
        if (currentEditingTableType === "historial")
            totalPagarContainer.classList.add('gray');
        else
            totalPagarContainer.classList.remove('gray');
        totalPagarContainer.textContent = `Total a Pagar: ${`${proveedorData.balance}`.includes('$')? proveedorData.balance : ('$' + proveedorData.balance.toFixed(2)).replace('$-','-$')}`;
    }
}

const setupAddPagoBtn = () => {
    const btn = document.getElementById('addPagoBtn');
    setupClienteAutocomplete('clienteCheque', mockClientes);
    const cuitCliente = document.getElementById('clienteCheque');
    
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
            proveedor_cuit: proveedorData?.cuit,
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
                        cliente_cuit: cuitCliente?.dataset.selectedClienteCuit
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

                if (!payload.pagos.comprobante){
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
            if (response.ok){
                const data = await response.json();
                showConfirmModal(data.message);
                proveedorData.balance = parseImporte(proveedorData.balance) - parseImporte(payload.pagos.importe);
                ultimosPagosProveedor.push(parsePagos({id: data.pagoId.id, ...payload.pagos}));
                renderTables(ultimosPagosProveedor, 1, optionsPagos);
                actualizarTotales(getCurrentData());
                renderCurrentTable();
                [comprobante, detalle, importeOtro, nroCheque, tercero, destinatario, importe, cuitCliente].forEach( input => {
                    input.value = '';
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

async function setUltimosPagos(cantidad){
    const responsePagos = await getPagosProveedor(proveedorData.cuit, cantidad);
    if (responsePagos.ok){
        const data = await responsePagos.json();
        ultimosPagosProveedor = data.map(p => {
            return parsePagos(p);
        });
    } else {
        showConfirmModal("No se obtuvieron los ultimos pagos del cliente");
    }
    renderTables(ultimosPagosProveedor, 1, optionsPagos);
}

async function cargarOrdenes() {
    if (proveedorData.cuit) {
        try {
            const response = await getOrdenesProveedor(proveedorData.cuit, null);
            const data = await response.json();
            if (!response.ok) {
                showConfirmModal(data.message);
                deleteModal("ordenesProveedoresModal","contentModalViajes", () => {
                    proveedorData = [];
                    ordenesProveedor = [];
                    ultimosPagosProveedor = [];
                    ordenesProveedorHistorial = [];
                });
            }
            ordenesProveedor = data.ordenes;
            ordenesProveedor.forEach( orden => {
                orden.precio = parseImporte(orden.precio);
                orden.importe = parseImporte(orden.importe);
            });
            console.log(ordenesProveedor);
        } catch (error) {
            console.log(error.message);
        }
    }
    renderTables(ordenesProveedor, 1, optionsOrdenes);
    actualizarTotales(ordenesProveedor);
    currentEditingTableType = 'ordenes';
}

async function setHistorial() {
    const selectCantidad = document.getElementById("selectResumenes");
    let cantidad = selectCantidad.value !== "Otro"? selectCantidad.value : document.getElementById('inputSelectOrden')?.value;
    if (!cantidad) cantidad = 10;

    try {
        const response = await getOrdenesProveedor(proveedorData.cuit, cantidad, true);
        const data = await response.json();
        if (!response.ok) {
            showConfirmModal("Error al cargar el historial del cliente");
            ordenesProveedorHistorial = null;
            return;
        }

        ordenesProveedorHistorial = data.ordenes;
        currentEditingTableType = 'historial';
        renderTables(ordenesProveedorHistorial, 1, optionsOrdenesHistorial);
        actualizarTotales(ordenesProveedor);
    } catch (error) {
        console.error('Error en setHistorialOrdenes:', error.message);
    }
}

// Inicializar
export async function inicializarModalProveedor(data) {
    proveedorData = data;
    document.body.classList.add("no-scroll");
    cargarNombreChofer(proveedorData.nombre);
    pagosOpen = true;
    const closeButton = document.getElementById('closeBtnViaje');
    if (closeButton) {
        closeButton.onclick = () => {
            
            deleteModal("ordenesProveedoresModal","contentModalViajes", () => {
                proveedorData = [];
                ordenesProveedor = [];
                ultimosPagosProveedor = [];
                ordenesProveedorHistorial = [];
                currentEditingTableType = "ordenes";

                socket.off('nuevoPago');
                socket.off('nuevoFactura');
                socket.off('updatePagadasProveedor');
                socket.off('deleteProveedor', manejarDeleteProveedor);
                socket.off('deletePago');
                socket.off('deleteFactura');
            });
        };
    }

    mainContent = document.getElementById('content-proveedoresOrdenes');
    createLoadingSpinner(mainContent);

    const selectPagosCantidad = document.getElementById("selectPagos");
    const pagosHeader = document.getElementById('headerPagos');
    const tablaPagos = document.getElementById('pagos-table');
    const proveedorAddPago = document.getElementById('proveedor-pagos-wrapper');
    const searchInput = document.getElementById('searchInput');
    const togglePagosArea = document.getElementById('togglePagosArea');

    // Toggle pagos area
    togglePagosArea?.addEventListener('click', () => {
        togglePagosArea.classList.toggle('active');
        pagosHeader.classList.toggle('hidden');
        tablaPagos.classList.toggle('hidden');
        proveedorAddPago.classList.toggle('hidden');
        if (searchInput) searchInput.value = '';
        pagosOpen = !pagosOpen;
        
    });

    socket.on('nuevoPago', async (pago) => {
        console.log(pago);
        if (pago.proveedor_cuit === proveedorData.cuit){
            console.log("nuevo pago: "+ pago.proveedor_cuit);
            pago.pagosArray.forEach(p => {
                if (p.tipo === 'Gasoil'){
                    p.fecha_pago = formatFecha(p.fecha_pago);
                    p.precio = p.importe / p.litros;
                    ordenesProveedor.push(p);
                    proveedorData.balance = parseImporte(proveedorData.balance) + parseImporte(p.importe);
                } else {
                    ultimosPagosProveedor.push(parsePagos(p));
                    proveedorData.balance = parseImporte(proveedorData.balance) - parseImporte(p.importe);
                }
            });
            await renderTables(ultimosPagosProveedor, 1, optionsPagos);
            await renderTables(getCurrentData(), 1, getCurrentOptions(), actualizarTotales);
            renderCurrentTable();
            showConfirmModal("Se actualizaron los pagos del proveedor");
        }
    });

    socket.on('deletePago', async (pago) => {
        if (pago.proveedor_cuit && pago.proveedor_cuit === proveedorData.cuit){
            let lenght;
            if (pago.tipo === 'Gasoil'){
                lenght = ordenesProveedor.length;
                ordenesProveedor = ordenesProveedor.filter(o => {
                    let cond = o.id === pago.id;
                    if (cond) proveedorData.balance = parseImporte(proveedorData.balance) + parseFloat(parseImporte(o.importe).toFixed(2));
                    return !cond;
                });
            } else {
                lenght = ultimosPagosProveedor.length;
                ultimosPagosProveedor = ultimosPagosProveedor.filter(o => {
                    let cond = o.id === pago.id && o.tipo === pago.tipo;
                    if (cond)
                        proveedorData.balance = parseImporte(proveedorData.balance) + parseFloat(parseImporte(o.importe).toFixed(2));
                    return !cond;
                });
                if (lenght !== ultimosPagosProveedor.length)
                    await renderTables(ultimosPagosProveedor, 1, optionsPagos);
            }
            
            if (lenght !== ultimosPagosProveedor.length || lenght !== ordenesProveedor){
                await renderTables(getCurrentData(), 1, getCurrentOptions(), actualizarTotales);
                renderCurrentTable();
                showConfirmModal("Se actualizaron los pagos del proveedor");
            }
        }
    });

    socket.on('updatePagadasProveedor', (pagadas) => {
        if (pagadas.cuit === proveedorData.cuit){
            ordenesProveedor = ordenesProveedor.filter( orden => {
                if (pagadas.ordenesPagadas.includes(orden.comprobante))
                    ordenesProveedorHistorial.push(orden);
                return !pagadas.ordenesPagadas.includes(orden.comprobante);
            });
            showConfirmModal("Se actualizaron las ordenes del cliente");
            renderTables(getCurrentData(), 1, getCurrentOptions(), actualizarTotales);
        }
    });

    async function manejarDeleteProveedor(proveedor) {
        if (proveedor.cuit === proveedorData.cuit){
            closeModalFactura();
            document.getElementById('documentGenerateModal')?.remove();
            showConfirmModal(`El proveedor ${proveedorData.nombre} fue eliminado`);
            closeButton.click();
        }
    }

    socket.on('deleteProveedor', manejarDeleteProveedor);

    try {
        socket.on('nuevoFactura', (factura) => {
            if (factura.cuil === proveedorData.cuit){
                let ordenesEditadas = false;
                ordenesProveedor.forEach(orden => {
                    orden.selected = false;
                    if (factura.viajesIds.includes(orden.comprobante)) {
                        orden.factura_id = factura.facturaId;
                        ordenesEditadas = true;
                    }
                });
                if (viaje.length > 0 && factura.viajesIds.includes(viaje[0].id)){
                    viaje[0].factura_id = factura.facturaId;
                    updateViajeStatus();
                }
                document.getElementById('documentUploadBoxModal')?.remove();
                showConfirmModal("Se actualizaron los documentos del proveedor");
                renderTables(ordenesProveedor, 1, optionsOrdenes);
                if (historialBtn.classList.contains("hidden") && !ordenesEditadas){
                    historialBtn.click()
                }
            }
        });

        socket.on('deleteFactura', (factura) => {
            if (factura.cuil === proveedorData.cuit){
                let ordenEditada = false;
                ordenesProveedor.forEach( orden => {
                    orden.selected = false;
                    if (orden.comprobante === factura.comprobante){
                        if (factura.facturaId && factura.facturaId !== "null" && factura.facturaId !== "undefined"){
                            orden.factura_id = null;
                            ordenEditada = true;
                        }
                    }
                });

                if (viaje.length > 0 && viaje[0].comprobante === factura.comprobante){
                    if (factura.facturaId && factura.facturaId !== "null" && factura.facturaId !== "undefined")
                        viaje[0].factura_id = null;
                    updateViajeStatus();
                }

                document.getElementById('documentUploadBoxModal')?.remove();
                showConfirmModal("Se actualizaron los documentos del proveedor");
                renderTables(ordenesProveedor, 1, optionsOrdenes);
                if (historialBtn.classList.contains("hidden") && !ordenEditada){
                    historialBtn.click()
                }

            }
        });

        setupSearchBar("proveedoresOrdenSearchBar",
            (searchTerm) => { let currentData = getCurrentData();
                            return currentData.filter(orden =>
                                formatFecha(orden.fecha_pago)?.includes(searchTerm) ||
                                orden.comprobante?.toLowerCase().includes(searchTerm) ||
                                orden.nombre?.toLowerCase().includes(searchTerm)
                            );
                        },
            (filteredData) => renderTables(filteredData, 1, getCurrentOptions())
        );
        const historialBtn = document.getElementById("historial");
        const backHistorialBtn = document.getElementById("back-historialBtn");
        const headerModal = document.getElementById("headerModal");
        const selectCantidad = document.getElementById("selectResumenes");
        const summaryBoxes = document.getElementById('summaryBoxes');
        const inputCantPagos = document.getElementById('inputSelectPago');
        const inputCantOrdenes = document.getElementById('inputSelectOrden');

        const cardPagos = document.getElementById("addPagoCard");
        document.getElementById("agregar-pago")?.addEventListener("click", () => {
            cardPagos.classList.toggle('hidden');
        });

        const fields = {
            cheque: document.getElementById('chequeFields'),
            otro: document.getElementById('otroFields')
        }; 

        setupPaymentTypeSelector(fields)
        setupAddPagoBtn();
        await cargarOrdenes();
        await setUltimosPagos(selectPagosCantidad.value);

        selectPagosCantidad?.addEventListener("change", () => {
            if (selectPagosCantidad.value !== "Otro"){
                inputCantPagos.classList.add('hidden');
                inputCantPagos.value = '';
                setUltimosPagos(selectPagosCantidad.value);
            } else {
                inputCantPagos.classList.remove('hidden');
            }
        });

        inputCantPagos?.addEventListener("change", () => {
            if (inputCantPagos.value > 0)
                setUltimosPagos(inputCantPagos.value);
        });

        selectCantidad?.addEventListener("change", () => {
            if (selectCantidad.value !== "Otro"){
                inputCantOrdenes.classList.add("hidden");
                inputCantOrdenes.value = '';
                historialBtn.click();
            } else
                inputCantOrdenes.classList.remove("hidden");
        })

        inputCantOrdenes?.addEventListener("change", () => {
            historialBtn.click();
        });

        historialBtn?.addEventListener("click", async () =>{
            changeSpinnerText(mainContent, "Cargando historial...");
            toggleSpinnerVisible(mainContent);
            summaryBoxes.classList.add("hidden");
            if (pagosOpen && currentEditingTableType !== "historial") togglePagosArea.click();
            await setHistorial();
            toggleSpinnerVisible(mainContent);
            changeSpinnerText(mainContent);
            document.getElementById("back-historial").classList.remove("hidden");
            headerModal.textContent = "Ordenes de Gasoil - Historial";
            historialBtn.classList.add("hidden");
            if (!ordenesProveedorHistorial){
                backHistorialBtn?.click();
            }
        });

        backHistorialBtn?.addEventListener("click", () =>{
            document.getElementById("back-historial").classList.add("hidden");
            headerModal.textContent = "Ordenes de Gasoil";
            historialBtn.classList.remove("hidden");
            currentEditingTableType = 'ordenes';
            renderTables(ordenesProveedor, 1, optionsOrdenes, actualizarTotales);
            summaryBoxes.classList.remove("hidden");
        });

    } catch (error) {
        console.error('Error de red o desconocido al obtener datos de las ordenes de gasoil:', error);
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    } finally {
        toggleSpinnerVisible(mainContent);
    }
}