import { renderTabla } from './tabla.js';
import { fetchAllDataChoferes, deleteChofer, fetchClientes, updateCliente, insertCliente, insertChofer, fetchTarifas } from './api.js';
import { updateChofer, showConfirmModal } from './apiPublic.js';
import { seePassword } from './login-register.js';
import { inicializarModal, renderizarTablas, handleSaveEditViajes } from './viajes-pagos.js';
import { parseImporte } from './resumenes.js';
import { handleSaveEditViajesCliente, inicializarModaCliente, renderizarTablaVC } from './viajes-clientes.js';

// --- Datos de ejemplo (sustituir con datos reales del backend) ---
let mockChoferes = [];
export let mockClientes = [];

export let tarifasCatac = [];

let currentChoferesPage = 1;
let currentClientesPage = 1;

// --- Estado de edición (exportado para ser usado en viajes-pagos.js) ---
export let editingRowId = null;
export let currentEditingTableType = null;
export let originalEditingData = {};
export let stagedEditingData = {};

// --- Definición de columnas para las tablas ---
const choferesColumns = [
    { key: 'nombre', label: 'Nombre y Apellido' },
    { key: 'cuil', label: 'CUIL/CUIT' },
    { key: 'trabajador', label: 'Trabajador', type: 'select', options: ['Monotributista', 'Responsable Inscripto', 'Autónomo', 'Exento'] },
    { key: 'patente_chasis', label: 'Chasis' },
    { key: 'patente_acoplado', label: 'Acoplado' },
    { key: 'telefono', label: 'Teléfono' },
    { key: 'email', label: 'Email' }
];

const clientesColumns = [
    { key: 'nombre', label: 'Nombre y Apellido/Razón Social' },
    { key: 'cuit', label: 'CUIL/CUIT' }
];

// --- Acciones para las tablas ---
const choferesActions = [
    {
        icon: 'bi bi-pencil',
        tooltip: 'Editar',
        handler: (rowData) => {
            enterEditMode(rowData, 'choferes');
        }
    },
    {
        icon: 'bi bi-trash',
        tooltip: 'Eliminar',
        handler: (rowData) => {
            showConfirmModal(`¿Estás seguro de que quieres eliminar al chofer ${rowData.nombre}?`, "delete", () => handleDelete(rowData.cuil, 'choferes'));
        }
    },
    {
        icon: 'bi bi-send',
        tooltip: 'Ver Viajes',
        handler: (rowData) => {
            verViajesModal(rowData, "chofer");
        }
    }
];

const clientesActions = [
    {
        icon: 'bi bi-pencil',
        tooltip: 'Editar',
        handler: (rowData) => {
            enterEditMode(rowData, 'clientes');
        }
    },
    {
        icon: 'bi bi-trash',
        tooltip: 'Eliminar',
        handler: (rowData) => {
            showConfirmModal(`¿Estás seguro de que quieres eliminar al cliente ${rowData.nombre}?`, "delete", () => handleDelete(rowData.id, 'clientes'));
        }
    },
    {
        icon: 'bi bi-send',
        tooltip: 'Ver Viajes',
        handler: (rowData) => {
            // Store CUIT before opening modal
            const cleanCUIT = rowData.cuit.replace(/[^0-9]/g, '');
            if (cleanCUIT.length === 11) {
                localStorage.setItem('selectedClientCUIT', cleanCUIT);
                console.log('Stored CUIT:', cleanCUIT);
                verViajesModal(rowData, "cliente");
            } else {
                console.error('Invalid CUIT:', rowData.cuit);
                showConfirmModal('Error: CUIT inválido en la fila seleccionada.');
            }
        }
    }
];

// --- Funciones de renderizado de tablas ---
function renderChoferesTable(data, currentPage = 1) {
    currentChoferesPage = currentPage;
    renderTabla({
        containerId: 'tabla-choferes',
        paginacionContainerId: 'paginacion-choferes',
        datos: data,
        columnas: choferesColumns,
        itemsPorPagina: 10,
        actions: choferesActions,
        editingRowId: editingRowId,
        onEdit: (id, field, value) => handleEdit(id, field, value, 'choferes'),
        tableType: 'choferes',
        currentPage: currentPage,
        onPageChange: (page) => { currentChoferesPage = page; }
    });
}

