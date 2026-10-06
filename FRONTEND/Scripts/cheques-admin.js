// /scripts/cheques-admin.js

import { setChequesPagos, socket, setupChoferAutocomplete, fetchAllChoferes, fetchProveedores, updatePagos, fetchClientes, deleteModal, createActionModal } from './api.js';
import { renderTables, setupTableEventListeners} from './tabla.js';
import { createLoadingSpinner, getCheques, showConfirmModal, toggleSpinnerVisible } from './apiPublic.js';

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

// Cheques propios (los que paga la empresa a choferes/proveedores)
let datosChequesProximos = [];
let datosChequesPagos = [];

// Cheques del cliente que se esté mirando en el modal de "Terceros"
let datosChequesProximosCliente = [];
let datosChequesPagosCliente = [];

let dataChoferes = [];
let dataProveedores = [];

let clienteData = [];
let clientes = [];

let currentChequesPage = 1;

// Filtros: separados para no mezclar lo que el admin tenga cargado en "Propios" con lo que
// cargue mientras mira los cheques de un cliente puntual (comparten la misma card de filtro).
let currentFilter = {};
let currentFilterCliente = {};

let filterCardVisible = false;
let currentActiveFilterBtn = null;

const contentPrincipal = document.getElementById("contentPrincipal");

// ---------------------------------------------------------------------------
// Columnas de las tablas
// ---------------------------------------------------------------------------

const columnasClientesTerceros = [
    { key: 'nombre', label: 'Nombre y Apellido/Razón Social', class: [] },
    { key: 'cuit', label: 'CUIL/CUIT', class: [] },
    { key: 'categoria', label: 'Categoría', class: [], type: 'select', options: [{ value: 'Responsable Inscripto', text: 'Responsable Inscripto' }, { value: 'Monotributista', text: 'Monotributista' }]},
];

const columnasProximos = [
    { label: 'Días', key: 'fecha_cheque', class: ['text-right', 'bold'], noEdit: true, modify: (content) => calcularDiasRestantes(content) > 0 ? `${calcularDiasRestantes(content)} días` : calcularDiasRestantes(content) === 0 ? 'Hoy' : formatFecha(content) },
    { label: 'Fecha Cobro', key: 'fecha_cheque', noEdit: true, class: [], modify: (content) => formatFecha(content) },
    { label: 'Cheque', key: 'nro_cheque', noEdit: true, class: [] },
    { label: 'Destinatario', key: 'destinatario', noEdit: true, class: [] },
    { label: 'Banco', key: 'tercero', noEdit: true, class: [] },
    { label: 'Fecha Emisión', key: 'fecha_pago', noEdit: true, class: [], modify: (content) => formatFecha(content) },
    { label: 'Entregado a', key: 'nombre', id:'autocompleteEntrega', autocompleteFunc: true, class: [] },
    { label: 'Importe', key: 'importe', noEdit: true, class: ['text-right'], modify: (content) => `$${parseImporte(content).toFixed(2)}` }
];

const columnasPagos = [
    { label: 'Fecha Cobro', key: 'fecha_cheque', class: [], modify: (content) => formatFecha(content) },
    { label: 'Cheque', key: 'nro_cheque', class: [] },
    { label: 'Destinatario', key: 'destinatario', class: [] },
    { label: 'Banco', key: 'tercero', class: [] },
    { label: 'Fecha Pago', key: 'fecha_pago', class: [], modify: (content) => formatFecha(content) },
    { label: 'Entregado a', key: 'nombre', class: [] },
    { label: 'Importe', key: 'importe', class: ['text-right'], modify: (content) => `$${parseImporte(content).toFixed(2)}` }
];

// ---------------------------------------------------------------------------
// Selección de cheques (checkboxes + resumen de cantidad/total)
// Mismo mecanismo para los cheques propios y para los del cliente del modal, solo cambia de
// qué array toma los datos y a qué IDs del DOM actualiza.
// ---------------------------------------------------------------------------

function crearSeleccionCheques(getDatos, { countId, totalId, controlsId }) {
    const seleccionados = new Map(); // Map<nro_cheque, chequeObject>

    const actualizarResumen = () => {
        const count = seleccionados.size;
        const total = Array.from(seleccionados.values()).reduce((sum, c) => sum + parseImporte(c.importe), 0).toFixed(2);

        const countElement = document.getElementById(countId);
        const totalElement = document.getElementById(totalId);
        if (countElement) countElement.textContent = count;
        if (totalElement) totalElement.textContent = `${total}`;

        const controls = document.getElementById(controlsId);
        if (controls) controls.classList.toggle('hidden', count === 0);
    };

    const handleCheckboxChange = (nroCheque, isChecked) => {
        const cheque = getDatos().find(c => c.nro_cheque === nroCheque);
        if (cheque) {
            cheque.selected = isChecked;
            if (isChecked) seleccionados.set(nroCheque, cheque);
            else seleccionados.delete(nroCheque);
            actualizarResumen();
        }
    };

    return { seleccionados, handleCheckboxChange, actualizarResumen };
}

const {
    seleccionados: selectedCheques,
    handleCheckboxChange,
    actualizarResumen: updateSelectedChequesSummary
} = crearSeleccionCheques(() => datosChequesProximos, {
    countId: 'selected-cheques-count',
    totalId: 'selected-cheques-total',
    controlsId: 'cheques-selection-controls'
});

