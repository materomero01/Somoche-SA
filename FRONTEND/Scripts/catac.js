// /FRONTEND/js/catac.js

import { renderTabla } from './tabla.js'; 
import { fetchTarifas, updateTarifas} from './api.js';

let datosCatac = [];

function setupCatacInteractions() {
    const updateInput = document.getElementById('catac-update');
    const updateButton = document.getElementById('catac-update-btn');

    if (updateButton && updateInput) {
        updateButton.addEventListener('click', async(event)=> {
            const percentageText = updateInput.value;
            let percentage = parseFloat(percentageText);

            if (isNaN(percentage)) {
                alert('Por favor, ingresa un porcentaje válido (número).');
                return;
            }
            const factor = percentage / 100;
            payload = {
                factor: factor
            }
            if (confirm(`Estas seguro de que desea actualizar las tarifas de Catac en un ${percentageText}%?`)){
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
            renderTabla({
                containerId: 'tabla-catac',
                datos: datosCatac,
                filas: 10,
                columnas: 5
            });
            alert(`Valores de la tabla actualizados con un ${percentage}% de variación.`);
        });
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    if (typeof loadHeader === 'function') { 
        await loadHeader(); 
    } else {
        console.error("loadHeader no está definido. Asegúrate de que header.js se cargue correctamente.");
    }

    if (typeof loadSidebar === 'function') { 
        const userRole = localStorage.getItem('userRole') || 'admin';
        await loadSidebar(userRole);
    } else {
        console.error("loadSidebar no está definido. Asegúrate de que sidebar.js se cargue correctamente.");
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

    datosCatac = JSON.parse(localStorage.getItem('tarifasCatac'));
    if (!datosCatac)
        datosCatac = await fetchTarifas();


    renderTabla({
        containerId: 'tabla-catac',
        datos: datosCatac,
        filas: 10,
        columnas: 5
    });

    setupCatacInteractions();
});