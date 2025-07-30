import { renderTabla } from './tabla.js';
import { getViajes, getPagosCuil, showConfirmModal, getFactura } from './apiPublic.js';
import { addViaje, addPagos, updateViaje, addResumen } from './api.js';
import { enterEditMode, handleEdit, editingRowId, originalEditingData, stagedEditingData, mockClientes, tarifasCatac } from './choferes-clientes.js';
import { setHistorial, parsePagos, parseViaje, parseImporte, columnasViajes, columnasPagos } from './resumenes.js';
import { viajesFactura } from './subir-factura.js';

let loadingSpinner;
let mainContent;

// Datos del chofer
export let choferData = {};

let viajesData = [];

let pagosData = [];

export let generatedUrls = [];

// Regex for input validation
const regexInputs = {
    'comprobante': /^(\d{4}-\d{8}|\d{11})$/
};

// Acciones para la tabla de viajes
const accionesViajes = [
    {
        icon: "bi bi-pencil",
        tooltip: "Editar viaje",
        handler: (item) => {
            enterEditMode({ ...item, choferCuil: choferData.cuil }, 'viajes');
        }
    },
    {
        icon: "bi bi-trash",
        tooltip: "Eliminar viaje",
        handler: (item, tr) => {
            showConfirmModal("¿Estás seguro de eliminar este viaje?", "delete", () => {
                viajesData = viajesData.filter(v => v.id !== item.id);
                renderizarTablas();
                actualizarTotales(viajesData);
            });
        }
    }
];

// Acciones para la tabla de pagos
const accionesPagos = [
    {
        icon: "bi bi-trash",
        tooltip: "Eliminar pago",
        handler: (item, tr) => {
            showConfirmModal("¿Estás seguro de eliminar este pago?", "delete" , () => {
                pagosData = pagosData.filter(p => p.id !== item.id);
                renderizarTablas();
                actualizarTotales(viajesData);
            });
        }
    }
];

// Set today's date in date inputs
const setTodayDate = () => {
    const today = new Date().toLocaleDateString('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).split('/').reverse().join('-');

    ['nuevoFecha', 'fechaPago'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = today;
    });

    const chequeDate = new Date();
    const fechaCheque = document.getElementById('fechaCheque');
    if (fechaCheque) {
        chequeDate.setDate(chequeDate.getDate() + 40);
        fechaCheque.value = chequeDate.toLocaleDateString('es-AR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).split('/').reverse().join('-');
    }
};

// Función para renderizar las tablas
export function renderizarTablas() {
    let columnas = choferData.trabajador !== 'Monotributista'
        ? columnasViajes
        : columnasViajes.filter(col => col.key !== "iva");

    if (editingRowId)
        columnas = columnas.filter(col => !["diferencia", "importe", "comision", "iva"].includes(col.key));

    renderTabla({
        containerId: "viajes-table",
        columnas: columnas,
        datos: viajesData.map(v => {
            let retornar = {
                id: v.id,
                fecha: v.fecha,
                comprobante: v.comprobante,
                campo: v.campo,
                km: v.km,
                tarifa: !editingRowId? `$${v.tarifa}`: v.tarifa,
                variacion: !editingRowId? `${v.variacion * 100}%` : v.variacion,
                toneladas: v.toneladas,
                cargado: v.cargado,
                descargado: v.descargado,
                diferencia: v.diferencia,
                importe: `$${v.importe.toFixed(2)}`,
                comision: `$${v.comision.toFixed(2)}`,
                factura_id: v.factura_id
            };
            if (v.iva) {
                retornar = {
                    ...retornar,
                    iva: `$${v.iva.toFixed(2)}`
                };
            }
            return retornar;
        }),
        itemsPorPagina: 5,
        actions: accionesViajes,
        tableType: "viajes",
        checkboxColumn: true,
        checkboxColumnPosition: "end",
        editingRowId: editingRowId,
        onEdit: (id, field, value) => handleEdit(id, field, value, 'viajes'),
        useScrollable: true,
        changeDataFactura: changeDataFactura,
        descargarFactura: descargarFactura,
        onCheckboxChange: (itemId, itemChecked) => { 
            if (itemChecked)
                viajesFactura.push(itemId); 
            else
                viajesFactura.pop(itemId);
        }
    });
        
    renderTabla({
        containerId: "pagos-table",
        columnas: columnasPagos,
        datos: pagosData.map(p => ({
            id: p.id,
            fechaPago: p.fechaPago,
            tipo: p.tipo,
            descripcion: p.descripcion,
            importe: `$${p.importe.toFixed(2)}`.replace('$-',"-$")
        })),
        itemsPorPagina: 5,
        actions: accionesPagos,
        useScrollable: true,
        tableType: "pagos"
    });
    
    actualizarTotales(viajesData);
}

function changeDataFactura(facturaId){
    if (!facturaId) {
        console.warn('No se recibió el facturaId en los encabezados');
    } else {
        viajesData.forEach(v =>{
            if (viajesFactura.includes(v.id))
                v.factura_id = facturaId;
        });

        renderizarTablas();
    }
}

// Función para descargar factura
async function descargarFactura(viaje) {
    if (viaje && viaje.factura_id) {
        try {
            const response = await getFactura(choferData.cuil, viaje.factura_id);
            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.error || 'Error al obtener la factura');
            }

            const data = await response.blob();

            const url = window.URL.createObjectURL(data);

            generatedUrls.push(url);

            // Abrir el PDF en una nueva pestaña
            const pdfWindow = window.open(url, '_blank');
        } catch (error){
            console.log(error.message);
            showConfirmModal("No se pudo obtener la factura para descargar");
        }
    }
}

