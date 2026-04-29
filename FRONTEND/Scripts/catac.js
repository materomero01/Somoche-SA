//catac.js
import { updateTarifas, tarifasCatac, tarifasFetra, loadTarifas} from './api.js';
import { showConfirmModal, createLoadingSpinner,toggleSpinnerVisible, changeSpinnerText} from './apiPublic.js';

let paginaActual = 1;
let contentShow = "catac";

const contentPrincipal = document.getElementById("catac-section");

// Tab content display
const handleTabContentDisplay = (selectedTab) => {
    const fetraHeader = document.getElementById("fetraHeader");
    const catacHeader = document.getElementById("catacHeader");
    const fetraData = document.getElementById("fetraData");
    const catacData = document.getElementById("catacData");
    if (selectedTab === 'catac') {
        fetraHeader?.classList.add("hidden");
        fetraData?.classList.add("hidden");
        catacHeader?.classList.remove("hidden");
        catacData?.classList.remove("hidden");
    } else if (selectedTab === 'fetra') {
        catacHeader?.classList.add("hidden");
        catacData?.classList.add("hidden");
        fetraHeader?.classList.remove("hidden");
        fetraData?.classList.remove("hidden");
    }
    contentShow = selectedTab;
};

// Setup tab selectors
const setupTabSelectors = () => {
    const tabSelector = document.getElementById('tarifasSectionSelector');
    if (!tabSelector) {
        console.warn("Elemento #tarifasSectionSelector no encontrado.");
        return;
    }

    const tabItems = tabSelector.querySelectorAll('.tab-item');
    tabItems.forEach(item => {
        item.addEventListener('click', () => {
            tabItems.forEach(tab => tab.classList.remove('active'));
            item.classList.add('active');
            handleTabContentDisplay(item.dataset.tab);
        });
    });

    const initialActive = tabSelector.querySelector('.tab-item.active');
    if (initialActive) handleTabContentDisplay(initialActive.dataset.tab);
};