function renderClientesTable(data, currentPage = 1) {
    currentClientesPage = currentPage;
    renderTabla({
        containerId: 'tabla-clientes',
        paginacionContainerId: 'paginacion-clientes',
        datos: data,
        columnas: clientesColumns,
        itemsPorPagina: 10,
        actions: clientesActions,
        editingRowId: editingRowId,
        onEdit: (id, field, value) => handleEdit(id, field, value, 'clientes'),
        tableType: 'clientes',
        currentPage: currentPage,
        onPageChange: (page) => { currentClientesPage = page; }
    });
}

// --- Función para renderizar la tabla actual ---
export function renderCurrentTable() {
    console.log(currentEditingTableType);
    if (currentEditingTableType === 'choferes') {
        renderChoferesTable(mockChoferes, currentChoferesPage);
    } else if (currentEditingTableType === 'clientes') {
        renderClientesTable(mockClientes, currentClientesPage);
    } else if (currentEditingTableType === 'viajes') {
        renderizarTablas();
    } else if (currentEditingTableType === "viajesCliente") {
        renderizarTablaVC();
    }
}

// --- Lógica de Pestañas ---
function setupChoferesClientesTabSelector() {
    const tabSelector = document.getElementById('choferesClientesSelector');
    if (!tabSelector) {
        console.warn("Elemento #choferesClientesSelector no encontrado. La funcionalidad de pestañas no se inicializará.");
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

async function verViajesModal(choferData, tipo) {
    tarifasCatac = JSON.parse(localStorage.getItem('tarifasCatac')) || fetchTarifas();
    if (tipo === "chofer") {
        const modalViajesPagos = document.getElementById("viajesPagosModal");
        if (modalViajesPagos) {
            try {
                const response = await fetch('/FRONTEND/viajes-pagos.html');
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }
                const viajesPagosHtml = await response.text();
                modalViajesPagos.innerHTML = viajesPagosHtml;
                modalViajesPagos.classList.toggle("active");
                inicializarModal(choferData);
            } catch (error) {
                console.log(error.message);
            }
        }
    } else if (tipo === "cliente") {
        const modalViajesClientes = document.getElementById("viajesClientesModal");
        if (modalViajesClientes) {
            try {
                const response = await fetch('/FRONTEND/viajes-clientes.html');
                if (!response.ok) {
                    throw new Error(`Error HTTP: ${response.status}`);
                }
                const viajesClientesHtml = await response.text();
                modalViajesClientes.innerHTML = viajesClientesHtml;
                modalViajesClientes.classList.toggle("active");
                inicializarModaCliente(choferData);
            } catch (error) {
                console.log(error.message);
            }
        }
    }
}

async function handleTabContentDisplay(selectedTab) {
    const choferesContent = document.getElementById('content-choferes');
    const clientesContent = document.getElementById('content-clientes');
    if (mockChoferes?.length === 0) {
        mockChoferes = await fetchAllDataChoferes();
    }
    if (mockClientes?.length === 0) {
        mockClientes = await fetchClientes();
    }
    if (selectedTab === 'choferes') {
        choferesContent.classList.remove('hidden');
        clientesContent.classList.add('hidden');
        
        renderChoferesTable(mockChoferes, currentChoferesPage);
        currentEditingTableType = 'choferes';
    } else if (selectedTab === 'clientes') {
        choferesContent.classList.add('hidden');
        clientesContent.classList.remove('hidden');
        renderClientesTable(mockClientes, currentClientesPage);
        currentEditingTableType = 'clientes';
    }
    resetEditingState();
}

// --- Lógica de la barra de búsqueda ---
function setupSearchBar(searchBarId, tableType) {
    const searchInput = document.querySelector(`#${searchBarId} .search-input`);
    const searchIcon = document.querySelector(`#${searchBarId} .search-icon`);

    if (searchInput && searchIcon) {
        const performSearch = () => {
            const searchTerm = searchInput.value.toLowerCase();
            let filteredData = [];

            if (tableType === 'choferes') {
                filteredData = mockChoferes.filter(chofer =>
                    chofer.nombre?.toLowerCase().includes(searchTerm) ||
                    chofer.cuil?.toLowerCase().includes(searchTerm) ||
                    chofer.patente_chasis?.toLowerCase().includes(searchTerm) ||
                    chofer.patente_acoplado?.toLowerCase().includes(searchTerm)
                );
                currentChoferesPage = 1;
                renderChoferesTable(filteredData, 1);
            } else if (tableType === 'clientes') {
                filteredData = mockClientes.filter(cliente =>
                    cliente.nombre.toLowerCase().includes(searchTerm) ||
                    cliente.cuit.toLowerCase().includes(searchTerm)
                );
                currentClientesPage = 1;
                renderClientesTable(filteredData, 1);
            }
        };

        searchIcon.addEventListener('click', performSearch);
        searchInput.addEventListener('input', performSearch);
    } else {
        console.warn(`Elementos de la barra de búsqueda para '${searchBarId}' no encontrados.`);
    }
}

// --- Lógica de los botones de añadir ---
function setupAddButtons() {
    const btnAddChofer = document.getElementById('btnAddChofer');
    const formCardChofer = document.getElementById('addChoferCard');
    const btnGuardarChofer = document.getElementById('btnGuardarNuevoChofer');
    if (btnAddChofer) {
        btnAddChofer.addEventListener('click', () => {
            formCardChofer.classList.toggle('hidden');
        });
    }
    if (btnGuardarChofer) {
        btnGuardarChofer.addEventListener('click', async () => {
            const formChofer = document.getElementById('form-chofer');
            const choferData = new FormData(formChofer);
            for (let [key, value] of choferData.entries()) {
                choferData[key] = value.trim();
            }
            var valid = true;
            ['nombre', 'cuil', 'password', 'trabajador', 'patente_chasis'].forEach(key => {
                if (!choferData[key] || choferData[key] === '')
                    valid = false;
            });
            if (!valid) {
                showConfirmModal('Por favor completá los campos obligatorios.');
                return;
            }
            const payload = {
                cuil: choferData['cuil'],
                nombre: choferData['nombre'],
                password: choferData['password'],
                trabajador: choferData['trabajador'] || null,
                patente_chasis: choferData['patente_chasis']?.toUpperCase(),
                patente_acoplado: choferData['patente_acoplado']?.toUpperCase() || null,
                telefono: choferData['telefono'] || null,
                email: choferData['email'] || null
            };
            const response = await insertChofer(payload);
            if (response) {
                const nuevoChofer = {
                    id: mockChoferes.length + 1,
                    nombre: payload.nombre,
                    cuil: payload.cuil,
                    trabajador: payload.trabajador,
                    patente_chasis: payload.patente_chasis,
                    patente_acoplado: payload.patente_acoplado,
                    telefono: payload.telefono,
                    email: payload.email
                };
                mockChoferes.push(nuevoChofer);
                renderChoferesTable(mockChoferes);
                formChofer.reset();
                formCardChofer.classList.toggle('hidden');
                showConfirmModal('Nuevo chofer añadido exitosamente.');
            }
        });
    }

    const btnAddCliente = document.getElementById('btnAddCliente');
    const formCard = document.getElementById('addClienteCard');
    const btnGuardar = document.getElementById('btnGuardarNuevoCliente');
    if (btnAddCliente) {
        btnAddCliente.addEventListener('click', () => {
            formCard.classList.toggle('hidden');
        });
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', async () => {
            const nombre = document.getElementById('nuevoClienteNombre').value.trim();
            const cuit = document.getElementById('nuevoClienteCuit').value.trim();

            if (!nombre || !cuit) {
                showConfirmModal('Por favor completá los campos obligatorios.');
                return;
            }
            const payload = {
                cuit: cuit,
                nombre: nombre
            };
            const response = await insertCliente(payload);
            if (response) {
                const nuevoCliente = {
                    id: mockClientes.length + 1,
                    nombre,
                    cuit
                };
                mockClientes.push(nuevoCliente);
                renderClientesTable(mockClientes);
                document.getElementById('nuevoClienteNombre').value = '';
                document.getElementById('nuevoClienteCuit').value = '';
                formCard.classList.add('hidden');
                showConfirmModal('Nuevo cliente añadido exitosamente.');
            }
        });
    }
}

