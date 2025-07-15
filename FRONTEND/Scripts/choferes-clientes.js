// /FRONTEND/js/choferes-clientes.js

// Importa renderTabla desde tabla.js
import { renderTabla } from './tabla.js';
import { fetchAllDataChoferes, updateChofer, deleteChofer, fetchClientes, updateCliente, insertCliente, insertChofer } from './api.js';
import { seePassword } from './login-register.js';

// --- Datos de ejemplo (sustituir con datos reales del backend) ---
let mockChoferes = [];

let mockClientes = [];

// { id: 1, nombre: 'Industrias SA', cuit: '30-12345678-9' },
// { id: 2, nombre: 'Comercio SRL', cuit: '30-98765432-1' },
// { id: 3, nombre: 'Servicios Integrales', cuit: '30-11223344-5' },
// { id: 4, nombre: 'Tecno Soluciones', cuit: '30-55667788-9' },
// { id: 5, nombre: 'Agropecuaria del Sur', cuit: '30-99887766-0' },
// { id: 6, nombre: 'Distribuidora Norte', cuit: '30-11223344-5' },
// { id: 7, nombre: 'Logística Central', cuit: '30-66778899-1' },
// { id: 8, nombre: 'Construcciones Modernas', cuit: '30-33445566-7' },
// { id: 9, nombre: 'Consultora Global', cuit: '30-00998877-6' },
// { id: 10, nombre: 'Farmacia Modelo', cuit: '30-77665544-3' },
// { id: 11, nombre: 'Panadería La Espiga', cuit: '20-13579246-8' },
// { id: 12, nombre: 'Carnicería El Novillo', cuit: '20-24681357-0' },
// { id: 13, nombre: 'Ferretería La Tuerca', cuit: '20-97531864-2' },
// { id: 14, nombre: 'Librería El Saber', cuit: '20-86429753-1' },
// { id: 15, nombre: 'Pinturería Color Fantasía', cuit: '20-11223344-0' },
// { id: 16, nombre: 'Veterinaria Mascotas Felices', cuit: '20-55443322-1' },
// { id: 17, nombre: 'Estudio Contable ABC', cuit: '20-88776655-9' },
// { id: 18, nombre: 'Gimnasio Fuerza y Salud', cuit: '20-00112233-4' },
// { id: 19, nombre: 'Despensa Don Juan', cuit: '20-44556677-8' },
// { id: 20, nombre: 'Florería La Rosa', cuit: '20-99887766-5' }

let currentChoferesPage = 1;
let currentClientesPage = 1;

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
            showConfirmModal(`¿Estás seguro de que quieres eliminar al chofer ${rowData.nombre}?`, () => handleDelete(rowData.cuil, 'choferes'));
        }
    },
    {
        icon: 'bi bi-send',
        tooltip: 'Ver Viajes',
        handler: (rowData) => {
            console.log('Navegar a detalles del chofer:', rowData);
            alert(`Navegando a los detalles de ${rowData.nombre}`);
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
            showConfirmModal(`¿Estás seguro de que quieres eliminar al cliente ${rowData.nombre}?`, () => handleDelete(rowData.id, 'clientes'));
        }
    },
    {
        icon: 'bi bi-send',
        tooltip: 'Ver Viajes',
        handler: (rowData) => {
            console.log('Navegar a viajes del cliente:', rowData);
            alert(`Navegando a los viajes de ${rowData.nombre}`);
        }
    }
];

// --- Estado de edición ---
let editingRowId = null;
let currentEditingTableType = null;
let originalEditingData = {};
let stagedEditingData = {};

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
        onEdit: (cuil, field, value) => handleEdit(cuil, field, value, 'choferes'),
        tableType: 'choferes',
        currentPage: currentPage, // Pasar la página actual
        onPageChange: (page) => { currentChoferesPage = page; } // Callback para actualizar la página
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
        onEdit: (cuil, field, value) => handleEdit(cuil, field, value, 'clientes'),
        tableType: 'clientes',
        currentPage: currentPage, // Pasar la página actual
        onPageChange: (page) => { currentClientesPage = page; } // Callback para actualizar la página
    });
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