// Función para actualizar los totales
export function actualizarTotales(viajesData) {
    const subtotal = viajesData.reduce((sum, viaje) => sum + (viaje.importe || 0), 0);
    const iva = viajesData.reduce((sum, viaje) => sum + (viaje.iva || 0), 0);
    const totalViajes = subtotal + iva;
    let totalPagos;
    let totalAPagar;
    if (pagosData){
        totalPagos = pagosData?.reduce((sum, pago) => sum + (pago.importe || 0), 0);
        totalAPagar = totalViajes - totalPagos;
        if (Math.abs(totalAPagar) < 0.01) totalAPagar = 0;
    }

    const subtotalContainer = document.getElementById("subtotal");
    if (subtotalContainer)
        subtotalContainer.textContent = `Subtotal: $${subtotal.toFixed(2)}`;
    const ivaContainer = document.getElementById("iva");
    if (ivaContainer)
        ivaContainer.textContent = `IVA (21%): $${iva.toFixed(2)}`;
    const totalViajesContainer = document.getElementById("total-viajes");
    if (totalViajesContainer)
        totalViajesContainer.textContent = `Total Viajes: $${totalViajes.toFixed(2)}`;
    const totalPagarContainer = document.getElementById("total-pagar");
    if (totalPagarContainer)
        totalPagarContainer.textContent = `Total a Pagar: ${("$" + totalAPagar.toFixed(2)).replace("$-", "-$")}`;
}

const validateInputs = (payload, fields) => {
    for (const [key, label] of Object.entries(fields)) {
        if (!payload[key] || (typeof payload[key] === 'string' && !payload[key].trim())) {
            showConfirmModal(`El valor para ${label} no ha sido ingresado.`);
            return false;
        }
    }
    return true;
};

