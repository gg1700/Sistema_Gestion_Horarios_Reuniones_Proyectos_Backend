# T-28 — Decisión de identidad OAuth2

## 1. Descripción

El backend permite autenticarse con Google y GitHub, crear usuarios automáticamente y vincular proveedores a cuentas existentes.

El flujo reutiliza el callback OAuth2 de la T-27 y `SessionService.createSession()` de la T-02.

## 2. Pruebas
Para realizar las pruebas se debe ingresar a:
http://localhost:3000/api/v1/auth/google

Consulta en la base de datos
```sql
SELECT id, handle_name, name, first_surname, email, profile_picture
FROM public."user"
ORDER BY created_at DESC;
```
Verificar tambien la cuenta externa
```sql
SELECT user_id, provider, provider_user_id,
       provider_username, provider_user_email
FROM public.external_account;
```

- Vincular GitHub a Google
Esta es una de las pruebas más importantes.
Primero, inicia sesión con Google y no borres las cookies.
Después abre:
Vincular GitHub a la sesión actualAutoriza GitHub. 
para vincular usar http://localhost:3000/api/v1/auth/github?intent=link

Resultado esperado:
http://localhost:5173/?oauth=success
```
SELECT user_id, provider, provider_user_id
FROM public.external_account
ORDER BY user_id, provider;
```

## 3. Endpoints

| Método | Endpoint | Función |
|---|---|---|
| GET | `/api/v1/auth/google` | Iniciar sesión con Google |
| GET | `/api/v1/auth/github` | Iniciar sesión con GitHub |
| GET | `/api/v1/auth/:provider?intent=link` | Vincular un proveedor al usuario autenticado |
| GET | `/api/v1/auth/:provider?mode=json` | Obtener la URL de autorización en JSON |
| GET | `/api/v1/auth/:provider/callback` | Procesar la respuesta OAuth2 |
| GET | `/api/v1/profile` | Obtener el perfil autenticado |

`intent` admite `login` (valor predeterminado) y `link`.

## 4. Respuestas del endpoint de autorización

**GET `/api/v1/auth/:provider`**

| HTTP | Respuesta | Significado |
|---|---|---|
| 302 | Redirección a Google/GitHub | Inicio correcto del flujo |
| 200 | `{ "authorizationUrl": "..." }` | Cuando se solicita `mode=json` |
| 400 | JSON con `success: false` | Proveedor o intención inválidos |
| 401 | JSON con `success: false` | Sesión ausente, inválida o usuario no disponible durante la vinculación |
| 429 | Respuesta del rate limiter, si corresponde | Demasiadas solicitudes |
| 500 | Error del servidor | Error inesperado |

En `mode=json`, el frontend debe conservar las cookies del flujo OAuth2.

## 5. Respuestas del callback

**GET `/api/v1/auth/:provider/callback`**

El callback utiliza redirecciones HTTP 302 a `FRONTEND_OAUTH_CALLBACK_URL`, añadiendo un parámetro `oauth` con el resultado.

Ejemplo:

`http://localhost:5173/?oauth=success`

| Código `oauth` | Significado | Acción sugerida al frontend |
|---|---|---|
| `success` | Autenticación o vinculación completada | Consultar el perfil y continuar |
| `access_denied` | El usuario canceló la autorización | Mostrar aviso y permitir reintentar |
| `invalid_provider` | Proveedor no admitido | Mostrar error |
| `invalid_state` | Estado OAuth ausente, inválido, alterado o expirado | Reiniciar el flujo de autorización |
| `invalid_code` | Código de autorización ausente, inválido o expirado | Permitir reintentar |
| `provider_unavailable` | Error al comunicarse con Google o GitHub | Permitir reintentar posteriormente |
| `invalid_session` | Sesión inválida, expirada o distinta durante la vinculación | Solicitar un nuevo inicio de sesión |
| `email_conflict` | Correo asociado a otro usuario | Iniciar sesión con la cuenta existente y después vincular el proveedor |
| `account_conflict` | Cuenta externa asociada a otro usuario o conflicto de vinculación | Informar del conflicto; no fusionar automáticamente |
| `additional_info_required` | El proveedor no proporcionó el correo necesario para crear el usuario | Informar que el registro no se completó |
| `handle_unavailable` | No se pudo generar un identificador disponible | Mostrar error e indicar que se intente nuevamente |
| `internal_error` | Error inesperado al procesar OAuth2 | Mostrar error genérico |

Estos códigos representan los resultados implementados en el callback y los conflictos que puede emitir la lógica de decisión.

## 6. Sesiones y cookies

En una autenticación exitosa, el backend establece una cookie:

- Nombre: `session`
- Contenido: JWT firmado mediante `SessionService.createSession()`
- `HttpOnly: true`
- `Signed: true`
- `SameSite: lax`
- `Secure: true` en producción
- Ruta: `/`
- `Max-Age`: 24 horas según la configuración actual del callback

El token no se incluye en los parámetros de redirección.

Para consultar el perfil desde el navegador:

```typescript
const response = await fetch("http://localhost:3000/api/v1/profile", {
  credentials: "include",
});

const result = await response.json();
```

El navegador y el backend deben estar configurados para permitir el envío de cookies entre sus respectivos orígenes.

## 7. Respuesta del perfil

Después de `oauth=success`, el frontend puede consultar `GET /api/v1/profile`.

La respuesta exitosa tiene esta estructura general:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "handleName": "ana-perez",
    "name": "Ana",
    "firstSurname": "Perez",
    "email": "ana@example.com",
    "profilePicture": "https://example.com/avatar.png",
    "requiresProfileCompletion": false
  }
}
```

Se omiten otras propiedades de información adicional del perfil para simplificar el ejemplo.

Si `requiresProfileCompletion` es `true`, el frontend debe permitir corregir los datos provisionales.

## 8. Reglas de creación y vinculación

- Si la identidad externa ya existe, se recupera al usuario correspondiente.
- Si se inicia una vinculación, se verifica la sesión existente y la pertenencia de la identidad.
- Si no existe usuario, se crea uno con los datos del proveedor.
- El nombre completo se divide en `name` y `first_surname`.
- Si faltan datos, se utilizan `Usuario` y `Pendiente`.
- Se genera un `handle_name` normalizado y único.
- El correo se guarda en `user.email` y `user_email` con `visible = false`.
- El enlace de GitHub se guarda en `link` con `visible = false`.
- El avatar se copia a `profile_picture`.
- Los tokens OAuth2 se almacenan cifrados.
- En los accesos posteriores no se sobrescriben los datos iniciales del perfil.
- Nunca se fusionan cuentas automáticamente solo porque comparten correo.