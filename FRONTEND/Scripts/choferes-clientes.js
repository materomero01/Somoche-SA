// /FRONTEND/js/choferes-clientes.js

// Importa renderTabla desde tabla.js
import { renderTabla } from './tabla.js';

// --- Datos de ejemplo (sustituir con datos reales del backend) ---
let mockChoferes = [
    { id: 1, nombre: 'Juan Pérez', cuil: '20-12345678-9', trabajador: 'Monotributista', chasis: 'AB123CD', acoplado: 'EF456GH', telefono: '11-1234-5678', email: 'juan.perez@example.com' },
    { id: 2, nombre: 'Ana García', cuil: '27-98765432-1', trabajador: 'Responsable Inscripto', chasis: 'IJ789KL', acoplado: 'MN012OP', telefono: '11-9876-5432', email: 'ana.garcia@example.com' },
    { id: 3, nombre: 'Carlos Ruiz', cuil: '20-11223344-5', trabajador: 'Monotributista', chasis: 'QR345ST', acoplado: 'UV678WX', telefono: '11-3333-4444', email: 'carlos.ruiz@example.com' },
    { id: 4, nombre: 'Laura Blanco', cuil: '27-55667788-9', trabajador: 'Autónomo', chasis: 'YZ901AB', acoplado: 'CD234EF', telefono: '11-5555-6666', email: 'laura.blanco@example.com' },
    { id: 5, nombre: 'Pedro Gómez', cuil: '20-99887766-0', trabajador: 'Monotributista', chasis: 'GH567IJ', acoplado: 'KL890MN', telefono: '11-7777-8888', email: 'pedro.gomez@example.com' },
    { id: 6, nombre: 'Sofía Torres', cuil: '27-11223344-5', trabajador: 'Responsable Inscripto', chasis: 'OP123QR', acoplado: 'ST456UV', telefono: '11-1111-2222', email: 'sofia.torres@example.com' },
    { id: 7, nombre: 'Miguel Ángel', cuil: '20-66778899-1', trabajador: 'Monotributista', chasis: 'WX789YZ', acoplado: 'AB012CD', telefono: '11-4444-5555', email: 'miguel.angel@example.com' },
    { id: 8, nombre: 'Valeria López', cuil: '27-33445566-7', trabajador: 'Autónomo', chasis: 'EF345GH', acoplado: 'IJ678KL', telefono: '11-6666-7777', email: 'valeria.lopez@example.com' },
    { id: 9, nombre: 'Ricardo Díaz', cuil: '20-00998877-6', trabajador: 'Monotributista', chasis: 'MN901OP', acoplado: 'QR234ST', telefono: '11-8888-9999', email: 'ricardo.diaz@example.com' },
    { id: 10, nombre: 'Elena Castro', cuil: '27-77665544-3', trabajador: 'Responsable Inscripto', chasis: 'UV567WX', acoplado: 'YZ890AB', telefono: '11-0000-1111', email: 'elena.castro@example.com' },
    { id: 11, nombre: 'Francisco Giménez', cuil: '20-13579246-8', trabajador: 'Monotributista', chasis: 'CD135EF', acoplado: 'GH246IJ', telefono: '11-2233-4455', email: 'francisco.gimenez@example.com' },
    { id: 12, nombre: 'Gabriela Herrera', cuil: '27-24681357-0', trabajador: 'Autónomo', chasis: 'KL798MN', acoplado: 'OP012QR', telefono: '11-5544-3322', email: 'gabriela.herrera@example.com' },
    { id: 13, nombre: 'Horacio Navarro', cuil: '20-97531864-2', trabajador: 'Monotributista', chasis: 'ST321UV', acoplado: 'WX654YZ', telefono: '11-9988-7766', email: 'horacio.navarro@example.com' },
    { id: 14, nombre: 'Isabel Ortega', cuil: '27-86429753-1', trabajador: 'Responsable Inscripto', chasis: 'AB987CD', acoplado: 'EF654GH', telefono: '11-1212-3434', email: 'isabel.ortega@example.com' },
    { id: 15, nombre: 'Javier Luna', cuil: '20-11223344-0', trabajador: 'Monotributista', chasis: 'IJ345KL', acoplado: 'MN678OP', telefono: '11-5656-7878', email: 'javier.luna@example.com' },
    { id: 16, nombre: 'Karen Silva', cuil: '27-55443322-1', trabajador: 'Autónomo', chasis: 'QR901ST', acoplado: 'UV234WX', telefono: '11-9090-1212', email: 'karen.silva@example.com' },
    { id: 17, nombre: 'Luis Morales', cuil: '20-88776655-9', trabajador: 'Monotributista', chasis: 'YZ567AB', acoplado: 'CD890EF', telefono: '11-3434-5656', email: 'luis.morales@example.com' },
    { id: 18, nombre: 'Marta Ríos', cuil: '27-00112233-4', trabajador: 'Responsable Inscripto', chasis: 'GH123IJ', acoplado: 'KL456MN', telefono: '11-7878-9090', email: 'marta.rios@example.com' },
    { id: 19, nombre: 'Nestor Vidal', cuil: '20-44556677-8', trabajador: 'Monotributista', chasis: 'OP789QR', acoplado: 'ST012UV', telefono: '11-2323-4545', email: 'nestor.vidal@example.com' },
    { id: 20, nombre: 'Olga Paz', cuil: '27-99887766-5', trabajador: 'Autónomo', chasis: 'WX345YZ', acoplado: 'AB678CD', telefono: '11-6767-8989', email: 'olga.paz@example.com' }
];

