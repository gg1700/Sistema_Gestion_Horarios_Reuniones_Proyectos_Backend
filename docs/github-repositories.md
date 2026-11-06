# Repositorios GitHub — T-43 / T-44 / T-45

Implementación local del 29 de octubre de 2026. T-39 ya está integrada en develop
(merge bfd082d): usa Octokit para actividad. Se comparte su creación de cliente,
timeout y respuesta a límites con el nuevo servicio. Se conserva el código de actividad.
La dependencia octokit ya figuraba en package-lock.json; se instalaron dependencias locales.

## Decisiones de integración

- Se usa `repository`, nombre del DBML del equipo y del servicio Visibilidad existente.
  El archivo conserva el nombre solicitado `009-create-featured-repository-table.sql`.
  No hay dos tablas para el mismo propósito.
- Hasta **5** repositorios, acorde al selector existente. GET informa `maxSelected`.
- Repositorios **personales**: `GET /user/repos?affiliation=owner&sort=pushed&direction=desc&per_page=100`.
  Se recorren todas las páginas mediante el iterador de Octokit (Link).
  No incluye repositorios de organizaciones o colaboraciones que el usuario no posee.
- Los scopes efectivos de la cabecera `X-OAuth-Scopes` prevalecen sobre los guardados.
  `repo` permite ver privados. Un token público devuelve públicos; solamente los
  públicos pueden seleccionarse para publicar. No se pide un scope más amplio al entrar.
- Descripción y lenguaje admiten null. ID GitHub numérico; ID de selección UUID local.
- Guardar no publica: una selección nueva empieza con `visible=false`. Reordenar
  conserva la visibilidad de las filas que permanecen seleccionadas.
- GET completo reconcilia las copias seleccionadas. Si un repositorio desaparece,
  se hace privado o deja de pertenecer al usuario, se retira y se devuelve un aviso.
  Una respuesta parcial, cuota o caída de GitHub nunca se interpreta como lista vacía.
- La detección sucede al actualizar/listar/guardar; no se añadió un webhook ni
  un monitor periódico. Entre consultas se sirve la última copia local confirmada.
- El visitante usa SQL local ordenado y datos ya filtrados. No llama a GitHub.
  Una cuenta desconectada/caducada o con otro nombre de propietario oculta las copias.
- RLS activado sin políticas y permisos directos revocados. Acceso mediante backend
  con rol autorizado; nunca exponer claves de servicio a Supabase/browser.

Documentación usada: [GitHub REST: repositorios](https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user).

## Contrato HTTP

Todas las rutas privadas requieren sesión válida de usuario activo (cookie `session`
firmada/HttpOnly; también se admite Bearer para clientes de pruebas).

`GET /api/v1/integrations/github/repositories` no tiene body.

```json
{"success":true,"data":{"username":"ana","maxSelected":5,"selectedIds":[123],"warnings":[],"repositories":[{"id":123,"name":"orbitia","description":null,"language":"TypeScript","stars":3,"url":"https://github.com/ana/orbitia","private":false,"visibility":"public","selected":true,"selectionId":"UUID-local","visible":false}]}}
```

`PUT /api/v1/integrations/github/repositories/selected`, `Content-Type: application/json`:

```json
{"repositoryIds":[456,123]}
```

El orden del array es el orden público. `[]` limpia la selección. El backend obtiene
las copias actuales de GitHub; no acepta nombre/URL/estrellas enviados por el cliente.
Respuesta: `{"success":true,"data":{"selectedIds":[456,123],"maxSelected":5}}`.
Reemplazo y copias se guardan en una transacción con bloqueo del usuario y cuenta.
No se pierde una publicación previa al reordenar; un error revierte todo el reemplazo.

`PATCH /api/v1/profile/visibility` publica explícitamente las selecciones:

```json
{"changes":[{"type":"repository","id":"UUID-local","visible":true}]}
```

`PATCH /api/v1/profile/public-link` con `{"publicLinkActive":true}` habilita el enlace.
`GET /api/v1/public/profiles/ana` devuelve las copias públicas en orden.

