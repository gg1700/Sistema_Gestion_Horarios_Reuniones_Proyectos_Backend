# Listado y selección de calendarios de Google

## 1. Descripción general

Esta funcionalidad permite a los usuarios autenticados consultar los calendarios disponibles en su cuenta de Google y seleccionar uno

La selección se almacena en la tabla `public.calendar_connection`, vinculada a la cuenta externa de Google del usuario.

## 2. Endpoints implementados

### 2.1. Listar calendarios

**Método:** GET

**Ruta:** `/api/v1/integrations/google-calendar/calendars`

**Autenticación:** sesión activa del usuario.

**Descripción:** consulta la API de Google Calendar y devuelve los calendarios accesibles por la cuenta Google vinculada, incluyendo los permisos asociados a cada calendario.

También devuelve el identificador del calendario seleccionado previamente, si existe.

**Respuesta satisfactoria:** HTTP 200 OK.

### 2.2. Seleccionar calendario

**Método:** PUT

**Ruta:** `/api/v1/integrations/google-calendar/selected`

**Autenticación:** sesión activa del usuario.

**Cuerpo de la solicitud:**

```json
{
  "calendarId": "ID_DEL_CALENDARIO"
}
```

**Descripción:** valida que el identificador proporcionado corresponda a un calendario accesible por la cuenta Google vinculada y que el usuario tenga permisos de escritura.

Si la validación es satisfactoria, guarda la selección en PostgreSQL.

**Respuesta satisfactoria:** HTTP 200 OK.

Si existe una selección previa, actualiza el registro sin modificar el identificador principal de la conexión.

## 3. Validaciones implementadas

- Verificación de sesión activa y perfil de usuario.
- Aplicación de límites de solicitudes mediante rate limit.
- Verificación de la conexión OAuth 2.0 con Google.
- Obtención de un token válido, renovándolo cuando corresponde.
- Validación del identificador del calendario.
- Comprobación de que el calendario aparece entre los accesibles por la cuenta autorizada.
- Verificación de permisos de escritura mediante `accessRole`.
- Rechazo de calendarios que solo permiten lectura.
- Actualización de la selección existente sin duplicar conexiones.

## 4. Manejo de errores

| HTTP | Código | Descripción |
|---|---|---|
| 400 | `invalid_calendar_id` | Identificador vacío o inválido |
| 401 | Según middleware | Sesión ausente o inválida |
| 403 | `calendar_read_only` | Calendario sin permisos de escritura |
| 404 | `calendar_not_found` | Calendario inexistente o no accesible |
| 409 | `google_not_connected` | Cuenta Google no conectada |
| 409 | `reconnection_required` | Se requiere volver a autorizar Google |
| 429 | Según middleware | Límite de solicitudes excedido |
| 502 | `google_calendar_unavailable` | Fallo de comunicación con Google |
| 500 | `internal_error` | Error inesperado del servidor |

## 5. Persistencia de datos

Se utiliza la tabla existente `public.calendar_connection`, relacionada con `public.external_account` mediante `external_account_id`.

Los principales campos almacenados son:

- `google_calendar_id`: identificador del calendario seleccionado.
- `name`: nombre del calendario.
- `timezone`: zona horaria.
- `status`: estado de la conexión.
- `updated_at`: fecha de la última modificación.

La restricción `UNIQUE (external_account_id)` garantiza una única selección por cuenta externa.

## 6. Pruebas realizadas en Postman
- **Paso 1. Iniciar sesión**

Abrir un navegador e ingresar a:

http://localhost:3000/api/v1/auth/google

Completar el inicio de sesión con una cuenta Google autorizada.

- **Paso 2. Autorizar Google Calendar**

Con la sesión activa, abrir:

http://localhost:3000/api/v1/integrations/google-calendar/connect

Seleccionar la cuenta Google y conceder los permisos solicitados.

Este proceso permite que el backend consulte los calendarios disponibles mediante la API de Google Calendar.  
Se efectuaron las siguientes pruebas manuales:
- **Paso 3. Obtener la cookie de sesión**

En el navegador:

1. Presionar `F12` para abrir las herramientas de desarrollador.
2. Ingresar a **Application** (Chrome) o **Storage** (Firefox).
3. Buscar la sección **Cookies**.
4. Seleccionar el dominio `http://localhost:3000`.
5. Buscar la cookie llamada `session`.
6. Copiar su valor completo.

- **Paso 4: Postman**
  - URL PUT: `http://localhost:3000/api/v1/integrations/google-calendar/selected` 
  - URL GET: `http://localhost:3000/api/v1/integrations/google-calendar/calendars` 
  - En cada solicitud, abrir la pestaña **Headers** y agregar:

  | Key | Value |
  |---|---|
  | `Cookie` | `session=VALOR_COMPLETO_DE_LA_COOKIE` |

  - Para las peticiones PUT, agregar también:

  | Key | Value |
  |---|---|
  | `Content-Type` | `application/json` |

### Casos de prueba 

- **Listar calendarios disponibles**

**Método:** GET `http://localhost:3000/api/v1/integrations/google-calendar/calendars`

**Resultado esperado:**

- Código HTTP `200 OK`.
- Propiedad `success` con valor `true`.
- Arreglo `data.calendars` con los calendarios accesibles.
- Cada calendario incluye su ID, nombre, zona horaria y permisos.

**Verificación:** comprobar que `canWrite` corresponda al permiso `accessRole` del calendario.

- **Seleccionar un calendario válido**

**Método:** PUT `http://localhost:3000/api/v1/integrations/google-calendar/selected`

**Procedimiento:**

1. Ejecutar primero el GET
2. Seleccionar un calendario que tenga `canWrite: true`.
3. Copiar su identificador `id`.
4. Crear una solicitud PUT.
5. Seleccionar **Body → raw → JSON**.
6. Enviar el siguiente cuerpo, reemplazando el identificador:

```json
{
  "calendarId": "ID_DEL_CALENDARIO_EDITABLE"
}
```
**Resultado esperado:**

- Código HTTP `200 OK`.
- Propiedad `success` con valor `true`.
- Identificador del calendario seleccionado.
- Nombre y zona horaria recuperados de Google.
- Estado `connected`.

**Verificar que el calendario se guardo**
```sql
SELECT
    cc.id,
    ea.user_id,
    ea.provider,
    cc.google_calendar_id,
    cc.name,
    cc.timezone,
    cc.status,
    cc.created_at,
    cc.updated_at
FROM public.calendar_connection cc
JOIN public.external_account ea
    ON ea.id = cc.external_account_id
WHERE ea.provider = 'google'; 
```
De esta manera se pueden realizar la prueba con calendario de solo lectura o id valido o sin inicio de sesion.
## 7. Pruebas automatizadas

Los escenarios incluyen listado, selección válida, permisos insuficientes, calendarios inaccesibles, IDs inválidos, reconexión requerida, paginación y errores de Google.
