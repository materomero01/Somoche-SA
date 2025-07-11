// /FRONTEND/catac.js
import { stringify } from 'querystring';
import { fetchTarifas, updateTarifas} from './api.js';

let datosCatac = [];
let paginaActual = 1;


function renderTabla({ containerId, datos, filas = 10, columnas = 5, pageNum = 1 }) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Contenedor ${containerId} no encontrado.`);
        return;
    }

    container.dataset.currentPage = pageNum;
    container.innerHTML = '';
    const tabla = document.createElement("table");
    tabla.id = "catacTable"; // Corregido para coincidir con el CSS
    const tbody = document.createElement("tbody");

    const itemsPorPagina = filas * columnas;
    const totalPaginas = Math.ceil(datos.length / itemsPorPagina);

    function renderizarCuerpo(pagina) {
        tbody.innerHTML = "";
        const startIndex = (pagina - 1) * itemsPorPagina;

        for (let i = 0; i < filas; i++) {
            const tr = document.createElement("tr");

            for (let j = 0; j < columnas; j++) {
                const indice = startIndex + (i * columnas) + j; // Corregido para distribución en filas
                const tdId = document.createElement("td");
                tdId.classList.add("table-id-cell");
                tdId.textContent = indice + 1;

                const tdValor = document.createElement("td");
                tdValor.classList.add("catac-value-cell");
                tdValor.textContent = indice < datos.length ? datos[indice]['valor'] : ""; // Rellenar con vacío si no hay datos

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
                alert('Por favor, ingresa un porcentaje válido (número).');
                return;
            }
            const factor = porcentaje / 100;
            payload = {
                factor: factor
            }
            if (confirm(`Estas seguro de que desea actualizar las tarifas de Catac en un ${textoPorcentaje}%?`)){
                try {
                    const data = await updateTarifas(payload);
                    datosCatac = data.tarifas;
                    updateInput.value = null;
                } catch (error) {
                    console.error('Error en tarifasCatac:', error.message);
                    return [];
                }
            } else 
                return;
            const container = document.getElementById('tabla-catac');
            if (!container) {
                console.error('Contenedor tabla-catac no encontrado.');
                alert('Error: No se pudo actualizar la tabla.');
                return;
            }

            paginaActual = parseInt(container.dataset.currentPage) || 1;
            renderTabla({
                containerId: 'tabla-catac',
                datos: datosCatac,
                filas: 10,
                columnas: 5,
                pageNum: paginaActual
            });
            alert(`Valores de la tabla actualizados con un ${porcentaje}% de variación.`);
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

        datosCatac = JSON.parse(localStorage.getItem('tarifasCatac'));
        if (!datosCatac)
            datosCatac = await fetchTarifas();

        const currentPath = window.location.pathname;
        const sidebarItems = document.querySelectorAll('.sidebar-item');

        sidebarItems.forEach(item => {
            const targetPage = item.dataset.targetPage;
            if (targetPage && currentPath.includes(targetPage)) {
                sidebarItems.forEach(el => el.classList.remove('active'));
                item.classList.add('active');
            }
        });
        
        datosCatac = Array.from({ length: 1500 }, () => (Math.random() * 20000).toFixed(2));
        const container = document.getElementById('tabla-catac');
        if (!container) {
            console.error('Contenedor tabla-catac no encontrado.');
            document.body.innerHTML += '<p>Error: No se pudo cargar la tabla.</p>';
            return;
        }
        renderTabla({
            containerId: 'tabla-catac',
            datos: datosCatac,
            filas: 10,
            columnas: 5,
            pageNum: paginaActual
        });

        configurarInteraccionesCatac();
    } catch (error) {
        console.error('Error durante la inicialización:', error);
        document.body.innerHTML += '<p>Error inesperado al cargar la página.</p>';
    }
});