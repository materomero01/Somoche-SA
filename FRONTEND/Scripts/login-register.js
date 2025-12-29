import { showConfirmModal, createLoadingSpinner, toggleSpinnerVisible, changeSpinnerText, BASE_URL } from "./apiPublic.js";

// FRONTEND/scripts/login-register.js
const formSesion = document.getElementById("formSesion");
const targetsInputs = document.getElementsByClassName("target-input");
const regexInputs = {
    'cuil-input': /^\d{2}-\d{8}-\d{1}$/,
    'chasis-input': /^(?:[A-Za-z]{3} \d{3}|[A-Za-z]{2} \d{3} [A-Za-z]{2})$/,
    'acoplado-input': /^(?:[A-Za-z]{3} \d{3}|[A-Za-z]{2} \d{3} [A-Za-z]{2})$/,
    'telefono-input': /^\d{10}$/,
    'email-input': /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
};

function formatCuil(input) {
    // Elimina todo lo que no sea un número
    let value = input.value.replace(/\D/g, '');
    
    // Limita a 11 dígitos (el máximo de un CUIL)
    if (value.length > 11) {
        value = value.slice(0, 11);
    }

    // Aplica el formato XX-XXXXXXXX-X
    let formattedValue = '';
    if (value.length > 0) {
        formattedValue = value.substring(0, 2);
        if (value.length > 2) {
            formattedValue += '-' + value.substring(2, 10);
        }
        if (value.length > 10) {
            formattedValue += '-' + value.substring(10, 11);
        }
    }

    input.value = formattedValue;
}

function seePassword(passwordId) {
    const iconoToggle = document.querySelector(".toggle");
    const inputPassword = document.getElementById("password-input");
    iconoToggle.addEventListener("click", (e) => {
        if (inputPassword?.type === "password") {
            inputPassword.type = "text";
            e.target.classList.replace("bi-eye-slash", "bi-eye");
        } else {
            inputPassword.type = "password";
            e.target.classList.replace("bi-eye", "bi-eye-slash");
        }
    });
}
const contentPrincipal = document.getElementById("contentPrincipal");


formSesion?.addEventListener("submit", async (event) => {
    event.preventDefault(); // Evita que el formulario se envíe por defecto

    var valid = true;
    for (let i = 0; i < targetsInputs.length; i++)
        if (!validFormat(targetsInputs[i], regexInputs[targetsInputs[i].id], document.getElementById(targetsInputs[i].id + "-error")))
            valid = false;
    if (!valid) { return; }
    const isRegisterForm = document.getElementById('register');
    const userData = new FormData(formSesion);
    // Convertir FormData a un objeto plano y trim() los valores de cadena
    const payload = {};
    for (let [key, value] of userData.entries()) {
        payload[key] = typeof value === 'string' ? value.trim() : value;
    }

    let apiURL;
    let redirectURL;

    // Ajustar el payload y la URL según sea formulario de registro o login
    if (isRegisterForm) {
        apiURL = `${BASE_URL}/users/register`;
        redirectURL = 'login.html';
    } else {
        apiURL = `${BASE_URL}/users/login`;
        redirectURL = 'home-admin.html';
    }

    //console.log("Payload enviado:", payload);
    //console.log("URL de la API:", apiURL);

    // --- Enviar datos al Backend ---
    try {
        createLoadingSpinner(contentPrincipal);
        isRegisterForm ? changeSpinnerText(contentPrincipal, "Registrando usuario...") : changeSpinnerText(contentPrincipal, "Iniciando Sesion...");


        const response = await fetch(apiURL, {
            method: 'POST', // El método es siempre POST para login y register
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (response.ok) {
            formSesion.reset(); // Limpiar el formulario

            if (!isRegisterForm && data.token) {
                localStorage.setItem('jwtToken', data.token);
                localStorage.setItem('userName', data.nombre_apellido);
                localStorage.setItem('userRole', data.role);
                localStorage.setItem('userCuil', data.cuil);
                if (data.trabajador)
                    localStorage.setItem('userTrabajador', data.trabajador);
            }
            if (data.role === "chofer")
                redirectURL = "home-chofer.html";
            //showConfirmModal(data.message);
            window.location.href = redirectURL;
        } else {
            toggleSpinnerVisible(contentPrincipal);
            showConfirmModal(data.message);
            console.error('Error del backend:', data);
        }
    } catch (error) {
        console.error('Error de red al registrar o iniciar sesión:', error);
        console.error('Error de conexión con el servidor.');
    }
    finally {
        changeSpinnerText(contentPrincipal);
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    seePassword("password-input");

    // Lógica para formateo automático de CUIL
    const cuilInput = document.getElementById("cuil-input");
    if (cuilInput) {
        cuilInput.addEventListener("input", (e) => {
            formatCuil(e.target);
        });
    }
});

/**
 * Parametros validFormat.
 * @param {HTMLElement} value
 * @param {regExp} regex
 * @param {HTMLElement} text
 * @returns {boolean} El resultado utilizado para enviar el form.
 */
function validFormat(input, regex, text) {
    if (input.value !== '' && !regex.test(input.value)) {
        text.style.display = 'block';
        return false;
    } else {
        text.style.display = 'none';
        return true;
    }
}