// --- Lógica de Edición ---
export function enterEditMode(rowData, tableType) {
    if (editingRowId !== null && editingRowId !== rowData.id) {
        if (hasChanges(originalEditingData, stagedEditingData)) {
            showConfirmModal(
                "Hay cambios sin guardar en la fila actual. ¿Deseas guardarlos antes de editar otra?",
                "confirm",
                async () => {
                    await handleSaveEdit();
                    setTimeout(() => enterEditMode(rowData, tableType), 100);
                },
                () => {
                    resetEditingState();
                    enterEditMode(rowData, tableType);
                }
            );
            return;
        } else {
            resetEditingState();
        }
    }

    if (editingRowId === rowData.id) {
        if (hasChanges(originalEditingData, stagedEditingData)) {
            showConfirmModal(
                "Hay cambios sin guardar. ¿Deseas guardarlos o descartarlos?",
                "confirm",
                handleSaveEdit,
                handleCancelEdit
            );
        } else {
            exitEditMode();
        }
        return;
    }

    originalEditingData = JSON.parse(JSON.stringify(rowData));
    stagedEditingData = JSON.parse(JSON.stringify(rowData));
    editingRowId = rowData.id;
    currentEditingTableType = tableType;

    renderCurrentTable();
}

export function handleEdit(id, field, value, tableType) {
    if (id === editingRowId && tableType === currentEditingTableType) {
        stagedEditingData[field] = value;
        console.log(`Campo ${field} de ID ${id} actualizado a ${value}`);

        // Lógica específica para actualizar tarifa cuando se cambia km en la tabla de viajes
        if ((tableType === 'viajes' || tableType === 'viajesCliente') && field === 'km') {
            const currentKm = parseInt(value.trim(), 10);
            const tarifaCatacCalculada = (!isNaN(currentKm) && currentKm > 0 && currentKm <= tarifasCatac.length && tarifasCatac[currentKm - 1]?.valor !== undefined)
                ? parseImporte(tarifasCatac[currentKm - 1].valor)
                : parseImporte(tarifasCatac[tarifasCatac.length - 1]?.valor) || 0;
            stagedEditingData['tarifa'] = tarifaCatacCalculada;
            console.log(`Tarifa actualizada a ${tarifaCatacCalculada} para km ${value}`);
            
            // Actualizar el input de tarifa en el DOM
            const tarifaInput = document.getElementById('tarifaEdit');
            if (tarifaInput) {
                tarifaInput.value = tarifaCatacCalculada;
            }
        }
    }
}