export async function handleSaveEditViajes() {
    const comprobanteOriginal = originalEditingData.comprobante;
    const payload = {
        [comprobanteOriginal]: {
            fecha: stagedEditingData.fecha || null,
            comprobante: stagedEditingData.comprobante || null,
            campo: stagedEditingData.campo || null,
            kilometros: parseInt(stagedEditingData.km) || null,
            tarifa: parseImporte(stagedEditingData.tarifa) || null,
            variacion: parseFloat(stagedEditingData.variacion) > 1? parseFloat(stagedEditingData.variacion) /100 : parseFloat(stagedEditingData.variacion) || 0.1,
            toneladas: parseFloat(stagedEditingData.toneladas) || null,
            cargado: parseFloat(stagedEditingData.cargado) || null,
            descargado: parseFloat(stagedEditingData.descargado) || null
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
    if (response) {
        showConfirmModal('Los cambios se realizaron con exito.');
        const viajeIndex = viajesData.findIndex(v => v.comprobante === comprobanteOriginal);
        if (viajeIndex !== -1)
            viajesData[viajeIndex] = parseViaje(payload[comprobanteOriginal]);
    } else {
        showConfirmModal('Error al guardar los cambios del viaje.');
    }
}

// Setup add viaje button
async function setupAddViajeBtn() {
    const form = document.getElementById('form-viaje');
    const btn = document.getElementById('addViajeBtn');
    setupClienteAutocomplete('nuevoCliente');
    btn?.addEventListener('click', async () => {
        const choferInput = document.getElementById('chofer');
        const clienteInput = document.getElementById('nuevoCliente');
        const fechaInput = document.getElementById('fecha');
        
        const formData = Object.fromEntries(new FormData(form).entries());
        const fechaISO = fechaInput?.value ? `${fechaInput.value}T00:00:00-03:00` : new Date().toISOString().split('T')[0] + 'T00:00:00-03:00';
        const viaje = {
            fecha: fechaISO,
            comprobante: formData.comprobante?.trim(),
            campo: formData.campo?.trim(),
            kilometros: parseFloat(formData.kilometro),
            tarifa: formData.tarifa,
            variacion: parseFloat(formData.variacion) || 0.1,
            toneladas: parseFloat(formData.toneladas),
            cargado: parseFloat(formData.cargado) || parseFloat(formData.toneladas),
            descargado: parseFloat(formData.descargado) || parseFloat(formData.toneladas),
            pagado: false
        };
        const payload = {
            cuil: choferData?.cuil,
            nombre: choferData?.nombre,
            cuit_cliente: clienteInput?.dataset.selectedClienteCuit,
            ...viaje
        };

        if (!payload.cuit_cliente) {
            showConfirmModal('Por favor, selecciona un cliente de la lista de sugerencias.');
            return;
        }

        if (!validateInputs(payload, {
            comprobante: 'Comprobante',
            campo: 'Campo',
            kilometros: 'Kilómetro',
            tarifa: 'Tarifa',
            toneladas: 'Toneladas',
            cargado: 'Cargado',
            descargado: 'Descargado'
        })) return;

        if (!regexInputs.comprobante.test(payload.comprobante)) {
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
            if ((isNaN(payload[key]) && key !== 'tarifa') || parseImporte(payload[key]) <= 0) {
                showConfirmModal(`${label} debe ser un número mayor a 0.`, 'error');
                return;
            }
        }

        try {
            const response = await addViaje(payload);
            const data = await response.json();
            if (response.ok) {
                viajesData.push(parseViaje(viaje));
                form.reset();
                setTodayDate();
                showConfirmModal(data.message);
                renderizarTablas();
            }
        } catch (error) {
            showConfirmModal(`Error al añadir viaje: ${error.message}`);
            console.error('Error en addViaje:', error.message);
        }
    });

    setupTarifaAutocomplete();
    setupCargaDescargaAutocomplete();
}

// Setup add pago button
const setupAddPagoBtn = () => {
    const btn = document.getElementById('addPagoBtn');
    btn?.addEventListener('click', async () => {
        const tipoPago = document.getElementById('tipoPago')?.value;
        const fechaPagoInput = document.getElementById('fechaPago')?.value;
        let fechaPago;
        try {
            fechaPago = fechaPagoInput ? new Date(`${fechaPagoInput}T00:00:00-03:00`).toISOString() : new Date().toISOString();
        } catch (error) {
            showConfirmModal('La fecha de pago ingresada no es válida');
            return;
        }

        let payload = {
            choferCuil: choferData?.cuil,
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
                        fechaPago: fechaPago,
                        fechaCheque: fechaCheque,
                        nroCheque: document.getElementById('nroCheque')?.value,
                        tercero: document.getElementById('terceroCheque')?.value,
                        destinatario: document.getElementById('destinatarioCheque')?.value,
                        importe: document.getElementById('importeCheque')?.value
                    }
                };

                if (isNaN(payload.pagos.importe) || payload.pagos.importe <= 0) {
                    showConfirmModal(`El importe ingresado no es válido`);
                    return;
                }
                break;
            case 'gasoil':
                payload = {
                    ...payload,
                    pagos: {
                        tipo: 'Gasoil',
                        fechaPago: fechaPago,
                        precioGasoil: document.getElementById('precioGasoil')?.value,
                        litros: document.getElementById('litrosGasoil')?.value,
                        importe: document.getElementById('importeGasoil')?.value
                    }
                };

                ['precioGasoil', 'litros', 'importe'].forEach(id => {
                    if (isNaN(payload.pagos[id]) || payload.pagos[id] <= 0) {
                        showConfirmModal(`El valor ingresado para ${id} no es válido`);
                        return;
                    }
                });
                break;
            case 'otro':
                payload = {
                    ...payload,
                    pagos: {
                        tipo: 'Otro',
                        fechaPago: fechaPago,
                        detalle: document.getElementById('detalleOtro')?.value,
                        importe: document.getElementById('importeOtro')?.value
                    }
                };

                if (isNaN(payload.pagos.importe) || payload.pagos.importe <= 0) {
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
            const data = await response.json();
            showConfirmModal(data.message);
            pagosData.push(parsePagos({id: data.pagoId.id, fecha_cheque: payload.pagos.fechaCheque, fecha_pago: payload.pagos.fechaPago, ...payload.pagos}));
            renderizarTablas();
        } catch (error) {
            showConfirmModal(`Error al añadir el pago: ${error.message}`);
            console.error('Error en addPagos:', error.message);
        }
    });
};

// Setup payment type selector
const setupPaymentTypeSelector = () => {
    const tipoPagoSelect = document.getElementById('tipoPago');
    const fields = {
        cheque: document.getElementById('chequeFields'),
        gasoil: document.getElementById('gasoilFields'),
        otro: document.getElementById('otroFields')
    };

    const showPaymentFields = type => {
        Object.values(fields).forEach(field => field?.classList.add('hidden'));
        fields[type]?.classList.remove('hidden');
        setTodayDate();
        if (type === 'gasoil') calculateGasoilImporte();
    };

    if (tipoPagoSelect) {
        tipoPagoSelect.addEventListener('change', e => showPaymentFields(e.target.value));
        showPaymentFields(tipoPagoSelect.value);
    }

    const precioGasoil = document.getElementById('precioGasoil');
    const litrosGasoil = document.getElementById('litrosGasoil');
    const importeGasoil = document.getElementById('importeGasoil');

    const calculateGasoilImporte = () => {
        const precio = parseFloat(precioGasoil?.value) || 0;
        const litros = parseFloat(litrosGasoil?.value) || 0;
        if (importeGasoil) importeGasoil.value = (precio * litros).toFixed(2);
    };

    precioGasoil?.addEventListener('input', calculateGasoilImporte);
    litrosGasoil?.addEventListener('input', calculateGasoilImporte);
};

async function cargarTablas() {
    if (choferData.cuil) {
        try {
            const response = await getViajes(choferData.cuil);
            const data = await response.json();
            if (!response.ok) {
                showConfirmModal(data.message);
                deleteModal();
            }
            viajesData = data.viajes.map(c => {
                return parseViaje(c);
            });
            if (choferData.trabajador === "Monotributista") {
                document.getElementById("iva").classList.add("hidden");
                document.getElementById("iva-resumen").classList.add("hidden");
            }
            const responsePagos = await getPagosCuil(choferData.cuil);
            const dataPagos = await responsePagos.json();
            if (!responsePagos.ok) {
                showConfirmModal(dataPagos.message);
                deleteModal();
            }
            pagosData = dataPagos.map(p => {
                return parsePagos(p);
            });
        } catch (error) {
            console.log(error.message);
        }
    }
    renderizarTablas();
}

// Setup autocomplete
const setupAutocomplete = ({ inputId, suggestionsId = `${inputId}-suggestions`, filterSuggestions, renderSuggestion, onSelect, dependentInputId, onDependentChange }) => {
    const input = document.getElementById(inputId);
    let suggestionsDiv = document.getElementById(suggestionsId);

    if (!input) {
        console.warn(`Input con ID '${inputId}' no encontrado.`);
        return;
    }

    if (!suggestionsDiv) {
        suggestionsDiv = document.createElement('div');
        suggestionsDiv.id = suggestionsId;
        suggestionsDiv.classList.add('suggestions-list');
        input.parentNode.insertBefore(suggestionsDiv, input.nextSibling);
    }

    let activeSuggestionIndex = -1;

    const displaySuggestions = suggestions => {
        suggestionsDiv.innerHTML = '';
        activeSuggestionIndex = -1;

        if (!suggestions?.length) {
            suggestionsDiv.style.display = 'none';
            return;
        }

        suggestions.forEach((suggestion, index) => {
            const item = document.createElement('div');
            item.classList.add('suggestion-item');
            item.textContent = renderSuggestion(suggestion);
            Object.entries(suggestion).forEach(([key, value]) => item.dataset[key] = value);

            item.addEventListener('click', () => {
                onSelect(input, suggestion);
                suggestionsDiv.innerHTML = '';
                suggestionsDiv.style.display = 'none';
                input.focus();
            });
            suggestionsDiv.appendChild(item);
        });
        suggestionsDiv.style.display = 'block';
    };

    input.addEventListener('input', () => {
        const query = input.value.trim();
        Object.keys(input.dataset).forEach(key => delete input.dataset[key]);
        displaySuggestions(query ? filterSuggestions(query) : []);
    });

    if (dependentInputId && onDependentChange) {
        const dependentInput = document.getElementById(dependentInputId);
        dependentInput?.addEventListener('change', () => onDependentChange(dependentInput, input, suggestionsDiv));
    }

    document.addEventListener('click', e => {
        if (!input.contains(e.target) && !suggestionsDiv.contains(e.target)) {
            suggestionsDiv.style.display = 'none';
            activeSuggestionIndex = -1;
        }
    });

    input.addEventListener('keydown', e => {
        const items = Array.from(suggestionsDiv.children);
        if (!items.length) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex + 1) % items.length;
                highlightSuggestion(items[activeSuggestionIndex]);
                break;
            case 'ArrowUp':
                e.preventDefault();
                activeSuggestionIndex = (activeSuggestionIndex - 1 + items.length) % items.length;
                highlightSuggestion(items[activeSuggestionIndex]);
                break;
            case 'Enter':
                e.preventDefault();
                if (activeSuggestionIndex > -1) items[activeSuggestionIndex].click();
                else if (items.length === 1 && input.value === items[0].dataset.nombre) items[0].click();
                break;
            case 'Escape':
                suggestionsDiv.style.display = 'none';
                activeSuggestionIndex = -1;
                break;
        }
    });

    suggestionsDiv.addEventListener('mousedown', e => e.preventDefault());

    input.addEventListener('focus', () => displaySuggestions(filterSuggestions(input.value.trim())));

    const highlightSuggestion = item => {
        Array.from(suggestionsDiv.children).forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
};