let mockClientes = [
    { id: 1, nombre: 'Industrias SA', cuit: '30-12345678-9' },
    { id: 2, nombre: 'Comercio SRL', cuit: '30-98765432-1' },
    { id: 3, nombre: 'Servicios Integrales', cuit: '30-11223344-5' },
    { id: 4, nombre: 'Tecno Soluciones', cuit: '30-55667788-9' },
    { id: 5, nombre: 'Agropecuaria del Sur', cuit: '30-99887766-0' },
    { id: 6, nombre: 'Distribuidora Norte', cuit: '30-11223344-5' },
    { id: 7, nombre: 'Logística Central', cuit: '30-66778899-1' },
    { id: 8, nombre: 'Construcciones Modernas', cuit: '30-33445566-7' },
    { id: 9, nombre: 'Consultora Global', cuit: '30-00998877-6' },
    { id: 10, nombre: 'Farmacia Modelo', cuit: '30-77665544-3' },
    { id: 11, nombre: 'Panadería La Espiga', cuit: '20-13579246-8' },
    { id: 12, nombre: 'Carnicería El Novillo', cuit: '20-24681357-0' },
    { id: 13, nombre: 'Ferretería La Tuerca', cuit: '20-97531864-2' },
    { id: 14, nombre: 'Librería El Saber', cuit: '20-86429753-1' },
    { id: 15, nombre: 'Pinturería Color Fantasía', cuit: '20-11223344-0' },
    { id: 16, nombre: 'Veterinaria Mascotas Felices', cuit: '20-55443322-1' },
    { id: 17, nombre: 'Estudio Contable ABC', cuit: '20-88776655-9' },
    { id: 18, nombre: 'Gimnasio Fuerza y Salud', cuit: '20-00112233-4' },
    { id: 19, nombre: 'Despensa Don Juan', cuit: '20-44556677-8' },
    { id: 20, nombre: 'Florería La Rosa', cuit: '20-99887766-5' }
];

let currentChoferesPage = 1;
let currentClientesPage = 1;

