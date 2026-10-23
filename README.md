# Sistema de Gestión de Horarios, Reuniones y Proyectos - Backend 
## Configuración de Credenciales OAuth 2.0


### 1. Configurar el archivo de entorno
Copia el archivo de ejemplo y renómbralo:
```
cp .env.example .env
```

### 2. Credenciales de Google 
Para la creacion de credenciales se realizo los siguientes pasos:
1. Acceder a la pagina de google cloud console https://console.cloud.google.com/welcome/new

2. Ingresar al boton de selecciona un proyecto, crea el proyecto y abrelo.

3. Ir al apartado de a "APIs y Servicios"  > "Biblioteca". Buscar y habilitar Google Calendar API y Google Meet API
4. Ir al apartado de Pantalla de Consentimiento OAuth y le das a comenzar
    -   Ingresar el nombre de la aplicación.
    - Correo electronico
    - Seleccionar Usuarios externos
    - Agregar los correos para que puedan realizar las pruebas
    - Aceptar las politicas y condiciones
5. Crear Cliente OAuth: Ir al apartado de cliente
    - Seleccionar aplicacion web
    - Nombre del cliente
    - Agregar las URI por ejemplo del local http://localhost:3000
    - Agregar las URI de redireccionamiento como por ejemplo: http://localhost:3000/api/auth/google/callback
    - Se les generara las credenciales, deben copiar el Client ID pegalo en el archivo .env en GOOGLE_CLIENT_ID y lo mismo con el Client Secret pegalo en GOOGLE_CLIENT_SECRET 
6. En el apartado de Acceso a los datos, se agregará o quitara permisos de los que son las API's de google calendar y meet.

### 3. Credenciales de GitHub 
Para GitHub deben realizar los siguientes pasos
1. Ve a tu cuenta de GitHub: **Settings > Developer settings > OAuth Apps**. O ingresar directo al link: https://github.com/settings/developers
2. Haz clic en **New OAuth App**.
3. Llena los datos:
   - **Application name:** Nombre de la aplicacion 
   - **Homepage URL:** Por ejemplo: http://localhost:3000
   - **Authorization callback URL:** Por ejemplo: http://localhost:3000/api/auth/github/callback
4. Haz clic en **Register application**.
5. Copia el **Client ID** y pégalo en tu archivo .env como GITHUB_CLIENT_ID.
6. Haz clic en **Generate a new client secret**, cópialo inmediatamente y pégalo como GITHUB_CLIENT_SECRET.

### 4. Clave de Encriptacion de Tokens
Para generar una clave para el cifrado y descifrado de tokens sigue los siguientes pasos:
1. Abre la teminal
2. Escribe el comando: `openssl rand -base64 32` o `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
3. Pulsa ENTER
4. Copia la cadena generada
5. Pega la cadena generada en la variable de entorno ENCRYPTION_KEY en el archivo .env.