const {
    seleccionados: selectedChequesCliente,
    handleCheckboxChange: handleCheckboxChangeCliente,
    actualizarResumen: updateSelectedChequesClienteSummary
} = crearSeleccionCheques(() => datosChequesProximosCliente, {
    countId: 'selected-cheques-cliente-count',
    totalId: 'selected-cheques-cliente-total',
    controlsId: 'cheques-cliente-selection-controls'
});

// ---------------------------------------------------------------------------
// Entregar/endosar un cheque a un chofer o proveedor: lo usan tanto la edición inline de
// "Entregado a" (un solo cheque, tabla de propios) como el endoso en bloque (varios cheques,
// modal del cliente).
// ---------------------------------------------------------------------------

function getDataEntregar() {
    return [...dataChoferes, ...dataProveedores];
}

// Si el destinatario es un chofer, pregunta si el pago se asigna puntualmente a ese chofer o
// queda como un pago general. Si es un proveedor, el destino siempre es general.
async function resolverDestinoEntrega(cuil, mensajeConfirmacionChofer) {
    const choferEncontrado = dataChoferes.find(c => c.cuil === cuil);
    const esChofer = choferEncontrado && choferEncontrado.tipo_trabajador === "Chofer";
    let destino = "general";
    if (esChofer) {
        destino = await new Promise((resolve) => {
            showConfirmModal(mensajeConfirmacionChofer(choferEncontrado.nombre), "confirm", () => resolve("chofer"), () => resolve("general"));
        });
    }
    return { choferEncontrado, destino };
}

function construirBodyEntrega(nros, cuil, choferEncontrado, destino) {
    const bodyRequest = {};
    nros.forEach(nro => {
        bodyRequest[nro] = {
            tipo: "cheque",
            destino,
            chofer_cuil: choferEncontrado ? cuil : null,
            proveedor_cuit: !choferEncontrado ? cuil : null
        };
    });
    return bodyRequest;
}

// ---------------------------------------------------------------------------
// Acciones de tabla
// ---------------------------------------------------------------------------

const actionsClientesTerceros = [{
    icon: 'bi bi-send',
    tooltip: 'Ver Cheques',
    classList: ['edit-btn'],
    id: null,
    handler: async (rowData) => {
        const modalTercerosCliente = document.getElementById("tercerosClientesModal");
        if (modalTercerosCliente) {
            try {
                const response = await fetch('cheques-tercero.html');
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }
                const tercerosClientesHtml = await response.text();
                modalTercerosCliente.innerHTML = tercerosClientesHtml;
                modalTercerosCliente.classList.toggle("active");
                const modalContent = document.getElementById("tercerosClienteContent");
                createLoadingSpinner(modalContent);
                await inicializarModalTercerosCliente(rowData);
                toggleSpinnerVisible(modalContent);
            } catch (error) {
                console.log(error.message);
            }
        }
    }
}];