// --- Definición de columnas para las tablas ---
const choferesColumns = [
    { key: 'nombre', label: 'Nombre y Apellido' },
    { key: 'cuil', label: 'CUIL/CUIT' },
    { key: 'trabajador', label: 'Trabajador', type: 'select', options: ['Monotributista', 'Responsable Inscripto', 'Autónomo', 'Exento'] },
    { key: 'chasis', label: 'Chasis' },
    { key: 'acoplado', label: 'Acoplado' },
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
            showConfirmModal(`¿Estás seguro de que quieres eliminar al chofer ${rowData.nombre}?`, () => handleDelete(rowData.id, 'choferes'));
        }
    },
    {
        icon: 'bi bi-send',
        tooltip: 'Ver Detalles',
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
        onEdit: (id, field, value) => handleEdit(id, field, value, 'choferes'),
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
        onEdit: (id, field, value) => handleEdit(id, field, value, 'clientes'),
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

function handleTabContentDisplay(selectedTab) {
    const choferesContent = document.getElementById('content-choferes');
    const clientesContent = document.getElementById('content-clientes');

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
                    chofer.nombre.toLowerCase().includes(searchTerm) ||
                    chofer.cuil.toLowerCase().includes(searchTerm) ||
                    chofer.chasis.toLowerCase().includes(searchTerm) ||
                    chofer.acoplado.toLowerCase().includes(searchTerm)
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
    const btnAddCliente = document.getElementById('btnAddCliente');

    if (btnAddChofer) {
        btnAddChofer.addEventListener('click', () => {
            alert('Funcionalidad para añadir nuevo chofer.');
        });
    }

    const formCard = document.getElementById('addClienteCard');
    const btnGuardar = document.getElementById('btnGuardarNuevoCliente');

    if (btnAddCliente) {
        btnAddCliente.addEventListener('click', () => {
            formCard.classList.toggle('hidden');
        });
    }

    if (btnGuardar) {
        btnGuardar.addEventListener('click', () => {
            const nombre = document.getElementById('nuevoClienteNombre').value.trim();
            const cuit = document.getElementById('nuevoClienteCuit').value.trim();

            if (!nombre || !cuit) {
                alert('Por favor completá los campos obligatorios.');
                return;
            }

            const nuevoCliente = {
                id: Date.now(),
                nombre,
                cuit
            };

            mockClientes.push(nuevoCliente);
            renderClientesTable(mockClientes);

            document.getElementById('nuevoClienteNombre').value = '';
            document.getElementById('nuevoClienteCuit').value = '';
            formCard.classList.add('hidden');
            alert('Nuevo cliente añadido exitosamente.'); // ADDED ALERT
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
    return JSON.stringify(originalData) !== JSON.stringify(stagedData);
}

function handleSaveEdit() {
    console.log('Guardando cambios:', stagedEditingData);
    
    if (currentEditingTableType === 'choferes') {
        const index = mockChoferes.findIndex(c => c.id === editingRowId);
        if (index !== -1) {
            mockChoferes[index] = { ...mockChoferes[index], ...stagedEditingData };
        }
        alert('Cambios guardados para el chofer.'); // ADDED ALERT
    } else if (currentEditingTableType === 'clientes') {
        const index = mockClientes.findIndex(c => c.id === editingRowId);
        if (index !== -1) {
            mockClientes[index] = { ...mockClientes[index], ...stagedEditingData };
        }
        alert('Cambios guardados para el cliente.'); // ADDED ALERT
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
function handleDelete(id, tableType) {
    console.log(`Eliminando ID: ${id} de la tabla ${tableType}`);
    
    if (tableType === 'choferes') {
        const totalItemsBefore = mockChoferes.length;
        mockChoferes = mockChoferes.filter(chofer => chofer.id !== id);
        
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
        const userRole = localStorage.getItem('userRole') || 'admin';
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
        const addClienteWrapper = document.querySelector('.add-cliente-wrapper');
        const addClienteCard = document.getElementById('addClienteCard');

        const isClickInsideModal = modalContent && modalContent.contains(event.target);
        const isClickInsideHeader = headerContainer && headerContainer.contains(event.target);
        const isClickInsideSidebar = sidebarContainer && sidebarContainer.contains(event.target);
        const isClickInsideAddCliente = addClienteWrapper && addClienteWrapper.contains(event.target);

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