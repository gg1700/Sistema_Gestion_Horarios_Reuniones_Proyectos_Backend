# Sistema de Gestión de Horarios, Reuniones y Proyectos - Backend 
## Configuración de Credenciales OAuth 2.0


### 1. Configurar el archivo de entorno
Copia el archivo de ejemplo y renómbralo:
```
cp .env.example .env
```

### 2. Credenciales de Google 
Para la creacion de credenciales se realizo los siguientes pasos:
1. Accede a [Google Cloud Console](https://console.cloud.google.com/) y selecciona o crea el proyecto de la aplicación.
2. Abre **Google Auth Platform** y configura la pantalla de consentimiento OAuth:
    -   Ingresa el nombre de la aplicación.
    - Correo electronico
    - Seleccionar Usuarios externos
3. En el apartado de Cliente 
    - Crea un cliente OAuth de tipo **Web application (Aplicación web)**
    - Nombre del cliente
    - Registra los orígenes JavaScript autorizados que necesite el frontend (por ejemplo, `http://localhost:3001`)
    - Agregar la URI de redirección del **backend** (por ejemplo, `http://localhost:3000/api/v1/auth/google/callback`)
    - Se generara las credenciales. Copiar el **Client ID** y el **Client Secret** al archivo `.env`, bajo `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, respectivamente. Configura también `GOOGLE_REDIRECT_URI` con la misma URI registrada en Google Cloud.
4. Modo de prueba y usuarios autorizados
    - Acceder a **Audience (Público)**
    - Verifica que la aplicación sea **External (Externo)** y permanezca en estado **Testing (Prueba)**.
    - En **Test users (Usuarios de prueba)** agregar las direcciones de las cuentas Google.
    - Guarda y comprueba que todos que los usuarios de prueba aparezcan en la lista.

### 3. Credenciales de GitHub 
Para GitHub se deben realizar los siguientes pasos:
1. Ingresar a [GitHub Developer settings](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**.
2. Ingresar el nombre de la aplicación y la URL principal (por ejemplo, `http://localhost:3001` si ese es el frontend).
3. En **Authorization callback URL**, registra la URI del backend, por ejemplo `http://localhost:3000/api/v1/auth/github/callback`.
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

### 5.Google Calendar API y permisos OAuth2
En este apartado se indica las configuraciones y permisos para habilitar la API de google calendar.

#### Habilitar Google Calendar API
1. En [Google Cloud Console](https://console.cloud.google.com/), selecciona el proyecto de OAuth2 utilizado por el backend.
2. Accede a **APIs y servicios → Biblioteca**.
3. Busca **Google Calendar API** y selecciona **Habilitar** (si aparece **Administrar**, ya está habilitada).

#### Registrar los scopes en la pantalla de consentimiento

1. Accede a **Google Auth Platform → Data Access (Acceso a los datos)** del proyecto.
2. Selecciona **Add or remove scopes (Agregar o quitar permisos)**.
3. Añadir los siguientes scopes:  

| Scope | Uso dentro del sistema |
| --- | --- |
| `https://www.googleapis.com/auth/calendar.calendarlist.readonly` | Consultar la lista de calendarios accesibles del usuario. |
| `https://www.googleapis.com/auth/calendar.events` | Consultar, crear, editar y eliminar eventos en calendarios donde el usuario tenga permisos. |

4. Guarda y comprueba que figuren en la lista de permisos configurados.

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