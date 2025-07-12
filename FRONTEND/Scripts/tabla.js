// /FRONTEND/js/tabla.js (Modificado para edición inline con CSS mejorado)

export function renderTabla({ 
    containerId, 
    paginacionContainerId, 
    datos, 
    columnas, 
    itemsPorPagina = 10, 
    paginaActual = 1, 
    currentPage = 1, // Nuevo parámetro para la página actual
    actions = [], 
    editingRowId = null, 
    onEdit = null,
    tableType = 'default', // Nuevo parámetro para distinguir tipos de tabla
    onPageChange = null, // Callback para notificar cambios de página
    checkboxColumn = false, // NUEVO: Parámetro para la columna de checkbox
    checkboxColumnPosition = 'start', // NUEVO: Posición de la columna de checkbox ('start' o 'end')
    onCheckboxChange = null // NUEVO: Callback para el cambio de checkbox
}) {
    const container = document.getElementById(containerId);
    const paginacionContainer = document.getElementById(paginacionContainerId);

    if (!container) {
        console.error(`Contenedor de tabla '${containerId}' no encontrado.`);
        return;
    }
    if (!paginacionContainer) {
        console.error(`Contenedor de paginación '${paginacionContainerId}' no encontrado.`);
        return;
    }

    // Usar currentPage si se proporciona, sino usar paginaActual
    const pageToUse = currentPage || paginaActual;

    // Agregar clase específica para el tipo de tabla
    container.className = `tabla-dinamica ${tableType === 'clientes' ? 'tabla-clientes' : ''}`;
    
    container.dataset.currentPage = pageToUse;
    container.innerHTML = "";
    paginacionContainer.innerHTML = "";

    const tabla = document.createElement("table");
    tabla.classList.add("data-table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    // --- Renderizar Encabezados de la Tabla ---
    const headerRow = document.createElement("tr");
    
    // Añadir encabezado del checkbox al inicio si la posición es 'start'
    if (checkboxColumn && checkboxColumnPosition === 'start') {
        const th = document.createElement("th");
        th.classList.add("checkbox-cell"); // Clase para estilos específicos del checkbox
        headerRow.appendChild(th);
    }

    columnas.forEach(col => {
        const th = document.createElement("th");
        th.textContent = col.label;
        headerRow.appendChild(th);
    });
    if (actions.length > 0) {
        const thAcciones = document.createElement("th");
        thAcciones.textContent = "Acciones";
        thAcciones.classList.add("acciones-cell");
        headerRow.appendChild(thAcciones);
    }

    // Añadir encabezado del checkbox al final si la posición es 'end'
    if (checkboxColumn && checkboxColumnPosition === 'end') {
        const th = document.createElement("th");
        th.classList.add("checkbox-cell"); // Clase para estilos específicos del checkbox
        headerRow.appendChild(th);
    }

    thead.appendChild(headerRow);
    tabla.appendChild(thead);
    tabla.appendChild(tbody);

    // --- Lógica de Paginación ---
    const totalPaginas = Math.ceil(datos.length / itemsPorPagina);

    function renderBody(page) {
        tbody.innerHTML = "";
        const start = (page - 1) * itemsPorPagina;
        const end = start + itemsPorPagina;
        const currentData = datos.slice(start, end);

        if (currentData.length === 0) {
            const noDataRow = document.createElement('tr');
            const noDataCell = document.createElement('td');
            // Ajustar colspan para incluir la nueva columna de checkbox
            noDataCell.colSpan = columnas.length + (actions.length > 0 ? 1 : 0) + (checkboxColumn ? 1 : 0);
            noDataCell.textContent = "No se encontraron resultados.";
            noDataCell.style.textAlign = "center";
            noDataCell.style.padding = "20px";
            noDataCell.style.color = "#888";
            noDataRow.appendChild(noDataCell);
            tbody.appendChild(noDataRow);
            return;
        }

        currentData.forEach(item => {
            const tr = document.createElement("tr");
            tr.setAttribute('data-id', item.id);
            
            // Determinar si esta fila está en modo edición
            const isEditing = editingRowId === item.id;
            
            if (isEditing) {
                tr.classList.add('editing-row');
            }

            // Añadir la celda del checkbox al inicio si la posición es 'start'
            if (checkboxColumn && checkboxColumnPosition === 'start') {
                const td = document.createElement("td");
                td.classList.add("checkbox-cell");
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.setAttribute('data-id', item.id); // Guardar el ID del cheque
                if (item.selected) { // Si el cheque ya está seleccionado, marcar el checkbox
                    checkbox.checked = true;
                }
                checkbox.addEventListener('change', (e) => {
                    if (onCheckboxChange) {
                        onCheckboxChange(item.id, e.target.checked); // Notificar el cambio
                    }
                });
                td.appendChild(checkbox);
                tr.appendChild(td);
            }

            columnas.forEach(col => {
                const td = document.createElement("td");
                
                if (isEditing) {
                    // Crear input editable
                    const input = createEditableInput(col, item[col.key], item.id);
                    td.appendChild(input);
                } else {
                    // Mostrar texto normal
                    td.textContent = item[col.key] !== undefined ? item[col.key] : '';
                }
                
                if (col.class) {
                    td.classList.add(col.class);
                }
                tr.appendChild(td);
            });

            if (actions.length > 0) {
                const tdAcciones = document.createElement("td");
                tdAcciones.classList.add("acciones-cell");
                
                if (isEditing) {
                    // Mostrar botones de guardar y cancelar
                    const saveBtn = document.createElement("button");
                    saveBtn.className = "btn-action save-btn";
                    saveBtn.innerHTML = '<i class="bi bi-check-lg"></i>';
                    saveBtn.title = "Guardar cambios";
                    saveBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        saveEditingRow(item.id);
                    });
                    
                    const cancelBtn = document.createElement("button");
                    cancelBtn.className = "btn-action cancel-btn";
                    cancelBtn.innerHTML = '<i class="bi bi-x-lg"></i>';
                    cancelBtn.title = "Cancelar edición";
                    cancelBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        cancelEditingRow(item.id);
                    });
                    
                    tdAcciones.appendChild(saveBtn);
                    tdAcciones.appendChild(cancelBtn);
                } else {
                    // Mostrar acciones normales
                    const actionContainer = document.createElement("div");
                    actionContainer.classList.add("action-icons");
                    
                    actions.forEach(action => {
                        const button = document.createElement("button");
                        button.className = "btn-action";
                        
                        // Agregar clases específicas según el tipo de acción
                        if (action.icon.includes('pencil')) {
                            button.classList.add('edit-btn');
                        } else if (action.icon.includes('trash')) {
                            button.classList.add('delete-btn');
                        } else if (action.icon.includes('send')) {
                            button.classList.add('navigate-btn');
                        }
                        
                        if (action.class) {
                            action.class.split(' ').forEach(cls => {
                                if (cls) {
                                    button.classList.add(cls);
                                }
                            });
                        }
                        
                        button.innerHTML = `<i class="${action.icon}"></i>`;
                        button.title = action.tooltip || '';
                        button.addEventListener('click', (e) => {
                            e.stopPropagation();
                            action.handler(item, tr);
                        });
                        actionContainer.appendChild(button);
                    });
                    
                    tdAcciones.appendChild(actionContainer);
                }
                
                tr.appendChild(tdAcciones);
            }

            // Añadir la celda del checkbox al final si la posición es 'end'
            if (checkboxColumn && checkboxColumnPosition === 'end') {
                const td = document.createElement("td");
                td.classList.add("checkbox-cell");
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.setAttribute('data-id', item.id); // Guardar el ID del cheque
                if (item.selected) { // Si el cheque ya está seleccionado, marcar el checkbox
                    checkbox.checked = true;
                }
                checkbox.addEventListener('change', (e) => {
                    if (onCheckboxChange) {
                        onCheckboxChange(item.id, e.target.checked); // Notificar el cambio
                    }
                });
                td.appendChild(checkbox);
                tr.appendChild(td);
            }

            tbody.appendChild(tr);
        });
    }

    function createEditableInput(column, value, itemId) {
        let input;
        
        if (column.type === 'select' && column.options) {
            // Crear select para campos con opciones
            input = document.createElement('select');
            input.className = 'editable-input editable-select';
            
            column.options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option;
                optionElement.textContent = option;
                if (option === value) {
                    optionElement.selected = true;
                }
                input.appendChild(optionElement);
            });
        } else {
            // Crear input de texto normal
            input = document.createElement('input');
            input.type = getInputType(column.key);
            input.className = 'editable-input';
            input.value = value || '';
            
            // Agregar placeholder apropiado
            input.placeholder = getPlaceholder(column.key);
        }
        
        // Agregar atributos para mejor UX
        input.setAttribute('data-field', column.key);
        input.setAttribute('data-item-id', itemId);
        
        // Agregar event listener para cambios
        input.addEventListener('input', (e) => {
            if (onEdit) {
                onEdit(itemId, column.key, e.target.value);
            }
        });
        
        input.addEventListener('change', (e) => {
            if (onEdit) {
                onEdit(itemId, column.key, e.target.value);
            }
        });
        
        // Agregar event listener para Enter (guardar) y Escape (cancelar)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveEditingRow(itemId);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelEditingRow(itemId);
            }
        });
        
        return input;
    }

    function getInputType(fieldKey) {
        switch (fieldKey) {
            case 'email':
                return 'email';
            case 'telefono':
                return 'tel';
            default:
                return 'text';
        }
    }

    function getPlaceholder(fieldKey) {
        const placeholders = {
            'nombre': 'Ingrese el nombre',
            'cuil': 'XX-XXXXXXXX-X',
            'cuit': 'XX-XXXXXXXX-X',
            'chasis': 'Código de chasis',
            'acoplado': 'Código de acoplado',
            'telefono': 'XX-XXXX-XXXX',
            'email': 'ejemplo@correo.com'
        };
        return placeholders[fieldKey] || 'Ingrese el valor';
    }

    function saveEditingRow(itemId) {
        // Disparar evento personalizado para que choferes-clientes.js lo maneje
        const event = new CustomEvent('saveEdit', {
            detail: { itemId: itemId }
        });
        document.dispatchEvent(event);
    }

    function cancelEditingRow(itemId) {
        // Disparar evento personalizado para que choferes-clientes.js lo maneje
        const event = new CustomEvent('cancelEdit', {
            detail: { itemId: itemId }
        });
        document.dispatchEvent(event);
    }

    function renderPaginacion(currentPage) {
        paginacionContainer.innerHTML = "";

        const btnPrev = document.createElement("button");
        btnPrev.textContent = "<";
        btnPrev.classList.add("pagination-button");
        btnPrev.disabled = currentPage === 1;
        btnPrev.onclick = () => cambiarPagina(currentPage - 1);
        paginacionContainer.appendChild(btnPrev);

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
            paginacionContainer.appendChild(botonPagina(1, currentPage));
            if (startPageNum > 2) {
                const ellipsis = document.createElement("span");
                ellipsis.textContent = "...";
                ellipsis.classList.add("pagination-ellipsis");
                paginacionContainer.appendChild(ellipsis);
            }
        }

        for (let i = startPageNum; i <= endPageNum; i++) {
            paginacionContainer.appendChild(botonPagina(i, currentPage));
        }

        if (endPageNum < totalPaginas) {
            if (endPageNum < totalPaginas - 1) {
                const ellipsis = document.createElement("span");
                ellipsis.textContent = "...";
                ellipsis.classList.add("pagination-ellipsis");
                paginacionContainer.appendChild(ellipsis);
            }
            paginacionContainer.appendChild(botonPagina(totalPaginas, currentPage));
        }

        const btnNext = document.createElement("button");
        btnNext.textContent = ">";
        btnNext.classList.add("pagination-button");
        btnNext.disabled = currentPage === totalPaginas;
        btnNext.onclick = () => cambiarPagina(currentPage + 1);
        paginacionContainer.appendChild(btnNext);
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
        renderPaginacion(nuevaPagina);
        
        // Notificar el cambio de página al componente padre
        if (onPageChange) {
            onPageChange(nuevaPagina);
        }
    }

    // Inicializa el cuerpo y la paginación con la página actual
    renderBody(pageToUse);
    renderPaginacion(pageToUse);

    // Adjuntar la tabla completa al contenedor
    container.appendChild(tabla);
}