const setupClienteAutocomplete = inputId => setupAutocomplete({
    inputId,
    filterSuggestions: query => query.length < 2 ? [] : mockClientes.filter(cliente => cliente.nombre.toLowerCase().includes(query.toLowerCase())),
    renderSuggestion: cliente => `${cliente.nombre} (${cliente.cuit})`,
    onSelect: (input, cliente) => {
        input.value = cliente.nombre;
        input.dataset.selectedClienteNombre = cliente.nombre;
        input.dataset.selectedClienteCuit = cliente.cuit;
    }
})

// Setup tarifa autocomplete
const setupTarifaAutocomplete = () => {
    const tarifaAutodescargableBase = 0;

    setupAutocomplete({
        inputId: 'tarifa',
        dependentInputId: 'nuevoKm',
        filterSuggestions: () => {
            const currentKm = parseInt(document.getElementById('nuevoKm')?.value.trim(), 10);
            const tarifaCatacCalculada = (!isNaN(currentKm) && currentKm > 0 && currentKm <= tarifasCatac.length && tarifasCatac[currentKm - 1]?.valor !== undefined)
                ? tarifasCatac[currentKm - 1].valor
                : tarifasCatac[tarifasCatac.length - 1].valor;

            return [
                { type: 'Tarifa CATAC', value: tarifaCatacCalculada },
                { type: 'Tarifa Autodescargable', value: tarifaAutodescargableBase }
            ];
        },
        renderSuggestion: suggestion => `${suggestion.type}: ${suggestion.value}`,
        onSelect: (input, suggestion) => input.value = suggestion.value,
        onDependentChange: (dependentInput, input, suggestionsDiv) => {
            const queryKm = parseInt(dependentInput.value.trim(), 10);
            if (isNaN(queryKm) || queryKm <= 0 || queryKm > tarifasCatac.length) {
                input.value = '';
                suggestionsDiv.style.display = 'none';
                return;
            }

            const tarifa = tarifasCatac[queryKm - 1];
            input.value = tarifa?.valor ?? '';
            suggestionsDiv.style.display = 'none';
            if (!tarifa?.valor) console.warn(`No se encontró tarifa para ${queryKm} km.`);
        }
    });
};