async function handleTabContentDisplay(selectedTab) {
    const choferesContent = document.getElementById('content-choferes');
    const clientesContent = document.getElementById('content-clientes');

    if (selectedTab === 'choferes') {
        choferesContent.classList.remove('hidden');
        clientesContent.classList.add('hidden');
        if (mockChoferes?.length === 0) {
            mockChoferes = await fetchAllDataChoferes();
            console.log(mockChoferes);
        }
        renderChoferesTable(mockChoferes, currentChoferesPage);
        currentEditingTableType = 'choferes';
    } else if (selectedTab === 'clientes') {
        choferesContent.classList.add('hidden');
        clientesContent.classList.remove('hidden');
        if (mockClientes?.length === 0) {
            mockClientes = await fetchClientes();
            console.log(mockClientes);
        }
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
                // Resetear a página 1 solo cuando se busca (esto es normal)
                currentChoferesPage = 1;
                renderChoferesTable(filteredData, 1);
            } else if (tableType === 'clientes') {
                filteredData = mockClientes.filter(cliente =>
                    cliente.nombre.toLowerCase().includes(searchTerm) ||
                    cliente.cuit.toLowerCase().includes(searchTerm)
                );
                // Resetear a página 1 solo cuando se busca (esto es normal)
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
            console.log(choferData);
            for (let [key, value] of choferData.entries()) {
                choferData[key] = value.trim();
            }
            var valid = true;
            ['nombre','cuil','password', 'trabajador','patente_chasis'].forEach( key => {
                if (!choferData[key] || choferData[key] === '')
                    valid = false;
            });
            if (!valid){
                alert('Por favor completá los campos obligatorios.');
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
            }
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
                alert('Nuevo chofer añadido exitosamente.'); // ADDED ALERT
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
                alert('Por favor completá los campos obligatorios.');
                return;
            }
            const payload = {
                cuit: cuit,
                nombre: nombre
            }
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
                alert('Nuevo cliente añadido exitosamente.'); // ADDED ALERT
            }
        });
    }
}

// --- Lógica de Edición ---
function enterEditMode(rowData, tableType) {
    // Si ya hay una fila siendo editada, preguntamos si quiere guardar los cambios
    if (editingRowId !== null && editingRowId !== rowData.id) {
        if (hasChanges(originalEditingData, stagedEditingData)) {
            showConfirmModal(
                "Hay cambios sin guardar en la fila actual. ¿Deseas guardarlos antes de editar otra?", 
                () => {
                    handleSaveEdit();
                    // Después de guardar, entra al modo de edición de la nueva fila
                    setTimeout(() => enterEditMode(rowData, tableType), 100);
                },
                () => {
                    // Si cancela, simplemente resetea y entra al modo de edición de la nueva fila
                    resetEditingState();
                    enterEditMode(rowData, tableType);
                }
            );
            return;
        } else {
            resetEditingState();
        }
    }

    // Si se hace clic en editar la misma fila que ya está siendo editada, salir del modo edición
    if (editingRowId === rowData.id) {
        if (hasChanges(originalEditingData, stagedEditingData)) {
            showConfirmModal(
                "Hay cambios sin guardar. ¿Deseas guardarlos o descartarlos?", 
                handleSaveEdit, 
                handleCancelEdit
            );
        } else {
            exitEditMode();
        }
        return;
    }

    // Entrar en modo edición
    originalEditingData = JSON.parse(JSON.stringify(rowData));
    stagedEditingData = JSON.parse(JSON.stringify(rowData));
    editingRowId = rowData.id;
    currentEditingTableType = tableType;

    // Re-renderizar la tabla para mostrar los inputs
    renderCurrentTable();
}

// Función llamada cuando un input editable cambia
function handleEdit(id, field, value, tableType) {
    if (id === editingRowId && tableType === currentEditingTableType) {
        stagedEditingData[field] = value;
        console.log(`Campo ${field} de ID ${id} actualizado a ${value}`);
    }
}

function hasChanges(originalData, stagedData) {
    Object.keys(stagedEditingData).forEach(key => {
        stagedEditingData[key] = stagedEditingData[key] === ''? null : stagedEditingData[key];
    });
    return JSON.stringify(originalData) !== JSON.stringify(stagedData);
}

