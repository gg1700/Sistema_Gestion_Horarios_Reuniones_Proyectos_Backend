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

## Probar inicio de sesion OAuth2
Para probar el inicio de sesión OAuth2, deben configurar una clave `COOKIE_SECRET` en su archivo `.env`.

**1. Generar la clave secreta:**

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

**2. Agregarla al `.env`:**

```dotenv
COOKIE_SECRET=your_cookie_secret
```

Cada integrante lo genera para desarrollo local.

**3. Iniciar el backend:**

```bash
npm run dev
```

**4. Probar el endpoint:**

```bash
curl -i http://localhost:3000/api/v1/auth/google
```

También pueden probar `/api/v1/auth/github`.

La respuesta debe ser **HTTP 302**, con una cabecera `Location` hacia Google o GitHub.

El caso de hacer la consulta con otro como facebook la respuesta sera **HTTP 400** como con el ejemplo de abajo.
```bash
curl -i http://localhost:3000/api/v1/auth/facebook
```