Errores: 401 sesión; 409 `GITHUB_NOT_CONNECTED` / `GITHUB_REAUTH_REQUIRED`;
403 `GITHUB_PERMISSION_DENIED` u origen inválido; 415 falta JSON;
422 `INVALID_SELECTION` / `INVALID_REPOSITORY`; 429 `GITHUB_RATE_LIMIT` con
`Retry-After`; 502 `GITHUB_UNAVAILABLE`; 500 error local. Nunca se envían tokens.

## Preparación y pruebas locales

Con Docker activo y `.env` apuntando a localhost:5433/Telematicos:

```powershell
npm run test:repositories:local
npm run db:repositories:local
npm run verify:repositories:local
npm run build
```

El primer comando crea/migra `orbitia_repository_test`, una base aislada con proveedor
simulado. El segundo aplica solo 008/009 a Telematicos con historial y transacción;
el tercero consulta GitHub real solamente si hay una única cuenta activa local.
Ninguno admite Supabase/producción como destino.

Pruebas automatizadas: paginación vacía y múltiple (también Octokit real con transporte
simulado), nulos, scopes, propietario e identidad, sesión/cookie, origen, máximo,
duplicados, privados, reordenamiento, rollback, reconciliación, cuota, caducidad,
visibilidad ajena, RLS, unicidad, cascada y perfil público sin llamadas a GitHub.
Frontend: cancelar borrador, orden, error conservando selección, privados/límite,
datos públicos completos, 404 y vista previa que nunca usa el correo de acceso.

## Postman y recorrido manual

Importar `github-repositories.postman_collection.json`. Completar las variables con
IDs reales de GET. Autenticarse con la cookie local mediante el administrador de
cookies de Postman o un Bearer de pruebas en la variable `sessionToken`. No versionar
tokens. La colección no contiene credenciales y no publica automáticamente nada.

1. Iniciar sesión real y abrir Perfil → Conexiones → GitHub.
2. Gestionar: buscar, elegir, ordenar; cancelar debe descartar. Guardar debe persistir
   tras recargar. Probar selección ajena/repetida/excesiva con Postman: 422.
3. Perfil → Visibilidad: activar los proyectos elegidos y guardar.
4. Perfil → Enlace público: activarlo y abrir la URL en otra sesión.
5. Verificar país, experiencias, enlaces y proyectos según visibilidad; revisar orden.
6. Con GitHub inaccesible, Actualizar debe conservar la selección y mostrar el error.

La evidencia HTTP automatizada usa Supertest + PostgreSQL. La ejecución interactiva
de esta colección en Postman y la aceptación del PR por otra persona quedan pendientes.
No se hicieron commits, push ni cambios en Supabase.

Resultados comprobados el 29/10/2026: 30 pruebas de repositorios/base/filtro público,
58 pruebas de regresión OAuth/filtro (hay solapamiento entre estas tandas),
9 pruebas nuevas de interfaz y 39 pruebas previas del frontend. Ambos builds pasan.
008/009 están aplicadas a la base local Telematicos. La consulta con la cuenta
vinculada real devolvió 409 `GITHUB_REAUTH_REQUIRED`: hace falta renovar su
autorización desde la pantalla. No se declara completado el recorrido con cuenta
real ni la revisión humana del PR.

## Revisión de código

- Se conserva la maqueta anterior mediante exportaciones `Demo*` y los componentes
  compartidos. Las rutas de repositorios, visibilidad, enlace y visitante usan datos reales.
- El diseño público existente se conservó; se corrigió el mapeo de campos reales
  (`firstSurname`, `countries`, `workExperiences`, `links`, métricas de repositorios).
- Se corrigió el repositorio de cuentas externas: no seleccionaba `id`, que T-39
  necesita para marcar tokens rechazados. 008 añade las tablas de caché que T-39
  consultaba pero no tenía en sus migraciones.
- Se comprobó pertenencia desde GitHub, no desde IDs enviados por navegador; se
  verifica que el token siga siendo el mismo al iniciar la transacción.
- La sesión de la cabecera usa el perfil real. El enlace público pasó de leer JWT
  en localStorage a usar la cookie existente. Cerrar sesión retira esa cookie;
  no se añadió revocación individual de otras copias de JWT.
- Agenda, reuniones, algunos editores de perfil y Google Calendar siguen con sus
  integraciones previas/maquetas. No se declara integrado todo el sistema.