// Setup carga/descarga autocomplete
const setupCargaDescargaAutocomplete = () => {
    const [toneladas, cargado, descargado] = ['nuevoToneladas', 'nuevoCargado', 'nuevoDescargado'].map(id => document.getElementById(id));
    if (!toneladas || !cargado || !descargado) {
        console.error("Inputs de toneladas, cargado o descargado no encontrados.");
        return;
    }

    toneladas.addEventListener('change', () => {
        const value = parseFloat(toneladas.value.trim());
        if (!isNaN(value) && value >= 0) {
            cargado.value = value;
            descargado.value = value;
        } else {
            cargado.value = '';
            descargado.value = '';
        }
    });
};

async function cerrarCuenta() {
    const totalPagarContainer = document.getElementById("total-pagar");
    const comprobantes = viajesData.map(viaje => viaje.comprobante);
    const pagos = pagosData.map(pagos => {
        return {
            tipo: pagos.tipo,
            id: pagos.id
        };
    });
    let saldoRestante = "";
    let importeRestante = 0;
    if (totalPagarContainer) {
        importeRestante = parseImporte(totalPagarContainer.textContent.split(': ')[1]);
        if (importeRestante !== 0)
            saldoRestante = `<br>El saldo restante de ${totalPagarContainer.textContent.split(': ')[1]} se agregará al siguiente resumen`;
    }

    const confirmar = async () => {
        const groupStamp = new Date();
        let payloadViajes = {};
        comprobantes.forEach(v => {
            payloadViajes = {
                ...payloadViajes,
                [v]: {
                    group: groupStamp,
                }
            };
        });

        let payloadPagos = {};
        pagos.forEach(p => {
            const idCompuesto = p.id + "-" + p.tipo;
            payloadPagos = {
                ...payloadPagos,
                [idCompuesto]: {
                    tipo: p.tipo,
                    group: groupStamp
                }
            };
        });
        let payloadRestante = null;
        if (importeRestante !== 0) {
            payloadRestante = {
                tipo: "Otro",
                detalle: importeRestante > 0 ? "Saldo a favor del resumen anterior" : "Saldo adeudado del resumen anterior",
                importe: -importeRestante
            };
        }
        if (loadingSpinner) {
            loadingSpinner.classList.remove("hidden");
            loadingSpinner.childNodes[2].textContent = "Generando resumen...";
        }
        if (mainContent) mainContent.classList.add("hidden");

        try {
            const response = await addResumen(choferData.cuil, groupStamp, payloadViajes, payloadPagos, payloadRestante);
            if (!response.ok) {
                showConfirmModal("No se pudo cerrar el resumen del chofer");
                if (loadingSpinner) {
                    loadingSpinner.classList.add("hidden");
                    loadingSpinner.childNodes[2].textContent = "Cargando datos...";
                }
                if (mainContent) mainContent.classList.remove("hidden");
                return;
            }
            const dataId = await response.json();
            console.log(dataId);
            pagosData = [];
            viajesData = [];
            if (dataId.idPagoAdicional.id)
                pagosData = [{id: dataId.idPagoAdicional.id, fecha_pago: groupStamp, ...payloadRestante}].map( p => {
                    return parsePagos(p);
                })
            showConfirmModal("Resumen cerrado con exito!");
            renderizarTablas();
        } catch (error) {
            console.log(error.message);
        }
        if (loadingSpinner) {
            loadingSpinner.classList.add("hidden");
            loadingSpinner.childNodes[2].textContent = "Cargando datos...";
        }
        if (mainContent) mainContent.classList.remove("hidden");
    };
    if (comprobantes && comprobantes.length > 0)
        showConfirmModal(`¿Estás seguro de cerrar el resumen del chofer?${saldoRestante}`, "confirm", confirmar);
    else
        showConfirmModal("No hay viajes disponibles para realizar un resumen");
}

