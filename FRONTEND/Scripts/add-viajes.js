import { fetchAllChoferes, fetchTarifas, addViaje, logout, addPagos, fetchClientes } from './api.js';

// Global variables
let allChoferes = [];
let allClientes = [];
let tarifasCatac = [];
let token;

// Regex for input validation
const regexInputs = {
    'comprobante': /^(\d{4}-\d{8}|\d{11})$/
};

// Set today's date in date inputs
const setTodayDate = () => {
    const today = new Date().toLocaleDateString('es-AR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).split('/').reverse().join('-');

    ['fecha', 'fechaPago'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = today;
    });

    const chequeDate = new Date();
    const fechaCheque = document.getElementById('fechaCheque');
    if (fechaCheque) {
        chequeDate.setDate(chequeDate.getDate() +40);
        fechaCheque.value = chequeDate.toLocaleDateString('es-AR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).split('/').reverse().join('-');
    }
};

// Validate form inputs
const validateInputs = (payload, fields) => {
    for (const [key, label] of Object.entries(fields)) {
        if (!payload[key] || (typeof payload[key] === 'string' && !payload[key].trim())) {
            alert(`El valor para ${label} no ha sido ingresado.`, 'error');
            return false;
        }
    }
    return true;
};

// Tab content display
const handleTabContentDisplay = (selectedTab) => {
    const content = { viajes: document.getElementById('viajes'), pagos: document.getElementById('pagos') };
    Object.values(content).forEach(div => div?.classList.add('hidden'));
    content[selectedTab]?.classList.remove('hidden');

    if (selectedTab === 'pagos') {
        setupPaymentTypeSelector();
        setupChoferAutocomplete('choferPago');
    } else if (selectedTab === 'viajes') {
        setupChoferAutocomplete('chofer');
        setupClienteAutocomplete('cliente');
        setupTarifaAutocomplete();
        setupCargaDescargaAutocomplete();
    }
};

// Setup tab selectors
const setupTabSelectors = () => {
    const tabSelector = document.getElementById('viajesPagosSelector');
    if (!tabSelector) {
        console.warn("Elemento #viajesPagosSelector no encontrado.");
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

// Setup add viaje button
const setupAddViajeBtn = () => {
    const form = document.getElementById('formViaje');
    const btn = document.getElementById('addViajeBtn');
    btn?.addEventListener('click', async () => {
        const choferInput = document.getElementById('chofer');
        const clienteInput = document.getElementById('cliente');
        const fechaInput = document.getElementById('fecha');
        const payload = {
            cuil: choferInput?.dataset.selectedChoferCuil,
            nombre: choferInput?.dataset.selectedChoferNombre,
            cuit_cliente: clienteInput?.dataset.selectedClienteCuit
        };

        if (!payload.cuil) {
            alert('Por favor, selecciona un chofer de la lista de sugerencias.');
            return;
        }

        if (!payload.cuit_cliente) {
            alert('Por favor, selecciona un cliente de la lista de sugerencias.');
            return;
        }

        const formData = Object.fromEntries(new FormData(form).entries());

        const fechaISO = fechaInput?.value ? `${fechaInput.value}T00:00:00-03:00` : new Date().toISOString().split('T')[0] + 'T00:00:00-03:00';
        Object.assign(payload, {
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
        });

        // Validate required fields
        if (!validateInputs(payload, {
            comprobante: 'Comprobante',
            campo: 'Campo',
            kilometros: 'Kilómetro',
            tarifa: 'Tarifa',
            toneladas: 'Toneladas',
            cargado: 'Cargado',
            descargado: 'Descargado'
        })) return;

        // Validate comprobante format
        if (!regexInputs.comprobante.test(payload.comprobante)) {
            alert('El comprobante debe tener el formato "XXXX-XXXXXXXX" o ser un número de 11 dígitos.');
            return;
        }

        // Validate numeric fields
        const numericFields = {
            kilometros: 'Kilómetro',
            toneladas: 'Toneladas',
            cargado: 'Cargado',
            descargado: 'Descargado'
        };
        for (const [key, label] of Object.entries(numericFields)) {
            if (isNaN(payload[key]) || payload[key] <= 0) {
                alert(`${label} debe ser un número mayor a 0.`, 'error');
                return;
            }
        }

        try {
            const response = await addViaje(payload);
            const data = await response.json();
            form.reset();
            setTodayDate();
            alert(data.message);
        } catch (error) {
            alert(`Error al añadir viaje: ${error.message}`);
            console.error('Error en addViaje:', error.message);
        }
    });
};

// Setup search bar
const setupViajesSearchBar = () => {
    const input = document.querySelector('#viajesSearchBar .search-input');
    const icon = document.querySelector('#viajesSearchBar .search-icon');
    if (!input || !icon) {
        console.warn("Elementos de la barra de búsqueda no encontrados.");
        return;
    }

    const handleSearch = () => {
        const term = input.value.trim();
        alert(term ? `Buscar viaje con: "${term}"` : 'Por favor, ingresa un término de búsqueda.', term ? 'info' : 'error');
    };

    input.addEventListener('keydown', e => e.key === 'Enter' && handleSearch());
    icon.addEventListener('click', handleSearch);
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

// Setup add pago button
const setupAddPagoBtn = () => {
    const btn = document.getElementById('addPagoBtn');
    btn?.addEventListener('click', async() => {
        const tipoPago = document.getElementById('tipoPago')?.value;
        const fechaPago = document.getElementById('fechaPago')?.value;
        let choferInput = document.getElementById('choferPago');
        let payload = {
            choferCuil: choferInput?.dataset.selectedChoferCuil,
        };

        if (!payload.choferCuil) {
            alert('Por favor, selecciona un chofer de la lista de sugerencias.');
            return;
        }

        switch (tipoPago) {
            case 'cheque':
                payload = {
                    ...payload,
                    pagos: {
                        tipo: tipoPago,
                        fechaPago: fechaPago,
                        fechaCheque: document.getElementById('fechaCheque')?.value,
                        nroCheque: document.getElementById('nroCheque')?.value,
                        tercero: document.getElementById('terceroCheque')?.value,
                        destinatario: document.getElementById('destinatarioCheque')?.value,
                        importe: document.getElementById('importeCheque')?.value
                    }
                };

                if (isNaN(payload.pagos.importe || payload.pagos.importe <= 0)){
                    alert(`El importe ingresado no es valido`);
                    return;
                }
                break;
            case 'gasoil':
                payload = {
                    ...payload,
                    pagos: {
                        tipo: tipoPago,
                        fechaPago: fechaPago,
                        precioGasoil: document.getElementById('precioGasoil')?.value,
                        litros: document.getElementById('litrosGasoil')?.value,
                        importe: document.getElementById('importeGasoil')?.value
                    }
                };
                
                ['precioGasoil', 'litros', 'importe'].forEach(id => {
                    if(isNaN(payload.pagos[id] || payload.pagos[id] <= 0)){
                        alert(`El valor ingresado para ${id} no es valido`);
                        return;
                    }
                });
                break;
            case 'otro':
                payload = {
                    ...payload,
                    pagos: {
                        tipo: tipoPago,
                        fechaPago: fechaPago,
                        detalle: document.getElementById('detalleOtro')?.value,
                        importe: document.getElementById('importeOtro')?.value
                    }
                };

                if(isNaN(payload.pagos.importe || payload.pagos.importe <= 0)){
                    alert(`El valor ingresado para el importe no es valido`);
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
            alert(data.message);
            
        } catch (error) {
            alert(`Error al añadir el pago: ${error.message}`);
            console.error('Error en addPagos:', error.message);
        }
        
        console.log('[Registrar Pago]', payload);
    });
};

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

// Setup chofer autocomplete
const setupChoferAutocomplete = inputId => setupAutocomplete({
    inputId,
    filterSuggestions: query => query.length < 2 ? [] : allChoferes.filter(chofer => chofer.nombre.toLowerCase().includes(query.toLowerCase())),
    renderSuggestion: chofer => `${chofer.nombre} (${chofer.cuil})`,
    onSelect: (input, chofer) => {
        input.value = chofer.nombre;
        input.dataset.selectedChoferNombre = chofer.nombre;
        input.dataset.selectedChoferCuil = chofer.cuil;
    }
});

const setupClienteAutocomplete = inputId => setupAutocomplete({
    inputId,
    filterSuggestions: query => query.length < 2 ? [] : allClientes.filter(cliente => cliente.nombre.toLowerCase().includes(query.toLowerCase())),
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
        dependentInputId: 'kilometro',
        filterSuggestions: () => {
            const currentKm = parseInt(document.getElementById('kilometro')?.value.trim(), 10);
            const tarifaCatacCalculada = (!isNaN(currentKm) && currentKm > 0 && currentKm <= tarifasCatac.length && tarifasCatac[currentKm - 1]?.valor !== undefined)
                ? tarifasCatac[currentKm - 1].valor
                : 0;

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
    const [toneladas, cargado, descargado] = ['toneladas', 'cargado', 'descargado'].map(id => document.getElementById(id));
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

// DOMContentLoaded initialization
document.addEventListener('DOMContentLoaded', async () => {
    

    if (typeof loadHeader === 'function') await loadHeader();
    else console.error("loadHeader no está definido. Asegúrate de cargar /FRONTEND/scripts/header.js.");

    if (typeof loadSidebar === 'function') await loadSidebar(localStorage.getItem('userRole') || 'admin');
    else console.error("loadSidebar no está definido. Asegúrate de cargar /FRONTEND/scripts/sidebar.js.");
    allChoferes = await fetchAllChoferes();
    allClientes = await fetchClientes();
    tarifasCatac = JSON.parse(localStorage.getItem('tarifasCatac')) || await fetchTarifas();
    const sidebarItems = document.querySelectorAll('.sidebar-item');
    sidebarItems.forEach(item => {
        if (item.dataset.targetPage && window.location.pathname.includes(item.dataset.targetPage)) {
            sidebarItems.forEach(el => el.classList.remove('active'));
            item.classList.add('active');
        }
    });

    setTodayDate();
    setupTabSelectors();
    setupAddViajeBtn();
    setupViajesSearchBar();
    setupAddPagoBtn();
});