export function hasChanges(originalData, stagedData) {
    Object.keys(stagedData).forEach(key => {
        stagedData[key] = stagedData[key] === '' ? null : stagedData[key];
    });
    return JSON.stringify(originalData) !== JSON.stringify(stagedData);
}

export async function handleSaveEdit() {
    if (!hasChanges(originalEditingData, stagedEditingData)) {
        exitEditMode();
        return;
    }

    try {
        if (currentEditingTableType === 'choferes') {
            const index = mockChoferes.findIndex(c => c.id === editingRowId);
            const payload = {
                nombre_y_apellido: stagedEditingData.nombre || null,
                cuil: stagedEditingData.cuil || null,
                trabajador: stagedEditingData.trabajador || null,
                patente_chasis: stagedEditingData.patente_chasis?.toUpperCase() || null,
                patente_acoplado: stagedEditingData.patente_acoplado?.toUpperCase() || null,
                telefono: stagedEditingData.telefono || null,
                email: stagedEditingData.email || null
            };
            const response = await updateChofer(originalEditingData.cuil, payload);
            if (response && index !== -1) {
                mockChoferes[index] = { ...mockChoferes[index], ...stagedEditingData };
                showConfirmModal('Cambios guardados para el chofer.');
            }
        } else if (currentEditingTableType === 'clientes') {
            const index = mockClientes.findIndex(c => c.id === editingRowId);
            const payload = {
                cuit: stagedEditingData.cuit || null,
                nombre: stagedEditingData.nombre || null
            };
            const response = await updateCliente(originalEditingData.cuit, payload);
            if (response && index !== -1) {
                mockClientes[index] = { ...mockClientes[index], ...stagedEditingData };
                showConfirmModal('Cambios guardados para el cliente.');
            }
        } else if (currentEditingTableType === 'viajes') {
            await handleSaveEditViajes();
        } else if (currentEditingTableType === 'viajesCliente') {
            await handleSaveEditViajesCliente();
        }
    } catch (error) {
        console.error('Error al guardar cambios:', error);
        showConfirmModal('Error al guardar los cambios.');
    }

    exitEditMode();
}