function renderTabla({ containerId, tableId, datos, filas = 10, columnas = 5, pageNum = 1 }) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Contenedor ${containerId} no encontrado.`);
        return;
    }

    container.dataset.currentPage = pageNum;
    container.innerHTML = '';
    const tabla = document.createElement("table");
    tabla.id = tableId; // Corregido para coincidir con el CSS
    const tbody = document.createElement("tbody");

    const itemsPorPagina = filas * columnas;
    const totalPaginas = Math.ceil(datos.length / itemsPorPagina);

    function renderizarCuerpo(pagina) {
        tbody.innerHTML = "";
        const startIndex = (pagina - 1) * itemsPorPagina;

        for (let i = 0; i < filas; i++) {
            const tr = document.createElement("tr");

            for (let j = 0; j < columnas; j++) {
                const indice = startIndex + (j * filas) + i // Corregido para distribución en filas
                const tdId = document.createElement("td");
                tdId.classList.add("table-id-cell");
                tdId.textContent = indice + 1;

                const tdValor = document.createElement("td");
                tdValor.classList.add("catac-value-cell");
                tdValor.textContent = indice < datos.length ? datos[indice].valor : ""; // Rellenar con vacío si no hay datos

                tr.appendChild(tdId);
                tr.appendChild(tdValor);
            }
            tbody.appendChild(tr);
        }
    }

    function renderizarPaginacion(paginaActual) {
        const paginacionDiv = document.createElement("div");
        paginacionDiv.className = "pagination-controls";

        const btnAnterior = document.createElement("button");
        btnAnterior.textContent = "<";
        btnAnterior.classList.add("pagination-button");
        btnAnterior.disabled = paginaActual === 1;
        btnAnterior.onclick = () => cambiarPagina(paginaActual - 1);
        paginacionDiv.appendChild(btnAnterior);

        const maxBotones = 5;
        let inicioPagina = Math.max(1, paginaActual - Math.floor(maxBotones / 2));
        let finPagina = Math.min(totalPaginas, inicioPagina + maxBotones - 1);

        if (finPagina - inicioPagina + 1 < maxBotones) {
            inicioPagina = Math.max(1, finPagina - maxBotones + 1);
        }

        if (inicioPagina > 1) {
            paginacionDiv.appendChild(crearBotonPagina(1, paginaActual));
            if (inicioPagina > 2) {
                const ellipsis = document.createElement("span");
                ellipsis.textContent = "...";
                ellipsis.classList.add("pagination-ellipsis");
                paginacionDiv.appendChild(ellipsis);
            }
        }

        for (let i = inicioPagina; i <= finPagina; i++) {
            paginacionDiv.appendChild(crearBotonPagina(i, paginaActual));
        }

        if (finPagina < totalPaginas) {
            if (finPagina < totalPaginas - 1) {
                const ellipsis = document.createElement("span");
                ellipsis.textContent = "...";
                ellipsis.classList.add("pagination-ellipsis");
                paginacionDiv.appendChild(ellipsis);
            }
            paginacionDiv.appendChild(crearBotonPagina(totalPaginas, paginaActual));
        }

        const btnSiguiente = document.createElement("button");
        btnSiguiente.textContent = ">";
        btnSiguiente.classList.add("pagination-button");
        btnSiguiente.disabled = paginaActual === totalPaginas;
        btnSiguiente.onclick = () => cambiarPagina(paginaActual + 1);
        paginacionDiv.appendChild(btnSiguiente);
        
        container.appendChild(paginacionDiv);
    }

    function crearBotonPagina(numero, paginaActual) {
        const btn = document.createElement("button");
        btn.textContent = numero;
        btn.classList.add("pagination-button");
        if (numero === paginaActual) {
            btn.classList.add("active");
        }
        btn.onclick = () => cambiarPagina(numero);
        return btn;
    }

    function cambiarPagina(nuevaPagina) {
        nuevaPagina = Math.max(1, Math.min(nuevaPagina, totalPaginas));
        
        if (nuevaPagina === parseInt(container.dataset.currentPage)) {
            return;
        }

        container.dataset.currentPage = nuevaPagina;
        renderizarCuerpo(nuevaPagina);

        const paginacionAnterior = container.querySelector(".pagination-controls");
        if (paginacionAnterior) {
            paginacionAnterior.remove();
        }
        renderizarPaginacion(nuevaPagina);
    }

    renderizarCuerpo(pageNum);
    tabla.appendChild(tbody);
    container.appendChild(tabla);
    renderizarPaginacion(pageNum);
}

function configurarInteraccionesCatac() {
    const inputActualizar = document.getElementById('catac-update');
    const btnActualizar = document.getElementById('catac-update-btn');

    if (btnActualizar && inputActualizar) {
        btnActualizar.addEventListener('click', async function() {
            const textoPorcentaje = inputActualizar.value;
            let porcentaje = parseFloat(textoPorcentaje);
            if (isNaN(porcentaje)) {
                showConfirmModal('Por favor, ingresa un porcentaje válido (número).');
                return;
            }
            const factor = porcentaje / 100;
            const payload = {
                porcentaje: factor,
                tabla: contentShow
            }

            showConfirmModal(`Estas seguro de que desea actualizar las tarifas de ${contentShow === "catac"? "Catac" : "Fe.Tr.A"} en un ${textoPorcentaje}%?`, 'confirm', async () => {
                try {
                    changeSpinnerText(contentPrincipal, "Actualizando tarifas...");
                    toggleSpinnerVisible(contentPrincipal);
                    const data = await updateTarifas(payload);
                    const updateInput = document.getElementById('catac-update');
                    updateInput.value = '';
                    if ((contentShow === 'catac' && data.tarifas.catac.length > 0) || (contentShow === 'fetra' && data.tarifas.fetra.length > 0)){
                        const container = contentShow === 'catac'? document.getElementById('tabla-catac') : document.getElementById('tabla-fetra');
                        if (!container) {
                            console.error('Contenedor tabla-catac no encontrado.');
                            showConfirmModal('Error: No se pudo actualizar la tabla.');
                            return;
                        }

                        paginaActual = parseInt(container.dataset.currentPage) || 1;
                        renderTabla({
                            containerId: contentShow === "catac"? 'tabla-catac' : 'tabla-fetra',
                            tableId: contentShow === "catac"? 'catacTable' : 'fetraTable',
                            datos: contentShow === "catac"? tarifasCatac : tarifasFetra,
                            filas: 10,
                            columnas: 5,
                            pageNum: paginaActual
                        });
                        showConfirmModal(`Valores de la tabla actualizados con un ${porcentaje}% de variación.`);
                    } else 
                        showConfirmModal('Ocurrio un error al actualizar las tarifas de Catac');
                    toggleSpinnerVisible(contentPrincipal);
                    changeSpinnerText(contentPrincipal);
                } catch (error) {
                    console.error('Error en tarifasCatac:', error.message);
                    return [];
                }}
            );

        });
    } else {
        console.error('Elementos de interacción (input o botón) no encontrados.');
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        if (typeof loadHeader === 'function') {
            await loadHeader();
        } else {
            console.error("loadHeader no está definido. Asegúrate de que header.js se cargue correctamente.");
            const header = document.querySelector('header');
            if (header) header.innerHTML = '<p>Error al cargar el encabezado.</p>';
        }

        if (typeof loadSidebar === 'function') {
            const userRole = localStorage.getItem('userRole') || 'admin';
            await loadSidebar(userRole);
        } else {
            console.error("loadSidebar no está definido. Asegúrate de que sidebar.js se cargue correctamente.");
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) sidebar.innerHTML = '<p>Error al cargar la barra lateral.</p>';
        }

        await loadTarifas();
        const currentPath = window.location.pathname;
        const sidebarItems = document.querySelectorAll('.sidebar-item');

        sidebarItems.forEach(item => {
            const targetPage = item.dataset.targetPage;
            if (targetPage && currentPath.includes(targetPage)) {
                sidebarItems.forEach(el => el.classList.remove('active'));
                item.classList.add('active');
            }
        });
        
        const container = document.getElementById('tabla-catac');
        if (!container) {
            console.error('Contenedor tabla-catac no encontrado.');
            document.body.innerHTML += '<p>Error: No se pudo cargar la tabla.</p>';
            return;
        }
        await createLoadingSpinner(contentPrincipal);

        setupTabSelectors();

        renderTabla({
            containerId: 'tabla-catac',
            tableId: 'catacTable',
            datos: tarifasCatac,
            filas: 10,
            columnas: 5,
            pageNum: paginaActual
        });

        renderTabla({
            containerId: 'tabla-fetra',
            tableId: 'fetraTable',
            datos: tarifasFetra,
            filas: 10,
            columnas: 5,
            pageNum: paginaActual
        });

        configurarInteraccionesCatac();

        toggleSpinnerVisible(contentPrincipal);
    } catch (error) {
        console.error('Error durante la inicialización:', error);
        document.body.innerHTML += '<p>Error inesperado al cargar la página.</p>';
    }
});