// /FRONTEND/js/header.js

async function loadHeader() {
    try {
        const response = await fetch('/FRONTEND/header.html'); // Ruta corregida
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        const headerHtml = await response.text();
        document.getElementById('header-container').innerHTML = headerHtml;
        setupHeaderDynamicContent(); // Llama a la configuración dinámica
        setupHeaderInteractions();   // Llama a las interacciones
    } catch (error) {
        console.error('Error al cargar el header:', error);
    }
}

function setupHeaderDynamicContent() {
    const dateElement = document.getElementById('currentDate');
    const userNameElement = document.getElementById('userName');
    const userRoleElement = document.getElementById('userRole');

    if (dateElement) {
        const today = new Date();
        const day = today.getDate();
        const month = today.getMonth() + 1;
        const year = today.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        dateElement.textContent = formattedDate;
    }
    const storedName = localStorage.getItem('userName');
    const storedRole = localStorage.getItem('userRole');
    if (storedName === null || storedRole === null)
        logout();
    if (userNameElement) {
        userNameElement.textContent = storedName;
    }
    if (userRoleElement) {
        userRoleElement.textContent = storedRole.toUpperCase();
    }
}

function setupHeaderInteractions() {
    const logoutIcon = document.querySelector('.header-icon');
    if (logoutIcon) {
        logoutIcon.addEventListener('click', function() {
            localStorage.clear();
            alert('Su sesion ha sido finalizada');
            window.location.href = "login.html";
            console.log('Se ha hecho clic en el icono de logout.');
        });
    }
}

function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}