export function handleCancelEdit() {
    console.log('Cancelando edición');
    exitEditMode();
}

export function exitEditMode() {
    resetEditingState();
    renderCurrentTable();
}

export function resetEditingState() {
    editingRowId = null;
    originalEditingData = {};
    stagedEditingData = {};
}

// --- Lógica de Eliminación ---
async function handleDelete(cuil, tableType) {
    if (tableType === 'choferes') {
        const response = await deleteChofer(cuil);
        if (response.ok) {
            mockChoferes = mockChoferes.filter(chofer => chofer.cuil !== cuil);
            const totalItemsAfter = mockChoferes.length;
            const itemsPerPage = 10;
            const maxPage = Math.ceil(totalItemsAfter / itemsPerPage) || 1;
            if (currentChoferesPage > maxPage) {
                currentChoferesPage = maxPage;
            }
            renderChoferesTable(mockChoferes, currentChoferesPage);
            showConfirmModal('Chofer eliminado exitosamente.');
        }
    } else if (tableType === 'clientes') {
        mockClientes = mockClientes.filter(cliente => cliente.id !== cuil);
        const totalItemsAfter = mockClientes.length;
        const itemsPerPage = 10;
        const maxPage = Math.ceil(totalItemsAfter / itemsPerPage) || 1;
        if (currentClientesPage > maxPage) {
            currentClientesPage = maxPage;
        }
        renderClientesTable(mockClientes, currentClientesPage);
        showConfirmModal('Cliente eliminado exitosamente.');
    }
    resetEditingState();
    hideConfirmModal();
}

// --- Event Listeners para los eventos personalizados de tabla.js ---
function setupTableEventListeners() {
    document.addEventListener('saveEdit', (event) => {
        const { itemId } = event.detail;
        if (itemId === editingRowId) {
            handleSaveEdit();
        }
    });

    document.addEventListener('cancelEdit', (event) => {
        const { itemId } = event.detail;
        if (itemId === editingRowId) {
            handleCancelEdit();
        }
    });
}