async function handleSaveEdit() {
    console.log('Guardando cambios:', stagedEditingData);
    if (hasChanges(originalEditingData, stagedEditingData))
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
                }
                const response = await updateChofer(originalEditingData.cuil, payload);
                console.log(response);
                if (response && index !== -1) {
                    mockChoferes[index] = { ...mockChoferes[index], ...stagedEditingData };
                    alert('Cambios guardados para el chofer.'); // ADDED ALERT
                }
                
            } else if (currentEditingTableType === 'clientes') {
                const index = mockClientes.findIndex(c => c.id === editingRowId);
                const payload = {
                    cuit: stagedEditingData.cuit || null,
                    nombre: stagedEditingData.nombre || null
                }
                const response = await updateCliente(originalEditingData.cuit, payload);
                if (response && index !== -1) {
                    mockClientes[index] = { ...mockClientes[index], ...stagedEditingData };
                    alert('Cambios guardados para el cliente.'); // ADDED ALERT
                }
                
            }
        } catch (error){
            console.log(error);
        }
    
    // Salir del modo edición y re-renderizar manteniendo la página actual
    exitEditMode();
    hideConfirmModal();
}

function handleCancelEdit() {
    console.log('Cancelando edición');
    
    // Salir del modo edición y re-renderizar
    exitEditMode();
    hideConfirmModal();
    alert('Edición cancelada.'); // ADDED ALERT
}

function exitEditMode() {
    resetEditingState();
    renderCurrentTable();
}

function renderCurrentTable() {
    if (currentEditingTableType === 'choferes') {
        renderChoferesTable(mockChoferes, currentChoferesPage);
    } else if (currentEditingTableType === 'clientes') {
        renderClientesTable(mockClientes, currentClientesPage);
    }
}

function resetEditingState() {
    editingRowId = null;
    originalEditingData = {};
    stagedEditingData = {};
}

// --- Lógica de Eliminación ---
async function handleDelete(cuil, tableType) {
    console.log(`Eliminando ID: ${id} de la tabla ${tableType}`);
    
    if (tableType === 'choferes') {
        const response = await deleteChofer(cuil);
        if (response.ok){
            mockChoferes = mockChoferes.filter(chofer => chofer.cuil !== cuil);
            
            // Verificar si después de eliminar necesitamos ajustar la página
            const totalItemsAfter = mockChoferes.length;
            const itemsPerPage = 10;
            const maxPage = Math.ceil(totalItemsAfter / itemsPerPage) || 1;
            
            // Si estamos en una página que ya no existe, ir a la última página válida
            if (currentChoferesPage > maxPage) {
                currentChoferesPage = maxPage;
            }
            
            renderChoferesTable(mockChoferes, currentChoferesPage);
            alert('Chofer eliminado exitosamente.'); // ADDED ALERT
        }
    } else if (tableType === 'clientes') {
        const totalItemsBefore = mockClientes.length;
        mockClientes = mockClientes.filter(cliente => cliente.id !== id);
        
        // Verificar si después de eliminar necesitamos ajustar la página
        const totalItemsAfter = mockClientes.length;
        const itemsPerPage = 10;
        const maxPage = Math.ceil(totalItemsAfter / itemsPerPage) || 1;
        
        // Si estamos en una página que ya no existe, ir a la última página válida
        if (currentClientesPage > maxPage) {
            currentClientesPage = maxPage;
        }
        
        renderClientesTable(mockClientes, currentClientesPage);
        alert('Cliente eliminado exitosamente.'); // ADDED ALERT
    }
    
    resetEditingState();
    hideConfirmModal();
    
}

// --- Lógica del Modal de Confirmación ---
function showConfirmModal(message, onConfirm, onCancel) {
    const modal = document.getElementById('confirmModal');
    const modalMessage = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    const closeButton = modal.querySelector('.close-button');

    modalMessage.textContent = message;

    // Limpiar listeners anteriores
    confirmBtn.onclick = null;
    cancelBtn.onclick = null;
    closeButton.onclick = null;

    confirmBtn.onclick = () => {
        onConfirm();
        hideConfirmModal();
    };
    
    cancelBtn.onclick = () => {
        if (onCancel) onCancel();
        hideConfirmModal();
    };
    
    closeButton.onclick = () => {
        if (onCancel) onCancel();
        hideConfirmModal();
    };

    modal.style.display = 'block';
    
    // Cerrar si se hace clic fuera del modal
    window.onclick = function (event) {
        if (event.target == modal) {
            if (onCancel) onCancel();
            hideConfirmModal();
        }
    };
}