// Cargar el nombre del chofer
export function cargarNombreChofer(nombre) {
    const personInfo = document.querySelector(".person-info span");
    if (personInfo) {
        personInfo.textContent = nombre;
    }
}

export function deleteModal(modalId, modalContentId) {
    const modal = document.getElementById(modalId);
    if (editingRowId){
        showConfirmModal("Guarda o cancela los cambios realizados antes de salir");
        return;
    }

    generatedUrls.forEach(url => {
        window.URL.revokeObjectURL(url);
        console.log('URL liberada:', url);
    });

    generatedUrls = [];

    if (modal) {
        modal.classList.toggle("active");
        document.body.classList.remove("no-scroll");
        const modalContent = document.getElementById(modalContentId);
        choferData = null;
        pagosData = [];
        viajesData = [];
        if (modalContent) modalContent.remove();
        window.onclick = null;
    }
}

// Inicializar
export async function inicializarModal(data) {
    document.body.classList.add("no-scroll");
    choferData = data;

    cargarNombreChofer(choferData.nombre);

    const closeButton = document.getElementById('closeBtnViaje');
    if (closeButton) {
        closeButton.onclick = () => {
            deleteModal("viajesPagosModal", "contentModalViajes");
        };
    }

    loadingSpinner = document.getElementById('loading-spinner');
    mainContent = document.getElementById('content-viajes');

    if (loadingSpinner) loadingSpinner.classList.remove("hidden");
    if (mainContent) mainContent.classList.add("hidden");

    try {
        await cargarTablas();
        setTodayDate();
        setupPaymentTypeSelector();
        setupAddPagoBtn();
        setupAddViajeBtn();
        const historialBtn = document.getElementById("historial");
        const backHistorialBtn = document.getElementById("back-historialBtn");
        const headerModal = document.getElementById("headerModal");
        const selectCantidad = document.getElementById("selectResumenes");
        const contentResumenes = document.getElementById("content-resumenes");

        selectCantidad?.addEventListener("change", () => {
            contentResumenes.classList.add("hidden");
            historialBtn.click();
        })

        historialBtn?.addEventListener("click", async () =>{
            if (loadingSpinner) {
                loadingSpinner.classList.remove("hidden");
                loadingSpinner.childNodes[2].textContent = "Cargando resumenes...";
            }
            if (mainContent) mainContent.classList.add("hidden");
            await setHistorial(choferData, descargarFactura);
            if (loadingSpinner) {
                loadingSpinner.classList.add("hidden");
                loadingSpinner.childNodes[2].textContent = "Cargando datos...";
            }
            if (mainContent) mainContent.classList.remove("hidden");
            document.getElementById("back-historial").classList.remove("hidden");
            headerModal.textContent = "Viajes y Pagos - Resumenes";
            contentResumenes.classList.remove("hidden");
            mainContent.classList.add("hidden");
            historialBtn.classList.add("hidden");
        });

        backHistorialBtn?.addEventListener("click", () =>{
            document.getElementById("back-historial").classList.add("hidden");
            headerModal.textContent = "Viajes y Pagos";
            contentResumenes.classList.add("hidden");
            mainContent.classList.remove("hidden");
            historialBtn.classList.remove("hidden");
        });

        const cardViajes = document.getElementById("addViajeCard");
        document.getElementById("agregar-viaje")?.addEventListener("click", () => {
            cardViajes.classList.toggle('hidden');
        });

        const cardPagos = document.getElementById("addPagoCard");
        document.getElementById("agregar-pago")?.addEventListener("click", () => {
            cardPagos.classList.toggle('hidden');
        });

        document.getElementById("cerrarCuenta")?.addEventListener("click", () => {
            cerrarCuenta();
        });
    } catch (error) {
        console.error('Error de red o desconocido al obtener datos de los viajes:', error);
        showConfirmModal('Error de conexión al cargar los viajes.');
        if (mainContent) mainContent.innerHTML = `<p class="error-message">Error de conexión al cargar los datos.</p>`;
    } finally {
        if (loadingSpinner) loadingSpinner.classList.add("hidden");
        if (mainContent) mainContent.classList.remove("hidden");
    }
}