// --- Inicialización al cargar el DOM ---
document.addEventListener('DOMContentLoaded', async function () {
    const headerContainer = document.getElementById('header-container');
    const sidebarContainer = document.getElementById('sidebar-container');
    const confirmModal = document.getElementById('confirmModal');

    if (confirmModal) {
        confirmModal.style.display = 'none';
    }

    if (typeof loadHeader === 'function') {
        await loadHeader();
    } else {
        console.error("loadHeader no está definido. Asegúrate de que /FRONTEND/js/header.js se cargue antes.");
    }

    if (typeof loadSidebar === 'function') {
        const userRole = localStorage.getItem('userRole');
        await loadSidebar(userRole);
    } else {
        console.error("loadSidebar no está definido. Asegúrate de que /FRONTEND/js/sidebar.js se cargue antes.");
    }

    const currentPath = window.location.pathname;
    const sidebarItems = document.querySelectorAll('.sidebar-item');

    sidebarItems.forEach(item => {
        const targetPage = item.dataset.targetPage;
        if (targetPage && currentPath.includes(targetPage)) {
            sidebarItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        }
    });

    setupTableEventListeners();
    setupChoferesClientesTabSelector();
    setupSearchBar('choferesSearchBar', 'choferes');
    setupSearchBar('clientesSearchBar', 'clientes');
    setupAddButtons();

    // Add CUIT capture for navigate-btn
    document.querySelectorAll('.navigate-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const row = e.target.closest('tr');
            const cuit = row.querySelector('td:nth-child(2)').getAttribute('title');
            const cleanCUIT = cuit.replace(/[^0-9]/g, '');
            if (cleanCUIT.length === 11) {
                localStorage.setItem('selectedClientCUIT', cleanCUIT);
                console.log('Stored CUIT:', cleanCUIT);
            } else {
                console.error('Invalid CUIT:', cuit);
                showConfirmModal('Error: CUIT inválido en la fila seleccionada.');
            }
        });
    });

    document.addEventListener('click', function (event) {
        const confirmModalElement = document.getElementById('confirmModal');
        const modalContent = confirmModalElement ? confirmModalElement.querySelector('.modal-content') : null;
        const headerContainer = document.getElementById('header-container');
        const sidebarContainer = document.getElementById('sidebar-container');
        const addClienteWrapper = document.getElementById('cliente-wrapper');
        const addClienteCard = document.getElementById('addClienteCard');
        const addChoferWrapper = document.getElementById('chofer-wrapper');
        const addChoferCard = document.getElementById('addChoferCard');
        const viajesPagosModal = document.getElementById('viajesPagosModal');

        const isClickOutsideModal = modalContent && !modalContent.contains(event.target);
        const isClickInsideHeader = headerContainer && headerContainer.contains(event.target);
        const isClickInsideSidebar = sidebarContainer && sidebarContainer.contains(event.target);
        const isClickInsideAddCliente = addClienteWrapper && addClienteWrapper.contains(event.target);
        const isClickInsideAddChofer = addChoferWrapper && addChoferWrapper.contains(event.target);
        const isClickInsideViajesModal = viajesPagosModal && viajesPagosModal.contains(event.target);

        if (addChoferCard && !isClickInsideAddChofer && !isClickInsideHeader && !isClickInsideSidebar) {
            addChoferCard.classList.add('hidden');
        }

        if (addClienteCard && !isClickInsideAddCliente && !isClickInsideHeader && !isClickInsideSidebar) {
            addClienteCard.classList.add('hidden');
        }

        if (editingRowId === null) {
            return;
        }

        const editingRowElement = document.querySelector(`.data-table tr[data-id="${editingRowId}"]`);
        const isClickInsideEditingRow = editingRowElement && editingRowElement.contains(event.target);
        const isActionButton = event.target.closest('.action-icons i');
        const isInputInTable = event.target.matches('.editable-input');
        const isTableHeader = event.target.closest('th');
        const isPaginationControl = event.target.closest('.pagination-controls');

        if (
            isClickInsideEditingRow ||
            !isClickOutsideModal ||
            isActionButton ||
            isInputInTable ||
            isTableHeader ||
            isPaginationControl ||
            isClickInsideHeader ||
            isClickInsideSidebar ||
            isClickInsideAddCliente ||
            isClickInsideViajesModal
        ) {
            return;
        }

        if (hasChanges(originalEditingData, stagedEditingData)) {
            showConfirmModal(
                "Hay cambios sin guardar. ¿Deseas guardar los cambios?",
                "confirm",
                handleSaveEdit,
                handleCancelEdit
            );
        } else {
            exitEditMode();
        }
    });
});