// Marcar como pagados / Endosar cheques seleccionados (checkbox header de la tabla de
// próximos del cliente, en el modal de "Terceros").
const checkboxHeaderAction = {
    icon: 'bi bi-check-all',
    tooltip: 'Marcar pagados o Endosar',
    id: null,
    classList: [],
    handler: async (selectedRows) => {
        if (selectedRows.length === 0) {
            showConfirmModal('Por favor, seleccione al menos un cheque.');
            return;
        }

        const totalSeleccionado = selectedRows.reduce((sum, cheque) => sum + parseImporte(cheque.importe), 0).toFixed(2);
        const subtitleModal = `
            <span style="display: block; margin-bottom: 6px;"><strong>Cheques seleccionados:</strong> ${selectedRows.map(c => c.nro_cheque).join(', ')}</span>
            <span style="display: block;"><strong>Total:</strong> $${totalSeleccionado}</span>
        `;
        const modal = createActionModal('documentGenerateModal', '¿Que acción desea realizar?', [
            { id: 'payChequesBtn',   class: 'btn-primary', label: 'Marcar Cheques como Pagados' },
            { id: 'giveChequeBtn',   class: 'btn-success', label: 'Endosar Cheques' },
        ], subtitleModal);

        const payChequesBtn = document.getElementById('payChequesBtn');
        const giveChequeBtn = document.getElementById('giveChequeBtn');
        const cancelBtn = document.getElementById("modalCancelBtn");

        // Marcar como pagados: misma lógica que pay-selected-btn para los cheques propios,
        // pero sobre la selección/datos del cliente (datosChequesProximosCliente), con un
        // cartel de confirmación previo ya que es una acción que no se puede deshacer sola.
        payChequesBtn.onclick = () => {
            const nros = selectedRows.map(c => c.nro_cheque);
            showConfirmModal(
                `¿Está seguro que desea marcar como pagados los ${nros.length} cheque(s) seleccionado(s)?`,
                "confirm",
                async () => {
                    try {
                        const response = await setChequesPagos(nros);
                        if (response) {
                            datosChequesProximosCliente = moverAPagos(datosChequesProximosCliente, datosChequesPagosCliente, nros).arr;
                            showConfirmModal(`Se marcaron como pagos los cheques con número: ${nros.join(', ')}`);
                        }
                    } catch (error) {
                        console.log(error.message);
                    }

                    selectedChequesCliente.clear();
                    currentFilterCliente = {};
                    clearFilterInputs();
                    renderTablaProximosCliente();
                    modal.remove();
                }
            );
        }

        // Endosar: reemplaza el botón por un input con autocomplete (choferes + proveedores,
        // igual que "Entregado a" en la tabla de propios) y dos botones de aceptar/cancelar.
        giveChequeBtn.onclick = () => {
            const inlineForm = document.createElement('div');
            inlineForm.style.display = 'flex';
            inlineForm.style.gap = '6px';
            inlineForm.style.alignItems = 'center';
            // Los botones van con estilos inline porque ".modal-actions-vertical button" les
            // pisa width/padding/font-size a cualquier botón dentro del modal (incluso a estos,
            // que están anidados dentro de inlineForm) y los hacía ocupar todo el ancho.
            const estiloBotonChico = 'width: auto; flex: 0 0 auto; padding: 10px 10px; font-size: 0.85rem; line-height: 1;';
            inlineForm.innerHTML = `
                <div class="autocomplete-container-table" style="flex: 1; margin-bottom: 0;">
                    <input type="search" id="autocompleteEndosar" class="editable-input" style="padding: 10px 6px;" placeholder="Buscar chofer o proveedor...">
                </div>
                <button id="confirmEndosoBtn" class="btn btn-success btn-sm" style="${estiloBotonChico}"><i class="bi bi-check-lg"></i></button>
                <button id="cancelEndosoBtn" class="btn btn-danger btn-sm" style="${estiloBotonChico}"><i class="bi bi-x-lg"></i></button>
            `;
            giveChequeBtn.replaceWith(inlineForm);

            setupChoferAutocomplete('autocompleteEndosar', getDataEntregar());

            document.getElementById('cancelEndosoBtn').onclick = () => {
                inlineForm.replaceWith(giveChequeBtn);
            };

            document.getElementById('confirmEndosoBtn').onclick = () => {
                const input = document.getElementById('autocompleteEndosar');
                const cuil = input?.dataset.selectedChoferCuil || null;

                if (!cuil) {
                    showConfirmModal("Por favor, selecciona un chofer o proveedor de la lista de sugerencias.");
                    return;
                }

                const nombreSeleccionado = input.dataset.selectedChoferNombre;

                showConfirmModal(
                    `¿Está de acuerdo en endosar ${selectedRows.length === 1 ? 'el cheque seleccionado' : 'los ' + selectedRows.length + ' cheques seleccionados'} a ${nombreSeleccionado}?`,
                    "confirm",
                    async () => {
                        const { choferEncontrado, destino } = await resolverDestinoEntrega(cuil, nombre => `Desea entregar los cheques seleccionados como pago del Chofer ${nombre}?`);
                        const bodyRequest = construirBodyEntrega(selectedRows.map(c => c.nro_cheque), cuil, choferEncontrado, destino);

                        try {
                            const response = await updatePagos(bodyRequest);
                            const result = await response.json();

                            if (response.ok) {
                                selectedRows.forEach(cheque => {
                                    const chequeLocal = datosChequesProximosCliente.find(c => c.nro_cheque === cheque.nro_cheque);
                                    if (chequeLocal) chequeLocal.nombre = nombreSeleccionado;
                                });
                                showConfirmModal("Cheques endosados con éxito.");
                                selectedChequesCliente.clear();
                                renderTablaProximosCliente();
                                modal.remove();
                            } else {
                                console.error("Errores del backend:", result.errors);
                                showConfirmModal(result.message);
                            }
                        } catch (error) {
                            console.error("Error de red:", error);
                            showConfirmModal("Error al intentar endosar los cheques.");
                        }
                    }
                );
            };
        }

        cancelBtn.onclick = () => {
            modal.remove();
        }
    }
}

// ---------------------------------------------------------------------------
// Opciones de tabla
// ---------------------------------------------------------------------------

const optionsProximos = {
    containerId: 'tabla-proximos',
    paginacionContainerId: 'paginacion-proximos',
    columnas: [columnasProximos],
    itemsPorPagina: () => 10,
    actions: [],
    onEdit: null,
    tableType: 'proximos',
    onPageChange: (page) => { currentChequesPage = page; },
    checkboxColumn: true,
    checkboxColumnPosition: "end",
    checkboxHeaderAction: null,
    onCheckboxChange: handleCheckboxChange,
    uploadFactura: null,
    useScrollable: false
}

const optionsPagos = {
    containerId: 'tabla-pagos',
    paginacionContainerId: 'paginacion-pagos',
    columnas: [columnasPagos],
    itemsPorPagina: () => 10,
    actions: [],
    onEdit: null,
    tableType: 'pagos',
    onPageChange: null,
    checkboxColumn: false,
    onCheckboxChange: null,
    uploadFactura: null,
    useScrollable: false
}

// Tablas de "próximos"/"pagos" DENTRO del modal de cheques de un cliente puntual. Son
// read-only (sin acciones): acá solo se consultan los cheques de ese cliente, la edición de
// "Entregado a" se sigue haciendo desde la pestaña "Terceros" de la página principal.
const optionsProximosCliente = {
    containerId: 'tabla-cheques-cliente',
    paginacionContainerId: 'paginacion-cheques-cliente',
    columnas: [columnasProximos],
    itemsPorPagina: () => 10,
    actions: [],
    onEdit: null,
    tableType: 'proximosCliente',
    checkboxColumn: true,
    checkboxColumnPosition: "end",
    checkboxHeaderAction: checkboxHeaderAction,
    onCheckboxChange: handleCheckboxChangeCliente,
    useScrollable: false,
};

