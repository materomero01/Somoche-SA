const inputPassword = document.getElementById("password-input");
const inputCuil = document.getElementById("cuil-input");
const iconoToggle = document.querySelector(".toggle");
const formSesion = document.getElementById("formLogin");


iconoToggle.addEventListener("click", (e) =>{
    if (inputPassword.type ==="password"){
        inputPassword.type = "text";
        e.target.classList.replace("bi-eye-slash", "bi-eye");
    } else {
        inputPassword.type = "password";
        e.target.classList.replace("bi-eye","bi-eye-slash");
    }
});

formSesion.addEventListener("submit", function(event) {
      event.preventDefault(); // Evita que el formulario se envíe por defecto

      const cuilRegex = /^\d{2}-\d{8}-\d{1}$/;
      const errorCUIL = document.getElementById("error-text-cuil");
      if (!cuilRegex.test(inputCuil.value)) {
        errorCUIL.style.display = 'block';
        return; // Detiene la ejecución si el correo es inválido
      } else {
        errorCUIL.style.display = 'none';
      }

      this.submit(); // Si deseas enviar el formulario
});