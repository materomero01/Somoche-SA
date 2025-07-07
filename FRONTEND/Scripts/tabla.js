// tabla.js

export function renderTabla({ containerId, datos, filas = 10, columnas = 5, paginaActual = 1 }) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Contenedor ${containerId} no encontrado.`);
        return;
    }

    container.dataset.currentPage = paginaActual;

    container.innerHTML = "";

    const tabla = document.createElement("table");
    tabla.id = "catacTable";
    const tbody = document.createElement("tbody");

    const itemsPorPagina = filas * columnas;
    const totalPaginas = Math.ceil(datos.length / itemsPorPagina);

    function renderBody(page) {
        tbody.innerHTML = "";
        const start = (page - 1) * itemsPorPagina;

        for (let i = 0; i < filas; i++) {
            const tr = document.createElement("tr");

            for (let j = 0; j < columnas; j++) {
                const index = start + i + j * filas; 
                
                if (index >= datos.length) {
                    continue; 
                }

                const tdId = document.createElement("td");
                tdId.classList.add("table-id-cell");
                tdId.textContent = index + 1;

                const tdValor = document.createElement("td");
                tdValor.classList.add("catac-value-cell");
                tdValor.textContent = datos[index];

                tr.appendChild(tdId);
                tr.appendChild(tdValor);
            }
            tbody.appendChild(tr);
        }
    }

    function renderPaginacion(currentPage) {
        const paginacionDiv = document.createElement("div");
        paginacionDiv.className = "pagination-controls";

        const btnPrev = document.createElement("button");
        btnPrev.textContent = "<";
        btnPrev.classList.add("pagination-button");
        btnPrev.disabled = currentPage === 1;
        btnPrev.onclick = () => cambiarPagina(currentPage - 1);
        paginacionDiv.appendChild(btnPrev);

        const maxButtonsToShow = 5;
        let startPageNum, endPageNum;

        if (totalPaginas <= maxButtonsToShow) {
            startPageNum = 1;
            endPageNum = totalPaginas;
        } else {
            if (currentPage <= Math.ceil(maxButtonsToShow / 2)) {
                startPageNum = 1;
                endPageNum = maxButtonsToShow;
            } else if (currentPage + Math.floor(maxButtonsToShow / 2) >= totalPaginas) {
                startPageNum = totalPaginas - maxButtonsToShow + 1;
                endPageNum = totalPaginas;
            } else {
                startPageNum = currentPage - Math.floor(maxButtonsToShow / 2);
                endPageNum = currentPage + Math.floor(maxButtonsToShow / 2);
            }
        }

        if (startPageNum > 1) {
            paginacionDiv.appendChild(botonPagina(1, currentPage));
            if (startPageNum > 2) {
                const ellipsis = document.createElement("span");
                ellipsis.textContent = "...";
                ellipsis.classList.add("pagination-ellipsis");
                paginacionDiv.appendChild(ellipsis);
            }
        }

        for (let i = startPageNum; i <= endPageNum; i++) {
            paginacionDiv.appendChild(botonPagina(i, currentPage));
        }

        if (endPageNum < totalPaginas) {
            if (endPageNum < totalPaginas - 1) {
                const ellipsis = document.createElement("span");
                ellipsis.textContent = "...";
                ellipsis.classList.add("pagination-ellipsis");
                paginacionDiv.appendChild(ellipsis);
            }
            paginacionDiv.appendChild(botonPagina(totalPaginas, currentPage));
        }

        const btnNext = document.createElement("button");
        btnNext.textContent = ">";
        btnNext.classList.add("pagination-button");
        btnNext.disabled = currentPage === totalPaginas;
        btnNext.onclick = () => cambiarPagina(currentPage + 1);
        paginacionDiv.appendChild(btnNext);
        
        container.appendChild(paginacionDiv);
    }

    function botonPagina(n, currentPage) {
        const btn = document.createElement("button");
        btn.textContent = n;
        btn.classList.add("pagination-button");
        if (n === currentPage) {
            btn.classList.add("active");
        }
        btn.onclick = () => cambiarPagina(n);
        return btn;
    }

    function cambiarPagina(nuevaPagina) {
        nuevaPagina = Math.max(1, Math.min(nuevaPagina, totalPaginas));
        
        if (nuevaPagina === parseInt(container.dataset.currentPage)) {
            return;
        }

        container.dataset.currentPage = nuevaPagina;
        renderBody(nuevaPagina);

        const oldPaginacionDiv = container.querySelector(".pagination-controls");
        if (oldPaginacionDiv) {
            oldPaginacionDiv.remove();
        }
        renderPaginacion(nuevaPagina);
    }

    renderBody(paginaActual); 
    tabla.appendChild(tbody);
    container.appendChild(tabla);
    renderPaginacion(paginaActual);
}