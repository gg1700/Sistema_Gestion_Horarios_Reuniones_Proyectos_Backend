# Eliminacion de cuentas: T-19, T-20 y T-21

## Contrato HTTP

`DELETE /api/v1/profile` requiere `Authorization: Bearer <token>` y este JSON:

```json
{ "confirmation": "ELIMINAR" }
```

Tambien admite el correo principal o cualquiera de los correos de contacto del
usuario, sin distinguir mayusculas y quitando espacios en los extremos. La palabra
`ELIMINAR` debe escribirse en mayusculas. El usuario se obtiene exclusivamente del
token: un `userId` enviado por body o query no cambia la cuenta que se elimina.

| Estado | Resultado |
| --- | --- |
| 200 | Cuenta eliminada; `{ "success": true, "message": "Cuenta eliminada correctamente" }`. |
| 400 | Falta confirmation, tiene un tipo invalido o no coincide. No se modifica la cuenta. |
| 401 | Falta la sesion, es invalida, el usuario no existe o tiene deleted_at. |
| 429 | Mas de cinco intentos por IP en quince minutos, incluso sin sesion. |
| 500 | Fallo local; rollback de todos los cambios de la transaccion, con mensaje generico. |

## T-19: estrategia y datos conservados

La fila de `public."user"` se conserva con su UUID, fechas, `status = 'deleted'`,
`deleted_at`, un handle aleatorio `deleted-<uuid>` y `public_link_active = false`.
Nombre, primer apellido, correo, password_hash y foto pasan a NULL. Los estados
permitidos son `active`, `inactive` y `deleted`. Los datos basicos siguen siendo
obligatorios para usuarios sin deleted_at mediante una restriccion CHECK.

Se borran fisicamente segundo apellido, asociaciones de telefonos y correos,
direcciones, asociaciones de pais, experiencia y enlaces. Se borran los registros
de phone y email que pertenecian al usuario solo si ya no estan asociados a otra
persona; el catalogo country y los contactos compartidos se conservan.

El repositorio consulta las llaves foraneas reales a user para eliminar tambien
las filas de los modulos instalados: cuentas externas y tokens, calendario,
repositorios seleccionados, cache de actividad y visibilidad. No inventa tablas
de tareas pendientes. Toda tabla nueva con datos del usuario debe tener una FK
real a user con `ON DELETE CASCADE`; el borrado logico no dispara por si solo la
cascada. Tablas descendientes deben aplicar cascada desde su padre correspondiente.

Las siete relaciones directas de T-04 ya usan cascada. La prueba automatizada
audita las FKs existentes y comprueba una dependencia adicional instalada durante
la prueba. La cascada tambien permite una purga fisica posterior de la fila anonima;
esta tarea no expone un endpoint de purga.

Actualizar deleted_at manualmente solo bloquea el acceso: no ejecuta esta limpieza.
Para eliminar una cuenta con todos sus datos se debe usar el servicio de eliminacion.

La migracion 011 modifica la restriccion de estados y permite NULL en los datos
personales de usuarios eliminados. La migracion 010 es la version existente de
T-48 publicada en develop; incluye public_link_active y no se modifica aqui.

Las rutas GET, POST, PATCH y DELETE de perfil verifican sesion y usuario sin
deleted_at. Las consultas de usuario/experiencia tambien excluyen eliminados.
No hay una tabla de sesiones: los JWT anteriores conservan una firma valida,
pero todos se rechazan al consultar su usuario eliminado. Cambiar la clave JWT
global o crear una lista de tokens revocados no es necesario para eliminar cuentas.

## Transaccion y fallos

El servicio bloquea la fila de user para serializar eliminaciones concurrentes,
valida la confirmacion y obtiene las cuentas externas. Marca la cuenta eliminada
y su enlace inactivo, intenta revocar cada proveedor y luego borra los datos y
anonimiza la fila. Todo cambio de PostgreSQL se confirma en una sola transaccion;
las sesiones se rechazan desde el COMMIT. Los accesos que ya estaban en curso
antes de ese COMMIT no se cancelan retroactivamente.

Las escrituras transaccionales de perfil tambien bloquean y vuelven a comprobar
al usuario antes de guardar. Asi una peticion iniciada durante la revocacion no
puede recrear datos personales despues de que termine la eliminacion.