function hideConfirmModal() {
    const modal = document.getElementById('confirmModal');
    modal.style.display = 'none';
    window.onclick = null;
}

// --- Event Listeners para los eventos personalizados de tabla.js ---
function setupTableEventListeners() {
    // Escuchar el evento de guardar desde tabla.js
    document.addEventListener('saveEdit', (event) => {
        const { itemId } = event.detail;
        if (itemId === editingRowId) {
            handleSaveEdit();
        }
    });

    // Escuchar el evento de cancelar desde tabla.js
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

    // Asegurar que el modal esté oculto por defecto
    if (confirmModal) {
        confirmModal.style.display = 'none';
    }

    // Cargar Header
    if (typeof loadHeader === 'function') {
        await loadHeader();
    } else {
        console.error("loadHeader no está definido. Asegúrate de que /FRONTEND/js/header.js se cargue antes.");
    }

    // Cargar Sidebar
    if (typeof loadSidebar === 'function') {
        const userRole = localStorage.getItem('userRole');
        await loadSidebar(userRole);
    } else {
        console.error("loadSidebar no está definido. Asegúrate de que /FRONTEND/js/sidebar.js se cargue antes.");
    }

    // Lógica para resaltar el ítem del sidebar
    const currentPath = window.location.pathname;
    const sidebarItems = document.querySelectorAll('.sidebar-item');

    sidebarItems.forEach(item => {
        const targetPage = item.dataset.targetPage;
        if (targetPage && currentPath.includes(targetPage)) {
            sidebarItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        }
    });

    // Configurar event listeners para tabla.js
    setupTableEventListeners();

    // Inicializar funcionalidades
    setupChoferesClientesTabSelector();
    setupSearchBar('choferesSearchBar', 'choferes');
    setupSearchBar('clientesSearchBar', 'clientes');
    setupAddButtons();

    // Manejador de clics fuera de la fila de edición
    document.addEventListener('click', function (event) {
        const confirmModalElement = document.getElementById('confirmModal');
        const modalContent = confirmModalElement ? confirmModalElement.querySelector('.modal-content') : null;
        const headerContainer = document.getElementById('header-container');
        const sidebarContainer = document.getElementById('sidebar-container');
        const addClienteWrapper = document.getElementById('cliente-wrapper');
        const addClienteCard = document.getElementById('addClienteCard');
        const addChoferWrapper = document.getElementById('chofer-wrapper');
        const addChoferCard = document.getElementById('addChoferCard');

        const isClickInsideModal = modalContent && modalContent.contains(event.target);
        const isClickInsideHeader = headerContainer && headerContainer.contains(event.target);
        const isClickInsideSidebar = sidebarContainer && sidebarContainer.contains(event.target);
        const isClickInsideAddCliente = addClienteWrapper && addClienteWrapper.contains(event.target);
        const isClickInsideAddChofer = addChoferWrapper && addChoferWrapper.contains(event.target);

        // 👉 Si se hizo clic fuera del formulario de chofer, cerrarlo
        if (addChoferCard && !isClickInsideAddChofer) {
            addChoferCard.classList.add('hidden');
        }

        // 👉 Si se hizo clic fuera del formulario de cliente, cerrarlo
        if (addClienteCard && !isClickInsideAddCliente) {
            addClienteCard.classList.add('hidden');
        }

        // 👉 Si no se está en modo edición, no seguir
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
            isClickInsideModal ||
            isActionButton ||
            isInputInTable ||
            isTableHeader ||
            isPaginationControl ||
            isClickInsideHeader ||
            isClickInsideSidebar ||
            isClickInsideAddCliente
        ) {
            return;
        }

        // 👉 Si hay cambios sin guardar
        if (hasChanges(originalEditingData, stagedEditingData)) {
            showConfirmModal(
                "Hay cambios sin guardar. ¿Deseas guardar los cambios?",
                handleSaveEdit,
                handleCancelEdit
            );
        } else {
            exitEditMode();
        }
    });
    
    
    console.log("Choferes y Clientes - Script principal cargado con edición inline.");
});