const optionsPagosCliente = {
    containerId: 'tabla-cheques-cliente',
    paginacionContainerId: 'paginacion-cheques-cliente',
    columnas: [columnasPagos],
    itemsPorPagina: () => 10,
    actions: [],
    onEdit: null,
    tableType: 'pagosCliente',
    checkboxColumn: false,
    useScrollable: false
};

const optionsClientesTerceros = {
    containerId: 'tabla-terceros',
    paginacionContainerId: 'paginacion-terceros',
    columnas: [columnasClientesTerceros],
    itemsPorPagina: () => 10,
    actions: actionsClientesTerceros,
    onEdit: null,
    tableType: 'clientesTerceros',
    onPageChange: (page) => { currentChequesPage = page; },
    checkboxColumn: false,
    useScrollable: false
}

// ---------------------------------------------------------------------------
// Helpers generales
// ---------------------------------------------------------------------------

function calcularDiasRestantes(fechaCheque) {
    const hoy = new Date();
    const fechaCobro = new Date(fechaCheque);
    const diffTime = fechaCobro - hoy;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

function formatFecha(fecha) {
    return new Date(fecha).toISOString().split('T')[0];
}

function parseImporte(importe) {
    if (typeof importe === 'string') {
        return parseFloat(importe.replace(/[$,]/g, '')) || 0;
    }
    return parseFloat(importe) || 0;
}

function calcularTotalImportesGlobal(data) {
    return data.reduce((acc, el) => acc + parseImporte(el.importe), 0).toFixed(2);
}

function filtrarCheques(data, filters) {
    return data.filter(cheque => {
        if (filters.numero && !cheque.nro_cheque.toString().toLowerCase().includes(filters.numero.toLowerCase())) return false;
        if (filters.destinatario && !cheque.destinatario.toLowerCase().includes(filters.destinatario.toLowerCase())) return false;
        if (filters.tercero && !cheque.tercero.toLowerCase().includes(filters.tercero.toLowerCase())) return false;
        if (filters.fechaDesde && formatFecha(cheque.fecha_cheque) < filters.fechaDesde) return false;
        if (filters.fechaHasta && formatFecha(cheque.fecha_cheque) > filters.fechaHasta) return false;
        if (filters.montoMinimo && parseImporte(cheque.importe) < parseFloat(filters.montoMinimo)) return false;
        if (filters.montoMaximo && parseImporte(cheque.importe) > parseFloat(filters.montoMaximo)) return false;
        return true;
    });
}

// Saca (si está) el cheque con ese nro de un array. Devuelve el array resultante y si hubo
// cambio, para no re-renderizar/avisar cuando el evento no afecta nada de lo que se ve.
function quitarChequePorNro(arr, nro) {
    const nuevo = arr.filter(c => c.nro_cheque !== nro);
    return { arr: nuevo, cambio: nuevo.length !== arr.length };
}

// Mueve de proximosArr a pagosArr (push in-place) los cheques cuyo nro esté en nros.
function moverAPagos(proximosArr, pagosArr, nros, selectedMap = null) {
    const nuevoProximos = proximosArr.filter(p => {
        if (!nros.includes(p.nro_cheque)) return true;
        pagosArr.push(p);
        selectedMap?.delete(p.nro_cheque);
        return false;
    });
    if (nuevoProximos.length !== proximosArr.length) {
        pagosArr.sort((a, b) => new Date(a.fecha_cheque) - new Date(b.fecha_cheque));
    }
    return { arr: nuevoProximos, cambio: nuevoProximos.length !== proximosArr.length };
}

// Agrega el cheque al array si todavía no está (por nro_cheque), insertándolo en la posición
// que le corresponde según fecha_cheque de mayor a menor (en vez de siempre al principio/final).
function agregarChequeSiFalta(arr, cheque) {
    if (arr.find(c => c.nro_cheque === cheque.nro_cheque)) return false;

    const fechaNueva = new Date(cheque.fecha_cheque);
    const index = arr.findIndex(c => new Date(c.fecha_cheque) < fechaNueva);
    if (index === -1) arr.push(cheque);
    else arr.splice(index, 0, cheque);

    return true;
}

// ---------------------------------------------------------------------------
// Render de tablas: propios
// ---------------------------------------------------------------------------

function renderTablaProximos() {
    let filteredData = filtrarCheques(datosChequesProximos, currentFilter);
    filteredData = filteredData.map(c => ({
        ...c,
        id: c.nro_cheque,
        selected: selectedCheques.get(c.nro_cheque) ? true : false
    }));

    renderTables(filteredData, currentChequesPage, optionsProximos);

    const totalDiv = document.getElementById('total-cheques-proximos');
    if (totalDiv) totalDiv.textContent = `Total: $${calcularTotalImportesGlobal(filteredData)}`;

    updateSelectedChequesSummary();
    updateClearFilterButtonVisibility();
}

function renderTablaPagos() {
    const filteredData = filtrarCheques(datosChequesPagos, currentFilter);
    renderTables(filteredData, 1, optionsPagos);
    updateClearFilterButtonVisibility();
}

// ---------------------------------------------------------------------------
// Render de tablas: cheques del cliente (modal)
// ---------------------------------------------------------------------------

function renderTablaProximosCliente() {
    let filteredData = filtrarCheques(datosChequesProximosCliente, currentFilterCliente);
    filteredData = filteredData.map(c => ({
        ...c,
        id: c.nro_cheque,
        selected: selectedChequesCliente.get(c.nro_cheque) ? true : false
    }));

    renderTables(filteredData, 1, optionsProximosCliente);

    const totalDiv = document.getElementById('total-cheques-proximos-cliente');
    totalDiv?.classList.remove('hidden');
    if (totalDiv) totalDiv.textContent = `Total: $${calcularTotalImportesGlobal(filteredData)}`;

    updateSelectedChequesClienteSummary();
    updateClearFilterClienteButtonVisibility();
}

function renderTablaPagosCliente() {
    document.getElementById('total-cheques-proximos-cliente')?.classList.add('hidden');
    const filteredData = filtrarCheques(datosChequesPagosCliente, currentFilterCliente);
    renderTables(filteredData, 1, optionsPagosCliente);
    updateClearFilterClienteButtonVisibility();
}

function tabActivaCliente() {
    return document.querySelector('#chequesClienteSelector .tab-item.active')?.dataset.tab;
}

// Re-renderiza la pestaña del cliente que esté activa en este momento (próximos o pagos).
function renderTablaClienteActiva() {
    if (tabActivaCliente() === 'pagos') renderTablaPagosCliente();
    else renderTablaProximosCliente();
}

// Trae y renderiza los cheques del cliente activo (clienteData) para la pestaña indicada:
// "proximos" -> pagado = false, "pagos" -> pagado = true, siempre filtrados por su cuit.
async function mostrarContenidoTabChequesCliente(tab) {
    const esPagado = tab === 'pagos';
    currentFilterCliente = {};
    clearFilterInputs();
    selectedChequesCliente.clear();
    document.getElementById('cheques-cliente-selection-controls')?.classList.add('hidden');

    try {
        const resultado = await getCheques(esPagado, null, null, "tercero", clienteData.cuit);
        const datos = (resultado || []).map(cheque => ({
            ...cheque,
            id: cheque.nro_cheque,
            selected: false,
            importe: parseImporte(cheque.importe)
        }));

        if (esPagado) {
            datosChequesPagosCliente = datos;
            renderTablaPagosCliente();
        } else {
            datosChequesProximosCliente = datos;
            renderTablaProximosCliente();
        }
    } catch (error) {
        console.error("Error obteniendo cheques del cliente:", error.message);
        showConfirmModal("Error al obtener los cheques del cliente.");
    }
}

function setupChequesClienteTabSelector() {
    const tabSelector = document.getElementById('chequesClienteSelector');
    if (!tabSelector) return;

    tabSelector.querySelectorAll('.tab-item').forEach(item => {
        item.addEventListener('click', function () {
            tabSelector.querySelectorAll('.tab-item').forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');
            mostrarContenidoTabChequesCliente(this.dataset.tab);
        });
    });
}

async function inicializarModalTercerosCliente(rowData) {
    document.body.classList.add("no-scroll");

    const personInfo = document.querySelector(".person-info span");
    if (personInfo) personInfo.textContent = rowData.nombre;
    clienteData = rowData;

    const closeButton = document.getElementById("closeBtnTerceros");
    if (closeButton) {
        closeButton.onclick = () => {
            deleteModal("tercerosClientesModal", "tercerosClienteContent", null, () => {
                clienteData = [];
                datosChequesProximosCliente = [];
                datosChequesPagosCliente = [];
                selectedChequesCliente.clear();
                currentFilterCliente = {};
            });
        };
    }

    setupChequesClienteTabSelector();

    // Filtro: reutiliza la misma card (#filter-card) y lógica de posicionamiento que los
    // cheques propios, pero aplicando/limpiando sobre los del cliente.
    document.getElementById('filter-btn-cheques-cliente')
        ?.addEventListener('click', (e) => toggleFilterCard(e, 'filter-btn-cheques-cliente'));

    document.getElementById('clear-filter-btn-cheques-cliente')
        ?.addEventListener('click', () => { clearFilterInputs(); applyFiltersCliente(); });

    const tabActiva = document.getElementById('chequesClienteSelector')?.querySelector('.tab-item.active')?.dataset.tab || 'proximos';
    await mostrarContenidoTabChequesCliente(tabActiva);
}

// ---------------------------------------------------------------------------
// Pestañas Próximos/Pagos y Propios/Terceros (página principal)
// ---------------------------------------------------------------------------

function setupChequesTabSelector() {
    const tabSelectorEstado = document.getElementById('chequesSelector'); // próximos/pagos
    const tabSelectorTipo = document.getElementById('chequesSelectorTerceros'); // propios/terceros

    if (!tabSelectorEstado || !tabSelectorTipo) return;

    const allTabs = [...tabSelectorEstado.querySelectorAll('.tab-item'), ...tabSelectorTipo.querySelectorAll('.tab-item')];

    allTabs.forEach(item => {
        item.addEventListener('click', function () {
            const parent = this.closest('.tab-selector');
            parent.querySelectorAll('.tab-item').forEach(tab => tab.classList.remove('active'));
            this.classList.add('active');

            // Si cambiamos el TIPO (propio/tercero), reseteamos el ESTADO a "proximos"
            if (parent.id === 'chequesSelectorTerceros') {
                const estadoTabs = tabSelectorEstado.querySelectorAll('.tab-item');
                estadoTabs.forEach(t => t.classList.remove('active'));
                Array.from(estadoTabs).find(t => t.dataset.tab === 'proximos')?.classList.add('active');
            }

            const estadoActivo = tabSelectorEstado.querySelector('.tab-item.active').dataset.tab;
            const tipoActivo = tabSelectorTipo.querySelector('.tab-item.active').dataset.tab;
            mostrarContenidoTabCheques(estadoActivo, tipoActivo);
        });
    });
}

async function mostrarContenidoTabCheques(estado, tipo) {
    const proximosDiv = document.getElementById('content-proximos');
    const pagosDiv = document.getElementById('content-pagos');
    const selectCantidad = document.getElementById("selectCheques");
    const inputCantCheques = document.getElementById('inputSelectCheques');
    const contentChequesPropios = document.getElementById('contentChequesPropios');
    const contentChequesTerceros = document.getElementById('contentChequesTerceros');

    currentFilter = {};
    clearFilterInputs();

    switch (tipo) {
        case 'propio':
            if (estado === 'proximos') {
                proximosDiv.classList.remove('hidden');
                pagosDiv.classList.add('hidden');

                try {
                    const resultado = await getCheques(false, null, null, tipo);
                    datosChequesProximos = resultado.map(cheque => ({
                        ...cheque,
                        selected: false,
                        importe: parseImporte(cheque.importe)
                    }));
                    renderTablaProximos();
                } catch (error) {
                    console.error("Error obteniendo próximos:", error.message);
                }
            } else if (estado === 'pagos') {
                try {
                    const cantidad = selectCantidad.value !== "Otro" ? selectCantidad.value : inputCantCheques.value;
                    const resultado = await getCheques(true, null, cantidad, tipo);
                    datosChequesPagos = resultado.map(cheque => ({
                        ...cheque,
                        importe: parseImporte(cheque.importe)
                    }));
                    renderTablaPagos();
                    proximosDiv.classList.add('hidden');
                    pagosDiv.classList.remove('hidden');
                } catch (error) {
                    console.error("Error obteniendo pagos:", error.message);
                }
            }
            contentChequesTerceros.classList.add('hidden');
            contentChequesPropios.classList.remove('hidden');
            updateClearFilterButtonVisibility();
            break;
        case 'tercero':
            try {
                clientes = await fetchClientes();
                renderTables(clientes, 1, optionsClientesTerceros);
                contentChequesPropios.classList.add('hidden');
                contentChequesTerceros.classList.remove('hidden');
            } catch (error) {
                console.error("Error obteniendo clientes:", error.message);
                showConfirmModal("Error al obtener clientes. Por favor, intente nuevamente.");
            }
    }
}

// ---------------------------------------------------------------------------
// Filtro (card compartida entre cheques propios y cheques del cliente)
// ---------------------------------------------------------------------------

const FILTER_INPUT_IDS = {
    numero: 'filter-cheque-numero',
    destinatario: 'filter-destinatario',
    tercero: 'filter-tercero',
    fechaDesde: 'filter-fecha-desde',
    fechaHasta: 'filter-fecha-hasta',
    montoMinimo: 'filter-monto-minimo',
    montoMaximo: 'filter-monto-maximo'
};

function leerFiltrosDesdeCard() {
    const filtro = {};
    for (const [key, id] of Object.entries(FILTER_INPUT_IDS)) {
        const value = document.getElementById(id)?.value || '';
        if (value !== '') filtro[key] = value;
    }
    return filtro;
}

function clearFilterInputs() {
    Object.values(FILTER_INPUT_IDS).forEach(id => {
        const element = document.getElementById(id);
        if (element) element.value = '';
    });
}

function tieneFiltrosActivos(filtro) {
    return Object.values(filtro).some(value => value !== '' && value !== undefined);
}

function setHidden(id, hidden) {
    document.getElementById(id)?.classList.toggle('hidden', hidden);
}

function updateClearFilterButtonVisibility() {
    const activeTab = document.querySelector('#chequesSelector .tab-item.active')?.dataset.tab;
    const activo = tieneFiltrosActivos(currentFilter);
    setHidden('clear-filter-btn-proximos', !(activo && activeTab === 'proximos'));
    setHidden('clear-filter-btn-pagos', !(activo && activeTab === 'pagos'));
}

function updateClearFilterClienteButtonVisibility() {
    setHidden('clear-filter-btn-cheques-cliente', !tieneFiltrosActivos(currentFilterCliente));
}

function cerrarFilterCard() {
    const filterCard = document.getElementById('filter-card');
    if (filterCard) {
        filterCard.classList.add('hidden');
        filterCardVisible = false;
        currentActiveFilterBtn = null;
    }
}

function toggleFilterCard(event, filterBtnId) {
    const filterCard = document.getElementById('filter-card');
    const clickedBtn = document.getElementById(filterBtnId);
    if (!filterCard || !clickedBtn) return;

    if (filterCardVisible && currentActiveFilterBtn === clickedBtn) {
        cerrarFilterCard();
    } else {
        filterCard.classList.remove('hidden');
        filterCardVisible = true;
        currentActiveFilterBtn = clickedBtn;

        positionFilterCard(filterCard, clickedBtn);

        // Asegurar que el filtro no se salga de la pantalla
        const cardRect = filterCard.getBoundingClientRect();
        if (cardRect.left < 10) {
            filterCard.style.left = '10px';
        } else if (cardRect.right > window.innerWidth - 10) {
            filterCard.style.left = `${window.innerWidth - cardRect.width - 10}px`;
        }
    }

    event.stopPropagation();
}

function positionFilterCard(filterCard, button) {
    const rect = button.getBoundingClientRect();
    const cardWidth = filterCard.offsetWidth;
    const buttonWidth = rect.width;

    const top = rect.bottom + window.scrollY + 12; // 12px de espacio
    const left = rect.left + window.scrollX + (buttonWidth - cardWidth); // alineado a la izquierda del botón

    filterCard.style.top = `${top}px`;
    filterCard.style.left = `${left}px`;
}

function applyFilters() {
    currentFilter = leerFiltrosDesdeCard();
    currentChequesPage = 1;

    const tabName = document.querySelector('#chequesSelector .tab-item.active')?.dataset.tab;
    if (tabName === 'proximos') renderTablaProximos();
    else if (tabName === 'pagos') renderTablaPagos();

    cerrarFilterCard();
    updateClearFilterButtonVisibility();
}

// Igual que applyFilters, pero sobre los cheques del cliente (currentFilterCliente) en vez de
// los propios.
function applyFiltersCliente() {
    currentFilterCliente = leerFiltrosDesdeCard();
    renderTablaClienteActiva();
    cerrarFilterCard();
    updateClearFilterClienteButtonVisibility();
}

function handleClickOutsideFilterCard(event) {
    const filterCard = document.getElementById('filter-card');
    const botonesFiltro = ['filter-btn-proximos', 'filter-btn-pagos', 'clear-filter-btn-proximos', 'clear-filter-btn-pagos']
        .map(id => document.getElementById(id))
        .filter(Boolean);

    if (!filterCardVisible || !filterCard) return;
    if (filterCard.contains(event.target)) return;
    if (botonesFiltro.some(btn => btn === event.target || btn.contains(event.target))) return;

    cerrarFilterCard();
}

// ---------------------------------------------------------------------------
// Inicialización
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', async function () {
    if (typeof loadHeader === 'function') await loadHeader();
    if (typeof loadSidebar === 'function') {
        const role = localStorage.getItem('userRole') || 'admin';
        await loadSidebar(role);
    }

    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-item').forEach(item => {
        const target = item.dataset.targetPage;
        if (target && currentPath.includes(target)) {
            document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
        }
    });

    await createLoadingSpinner(contentPrincipal);

    setupChequesTabSelector();
    setupTableEventListeners();

    const tabSelectorEstado = document.getElementById('chequesSelector');
    const tabSelectorTipo = document.getElementById('chequesSelectorTerceros');

    if (tabSelectorEstado && tabSelectorTipo) {
        const estadoInicial = tabSelectorEstado.querySelector('.tab-item.active').dataset.tab;
        const tipoInicial = tabSelectorTipo.querySelector('.tab-item.active').dataset.tab;

        // Carga inicial con los valores por defecto (proximos y propio)
        await mostrarContenidoTabCheques(estadoInicial, tipoInicial);
        toggleSpinnerVisible(contentPrincipal);
    }

    document.getElementById('cancel-selection-btn')?.addEventListener('click', () => {
        selectedCheques.clear();
        document.querySelectorAll('#tabla-proximos input[type="checkbox"]').forEach(checkbox => {
            checkbox.checked = false;
        });
        datosChequesProximos.forEach(cheque => cheque.selected = false);
        updateSelectedChequesSummary();
    });

    document.getElementById('clear-filter-btn-proximos')?.addEventListener('click', () => {
        clearFilterInputs();
        applyFilters();
    });

    document.getElementById('clear-filter-btn-pagos')?.addEventListener('click', () => {
        clearFilterInputs();
        applyFilters();
    });

    const selectCantidad = document.getElementById("selectCheques");
    const inputCantCheques = document.getElementById('inputSelectCheques');

    inputCantCheques?.addEventListener("change", () => {
        if (inputCantCheques.value > 0) mostrarContenidoTabCheques('pagos');
    });

    selectCantidad?.addEventListener("change", () => {
        if (selectCantidad.value !== "Otro") {
            inputCantCheques.classList.add("hidden");
            inputCantCheques.value = '';
            mostrarContenidoTabCheques('pagos');
        } else {
            inputCantCheques.classList.remove("hidden");
        }
    });

    document.getElementById('pay-selected-btn')?.addEventListener('click', async () => {
        if (selectedCheques.size === 0) {
            showConfirmModal('No hay cheques seleccionados para pagar.');
            return;
        }
        const nros = Array.from(selectedCheques.keys());
        try {
            const response = await setChequesPagos(nros);
            if (response) {
                datosChequesProximos = moverAPagos(datosChequesProximos, datosChequesPagos, nros).arr;
                showConfirmModal(`Se marcaron como pagos los cheques con número: ${nros.join(', ')}`);
            }
        } catch (error) {
            console.log(error.message);
        }

        selectedCheques.clear();
        document.getElementById('clear-filter-btn-proximos')?.click();
    });

    try {
        dataChoferes = await fetchAllChoferes();
        dataProveedores = await fetchProveedores();
    } catch (error) {
        console.log(error.message);
    }

    document.getElementById('filter-btn-proximos')?.addEventListener('click', (e) => toggleFilterCard(e, 'filter-btn-proximos'));
    document.getElementById('filter-btn-pagos')?.addEventListener('click', (e) => toggleFilterCard(e, 'filter-btn-pagos'));

    // La card de filtro (#filter-card) es compartida: aplica sobre los cheques propios o sobre
    // los del cliente según qué botón "Filtrar" la haya abierto.
    document.getElementById('apply-filter-btn')?.addEventListener('click', () => {
        if (currentActiveFilterBtn?.id === 'filter-btn-cheques-cliente') applyFiltersCliente();
        else applyFilters();
    });

    window.addEventListener('resize', () => {
        if (filterCardVisible && currentActiveFilterBtn) {
            positionFilterCard(document.getElementById('filter-card'), currentActiveFilterBtn);
        }
    });

    document.addEventListener('click', handleClickOutsideFilterCard);
    updateClearFilterButtonVisibility();

    // -----------------------------------------------------------------------
    // Sockets: mantienen sincronizados tanto los cheques propios como los del
    // cliente que se esté mirando en el modal (si hay uno abierto).
    // -----------------------------------------------------------------------

    socket.on('nuevoPago', (pagos) => {
        let actualizoPropios = false;
        try {
            pagos.pagosArray.forEach(pago => {
                if (pago.tipo.toLowerCase() !== 'cheque') return;
                // El backend manda cliente_cuit (no cuit) en cada entrada de pagosArray.
                if (pago.cliente_cuit) { return; }
                if (agregarChequeSiFalta(datosChequesProximos, pago)) {
                    actualizoPropios = true;
                }
            });

            if (actualizoPropios) {
                renderTablaProximos();
                showConfirmModal("Se actualizaron los cheques próximos");
            }

            // Si el modal de un cliente está abierto en "Próximos" (la única pestaña donde puede
            // aparecer un cheque recién cargado) y el cheque nuevo es de ese mismo cliente, agregarlo.
            if (clienteData?.cuit && tabActivaCliente() === 'proximos') {
                let actualizoCliente = false;
                pagos.pagosArray.forEach(pago => {
                    if (pago.tipo.toLowerCase() === 'cheque' && pago.cliente_cuit === clienteData.cuit
                        && agregarChequeSiFalta(datosChequesProximosCliente, { ...pago, importe: parseImporte(pago.importe) })) {
                        actualizoCliente = true;
                    }
                });
                if (actualizoCliente) {
                    renderTablaProximosCliente();
                    showConfirmModal("Se actualizaron los cheques del cliente");
                }
            }
        } catch (error) {
            console.error("Error procesando nuevoPago:", error);
        }
    });

    socket.on('deletePago', (pago) => {
        if (pago.tipo.toLowerCase() !== 'cheque') return;

        if (!pago.cuit) {
            const propios = quitarChequePorNro(datosChequesProximos, pago.id);
            if (propios.cambio) {
                datosChequesProximos = propios.arr;
                currentChequesPage = 1;
                renderTablaProximos();
                showConfirmModal("Se actualizaron los cheques próximos");
                return;
            }
        }

        // Si el cheque eliminado es del cliente que se está mirando en el modal, sacarlo de ahí.
        if (clienteData?.cuit && pago.cuit === clienteData.cuit) {
            const proximosCliente = quitarChequePorNro(datosChequesProximosCliente, pago.id);
            const pagosCliente = quitarChequePorNro(datosChequesPagosCliente, pago.id);

            if (proximosCliente.cambio || pagosCliente.cambio) {
                datosChequesProximosCliente = proximosCliente.arr;
                datosChequesPagosCliente = pagosCliente.arr;
                selectedChequesCliente.delete(pago.id);
                renderTablaClienteActiva();
                showConfirmModal("Se actualizaron los cheques del cliente");
            }
        }
    });

    socket.on('updatePagos', async ({ updatedPagos }) => {
        const chequesActualizadosIds = new Set(
            updatedPagos.filter(p => p.tipo === "cheque").map(p => p.id)
        );

        // Propios: solo si estamos parados en la pestaña "proximos"
        const activeTab = document.querySelector('#chequesSelector .tab-item.active');
        if (activeTab?.dataset.tab === "proximos"
            && datosChequesProximos.some(cheque => chequesActualizadosIds.has(cheque.nro_cheque))) {
            activeTab.click(); // refresca la pestaña completa
            showConfirmModal("Se actualizaron los cheques próximos");
        }

        // Cheques del cliente (modal abierto): el payload no trae el valor nuevo (p. ej. a
        // quién se endosó), así que ante la duda se vuelve a pedir la pestaña activa al backend.
        if (datosChequesProximosCliente.some(cheque => chequesActualizadosIds.has(cheque.nro_cheque))) {
            await mostrarContenidoTabChequesCliente(tabActivaCliente() || 'proximos');
            showConfirmModal("Se actualizaron los cheques del cliente");
        }
    });

    socket.on('marcarPago', (pago) => {
        const propios = moverAPagos(datosChequesProximos, datosChequesPagos, pago.nros);
        if (propios.cambio) {
            datosChequesProximos = propios.arr;
            renderTablaProximos();
            renderTablaPagos();
            showConfirmModal("Se marcaron cheques como pagos y se actualizaron las tablas");
        }

        // Mismo movimiento (próximos -> pagos) para los cheques del cliente, si el modal está
        // abierto y alguno de los cheques marcados es de ese cliente.
        const cliente = moverAPagos(datosChequesProximosCliente, datosChequesPagosCliente, pago.nros, selectedChequesCliente);
        if (cliente.cambio) {
            datosChequesProximosCliente = cliente.arr;
            renderTablaClienteActiva();
            showConfirmModal("Se actualizaron los cheques del cliente");
        }
    });
});