Cada llamada externa tiene un limite de cinco segundos. Un fallo HTTP, un token
ya revocado, un error de descifrado o un proveedor caido se registra sin incluir
tokens ni respuestas del proveedor, y no impide continuar con las otras cuentas
ni con el borrado local. Si falla la transaccion local, el acceso ya revocado en
un proveedor no se puede restaurar mediante ROLLBACK; el usuario puede reintentar
la eliminacion con su sesion local.

## T-21: contrato con las tareas OAuth

La rama T-29 publica el contrato `public.external_account` con `user_id`,
`provider`, `access_token` y `refresh_token`. T-21 lee todos los tokens del usuario;
no reutiliza el listado publico de cuentas, que los omite. Si la tabla no esta
instalada, no existen cuentas vinculadas en ese modulo y no hay llamadas externas.
Si la tabla existe y su consulta falla, se aborta la eliminacion con rollback.

Se conserva el formato de cifrado de T-29/T-25:
`v1:<iv_base64>:<tag_base64>:<ciphertext_base64>`, AES-256-GCM, IV de 12 bytes,
tag de 16 bytes y ENCRYPTION_KEY de 32 bytes en base64. Debe ser la misma clave
que cifra los tokens. Es opcional al arrancar sin cuentas externas: no hace
falta configurar nuevas variables para las pruebas normales de perfil.

Google usa primero refresh_token y, si no existe, access_token; envia `token`
al endpoint de revocacion. GitHub usa access_token y elimina la autorizacion
de la aplicacion. Referencias oficiales consultadas:

- [Revocacion en Google](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).
- [Eliminar una autorizacion en GitHub](https://docs.github.com/en/rest/apps/oauth-applications#delete-an-app-authorization).

Las migraciones de T-14/T-24/T-33/T-44 aun no estan integradas en esta base. La
prueba de integracion crea y retira una tabla external_account de prueba conforme
al contrato publicado. Esto prueba T-21 sin introducir una migracion de T-24 ni
afirmar que ya estan implementados OAuth, calendario o repositorios. Al integrar
esos modulos hay que validar sus FKs, columnas y la clave de cifrado compartida.

## Verificacion local y Bruno

Entorno: PostgreSQL 18 en Docker local, puerto 55432, sin cambios en Supabase.
Aplicar primero las migraciones con `npm run migrate-db`, luego ejecutar:

```powershell
$env:NODE_ENV = 'test'
npm test
Remove-Item Env:NODE_ENV
npm run build
```

Las pruebas cubren confirmaciones, borrado y anonimizado, token anterior en
todas las rutas de perfil, liberacion del handle/correo, enlace publico inactivo,
contactos compartidos, rollback, cascadas y rate limit. Los proveedores se
simulan: no se revocan autorizaciones reales durante las pruebas.

Resultado local del 23 de octubre de 2026: 52 pruebas aprobadas en cinco archivos,
compilacion TypeScript correcta y ESLint sin errores (advertencias de console
para los registros requeridos y de any en codigo previo). Se aplicaron 010 y 011
en Docker. Tambien se ejecutaron los cuerpos y scripts de prueba de los cuatro
archivos Bruno contra una instancia HTTP local: registro 201, confirmacion
incorrecta 400, eliminacion 200 y token anterior 401. Se comprobo el anonimizado
en PostgreSQL y se retiro exclusivamente la cuenta creada para esta verificacion.

Para probar manualmente, abrir la carpeta `bruno` y usar **Eliminar cuenta - T-20**:

1. `POST /api/v1/auth/register`: crea una cuenta de prueba y guarda su token en
   deleteAccountToken. No modifica accessToken de la coleccion.
2. `DELETE /api/v1/profile - Confirmacion incorrecta`: espera 400.
3. `DELETE /api/v1/profile - Eliminar cuenta`: espera 200 y elimina esa cuenta.
4. `GET /api/v1/profile - Token anterior`: espera 401 por usuario no disponible.

El cuerpo del registro es visible y fijo. Despues de eliminar se puede volver a
registrar con el mismo handle y correo. Si ya existe una cuenta sin eliminar,
el registro devuelve 409: primero completa su eliminacion con su sesion o usa
otros datos de prueba. Las peticiones DELETE comparten el limite de cinco intentos.

La ejecucion en la interfaz de Bruno y la aceptacion del PR por otra persona
corresponden a la revision manual; no se presentan como realizadas por las pruebas
automatizadas.
