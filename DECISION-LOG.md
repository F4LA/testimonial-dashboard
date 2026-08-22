# DECISION LOG — Testimonial Dashboard

Chronological record of decisions and changes to the dashboard (frontend and `apps-script/`).
**Most recent entry on top.** Each entry: date · what changed · why.

> **Mandatory:** every change to the dashboard adds an entry here and updates `DASHBOARD-SYSTEM.md` (see the rule in `CLAUDE.md`). A change is not finished until the documentation is updated and pushed.

> **⚠️ Append-only, absolutely (D-101).** **A past entry's text is never rewritten, edited, or deleted** — not to correct it, not to add new information, not even to record that what it describes was later validated. Unlike the system log (`F4LA/testimonial-system` `decision-log.md`), this file has **no Status column**, so there is exactly one place for new information about an old entry: **a NEW entry at the top**, referencing the old one.
>
> *Why:* the log records what was known **when**, not a tidied-up version written with hindsight. An entry edited after the fact stops being usable as evidence of what anyone knew at the time — which is the whole reason it exists. Same instinct as the Event Log being append-only: a mis-marked event is annotated, never rewritten.
>
> This does **not** apply to the living documents, which are meant to be rewritten in place: `DASHBOARD-SYSTEM.md`, `CLAUDE.md`, and the system repo's `project-brain.md`.

---

## 2026-08-21 — Este repo pasa a ser la fuente de `apps-script/*.gs`, mismo tratamiento que el motor (D-127 en `testimonial-system`)

Se agrega `.clasp.json` en la raíz (Script ID `1q6spjnmFYXeq4UmUvncqBoO6Q0mhZ7ieQkJAIEoxRGK6O9BnOXZgWcpj` — proyecto standalone del tablero, cuenta `membership@strongstandard.com`), y las exclusiones de credenciales de clasp al `.gitignore`. La dirección queda invertida: el repo es la fuente para `Code.gs`, `Digest.gs` y `DriftCheck.gs`; se edita acá y se empuja con `clasp push`; el editor de Apps Script se usa solo para correr funciones y leer logs. Regla escrita en `CLAUDE.md`, junto a la sección que ya explicaba que `apps-script/` no incluye el motor.

**Prueba de deriva antes de establecer la dirección, como corresponde.** El primer `clasp pull` no dio vacío: `Code.gs` coincidió byte a byte, pero `Digest.gs` y `DriftCheck.gs` mostraron una única diferencia en cada uno — un salto de línea final ausente en la versión que trae `clasp pull`, no una edición de contenido (mismo número de líneas de código, mismo texto). Ninguna edición en vivo real desde la última sincronización. Se descartó la versión traída por `clasp pull` para esos dos archivos (el repo ya tenía la forma correcta) y se corrió `clasp push` para que el editor coincida con el repo, no al revés. Un segundo `clasp pull` + `git diff` después del push salió completamente vacío, incluido `appsscript.json`, que no estaba versionado y se agrega tal cual lo trajo `clasp pull` (mismo precedente que el manifiesto del motor en D-127).

---

## 2026-08-21 — La comprobación de direcciones existía y nadie podía correrla

Un defecto de fondo con tres caras, todas verificadas en el editor en vivo antes de tocar código, no supuestas. **Sin redespliegue:** el digest corre por disparador de tiempo y toma el código actual del proyecto; `Code.gs` y `PROXY_VERSION` no se tocaron.

**Dato nuevo y bueno que salió de la investigación:** el disparador `sendDailyDigest` **sí está instalado**. `installDigestTrigger` corrió empezando y terminando en el mismo segundo (7:33:51 → 7:33:51), y cero segundos prueba que salió por el retorno temprano — imposible si hubiera hecho las cuatro llamadas de red de la comprobación.

**Una corrección a la premisa, porque importa para saber qué estaba roto.** `dSelfCheckSend_()` **no era** código inalcanzable: `selfCheck()` ya lo llamaba (y `previewDigest()` también). Lo que pasaba es que **reportaba solo por excepción**: con las cuatro direcciones sanas devuelve la lista vacía, se funde en `problems`, y la salida dice `invariants: ok` sin una sola línea sobre direcciones. Así que no se podía saber si la comprobación había corrido, ni si las cuatro direcciones se habían verificado alguna vez. Inalcanzable de verdad estaba **solo por la ruta de `installDigestTrigger`**, que es la peor de las dos: es la función cuyo trabajo entero es validar antes de conectar nada.

### Los tres arreglos

**1 · `selfCheck()` imprime el reporte, limpio o no.** Sección nueva `--- Slack addresses (asked Slack, read-only) ---` con una línea por persona: `resolves` / `MISSING` / `ERROR`, el correo, y el id de Slack cuando resuelve. Es la diferencia entre una comprobación que existe y una que se puede leer.

**2 · En `installDigestTrigger`, comprobar primero y decidir después.** El retorno temprano estaba antes de la comprobación, así que desde el 10 de agosto — el estado permanente de un sistema ya instalado, justo cuando más querrías poder re-verificar — la función veía el disparador, devolvía "Already installed. Nothing done." y nunca llegaba a mirar nada. Ahora las comprobaciones van arriba y la decisión de instalar abajo; re-correrla sobre un sistema instalado re-verifica la configuración y **dice qué encontró** en vez de un "Nothing done" mudo que se leía igual con la config sana que sin haberla mirado nunca.

**3 · El encabezado decía "NOTHING IS WIRED YET. No trigger is installed".** Falso desde el 10 de agosto, once días. Corregido a lo que es: está conectado, manda de verdad, disparador diario entre 08:00 y 09:00. Un comentario equivocado sobre si un sistema está encendido invita exactamente a la edición que nadie haría sabiendo que mañana a la mañana salen DMs reales.

**Refactor mínimo para que 1 y 2 no dupliquen llamadas:** `dAddressReport_()` construye el reporte una vez y `dSelfCheckSend_(report)` lo acepta; quien no se lo pase se lo construye solo. Una corrida de `selfCheck()` pregunta a Slack una vez por persona, no dos.

### Alcance, para que quede claro en el registro

**No había ningún riesgo activo.** Las cuatro direcciones se verificaron a mano contra Slack el 21 de agosto y las cuatro resuelven a la persona correcta: Gaby `support@strongstandard.com`, Miguel Salas `miguelsa45@gmail.com`, Joey `drjoey@fit4lifeacademy.health`, Bernardo `bernardo@strongstandard.com`. El envío del lunes no estaba en peligro. Lo que se arregló es que **el sistema pueda comprobarlo solo**, en vez de depender de que alguien lo haga a mano.

### Barrido del mismo patrón, que era parte del pedido

Buscadas otras comprobaciones detrás de un retorno temprano o sin invocar, en `Digest.gs` y `DriftCheck.gs`. **No hay otra igual.** `dSelfCheckRaffle_`, `dSelfCheckPostponement_` y `dSelfCheckIdentity_` cuelgan de `selfCheck()` y sí se alcanzan. `installDriftCheckTrigger` tiene el mismo retorno temprano pero **no esconde nada detrás**: solo instala. Las tres funciones que nada invoca localmente — `checkIdentityFor`, `clearDrift`, `installDriftCheckTrigger` — son puntos de entrada manuales por diseño, de la misma clase que `previewDigest` y `ackDrift`. Lo único anotado, sin arreglar: `DriftCheck.gs` no tiene un autochequeo propio; su equivalente es que avisa por Slack cuando no puede correr, que cubre el caso importante.

### Verificación

**La huella no se movió** y la comparación se corrió para confirmarlo, no se razonó: nada tocó cómo se derivan las tareas. Los seis bancos verdes.

Banco nuevo con 16 comprobaciones, incluida la que importa: con el disparador ya instalado, `installDigestTrigger` ahora **sí** consulta las cuatro direcciones (antes: cero), no instala un segundo disparador, y con una dirección rota se niega aunque ya esté instalado.

**Un fallo de mi propia prueba, que vale registrar** porque es la segunda vez hoy que el andamio miente: la primera versión reemplazaba `dResolveDm_` entera, y con eso borré su guarda `D_PEOPLE` — la prueba reportó una llamada de red extra por `SomeCoachName` y una excepción, dos cosas que el código desplegado no puede producir. Corregido interceptando `dSlack_`, la capa de red, para que corra el `dResolveDm_` real. Con eso queda además probado que un coach cuesta **cero** llamadas a Slack. **Regla que me llevo: sustituir la función bajo prueba invalida la prueba; hay que sustituir su frontera.**

**`selfCheck()` con la sección nueva no se corrió en el proyecto real** — no hay API executable y Chrome no está conectado desde esta sesión. Queda para correr en el editor.

---

## 2026-08-21 — El conteo de piezas NO estaba al revés: el "0 of 5" lo inventó un stub de prueba

**Sin cambio de código.** Se investigó como defecto de producto y no lo es. Lo que sí cambió: el ejemplo equivocado que quedó escrito en `DASHBOARD-SYSTEM.md`.

**El síntoma y de dónde salió de verdad.** La vista previa que se reprodujo localmente para el 25 de agosto imprimía *"How's the content for Jennifer Dickey coming along? 0 of 5 pieces still open."* con las cinco piezas sin empezar. El número estaba mal, pero **no venía del código**: en el stub de esa reproducción (`preview.js`, fuera del repo) el título y el detalle de cada tarea estaban **escritos a mano**, no generados. Ese "0 of 5" es texto que se tecleó en el andamio de prueba, no salida del motor de tareas.

**Ni (a) ni (b).** Los dos lados calculan el pendiente igual y bien:

    var pending = PIECES.filter(function (p) { return !t.pieces[p.key].done; });
    var pendingText = pending.length + ' of ' + PIECES.length + ' pieces still open';

`pending` son las piezas **no** hechas, así que con cero hechas da 5. Comprobado corriendo el código real desplegado contra los datos reales de Jennifer (0/5 hechas, las cinco `open`): el escalón de Miguel del 25 de agosto dice **"5 of 5 pieces still open."**, y el de Gaby a los 7 días, **"5 of 5 pieces still open. 8 days since production started."** Idéntico en `flows.js` y en `dFlowContent_`, así que el texto no está duplicado en dos versiones: hay una sola cadena, calculada una vez por lado, y las dos coinciden.

**Barridos los demás textos con conteo**, por si el error de sentido estaba en más de uno. Son tres de cara al equipo, los tres correctos: las piezas pendientes; *"N eligible entries"* del sorteo (`eligible.length`); y *"a thank-you for each of the N other entries"* (`losers.length`, ya cubierto por su propio banco: 6 participantes → 5 agradecimientos). El *"asked to move month N times"* del aplazamiento también sale bien. El resto de los `.length` del digest son diagnósticos de self-check, no copia.

**La huella no se movió** — nada tocó cómo se deriva el escalón ni la severidad, y la comparación se corrió igual para confirmarlo, no se razonó. Los cinco bancos siguen verdes.

**Lo que sí se corrigió:** `DASHBOARD-SYSTEM.md` §10.5b traía ese mismo "0 of 5" en su bloque de ejemplo. Es un documento vivo, así que se corrige en su lugar (D-101): el ejemplo ahora muestra el `title` solo, que es lo que el bloque de novedades realmente imprime, y se aclara aparte que los conteos viven en el `detail` y que `pending` son las **no** hechas. Un ejemplo en el documento vivo con un número que el código no puede emitir es exactamente el tipo de cosa que manda a alguien a buscar un bug inexistente — que es lo que pasó acá.

**La lección, que vale más que el no-defecto:** una reproducción local solo prueba algo si el contenido lo **genera el código**. Escribir la copia a mano dentro del stub convirtió la reproducción en una fabricación con aspecto de salida real. El stub quedó corregido para tomar el texto verbatim de lo que produce el flujo real, con un comentario diciendo por qué.

---

## 2026-08-21 — El resumen diario marca lo nuevo, y un fallo de envío deja de tumbar al resto

Dos cosas en el mismo pase, las dos sobre `Digest.gs`. Sin redespliegue: el digest corre por disparador de tiempo y toma el código actual del proyecto; `Code.gs` y `PROXY_VERSION` no se tocaron.

### 1 · "New since yesterday", para Gaby y Miguel

La lista personal de esas dos personas lleva ahora un bloque **arriba** del resumen que ya existía, y solo cuando hay algo: `🆕 New since yesterday (N)` con las tareas numeradas. Debajo sigue el mensaje igual que siempre, mismo enlace al tablero incluido. Un día sin novedades produce un mensaje **idéntico** al de hoy. Joey y Bernardo quedan fuera por ahora.

**La novedad se mide con la huella de tarea que ya existía**, no con un identificador nuevo: `dTaskKey_` produce la misma línea `owner|flow|rung|severity|clientKey` que compara el chequeo de deriva, y `dFingerprint_` pasó a ser exactamente esas líneas ordenadas — una sola definición en el archivo, no dos. Cada persona rastreada tiene una Script Property (`DIGEST_SEEN_<nombre>`) con las huellas ya anunciadas, que se **reemplaza** por el conjunto de hoy en cada corrida, sin acumular histórico.

Las decisiones que venían tomadas quedaron implementadas tal cual: una tarea que **escala** cambia de huella y se vuelve a marcar (es lo que hay que notar); la **primera corrida** siembra y no marca nada; y el texto de cada tarea sale **tal cual** del motor de tareas, sin una segunda versión de la copia.

Dos casos que hubo que decidir al escribirlo, y que quedan documentados en el código: si el envío **falla**, el registro NO se actualiza — nada se anunció, así que nada debe quedar como anunciado, y a la mañana siguiente esas tareas siguen siendo nuevas. Y `previewDigest()` **lee el registro pero nunca lo escribe**: previsualizar no puede consumir la novedad que la corrida real tiene que reportar.

### 2 · Un fallo de envío ya no tumba a los demás (defecto real, preventivo)

`dSlack_` lanza excepción cuando Slack responde no-ok, y `dResolveDm_` lo llama — así que una dirección que no resolviera **tiraba fuera del bucle de envío**. La guarda `if (!id)` nunca atrapaba eso: solo cubre el caso de una dirección **ausente del mapa**. Con el orden `Gaby, Miguel, Joey, Bernardo`, un fallo en Miguel dejaba sin mensaje a Joey, a Bernardo **y al resumen del equipo**, y solo se veía en el log de ejecución.

Ahora cada envío va aislado en su propio `try`: un fallo cuesta el mensaje de esa persona y de nadie más, y queda nombrado en el bloque **Problems this run** del resumen — que por eso también sale en un día por lo demás quieto, si algo falló.

Y el autochequeo ahora **le pregunta a Slack** si cada dirección resuelve de verdad. Antes solo comprobaba que el mapa tuviera una cadena no vacía, así que una dirección presente pero equivocada pasaba en silencio, y lo primero que alguien notaría sería la mañana en que esa persona tuviera su primera tarea. La consulta es de solo lectura y tolerante a fallos: un Slack inalcanzable se reporta como problema, nunca se lanza, así que `selfCheck()` y `previewDigest()` terminan igual.

**Nada de esto está roto hoy:** las cuatro direcciones configuradas se verificaron contra Slack en vivo y resuelven. El arreglo es preventivo — y la fecha en que importaba era cercana, porque las primeras tareas de Miguel a la hora del digest caen el 25 de agosto (los avisos de contenido de Jennifer y Heather, a 5 días de sus `Collection — complete` del 19).

### Verificación

Bancos nuevos, 33 comprobaciones en verde entre los dos: la lógica de novedad (primera corrida siembra sin marcar, nada nuevo el segundo día, una tarea nueva marcada sola, la escalada re-marcada, el día vacío y la reaparición, Joey y Bernardo sin bloque ni propiedad, un registro ilegible tratado como primera corrida y no como "todo nuevo"), y el aislamiento del envío simulando exactamente la forma del defecto — con Miguel lanzando, Gaby y Joey reciben lo suyo, Gaby y Bernardo el resumen, el fallo aparece nombrado en Problems this run y en el log, y el registro de Miguel queda sin escribir.

**La comparación de huellas del chequeo de deriva se corrió, no se razonó:** sigue coincidiendo. La huella no incluye el texto del mensaje, así que no se movió — que es lo que se esperaba, pero comprobado. Los cuatro bancos anteriores (identidad, D-120, mensajes del sorteo, paridad con ex-cliente) siguen verdes.

**La vista previa no se pudo correr en el proyecto real** (no está desplegado como API executable y Chrome no está conectado desde esta sesión). Se reprodujo localmente con la configuración real y el estado real de hoy — 0 tareas para las cuatro personas, así que hoy el digest no manda nada a nadie — y con el escenario del 25 de agosto para ver el bloque nuevo en su primera corrida y en la siguiente. Queda pendiente correr `previewDigest()` y `dSelfCheckSend_()` en el editor para confirmarlo contra el proyecto en vivo.

---

## 2026-08-21 — El código del chequeo de deriva llega al repo (el hueco de ayer, cerrado)

Cierra el hueco señalado al registrar D-135 (entrada de abajo, mismo día): esa entrada describía `DriftCheck.gs` y la costura de reloj de `Digest.gs` como hechos, pero **el código solo existía en el editor de Apps Script**. `apps-script/` tenía dos archivos y `Digest.gs` no tenía ni `dNow_()` ni `D_NOW_OVERRIDE`. Ahora el repo coincide con lo desplegado.

**Es la misma clase de hueco que D-133, al revés.** Ahí el archivo desplegado estaba viejo respecto del repo; acá el repo estaba viejo respecto de lo desplegado. Las dos veces la causa fue la misma: código pegado a mano en el editor sin bajar al repo, mientras `CLAUDE.md` dice que `apps-script/` es la fuente de verdad de lo que corre. Vale registrarlo como patrón, no como accidente: **el editor de Apps Script no es un lugar donde el código pueda quedarse.**

**Verificado por diff antes de commitear, que era la condición.** El `Digest.gs` adjunto difiere del que ya estaba en **exactamente** dos piezas y nada más: 16 líneas nuevas (el bloque de la costura, `var D_NOW_OVERRIDE = 0` y `function dNow_()`), y 10 llamadas `Date.now()` → `dNow_()`, todas dentro de funciones de reglas — `dCurrentMonth_`, el fold, `dRung_`, y las de outreach, video, pulls manuales, contenido y aprobación. 1984 + 16 = 2000 líneas. El resto del archivo, byte a byte igual.

Los `Date.now()` que **quedan** están todos en `dSelfCheckPostponement_`, y quedan a propósito: ese self-check construye datos sintéticos *relativos al ahora real* (un mes muy adelante sigue esperando, uno pasado ya volvió) y congelarlo lo rompería.

**Comprobado que la costura es transparente:** con `D_NOW_OVERRIDE` en 0, `dNow_()` devuelve `Date.now()` con delta 0 ms, así que `sendDailyDigest()` y `previewDigest()` se comportan igual que antes; con override puesto, congela. Los cuatro bancos de pruebas (identidad, paridad con ex-cliente, D-120, mensajes del sorteo) siguen en verde.

**Comprobadas también las dependencias de `DriftCheck.gs` contra el repo**, en vez de asumirlas: `dFingerprint_`, `dResolveDm_`, `dSlack_`, `DIGEST_TZ` y `D_NOW_OVERRIDE` existen los cinco en `Digest.gs`; los cinco parsers que usa (`_parseEventLog`, `_parseRoster`, `_parseMastersheet`, `_parseSettings`, `_parseSignal`) están expuestos por `sheets-reader.js`; y `index.html` carga 17 módulos `dashboard/*.js`, el número que el encabezado del archivo dice haber verificado sin DOM.

**Sin redespliegue.** El digest y el chequeo corren por disparador de tiempo, que toma el código actual del proyecto; el `PROXY_VERSION` de `Code.gs` no se tocó, y es lo único acá que depende de un deployment.

**`DASHBOARD-SYSTEM.md` documenta ahora el chequeo** (§10.5b nueva: cómo obtiene la huella del tablero sin navegador, por qué el sitio en vivo y no el repo, por qué no comparte la lectura de hojas, la costura de reloj, la cadencia con su latido de los lunes, y el reconocimiento con vencimiento). El bloque de File layout pasa de dos archivos a tres.

**Corregido de paso, porque el documento vivo tiene que decir la verdad:** el encabezado y §10.5 seguían afirmando que el digest estaba *escrito pero NO conectado*. Es falso desde D-104, que instaló su disparador el 10 de agosto — y la propia validación de D-135 lo confirma al describir el activador nuevo "junto al de `sendDailyDigest`". Un documento vivo que le miente al lector sobre si algo manda mensajes de verdad es peor que uno incompleto.

---

## 2026-08-21 — selfCheck() promovido a trabajo recurrente (DriftCheck.gs)

**Por qué.** Las dos desincronizaciones del 20 de agosto (identidad y aplazamiento) llevaban días vivas y solo se encontraron porque alguien estaba tocando otra cosa. `selfCheck()` ya probaba que el tablero y el digest coinciden, pero solo cuando una persona lo corría a mano. Este archivo elimina ese paso.

**Cómo obtiene la huella del tablero sin navegador — el problema central.** No reimplementa las reglas del tablero por tercera vez. Baja el código REAL y desplegado desde `f4la.github.io` (nunca el repo — comparar repo contra digest desplegado reabriría del otro lado el mismo hueco que este archivo existe para cerrar), lo evalúa dentro de su propia caja aislada (nunca el espacio global de Apps Script, ya compartido con `Code.gs` y contaminado una vez por un `clasp push` sin filtro, D-127 en el repo del motor), le da los mismos datos de las hojas a través de los MISMOS parsers que el tablero ya expone para pruebas offline (`SheetsReader._parseEventLog` etc.), y llama a `Alerts.fingerprint(state)` — la propia función del tablero. Es el código real, no una copia de las reglas.

**Deliberadamente NO comparte la lectura de hojas con `Digest.gs`:** cada lado lee el mundo a su manera, igual que en producción. Compartir la lectura habría vuelto invisible para este chequeo la desincronización de identidad del 20 de agosto, que era un bug de FUENTE, no de regla.

**Cadencia:** diaria, disparador propio, instalado media hora después del digest. Corre en ESTE proyecto de Apps Script (no GitHub Actions, no un host Node aparte) porque es el único lugar donde vive el código DESPLEGADO del digest — cualquier otro lugar compararía repo contra repo y no vería la clase de bug que fue D-133 (un archivo desplegado viejo, no un repo viejo).

**Silencio si coincide, con un latido semanal:** un disparador muerto y un sistema sano producen el mismo silencio, así que los lunes siempre mandan una línea sin importar el resultado.

**Un chequeo que no puede correr nunca es silencioso:** no poder bajar el HTML, no poder leer una hoja, o que el código del tablero tire una excepción son todos aviso, nunca silencio.

**Divergencia reconocida, no un botón de silencio.** `ackDrift(razon)` guarda las líneas de diferencia de HOY y una razón; se niega sin razón. Las corridas futuras restan exactamente esas líneas — cualquier divergencia NUEVA sigue sonando aunque haya una reconocida. El reconocimiento se limpia solo en cuanto esas líneas dejan de aparecer (y avisa que lo hizo), y vence a los 7 días de todos modos.

**Costura de reloj agregada a `Digest.gs` en el mismo pase:** las funciones de reglas ahora leen `dNow_()` en vez de `Date.now()` directo (10 lugares). `D_NOW_OVERRIDE` es 0 en operación normal, así que `sendDailyDigest()` y `previewDigest()` se comportan exactamente igual que antes. Sin esta costura, una tarea justo sobre un umbral podía leer severidad distinta en cada lado por los segundos de diferencia entre los dos cálculos — una falsa alarma que habría entrenado al equipo a ignorar el chequeo.

**Nada de esto toca el registro de eventos.** El registro es la memoria de los clientes, no el diario de salud del sistema. El estado del chequeo vive en Script Properties únicamente.

**Validado en producción, las 8 pruebas:** (1) coincide en silencio, streak sube; (2) diferencia real provocada a propósito → Slack con el diff línea por línea, formato `owner|flow|rung|severity|cliente`; (3) `ackDrift("razón")` la calla; (4) una corrida más con el reconocimiento activo → sigue en OK, sin Slack; (5) deshecho el cambio de prueba → el reconocimiento se limpia SOLO y manda su propio aviso de Slack confirmándolo; (6) streak sigue subiendo después de la limpieza; (7) `installDriftCheckTrigger()` instaló el disparador diario, confirmado en la pantalla de Activadores junto al de `sendDailyDigest`.

**Archivos:** `DriftCheck.gs` (nuevo, en el mismo proyecto de Apps Script que `Digest.gs` y `Code.gs`), `Digest.gs` (costura de reloj, aditiva, sin cambio de comportamiento fuera de la simulación).

---

## 2026-08-20 — El digest reconocía solo a los clientes activos

**El bug, encontrado corriendo la comparación de huellas, no reportado por nadie.** Después de resincronizar el archivo desplegado, `Alerts.fingerprint(TDApp.state)` devolvió vacío y el digest devolvió una tarea: `Resolve the identity for jpaige031108@gmail.com`. Es Jennifer Dickey, la tarjeta con chip "former". `dReadRoster_` leía solo la pestaña Roster, que es una vista filtrada a clientes ACTIVOS 1:1. El registro de eventos es permanente y el Roster no, así que todo cliente que termina su contrato desaparece de ahí mientras sus eventos siguen vivos. `identity.js` siempre leyó las dos fuentes y su propio encabezado dice por qué: resolver solo contra el Roster convierte a cada cliente pasado en un falso "no identificado" y entierra los reales.

**El daño que importaba no era la tarea de más.** Cuando no resuelve, el digest cae al correo para el nombre. Cualquier tarea futura de esa persona iba a nombrar una dirección. Jennifer entró a Producing el 19 y el aviso de contenido sale a los cinco días: alrededor del 24, Miguel recibía "How's the content for jpaige031108@gmail.com coming along?" sin saber de quién le hablaban.

**El arreglo es un espejo, no una interpretación.** `dBuildIdentity_` reproduce `identity.js`: Roster, después Mastersheet Data quedándose con el contrato más reciente, después nada. `dLooseDate_` reproduce `parseLooseDate` con los tres formatos que esa columna mezcla de verdad. El mapa coach→Slack se cosecha del Roster, que es el único lugar donde esas direcciones existen. Un correo ausente de las dos fuentes sigue sin resolver, con la razón en el texto: el fallback amplía dónde se busca, no relaja el "nunca adivina".

**Ampliar la identidad NO amplió el ruteo.** `dResolveDm_` no consulta el índice nuevo, así que un cliente o un coach siguen sin poder recibir un mensaje. Las dos garantías de D-094 quedan intactas y ahora está dicho en `DASHBOARD-SYSTEM.md`.

**Una diferencia propia del lado Apps Script, documentada en el código.** El frontend lee la hoja como cadenas ya parseadas por `sheets-reader.js`; `getValues()` devuelve objetos `Date` reales para cualquier celda que Sheets reconoció como fecha. El parseo acepta las dos formas. Sin eso el ordenamiento por contrato falla en silencio y elige el coach de un contrato viejo. Misma clase de diferencia que `dMonthSetting_` con los seriales.

**Validado en dos capas.** 22 comprobaciones en un sandbox fuera del proyecto al diseñar el arreglo, y 27 más al recibirlo, incluida la comparación caso por caso contra `identity.js`. Encontrado leyendo: `dSelfCheckPostponement_` construía a mano un roster falso con la forma vieja del objeto y habría seguido pasando contra una forma que el código en vivo ya no acepta; ahora se construye con el constructor real. `dSelfCheckIdentity_` queda enganchado a `selfCheck()` y comprueba EN VIVO que la pestaña exista: si le cambian el nombre lo dice, en vez de degradar callado a Roster solo. Agregado `checkIdentityFor(email)`, de solo lectura.

**La huella de tareas SÍ cambia**, y ese es el punto: la tarea de identidad falsa desaparece, el nombre reemplaza al correo, y las dos implementaciones vuelven a coincidir.

**La tabla de dos fuentes de verdad de `CLAUDE.md` no tenía fila para identidad** — la ausencia de esa fila es la razón por la que nadie tenía que acordarse de cambiar los dos lados. Agregada en este mismo commit.

---

## 2026-08-20 — Los mensajes de la rifa: uno por cada no-ganador, con su propio nombre

**El bug, verificado en el código en vivo antes de tocar nada.** `flowRaffleMessages` cuelga del testimonio del GANADOR y declaraba `templates: ["raffleWinnerMessage","raffleNonWinnerMessage"]`. En `evaluate()` las dos claves se renderizaban contra los mismos `vars` — los del testimonio — así que `[Name]` resolvía al ganador en las dos, y la cantidad quedaba fija en una sin importar cuánta gente hubiera perdido. En el sorteo real de agosto la cola le entregaba a Gaby un mensaje de no-ganador que abría **"Hey Heather!"**, siendo Heather la ganadora. Con seis participantes habría pegado cinco mensajes, todos dirigidos a la ganadora.

**Los destinatarios salen del snapshot congelado, nunca de la lista viva.** La copia de no-ganador dice "Your name was in the draw, but this time it went to someone else", y eso solo es cierto de quienes eran elegibles AL MOMENTO DEL SORTEO. La lista viva se sigue moviendo: alguien que califica dos días después recibiría un mensaje sobre un sorteo en el que nunca estuvo. El snapshot del evento del ganador es el registro (spec §4.4) y ya trae nombre, email y ciclo de cada elegible.

Nuevo `RaffleFold.parseSnapshotEligible(text)`, el **inverso exacto** de `snapshotText`: lee el segmento entre "eligible: " y " Winner's conditions at the draw:" y saca las entradas con una regex global sobre "Nombre <email>" más el sufijo opcional " (part N)"; ciclo 1 por defecto. Devuelve `[]` ante cualquier cosa que no pueda leer, nunca una adivinanza parcial. Las dos funciones llevan un comentario que dice que son un par y que se cambian juntas: el texto vive en un log append-only, así que el formato está congelado para las filas ya escritas.

**Cambio de modelo, aditivo.** Una copia puede traer sus PROPIOS vars, superpuestos a los de la tarea. La tarea nombra `recipients` y marca una plantilla como `perRecipient`; esa plantilla se renderiza una vez por persona, con `Name` / `Client First Name` / `Client` resueltos desde esa persona. Los pasos de una sola plantilla y el array `templates:` existente se comportan exactamente igual que antes. El nombre va EN EL BOTÓN — "Copy the message for Jennifer Dickey" — no solo dentro del texto: estos se pegan uno tras otro en hilos distintos de Everfit, y el nombre en el botón es lo único que hace seguro hacerlo en fila. El del ganador conserva "Copy the WINNER message" y va primero; los demás siguen, ordenados por nombre. El ganador se descarta por email Y ciclo, porque un testimonio de parte 2 es un sujeto de rifa aparte.

**Dos casos que la tarea declara en vez de esconder.** Si el ganador fue la única entrada: nada de copias de no-ganador, y el título dice "the only entry this month" en lugar de prometer agradecimientos. Si el snapshot falta o no se puede leer: la copia del ganador, ninguna más, y una línea de detalle diciendo que no se pudo leer y que esos agradecimientos hay que hacerlos a mano. **Deliberadamente NO hay fallback a la lista viva** en ese segundo caso — caer en la lista viva es exactamente la falla que leer el snapshot viene a evitar, y un hueco declarado es mejor que una lista corta que parece completa.

**Validado antes de cerrar, 33 comprobaciones en verde.** Contra los datos reales de agosto: exactamente dos copias, la del ganador para Heather y una para Jennifer Dickey que abre "Hey Jennifer!". Ida y vuelta `snapshotText` → `parseSnapshotEligible` con cuatro entradas, incluida una de parte 2 y un nombre con apóstrofo y guión, devolviendo la lista idéntica; el texto de las condiciones no se confunde con una entrada. Seis participantes → una copia de ganador y cinco de no-ganador, cada una con su propio nombre, ninguna dirigida a la ganadora. El caso de una sola entrada y el del snapshot ilegible, los dos explícitos. Cero placeholders sin llenar, ningún em dash, `checkTemplates` verde, `copySource` sigue en D-106.

**La huella de tareas no cambió** (`owner|flow|rung|severity|clientKey`), así que `Digest.gs` no necesita cambio — confirmado corriendo la comparación entre las dos implementaciones en los tres escenarios, no asumido.

---

## 2026-08-20 — El digest desplegado está atrasado respecto del repo

Al redesplegar el proxy para D-131 se comparó el código en vivo del proyecto de Apps Script contra el repo, y el archivo del resumen diario en vivo (llamado "DIgest.js", con I mayúscula — no "Digest.gs" como en el repo) tiene 283 líneas menos que la versión del repo: cero ocurrencias de `dPostponement_`, `dFlowPostponed_`, `dFirstBusinessDay_` ni `POSTPONED`. El commit que agregó el aplazamiento a otro mes nunca se pegó al proyecto real.

Consecuencia: si el disparador diario corre, el resumen de Slack puede seguir generándole a alguien la tarea de "manda el outreach" para un cliente que el tablero ya tiene aplazado — exactamente la clase de desincronización que el espejo del digest existe para evitar.

NO SE ARREGLÓ EN ESTE PASE, a propósito: cambia lo que el equipo recibe por Slack todos los días, y esa es decisión de Bernardo, no una corrección de código unilateral. Además el nombre de archivo distinto significa que un `clasp push` directo del repo crearía un SEGUNDO archivo junto al existente, duplicando funciones en el mismo scope global — el mismo tipo de contaminación que D-128 encontró y corrigió con `.claspignore`. Cualquier arreglo futuro necesita primero resolver el nombre del archivo, no solo empujar el contenido.

---

## 2026-08-20 — El botón de fan-out ahora manda el ciclo

El botón "Fire the kickoff fan-out" ya conoce el ciclo del testimonio en el momento del clic (`t.cycle`, ya usado para el evento de kickoff en la misma función) y ahora también lo manda al proxy. `requestFanout_` lo escribe en una columna F nueva ("Cycle") de la fila de señales, solo cuando es un número válido — la casilla manual de Gaby sigue sin esa columna y se comporta exactamente igual que antes (aditivo puro). PROXY_VERSION 7→8, redesplegado editando el deployment existente …qll5X-MnC3gZ. Cierra, del lado del dashboard, la mitad del pendiente de D-129/D-130 que le tocaba al fan-out (F4LA/testimonial-system, D-131). El motor lee esta columna nueva en una sesión aparte.

---

## 2026-08-19 — Los cuatro parches del motor salen de este repo

`apps-script/` queda con **exactamente dos archivos**, y los dos son de este repo: `Code.gs` (el proxy de escritura) y `Digest.gs` (el resumen diario), ambos del proyecto de Apps Script propio del dashboard. Ninguno de los dos se tocó.

**Borrados:**

    apps-script/engine-signal-poll.gs
    apps-script/engine-prefs-form-bridge.gs
    apps-script/engine-fix-logEvent.gs
    apps-script/engine-one-time-coach-form-trigger.gs

**Por qué.** El código del motor de recolección ya está versionado en `F4LA/testimonial-system`, carpeta `engine/`, que es su fuente única. Verificado hoy: tres de estos cuatro ya están dentro de `engine/Code.gs`, y uno además había quedado **ATRASADO** respecto del motor en vivo — pegarlo habría revertido código que funciona. Un parche que quedó atrás de lo que corre no es documentación, es una trampa. Los cuatro se conservan por su razonamiento en `engine/history/` del otro repo, cada uno con encabezado de "no pegar"; se confirmó antes de borrar que los cuatro están ahí y llevan ese encabezado.

Vivían acá por una razón que ya no existe: cuando se escribieron, el motor no estaba versionado en ninguna parte y este era el único repo a mano. Tenerlos en el repo del dashboard hacía que `apps-script/` pareciera contener dos sistemas distintos, y que una sesión de este repo pudiera creerse con permiso de editar el motor.

**Barrido de menciones**, no solo en un lugar:

- `DASHBOARD-SYSTEM.md` — el bloque "File layout" (los tres archivos listados como "NOT ours" desaparecen, y queda dicho que la carpeta tiene exactamente dos); las cuatro referencias sueltas de §11 (el trigger del formulario del coach, el arreglo de `logEvent_`, el puente del formulario de preferencias, el poll de Signal) ahora apuntan a `engine/Code.gs` o a `engine/history/`; y el encabezado de §11, que mandaba a leer una copia en `~/Downloads`, ahora apunta al otro repo y explica por qué esa sección **se queda**: el dashboard lee lo que el motor escribe, así que sus strings, sus fallas silenciosas y su lista de triggers le importan a quien lee el fold. Es la descripción de un vecino, no de código de este repo.
- `README.md` — mismo bloque de layout, más la aclaración explícita.
- `CLAUDE.md` — sección nueva arriba: el motor NO vive acá, vive en `F4LA/testimonial-system` carpeta `engine/`, y se toca desde la sesión de Claude Code de ESE repo, nunca desde esta.
- `context/phase-5-draw-brief.md` — es una nota de traspaso fechada, no un documento vivo, así que **no se reescribió el cuerpo**: lleva un aviso arriba diciendo que esa ruta se movió, para que nadie siga un camino muerto.

`DECISION-LOG.md` no se tocó fuera de esta entrada. Nueve entradas viejas nombran los archivos borrados y quedan intactas: son evidencia de lo que se sabía cuando se escribieron (D-101), y las rutas que citan eran ciertas ese día.

---

## 2026-08-18 — La vista del sorteo dice que el cliente está aplazado, y el botón de mover mes deja de mentirle

Sale de verificar en producción el aplazamiento de Allen Donald (entrada de abajo, mismo día). Con él ya aplazado se revisó cómo queda su fila **dentro** de la vista del sorteo, y aparecieron dos cosas que no estaban bien.

**Lo que sí estaba bien:** la lista de espera ya protegía la antigüedad con `isFinite`, así que un `hoursInStage` congelado en `NaN` no imprime "NaN days" — omite los días y no pasa nada raro.

**1 · La fila no decía que estaba aplazado.** Un cliente aplazado sale de la cohorte vieja y cae en la nueva, donde **sigue reteniendo el sorteo de ese mes** — y eso es correcto: no ha producido nada, y la regla de D-119 es que quien no califica y no está cerrado retiene. No se le tocó nada a la compuerta. Pero leído desde la vista de septiembre, Allen se veía como un cliente trabado en 0/3, indistinguible de uno que no contesta, e invitaba a perseguirlo. Ahora la fila de la cohorte y la de "esperando por" llevan *"postponed, outreach resumes Sep 1"*. `RaffleFold.build` expone `postponed` / `postponedMonth` / `resumeDate` — **solo display, ninguna regla de elegibilidad o de sorteo los lee**, así que el espejo del digest no necesita nada.

**2 · El diálogo de "Move to another month" mentía para un aplazado.** Prometía, sin condición, *"does not change anything about their testimonial or their pipeline stage"*. Desde D-120 eso es falso para un cliente aplazado: el mes de la cohorte y la fecha de regreso salen de la misma función, así que mover el mes mueve también el día en que vuelve la tarea de outreach de Gaby. **Ese acoplamiento es justamente el diseño** — es lo que impide que los dos se desincronicen — pero el diálogo tiene que decirlo en vez de dejar que alguien mueva a un cliente y se entere después. La línea ahora cambia según el caso.

---

## 2026-08-18 — El escalón de regreso escala como `start`, y `hoursInStage` congelado queda documentado

Cierra los dos puntos que quedaron señalados en la entrada del aplazamiento (más abajo, mismo día). Sin cambio de comportamiento: una verificación y documentación.

**1 · Escalonamiento.** Se revisó qué escalonamiento tiene el escalón normal de outreach antes de inventarle uno al de regreso. Resultado medido, no supuesto: **`start` tampoco escala.** Su `wait` es `0` mientras no se haya marcado que el coach no escribió (`outreachCoachNotMessagedHours` aplica solo a `retry`), así que el test `(wait > 0 && …)` de `rung()` nunca se cumple y la severidad se queda en `due` por siempre. Comprobado: un `start` con 60 días de antigüedad sigue leyendo `due`, mientras un `retry` con 59 días lee `overdue`.

Como el escalón de regreso es la misma tarea con otro ancla, se **deja como estaba** — `hours: 0` anclado en `resumeDate`, `waitedHours` sube y lo hace trepar en la cola, pero no se pinta como atrasado. No se creó ningún ajuste nuevo en Settings, que es justamente lo que este escalón evita por diseño: hacerlo escalar exigiría un umbral nuevo.

**2 · `hoursInStage` congelado.** Queda explícito en `DASHBOARD-SYSTEM.md` §4.8, en un bloque de advertencia con los tres casos (`NaN` mientras espera / contado desde `resumeDate` después / normal si no hay aplazamiento), más un puntero en el propio `state-builder.js`. Motivo: el campo se sobrescribe en el fold a propósito, y quien lo lea sin ese contexto va a ver `NaN` o una antigüedad que arranca el día 1 del mes y va a perseguir un bug que no existe. También dice por qué se sobrescribe el campo en vez de chequear `postponement.waiting` en los cuatro consumidores: cuatro lugares acordándose de chequear es la forma de bug que D-120 se pasó el diseño entero evitando.

---

## 2026-08-18 — "Sí, pero el mes que viene": el aplazamiento (D-120)

Implementa el diseño aprobado el 18 de agosto y registrado como D-120 en el repo de gobierno. El diseño estaba cerrado; esta sesión lo construye, no lo rediseña. Un solo commit: flujos, tablero, ficha, cola, espejo del digest y documentación.

**El caso que lo forzó.** Allen Donald contestó al outreach de agosto pidiendo participar en septiembre. La pregunta de la cola ofrecía dos botones y los dos mienten: *"Yes, they're in"* dispara toda la colección y lo persigue el mes entero; *"No reply"* le manda dos seguimientos a alguien que sí respondió. Se quedó sin tocar en la cola acumulando atraso falso, porque apretar cualquiera de los dos hacía daño real.

### Dos eventos nuevos, PROXY_VERSION 7

    Pipeline — postponed to month        payload = mes destino YYYY-MM
    Pipeline — postponement cancelled    payload = el mes al que vuelve

Ninguno de los dos es terminal. `declined` y `dropped` cierran un testimonio; estos lo pausan — el cliente dijo que sí. En los dos el mes destino va PRIMERO en el texto, porque `monthOf()` toma el primer `YYYY-MM` que encuentra.

**Falta el redespliegue a mano:** editar el deployment existente `…qll5X-MnC3gZ` → *New version* (D-092), nunca "New deployment". Mientras no corra, los dos botones fallan en producción — los strings están en el repo y no en el `ALLOWED_STAGES` que el Web App enforce de verdad.

### Una sola función de mes, leyendo tres strings

`monthOf` leía solo `Raffle — month moved` (D-100). Ahora lee además los dos eventos del aplazamiento, con la misma regla de que gana el último. El aplazamiento **no** escribe además un `Raffle — month moved`: sería una segunda anotación que dice lo mismo y que puede separarse — una de las dos podría quedar superada sola. Después de este cambio el mes de un testimonio lo decide una función, en un lugar.

**Consecuencia verificada, no programada:** la compuerta del sorteo (D-119) recorre el grupo del mes, así que un cliente aplazado sale de agosto por construcción. No se le agregó ninguna condición nueva a la compuerta, y no debe agregársele: dentro del grupo de un mes la marca de "movido" significa movido HACIA ese mes, y esa gente sigue teniendo que resolverse.

### Una compuerta, arriba de las escaleras

    var flows = (t.postponement && t.postponement.pending) ? [flowPostponed] : FLOWS;

Se pregunta UNA vez, en `Flows.evaluate`, no como condición dentro de cada flujo. El modo de fallar de las condiciones por flujo es el próximo flujo que alguien escriba, que las ignora en silencio. `alerts.js reviewTasks` repite la compuerta porque sus items no pasan por `evaluate` y un flag viejo sigue siendo una tarea en la cola de Gaby.

### `pending` se apaga con el outreach nuevo, NUNCA con la fecha

Si se apagara por fecha, el 1 de septiembre se re-armaría la escalera vieja y Allen recibiría al instante un seguimiento con treinta días de atraso, anclado en un outreach del mes que pidió saltarse. La fecha hace una sola cosa: deja aparecer la tarea de Gaby.

### El escalón de regreso

Dueña Gaby, condición `pending && hoy >= resumeDate`, texto *"Send the outreach to [Cliente], they asked to move to this month"* (más *", they have asked to move month N times"* si hubo más de uno), y el botón de copiar reutiliza `outreachInitial` — la copia aprobada en D-109, sin escribir texto nuevo. Cierra con **"Outreach sent"**, que escribe el evento normal de outreach: apaga `pending` y la escalera arranca de cero desde hoy.

**Ningún plazo nuevo en Settings.** Los demás escalones esperan un umbral medido desde un evento; este espera una fecha que ya está en el dato. `hours: 0` con `resumeDate` como ancla. `resumeDate` = primer día lunes-a-viernes del mes, medianoche en la zona de la hoja. Los feriados no se modelan a propósito: un feriado le cuesta un día a la tarea, y una tabla de feriados es otra cosa que mantener que se desactualiza en silencio. Es regla de calendario, no umbral — no hay ajuste que pueda cambiar qué significa "el primer día hábil".

### Tablero

El cliente no cambia de columna y no hay columna nueva. Mientras espera: tarjeta atenuada al fondo de su columna con chip *"waiting for Sep 2026"* construido del dato, el contador de antigüedad **detenido** (`paused · resumes Sep 1`), el encabezado separando (`Outreach 1 · 1 waiting for Sep 2026`), y fuera del buffer y de los bloqueantes de publicación — misma razón que D-117: quien no está en juego este mes no puede contaminar el número que dice qué frena la publicación. Desde `resumeDate` vuelve a los conteos normales y su antigüedad cuenta desde ese día, no desde el evento de agosto.

### Cancelar

Enlace en la ficha, visible solo mientras `pending`. Una escritura que apaga el aplazamiento y devuelve la entrada del sorteo al mes original. Existe porque este botón silencia a un cliente un mes entero y apaga todas las tareas que avisarían: sin deshacer, un clic equivocado lo saca del trabajo sin que nada levante la mano. No hay tope de aplazamientos; el diálogo muestra el historial como información, no como bloqueo.

### Verificación

Banco de pruebas en Node cargando los módulos reales (no reimplementaciones) con datos sintéticos y reloj simulado, más los puros de `Digest.gs` con stubs — **33 comprobaciones, todas en verde**. Cubre los seis puntos de la prueba de aceptación previa a producción: cero tareas al aplazar desde Outreach; exactamente la tarea de Gaby en la fecha, con la copia D-109, sin placeholders sin llenar y sin em dashes; "Outreach enviado" arranca la escalera nueva y a las 25h da `reply-check` (25h de antigüedad, no 30 días); segundo aplazamiento con el texto de dos veces; cancelación devolviendo cliente y mes; y aplazar desde Collecting apagando también video, formulario del coach y Everfit. Un control confirma que la misma forma SIN aplazamiento sí genera tareas, para que el cero no pase por vacío.

Huella de tareas idéntica entre tablero y digest en los siete escenarios (sin aplazar, esperando, día de regreso, +5d, outreach re-enviado, aplazado dos veces, cancelado). `dSelfCheckPostponement_()` agrega los invariantes estructurales del lado del digest, y `selfCheck()` los asegura además contra el log vivo.

**Pendiente, y es de producción:** con el proxy en 6 el caso real de Allen Donald no se puede cerrar todavía. Después del redespliegue a 7, aplazarlo a septiembre debería sacarlo de la lista de espera del sorteo de agosto (hoy: Allen Donald, Christine Demetriou y Jennifer Dickey; después: Christine y Jennifer), dejarlo atenuado en Outreach con chip de septiembre y sin ninguna tarea suya en la cola ni en el resumen.

---

## 2026-08-18 — RESUELTO: el proxy ya está en versión 6 (la nota de ayer quedó vieja)

La entrada de ayer, "PENDIENTE ABIERTO: el proxy sigue en versión 5" (más abajo), ya no es cierta y no se edita — se registra la resolución acá, aparte, como manda la regla de append-only de este archivo.

**Verificado en vivo ahora mismo:** `GET` al deployment `…qll5X-MnC3gZ` responde `{"ok":true,"version":6}`. `Code.gs` se repegó y se redesplegó el 18 de agosto sobre el deployment existente (D-092), y `syncSettings()` corrió para sembrar `videoSnoozeDays`. El botón "Remind me in N days" del video ya funciona en producción — primer uso real fue el aplazamiento de Jennifer Dickey ese mismo día.

Esto se registró primero en el repo de gobernanza (`testimonial-system`, D-118) y no aquí — por eso la nota de ayer en **este** archivo seguía leyéndose como pendiente para cualquiera que solo abriera este repo. Al operar entre los dos repos, verificar el estado real (ping al proxy, banner del dashboard) pesa más que confiar en cuál de los dos logs se actualizó primero.

---

## 2026-08-17 — PENDIENTE ABIERTO: el proxy sigue en versión 5, el repo espera 6

Nota de traspaso, no una decisión — para que una sesión nueva no tenga que reconstruir esto de una conversación de chat.

El commit "La escalera se corre un lugar…" (más abajo, mismo día) subió `PROXY_VERSION` a **6** en `apps-script/Code.gs` y `EXPECTED_PROXY_VERSION` a **6** en `dashboard/config.js`, por el string nuevo `Collection — video check snoozed`. **El deployment en vivo (`…qll5X-MnC3gZ`) sigue sirviendo la versión 5.**

Mientras eso no se resuelva:

- El dashboard muestra el banner rojo de versión desalineada.
- El botón **"Remind me in N days"** del video (Flujo 3, aplazamiento) **falla en producción** — el string no está en el `ALLOWED_STAGES` que corre de verdad, solo en el repo.
- Todo lo demás de ese commit (escalera, Flujo 5, sorteo) no depende del proxy y ya funciona en vivo.

**Para cerrar esto:**

1. Abrir el proyecto de Apps Script del dashboard, pegar el `apps-script/Code.gs` actual del repo.
2. Desplegar: lápiz → **New version** sobre el deployment existente `…qll5X-MnC3gZ` — nunca "New deployment" (regla D-092).
3. Correr `syncSettings()` una vez, para sembrar `videoSnoozeDays` (default 2) en la pestaña Settings.
4. Confirmar en vivo: `ping` al proxy debe reportar `version: 6`, y escribir `Collection — video check snoozed` debe aceptarse.

También sigue abierto, señalado en la entrada de ayer y no resuelto todavía: si `outreachInitial` debería llevar `D-109` o `D-110` (§ "Los dos mensajes de la rifa quedan cargados").

---

## 2026-08-17 — La fila de puntos de entradas queda solo para Collecting

Cierra el punto que quedó señalado en la entrada de hoy sobre la escalera de etapas.

`pipeline-board.js` dibujaba los seis puntos de entradas para `collecting` **y** `invited`. Bajo la escalera vieja eso era correcto: Invited significaba que el kickoff ya se había disparado, así que las entradas podían estar llegando y los puntos eran justamente el dato.

Con la escalera nueva Invited significa que el cliente dijo que sí y todavía no se le mandó nada — sin kickoff no hay carpeta ni fan-out, así que es **0/6 garantizado**. Una fila de puntos vacíos que solo puede leer 0/6 no informa nada, y es exactamente el tipo de ruido que el cambio de escalera venía a quitar.

Verificado: en Invited no se dibuja ni la fila ni el contador; en Collecting siguen ambos. Contra los datos reales, el número de filas de puntos coincide con el número de clientes en Collecting (Jennifer 3/6 y Heather 4/6; Allen y Christine, en Outreach, sin fila). La barra de progreso de piezas de Producing/Review quedó intacta, la huella de tareas no se movió y `alerts.problems` sigue vacío.

---

## 2026-08-17 — La escalera se corre un lugar, y tres reglas que la producción real destapó

Cuatro cambios decididos con Bernardo, en un solo commit, espejo del digest incluido (D-103/D-104). Los cuatro salieron de mirar el tablero con clientes de verdad, no de rediseñar en abstracto.

### 1 · Invited pasa a ser "dijo que sí"; Collecting arranca en el kickoff

Jennifer Dickey aparecía en la columna **Invited** con el formulario del coach, las notas de Meet y los Looms ya dentro — 3 de 6 entradas. La etiqueta mentía: estaba recolectando.

    invited    = "Outreach — client accepted"
    collecting = "Invite — kickoff sent" || los cinco strings del fan-out
    producing  = "Collection — complete"   (sin cambios)

**El video del cliente deja de ser una puerta de etapa.** Vuelve a ser una de las seis entradas y nada más. La compuerta Collecting → Producing (D-087) no se tocó.

La escalera se recorre hacia adelante y gana el último rung con evento, no el más reciente por fecha. Verificado en vivo: Jennifer tiene kickoff el 12 y aceptación el 13, y cae en Collecting igual porque Collecting va después. Un cliente con kickoff y sin aceptación registrada también cae en Collecting, no se rompe.

La pelota de `invited` pasó de "Client" a **"Gaby"**: el cliente ya respondió, lo que falta es que nosotros disparemos el kickoff.

El fold ahora expone **`collectingEntry`** (el evento que metió al testimonio en Collecting), para que nadie tenga que re-derivar esa condición.

### 2 · La tarea de Everfit y fotos no sale antes del kickoff

`flowManualPulls` no tenía **ninguna** condición previa: se generaba para cualquier testimonio que existiera. Salió para cuatro clientes recién nominados, uno que ni había aceptado. Daño extra: su `blocking: true` contaminaba el indicador de buffer con esa gente.

Ahora la tarea solo existe si hay `collectingEntry` — leído del fold, no recalculado. Y el ancla de antigüedad pasó a ser la entrada a Collecting, así el "lleva X días esperando" cuenta desde que la tarea realmente pudo existir, no desde un evento de video o de carpeta que no dice nada sobre si Gaby hizo sus descargas.

### 3 · Revisar el video: dos estados, y un botón para aplazar

El botón *"Checked, not there"* solo re-anclaba el reloj, así que la tarjeta **desaparecía** por un intervalo completo — y el paso de mandar el seguimiento vivía en esa misma tarjeta. Bernardo lo apretó y perdió de vista el seguimiento.

    ESTADO A  "Check if [Client] uploaded their video."
              sin mensaje · [Mark received] [Checked, not there] [Remind me in N days]
    ESTADO B  "Nothing in folder 03 for [Client]. Send the follow-up."
              con mensaje · [Mark received] [Follow-up sent] [Remind me in N days]

Apretar *"Checked, not there"* escribe el evento y **la tarea no se va**: pasa a B. Solo *"Follow-up sent"* (o *"Mark received"*) la cierra. B es el estado cuando la revisión más reciente es posterior al seguimiento más reciente, o hay revisión y ningún seguimiento.

**Una revisión ya no posterga nada.** Lo único que posterga es el aplazamiento explícito, y al vencer devuelve la tarea **al estado en que estaba**, no al principio.

Arrastra: string nuevo `Collection — video check snoozed`, `PROXY_VERSION` 5 → **6**, y `videoSnoozeDays` (2) en los defaults de Settings de los tres lados. Ningún tiempo quedó en código.

### 4 · El sorteo no se habilita a mitad del mes

`drawState` pasaba a "due" en cuanto había **una** persona elegible. Se habilitó el 17 de agosto con una sola elegible mientras tres clientes seguían en proceso. El daño real no es el ruido: confirmar un ganador **congela una foto permanente** de quiénes eran elegibles, así que un sorteo temprano deja registrado para siempre un sorteo de una participante y excluye a gente que no hizo nada mal.

Un miembro del grupo está **resuelto** si califica o si está cerrado (declined/dropped). Cualquier otro retiene el sorteo. El fin de mes es el seguro de fondo: pase lo que pase, el último día se habilita.

**"Movido a otro mes" no se testea como criterio de resolución, a propósito.** Mover a alguien lo saca del grupo por completo, así que resuelve por construcción. Testear la bandera `moved` habría sido un bug: dentro de esa lista significa movido **hacia** este mes, y esa gente todavía necesita resolverse.

`build()` devuelve **`holdingUp`**, y la vista del sorteo los nombra con su etapa, sus días y el botón de mover al lado. La espera tiene que ser accionable, no un muro. **Ninguna tarea se genera mientras espera** — la razón vive en la vista, no en la cola de nadie.

### Verificación

Los 23 escenarios de deriva dan huella **idéntica** entre `alerts.js` y `Digest.gs`, y las etapas también coinciden testimonio por testimonio. Los siete escenarios pedidos pasan, incluidos los dos de reloj simulado. En vivo: Jennifer dice **Collecting** y sigue marcando **3 de 6** entradas; agosto está en `waiting` con `holdingUp` nombrando a Allen, Christine y Jennifer; visto desde el 1 de septiembre pasa a `overdue`.

`checkTemplates()` en verde, doce plantillas con su procedencia intacta, ninguna comilla ni puntuación tocada. `RaffleFold.selfCheck()`, `dSelfCheckRaffle_()` y `dSelfCheckSend_()` todos vacíos.

### Pendiente de decidir (no tocado)

`pipeline-board.js` dibuja los seis puntos de entradas para `collecting` **y** `invited`. Con la escalera nueva, un cliente en Invited todavía no puede tener ninguna entrada, así que esa tarjeta muestra "0/6 inputs" — cierto, pero ruido. Se dejó como estaba porque no se pidió cambiarlo; conviene decidir si esa fila debería quedar solo para Collecting.

---

## 2026-08-11 — Los dos mensajes de la rifa quedan cargados (D-106)

El texto aprobado del **mensaje al ganador** y del **mensaje a los no-ganadores** (Everfit, Bernardo → cliente) ya está en el dashboard. Los dos textos se aprobaron en el repo de gobernanza como **D-106**; la gobernanza de la carga se sigue allá, esta entrada solo registra el cableado.

Con esto **ya no queda ninguna plantilla `NONE`**: el estado vacío *"No approved message exists for this step yet."* pasa a ser inalcanzable. Se deja en el código para el próximo paso que lo necesite.

### Hizo falta un cambio de patrón: dos mensajes en una sola tarea

La tarea post-sorteo de Gaby es *"send the winner message and the thank-you to everyone who did not win"* — **dos** mensajes. El modelo solo admitía **uno** por tarea (`template:` en singular), así que cablear solo el del ganador habría dejado el del no-ganador inalcanzable, y la tarea a medio hacer.

Ahora una tarea puede declarar `templates: [...]`. `evaluate()` renderiza cada uno en `task.copies`, y la cola dibuja **un botón por mensaje**. Los pasos de una sola plantilla siguen exactamente igual (`template:`, botón **"Copy message"**), así que no hubo que tocar ninguno.

Las etiquetas son deliberadamente explícitas — **"Copy the WINNER message"** y **"Copy the NON-WINNER message"** — porque el único error que este paso puede cometer es mandarle el texto del ganador a quien no ganó, y dos botones que dijeran "Copy message" lo invitarían. El handler de copiar también se corrigió: antes copiaba *"el mensaje de la tarea"*, ahora copia **el mensaje al que pertenece el botón**.

### Verificación

No hay ningún elegible real todavía (el Event Log arrancó con 8 filas reales, cohorte 4, sin nadie que cumpla las tres condiciones), así que se validó con datos sintéticos sobre **dos clientes reales del roster**: sorteo con 2 elegibles, ganador confirmado, y la tarea de Gaby entregando `copies.length === 2`, ambas con `copySource: "D-106"`, cero placeholders sin llenar y el nombre del cliente resuelto en las dos.

`[Name]` es de una sola palabra, así que el regex ancho de D-109 ya lo cubría — verificado explícitamente, y también que un placeholder desconocido se sigue devolviendo tal cual.

Integridad de los textos: ganador 516 caracteres en 6 párrafos, no-ganador 512 en 5; apóstrofos tipográficos (U+2019) en ambos, elipsis (U+2026) y los dos emoji en el del ganador; sin em dashes, sin espacios dobles ni saltos triples en las uniones de cadena. `checkTemplates()` en verde y las doce plantillas sin regresión.

La tarea de Miguel (`raffleMonthAdd`) sigue con su propia copy `v2`, una sola, con la etiqueta genérica — no se contaminó.

Sin deriva: el fingerprint de tareas no se movió (las plantillas no entran en él), idéntico en los 18 escenarios, y la suite de rifa limpia en los 9. `Digest.gs` no necesita cambio porque no reparte copy.

### Una discrepancia que dejo señalada, no resuelta

Se pidió seguir *"el mismo patrón usado para el mensaje inicial de outreach (D-110)"*, pero ese mensaje se cargó ayer etiquetado como **D-109**, que es el número que se indicó entonces. Uno de los dos números está mal. **No cambié la etiqueta de `outreachInitial`** — cambiar una referencia de procedencia por cuenta propia es justo lo que este campo existe para evitar. Queda pendiente confirmar cuál es el correcto.

---

## 2026-08-11 — El primer mensaje de outreach queda cargado en la cola (D-109)

El texto aprobado del **primer mensaje de invitación** (Bernardo → cliente, después del warm-up del coach y antes de que el cliente diga sí o no) ya está en el dashboard. El texto en sí se aprobó en el repo de gobernanza como **D-109**; esta entrada solo registra el cableado.

### Dónde aparece

En el flujo de outreach, rungs **`start`** y **`retry`** — la misma acción en ambos casos (el retry es el mismo mensaje una vez que el coach por fin lo calentó), así que los dos entregan la misma copy. El botón es **"Copy message"**, igual que las demás plantillas ya cableadas.

Los rungs posteriores **no la heredan**: `reply-check` sigue sin copy, y `fu1`/`fu2` conservan su texto del SOP §2.5.

### Corrección al planteo

Se pidió reemplazar el estado vacío *"No approved message exists for this step yet."* en este paso. Ese estado **no se estaba mostrando ahí**: el rung no tenía plantilla asignada en absoluto, y esa caja solo aparece con plantillas marcadas `NONE` — hoy únicamente los dos mensajes de la rifa. El resultado es el mismo (ahora hay botón donde antes no había nada), pero conviene que el log diga qué pasaba realmente.

### Los placeholders son multi-palabra, y eso obligó a tocar el renderer

La copy aprobada usa **`[Client First Name]`** y **`[Coach Name]`**. El renderer hacía `match` con `\[(\w+)\]`, que **no** acepta espacios — los dos habrían salido sin reemplazar. Ahora usa `\[([\w ]+)\]`.

Ensanchar el patrón es seguro porque un placeholder desconocido se sigue devolviendo tal cual, que es el comportamiento que ya existía a propósito (*"un hueco se ve, en vez de quedar en blanco"*). Verificado sin regresión en las nueve plantillas anteriores.

Ambos valores son **alias** de los que la tarjeta ya usa (`Name` y `Coach`), no una segunda fuente: el mensaje y la tarjeta no pueden discrepar sobre quién es el cliente o el coach.

### El texto se guarda carácter por carácter

`outreachInitial` lleva apóstrofos tipográficos (U+2019) y una elipsis (U+2026) porque así se aprobó; las plantillas viejas del SOP llevan comillas rectas porque así se aprobaron ellas. **Ninguna de las dos debe "normalizarse"** — cambiar en silencio un mensaje aprobado que va al cliente es justamente la deriva que el campo de procedencia existe para evitar. Queda anotado en el propio archivo y en `DASHBOARD-SYSTEM.md`.

Se añadió `D-###` como cuarto valor de procedencia, junto a `SOP`, `v2` y `NONE`.

### Verificado

Contra un cliente real del roster: una sola tarea de outreach, `copySource: "D-109"`, cero placeholders sin llenar, nombre y coach insertados, texto de 920 caracteres en 7 párrafos, sin espacios dobles ni saltos triples en las uniones de cadena. `checkTemplates()` sigue en verde (ningún em dash). El fingerprint de tareas no se movió: las plantillas no entran en él, y las dos implementaciones siguen idénticas en los 18 escenarios — `Digest.gs` no necesita cambio, porque no reparte copy.

---

## 2026-08-10 — El digest: DMs y nada más, con resumen de equipo para Gaby y Bernardo

Cambios de comportamiento pedidos antes de pegar el archivo, más las direcciones reales.

### Qué sale ahora

1. **Un DM por persona** (Gaby, Miguel, Joey, Bernardo) con **sus** tareas — como ya estaba.
2. **Un SEGUNDO DM, separado**, a Gaby y Bernardo (`DIGEST.SUMMARY_TO`) con el resumen del día: todas las tareas de todos, agrupadas por persona, con los totales por urgencia. Dos mensajes y no uno más largo, a propósito: el primero tiene que seguir siendo accionable, y meter los ocho items de Gaby dentro de los treinta de todos lo arruinaría.
3. **Nada más.** No se postea a ningún canal grupal.

### El canal se eliminó, no se apagó

El canal de testimonial collection queda reservado para el mensaje mensual de nominación, y el canal privado que esto apuntaba ya no existe. `CONTENT_CHANNEL_ID` queda vacío y **nadie lo lee**: se borró el código del canal en vez de dejarlo detrás de un flag, así que no queda un camino dormido que pueda empezar a postear por accidente. `installDigestTrigger()` ya no lo exige — ahora exige lo que de verdad importa, que haya cómo alcanzar a Gaby.

### La guarda del coach, intacta y ahora afirmada en el instalador

`PEOPLE_SLACK` es el **único** sitio de donde sale una dirección. `dResolveDm_` no tiene fallback al roster y rechaza cualquier nombre fuera de `D_PEOPLE`. Nuevo `dSelfCheckSend_()` afirma las dos cosas más que `PEOPLE_SLACK` y `SUMMARY_TO` solo contengan usuarios del dashboard, y **`installDigestTrigger()` se niega a instalar** si algo de eso falla.

### Verificado con Slack instrumentado

Con tres clientes reales en estados distintos (Gaby 3 tareas, Miguel 1, Joey 1): **5 mensajes** — 3 listas personales + 2 resúmenes. Cero destinos que empiecen por `C`/`G` (canales). Cero direcciones fuera de las cuatro. Con el log vacío: **cero llamadas a Slack**, ni siquiera el resumen. `installDigestTrigger` idempotente y sin exigir canal.

Las dos suites de deriva siguen limpias: fingerprint idéntico en los 18 escenarios, rifa sin deriva en los 9.

---

## 2026-08-10 — El digest habla el mismo idioma que la cola: modelo v2 portado y la guarda del coach

Dos bloqueadores que aparecieron al preparar el lanzamiento del digest. `Digest.gs` nunca se pegó a ningún proyecto de Apps Script, así que nada de esto llegó a enviarse — pero el primer envío real habría sido incorrecto en las dos formas.

### 1 · Le mandaba un DM a un coach

Las reglas v1 asignaban *"fill the coach form"* al **coach**, y `dResolveDm_` resolvía su dirección desde la columna J del roster. El primer digest real le habría escrito en frío a un coach una tarea que el sistema está diseñado para nunca darle (D-094). El dashboard nunca pudo hacer esto: `alerts.js` afirma que todo owner es usuario del dashboard.

Cerrado por **dos mecanismos independientes**, para que sea estructural y no una convención:

- `dTasks_` **redirige a Gaby** cualquier owner que no sea persona del dashboard y lo registra en `problems`, que ahora se imprimen en el preview y en cada ejecución real.
- `dResolveDm_` **se niega a resolver** a nadie fuera de `D_PEOPLE`. Se eliminó el fallback al roster.

`sendDailyDigest` además solo itera `D_PEOPLE`, así que no queda ningún bucle que pueda alcanzar a un coach.

### 2 · Seguía corriendo el modelo de tareas v1

Con los mismos datos, el dashboard mostraba 20 tareas y el digest 26, y decían cosas distintas: una tarea por **pieza** de producción en vez de una por cliente (lo que D-090 (b) corrigió), sin nivel *overdue*, sin escalaciones, y con umbrales v1 que ya no existen en Settings.

Portadas las ocho escaleras v2 rung por rung (`dFlow*_`), más los items sin escalera de `alerts.js`. El nivel `reminder` también se estaba **calculando y descartando** antes de enviar, porque `dRender_` solo pintaba overdue/due/review.

### La verificación: el fingerprint de tareas

Un solo string comparable, `owner|flow|rung|severity|clientKey` por tarea, ordenado. `Alerts.fingerprint(TDApp.state)` en la consola produce el mismo string que imprime `selfCheck()`. **Verificado idéntico en 18 escenarios** que recorren cada rung de cada flujo.

La comparación encontró un fallo real: el dashboard usaba `rung: "flag"` para todos los flags, así que un cliente con dos flags producía **dos líneas idénticas** — el fingerprint no podía distinguir "ambos lados coinciden" de "ambos lados están mal igual". Ahora el rung lleva qué input está marcado.

### Lo que sigue abierto

- El digest **no está pegado a ningún proyecto** todavía, y no hay trigger. Nada envía.
- Faltan `SLACK_BOT_TOKEN`, las direcciones de Slack y el channel ID.
- `previewDigest()` **no prueba nada de Slack**: nunca llama a `UrlFetchApp`. Un preview limpio no dice que el token sirva ni que el bot esté en el canal.
- El Event Log está vacío tras el wipe, así que el preview de hoy sale en `tasks: 0`.

---

## 2026-08-10 — Phase 5: the raffle DRAW, validated live; then two fixes it exposed

**The write half of the raffle** (`fad352d`), and the follow-up commit for the two defects the live test found. The system log closes the whole raffle section in one row (D-103); this entry is the repo-side record.

### What shipped

Three parts, frontend and `Digest.gs` **in the same commit** as D-088 requires:

1. **Move to another month** (D-100) — per-row button in `#/raffle`, confirmation-dialogued, writing `Raffle — month moved` with the target as `YYYY-MM`. Latest-wins, so a second move supersedes the first.
2. **The draw** — eligible = qualifies on all three ∧ in this month's cohort ∧ the **person** has never won. Cohort-only closes the scope question D-100 left open. Derived from the same `compliance()` the read-only view always used, so there is one qualification rule and `selfCheck()` proves a non-qualifier can never reach the eligible list. The system draws; a human confirms. The winner event freezes month + winner + the full eligible list + the winner's conditions in the client's own words (spec §4.4).
3. **Post-draw, parallel** (D-080) — Miguel's Master Sheet month and Gaby's messages as two independent flows, never chained, actioned in the queue.

Plus a month-level draw-due state (`waiting/due/overdue/done`) with **no Settings threshold** — "eligible entries exist and no winner" is a fact, and a month that ended undrawn is late by the calendar; a Bernardo review task if two winners are ever recorded; and the client card showing a past win **above** the live conditions, so the two cannot read as contradicting each other (the `089dd9e` failure class). `PROXY_VERSION` 5 adds `Raffle — month moved` to `ALLOWED_STAGES`, redeployed by editing deployment `…qll5X-MnC3gZ` (D-092).

### The pre-flight paid for itself

The live `ALLOWED_STAGES` check ran **before** any code was written (D-092's lesson). A negative control confirmed the vocabulary gate can actually fail — an invented stage, an engine-owned stage and an unattributed write were all rejected — and `Raffle — month moved` was confirmed missing from the deployment, exactly as predicted. Worth recording that **the proxy has no dry-run**: reaching the stage check with a *valid* string appends a row, so a string can only be confirmed present by writing one. That is why the three pre-existing raffle strings were deliberately **not** probed, and why the one acceptance check that was run used the real move payload on test data rather than a throwaway.

### Validated live, end to end, pre-wipe

Rows 91 and 106 (both moves, supersede confirmed), 107 (winner **Karen Nosek**, drawn from 2 eligible), 108 and 109 (both post-draw tasks — Miguel's marked first, Gaby's confirmed still standing, then marked). The snapshot was checked by **rebuilding the pre-draw state from rows 1–106 alone** and recomputing the eligible set independently: it matches what the event froze, so the record is a true account of the moment and not merely well-formed. `Digest.gs` agreed on the winner, the draw state and both task states.

### The D-088 comparison found a real bug

Running both implementations over identical event rows across nine scenarios: with two winners recorded, **the two sides named different people** — the frontend by display-sort order, the digest by sheet order. Both now take the **earliest-confirmed** win. Exactly the class of divergence the guard exists to catch, and it would never have surfaced from reading either file.

### Two defects the live test exposed — fixed in the follow-up commit

**1 · `activeMonth` was silently defeated by a Sheets date coercion.** Typing `2026-09` — what the setting's own note instructs — makes Sheets store the **serial `46266`**. Every reader tested it against `YYYY-MM`, failed, and fell back silently. Two consequences, one of them outward-facing: the raffle showed the wrong cohort behind an "invalid value" banner, and **`flows.js roundDeadline` put the wrong month into the deadline a COACH is told**. Normalised now in the one place a raw cell becomes a value (`sheets-reader.js monthSetting`, mirrored as `dMonthSetting_`), accepting a real `YYYY-MM`, a date serial, an ISO date or a `Date`. **Anything unrecognised is returned unchanged on purpose** — nonsense like `Septembre` must still fail the readers' test and still raise the banner rather than be swallowed as "no pin set".

**2 · `movedFrom` reported the entry month instead of the previous override.** On a round trip (Aug → Sep → Aug) that made the card read *"moved from Aug 2026"* while sitting in Aug 2026. `monthOf` now walks **every** move: the newest decides the month, the one before it is what "moved from" reports, and a move with no readable month is skipped rather than guessed at. Both views also drop the clause entirely when it would name the month already on screen.

Both fixes are asserted in **both** `selfCheck()`s, so neither can regress quietly.

### Still open

- **No undo on a confirmed winner** (D-093) — the log is append-only and no `Raffle — correction` string exists.
- **The bridge writes no cycle** (D-100) — a cycle-2 preferences submission attaches to cycle 1. Harmless at launch, wrong on the first re-nomination.
- **Gaby's two client-facing templates have no approved copy.** Declared `NONE`-source, so the queue says *"no approved message exists for this step yet"* rather than inventing words in her voice. Paste the SOP wording into `TEMPLATES.raffleWinnerMessage` / `raffleNonWinnerMessage` and the buttons light up with no other change.
- **Re-drawing is possible by design** — the pick happens on click and is shown in the dialog, so cancelling and clicking again gives a different name. Inherent to propose-then-confirm; stated in the dialog, and only a confirmed draw is ever logged.

All eight test clients and every row above join the 2026-08-10 wipe.

---

## 2026-08-09 — D-099 validated live; the log's append-only rule made absolute

**The fix is confirmed on the branch that was actually broken.** The preferences form was resubmitted with `"Not yet"` on the review question, and **Event Log row 89** wrote `No ("Not yet")` — a clean No with the client's raw wording preserved, not an unclear flag. **Zero `Unclear answer` rows remain anywhere in the log.**

Two behaviours neither D-098 nor D-099 had ever exercised live were confirmed in passing:

- **Non-idempotency works as designed** — the resubmission appended three fresh rows (88–90). Nothing overwritten, nothing deduped.
- **Latest-wins got its first real test** — row 86 says `Yes`, row 89 says `No`, same `(email, cycle, Stage)`. The newest answer counts; the older stays in the timeline as history.

It also validated the raffle view for free, on the one path only tested synthetically: **Cameron moved from 2/3 to 1/3 with no code change.** His review condition renders `✕ Google review (self-reported)` and the sentence rewrote itself to *"Waiting on the questionnaire video and the Google review."* — the latest-wins read, the raw-answer parse, and the live-not-snapshotted rule all working together on real data.

### The process correction

New information about D-099 was first written **into the D-099 row itself**. That breaks the log's own first rule — *append-only, never edit a past row* — and the rule exists precisely so the log records what was known when, not a tidied-up version written with hindsight. A row edited after the fact can no longer be trusted as evidence of what anyone knew at the time.

Reverted: **D-099's Decision and Context columns are now byte-identical to when they were first written** (verified against the commit that added them), and the live confirmation lives in the **Status** column — the one edit the rule permits on a past row:

```
Active — validated live Aug 9 (Event Log row 89, "Not yet" → clean No)
```

Audited the neighbours while there: **D-098 and D-100 are byte-identical to as-written.** This entry carries the detail, since a change log has no Status column.

**The rule is absolute from here:** a past row's text is never rewritten. New information about an old decision goes in Status, or in a new row.

---

## 2026-08-09 — Phase 5: raffle compliance (read-only half)

The automatic "who qualifies" computation and its two surfaces — the client card's Recognitions block and a monthly `#/raffle` view. **Writes nothing**: no proxy call, no `PROXY_VERSION` bump, no `ALLOWED_STAGES` check (that moves to the first write chunk). The draw, the snapshot, and the parallel post-draw tasks are next.

Full behaviour in `DASHBOARD-SYSTEM.md` §10.9. The decisions worth recording here:

**Condition 2 got no new event.** It reads `CFG.INPUTS.video.stages`, the fold's own definition of "the video is in", so the raffle can never disagree with the pipeline board about the same fact.

**Four invariants are enforced by a `selfCheck()` that throws at load**, not by convention — each one, if broken, lets somebody into the draw who should not be there: podcast consent is never a condition (D-097); the review condition never reads a confirmation (D-066); it never reads the dashboard-writable `Review — self-reported` (D-098); and it never reads `Collection — client video link`, which is the fan-out sharing folder 03 and would qualify every invited client. **Each guard was verified by sabotage** — a copy of the module edited to break each rule, confirming all four throw, and the clean file still loads.

**Unclear is a third state, not a no.** The fold prefers the bridge's normalized prefix and falls back to the client's raw words, which resolves the pre-D-099 `Unclear answer: "Not yet"` rows with no backfill. A genuinely unreadable answer blocks entry and is surfaced for a human — never silently rejected.

**Monthly scoping (D-100):** `activeMonth` from Settings, blank = current month; a testimonial belongs to the month of its **earliest event**, not the month it qualified — qualification is unstable under latest-wins and would let clients hop cohorts after a draw. The manual "moved to month X" override is **already respected by the reader** although nothing writes it yet, so the view is correct the moment the button ships.

**`Digest.gs` unchanged and needs no change** — read-only, no task, no alert, so no second source of truth is created. Flagged: the moment the digest says anything raffle-shaped, D-088 requires the logic in both places in the same commit.

**Verified** against the live log by unit-testing the fold on eight cases: Cameron Colbo 2/3 (photo ✓, review ✓, no video); Benjamin Jayne the inverse 1/3; a synthetic all-three-met using the *blur my face* variant → qualifies; a legacy unclear row recovering to a clean No; a genuinely unreadable answer staying unclear; an explicit photo No; the month override; and the fan-out trap correctly **not** satisfying condition 2.

**Files:** `dashboard/raffle.js` · `dashboard/raffle-view.js` · `dashboard/client-card.js` · `dashboard/renderer.js` · `dashboard/config.js` · `index.html` · `styles.css`

---

## 2026-08-09 — Bridge classifier fix: "Not yet" was not a No (D-099)

Found while verifying the raffle compliance view, by pulling the **live form's actual option strings** instead of the wording everyone had been repeating.

The Google-review question's negative option is **`"Not yet"`**, not `"No"`. The bridge's negative branch was `/^n(o)?\b/`, which does **not** match it — there is no word boundary between the `o` and the `t`. So the most common negative answer in the whole form was written to the event log as:

```
Unclear answer: "Not yet" — review manually
```

Manual-review noise pointed at Gaby, for a perfectly clear answer, on every client who had not yet left a review.

It failed **safe** for the raffle — unclear is not a Yes, so nobody could wrongly qualify — but the log was wrong, and the log is the memory.

**Fixed** to `/^n(o|ot)?\b/` and re-tested against all **seven** closed options the live form actually offers:

| Answer | Before | After |
|---|---|---|
| `Yes, you can use my before/after photos` | Yes | Yes |
| `Yes, you can use them, but please blur my face` | Yes | Yes |
| `No, I'd rather not share them (…won't be entered…)` | No | No |
| `Yes, done` | Yes | Yes |
| **`Not yet`** | **UNCLEAR** | **No** |
| `Yes, I'd be open to it` | Yes | Yes |
| `No, I'd rather not` | No | No |

Every closed option classifies; genuine free text (`"maybe later"`) still flags for review, which is the branch's real job.

**The lesson worth keeping.** D-098's live validation answered **"Yes" to every question**, so the negative branch was never executed. A passing happy-path test is not coverage of the branch that matters — and the option strings should have been read off the live form from the start, which is exactly what found this.

No schema change, no trigger change (a re-paste of the same file), proxy and `PROXY_VERSION` untouched.

**Files:** `apps-script/engine-prefs-form-bridge.gs`

---

## 2026-08-09 — Kickoff checklist completed; Flow 3 can now start

Adding SOP §3's Everfit confirmation message surfaced a gap: **nothing anywhere wrote `Invite — instructions email sent`**, so Flow 3's clock could never start and the video ladder was unreachable. The walkthrough had described a "Mark email sent" button that did not exist.

`kickoffBlock` is now an ordered two-step checklist:

1. **Fire the fan-out** — confirmed, since it reaches outside the team.
2. **Send the instructions email, confirm on Everfit, mark it** — with the SOP copy on a Copy button, then a button writing `Invite — instructions email sent`.

They are two different acts, and only the second means the client has been told what to do. Anchoring the 48h video check there rather than on the fan-out avoids chasing someone who has not been asked.

**Verified:** all eight live clients show *step 2 of 2* (they were fanned out but never marked); marking it flips the card to *kickoff complete, video clock running*; and with `?sim=+60h` Flow 3 then produces *"Check if Cameron Colbo uploaded their video."* — which produced nothing before. All templates render, none empty, none containing an em dash.

**Files / commits:** `dashboard/client-card.js` · `dashboard/flows.js`

---

## 2026-08-09 — Phase 5 groundwork: the preferences-form bridge

**The gap.** Spec §4.4 and §4.5 read as if the system "already knows" each client's photo permission, questionnaire, and review self-report. It does not. Verified against the engine source: its **nine** Stage strings contain no preferences handler, no `PREFS_FORM` property, and no trigger. Those answers have lived only in the responses sheet. Left alone, the raffle would show every client as *not qualified* forever — the same failure class as D-085, where the coach form routed correctly and silently wrote no event.

**Built** (`apps-script/engine-prefs-form-bridge.gs`, additive, engine-side, paste-and-install): `onPrefsFormSubmit` reads the responses **by header** — the columns already shifted once when the podcast question was added, so indexes are unsafe — resolves the master-key email through the Active Client Roster, and writes one event per signal. No existing function is modified; the proxy and `PROXY_VERSION` are untouched, since this writes through `logEvent_` directly rather than through the write proxy.

**Vocabulary — a dedicated `Preferences — ` group**, not a reuse of `Review — self-reported`:

| Event | Feeds |
|---|---|
| `Preferences — photo permission` | raffle condition 1 · client card |
| `Preferences — review self-reported` | raffle condition 3 · reviews view |
| `Preferences — podcast consent` | podcast chain **only** — not a raffle condition (D-097) |
| `Preferences — unresolved` | identity failure, empty email, system bucket |

The group is a structural guarantee, not a naming preference. `Review — self-reported` already exists in the dashboard's ALLOWED_STAGES, so writing the form's answer under that string would let a **person** hand-enter a "self-report" and open the raffle. D-066 says the two review signals are never merged; keeping the client's own answers in an engine-owned group makes the merge impossible rather than merely discouraged.

**Raffle condition 2 (questionnaire/testimonial) gets no new event** — it is the existing client-video event, which the view chunk reads.

**Idempotency: none, deliberately.** A resubmission appends three more events. The log is append-only and the fold is latest-wins per (email, cycle, Stage), so the newest answer counts and the older ones remain as history.

**D-085 dependency asserted, not assumed.** This trigger is bound to the responses sheet, so `getActiveSpreadsheet()` returns the wrong file — exactly the condition that silently voided the coach form. `checkPrefsFormWiring()` inspects the deployed `logEvent_` for the `SIGNAL_SHEET_ID` fallback and says STOP if it is absent.

**⚠️ Raised for Bernardo:** the responses sheet has an `Email Address` column at index 7, alongside the form's own email question. That is consistent with *"Responder input"* (no login, fine) **and** with *"Verified"* (login required, which would break D-063 for external clients). The sheet cannot distinguish them — the form setting needs a look.

**Confirmed and validated live, same day.** All four strings approved; the trigger is installed (five now). A real submission for Cameron Colbo wrote rows 85-87 — photo permission, review self-reported, podcast consent, all *Yes*. The email resolved to the **typed** `cameron.colbo@gmail.com`, not the logged-in Google account, which settles the `Email Address` question from the data side: identity comes from the master-key question, so a signed-in submitter cannot displace it. The form setting is still worth a look for the *access* half — whether an external client can reach the form at all — but the resolution path is confirmed correct. Cameron Colbo is pre-launch test data and joins the Aug 10 wipe, which now has a fifth location: the preferences responses sheet.

**Carry-forward:** `Preferences — unresolved` is written but nobody is told. It must become a **Gaby task** in the alert engine (spec §5) when the alerts side of Phase 5 is built.

**Files:** `apps-script/engine-prefs-form-bridge.gs`

---

## 2026-08-09 — Video follow-up copy found in the SOP · coachFormUrl set

**Correction.** I reported that no client-facing video-upload follow-ups existed in the SOP. That was wrong. They are in **SOP §3, "Follow-Up System for Uploads"** — I had searched only revision 5, where that section was dropped. The copy lives in revisions 1 through 4.

Its cadence is **48h / 48h / 48h**, matching v2's Flow 3 exactly. Both messages are now wired verbatim, with the SOP's **third** client message dropped — v2 replaces it with the tell-the-coach step, the same treatment as outreach FU#3.

**One wording edit:** both used an em dash (`busy—just`), which v2 forbids. Replaced with a comma, preserving the voice. `checkTemplates()` asserts this and now passes with **zero** empty templates.

**`coachFormUrl` set** to the published responder link. It is placed in `SETTINGS_DEFAULTS` and seeded in `SETTINGS_SEED`, so it works immediately: `parseSettings` skips empty cells and falls back to the default, and the Settings tab can still override it. The coach-form template renders a real link with no placeholder remaining.

**Method note worth keeping:** a document can have several revisions on disk with materially different content, and the newest is not necessarily the most complete. Searching one file and reporting absence was the error; search every revision.

**Files / commits:** `dashboard/flows.js` · `dashboard/config.js` · `apps-script/Code.gs`

---

## 2026-08-09 — A real simulated clock (`?sim=`)

Testing the ladders meant waiting real hours, and the only tool for it was a scratchpad harness that was deleted after the v2 build. Offering to build it rather than building it was the wrong call — the request was to watch a threshold cross, and `?sim=` was tried twice against a feature that did not exist. No query-param handling existed anywhere in the codebase.

**One clock seam.** Every rule that asks how long something has waited now reads `TDClock.now()` — 7 reads in `flows.js`, 1 in `state-builder.js`. Shifting one function is exact; shifting event timestamps, as the old harness did, only approximates it.

**Parser tolerates what a person actually types.** A literal `+` in a query string decodes to a space, so `?sim=+60h`, `?sim= 60h` and `?sim=%2B60h` all work, as do `2d`, `90m`, `-24h` and a bare `60`. An unparseable value shows a banner naming the accepted forms instead of silently doing nothing — which is exactly how the missing feature presented.

**Writes are refused while shifted**, with a banner saying so. A time-shifted view plus a live action button lets someone send a follow-up that is not actually due.

**Clarified, because the behaviour changed at v2:** time controls whether a rung appears and how urgent it looks, but **ladder wording advances on button presses, not on the clock**. The Phase-3 engine rewrote titles on a threshold; v2 is press-driven, matching the spec's flow tables. Exactly one task rewrites on time alone — Flow 5's Everfit/photos escalation.

**Verified end to end:** `?sim=+30h` surfaces Cameron's reply check and his coach-form chase; `+60h` pushes six chases to overdue; `+120h` rewrites eight reminders to *"has been waiting 5 days on your Everfit data and photos"*; `?sim=5d` is identical to `+120h`; a write while shifted is refused.

**Files / commits:** `dashboard/clock.js` · `dashboard/{flows,state-builder,event-writer}.js` · `app.js` · `index.html` · `styles.css`

---

## 2026-08-08 — Fan-out bridge failed silently: three fixes

**Symptom.** Firing the kickoff for Cameron Colbo dimmed the button for a few seconds, then restored it. No Signal row, no message, no error. `previewPendingSignals()` showed `pending: 0` — the engine and its triggers were fine and had nothing to process.

**Root cause: the deployed proxy was running the old code.** POSTing to the live Web App:

```
{"action":"requestFanout"} → {"ok":false,"message":"Unknown action: requestFanout"}
{"action":"appendEvent"}   → {"ok":false,"message":"Unknown or missing actor: \"\"."}
```

`requestFanout_` was added to `apps-script/Code.gs` in the repo, but that file is the *source of truth for* the deployed script, not the running code. The build walkthrough covered pasting `engine-signal-poll.gs` into the engine and never mentioned redeploying the dashboard's own proxy. Same class of failure as the coach form trigger: code updated, deployment not.

**Why nothing was shown.** `mode:"no-cors"` made the reply opaque, so the real error was unreadable. The fallback path polled the Signal tab four times over ~4.5s and wrote *"no Signal row appeared"* into `#cardResult` — which sits at the very bottom of the client card, several screens below the button. The message existed and was unreachable.

*(Method note: the first probe returned a Google 404 page and looked like `doPost` was missing. That was wrong — `curl -L` downgrades POST to GET on a 302, and the Apps Script redirect key is single-use. Following the redirect correctly showed `doPost` healthy.)*

### Three fixes

1. **Read the response.** Apps Script returns `access-control-allow-origin: *` on the redirect target — verified live — so `no-cors` was never necessary. The server's own error is now surfaced first, in under a second, instead of inferred from an absent row. `Content-Type` stays `text/plain` to remain a CORS simple request; Apps Script does not answer OPTIONS, so a preflight would fail. A network/CORS failure falls back to an opaque send so a write is never lost.
2. **Feedback where the action is.** Fixed toast (errors persist, successes fade) + a result beside the clicked button + the view's result strip.
3. **`PROXY_VERSION` handshake.** `Code.gs` reports its version, `config.js` states what it expects, the dashboard pings on load and shows a red banner naming the exact redeploy steps on mismatch. This class of bug fails silently by nature, so it is now detected automatically.

**Verified against the live, still-stale deployment:** the handshake reports `deployed: 0, expected: 2` with the redeploy instructions; `requestFanout` rejects with the actual `"Unknown action: requestFanout"`; `appendEvent` still works.

**The engine needed no changes.** The poll and all four triggers stay exactly as installed. Cameron remained safe in Outreach with no half-done state.

**Files / commits:** `dashboard/{event-writer,dialog,client-card,queue-view,pipeline-board,config}.js` · `app.js` · `index.html` · `styles.css` · `apps-script/Code.gs`

---

## 2026-08-08 — Fan-out bridge, manual entry into Nominated, and the move taxonomy

Item 1 of the v2 redesign. The task-engine rebuild (item 2) has not started; Phase 4 stays untouched.

### The dashboard fires the fan-out — but not the way it was proposed

The plan was for the dashboard to tick the Signal checkbox. **That cannot work:** Apps Script `onEdit` triggers fire only for edits made by a human in the UI, never for edits made by a script or by the Sheets API. The checkbox would turn green and nothing would run — a silent no-op, which is exactly the failure mode that already cost a day with `logEvent_`.

**Option C, chosen.** The proxy writes what a human tick writes (roster name in A, boolean `true` in B, `Processed` empty) into the **first empty pre-made row 13–30**, and a new one-minute poll on the engine picks it up. Never appended: an appended row holds a text `"TRUE"` that the engine's `confirmed !== true` check rejects, and Gaby could not use it as the manual fallback.

Rejected **Option B** (a `doPost` endpoint on the engine) despite its synchronous result: it would add a public endpoint to a live script two days before launch. Option C is purely additive — `onSignalEdit` and `fanOut_` are untouched — and its rollback is free: delete one trigger and the checkbox path is exactly as it was.

**Order of operations:** queue the fan-out first, write `Invite — kickoff sent` second. The reverse would let the card claim Invited with nothing behind it. This way a failed kickoff write is self-healing — the engine's fan-out rows arrive and the Invited inference recovers the stage.

**Three double-fire layers:** the fire step only renders when neither a fan-out event nor a kickoff event exists for that (email, cycle); the proxy refuses if a row is already pending or was processed this month; the engine's pre-existing `Processed` guard claims before working, under the same lock the checkbox takes.

### Move taxonomy: block ≠ confirm ≠ flow

**Confirmations only on outward-facing or irreversible moves — three in the whole pipeline.** A dialog that appears on every action stops being read, and then it protects nothing.

- 🔴 **Invited** — creates the folder, shares folder 03 anyone-with-link-Editor, DMs a real coach
- 🔴 **Declined / Dropped** — leaves the board, note required, no reopen event exists
- 🔴 **Published** — see the reversibility note below
- 🔒 **Collecting → Producing** stays a **hard block**, not a confirmation: a disabled control naming what is missing
- everything else flows

**Firing is a button, never a drag or a card-move side effect.** v2 said moving the card triggers the automation; it reaches outside the team, so it gets an explicit confirmed step. Gaby still never touches the sheet, which is the actual goal.

**⚠️ Registered: there is no reverse event anywhere in the vocabulary.** The ladder is forward-only by design, so a mis-marked step cannot be unmarked, only annotated. That is why Published confirms despite not being outward-facing. A `Pipeline — correction` event would be the shape if corrections are ever wanted; it is a fold change and is not in v2.

**Drag-and-drop is approved but deliberately sequenced after launch.** It replaces the button as the way to *initiate* a move and lands on the same confirmation and block layer, unchanged. Functional base for the 10th; drag as the enhancement.

### Manual entry into Nominated did not exist

Testimonials are derived purely from event-log groups, so a client with no events had no card — and the "Log nomination" button lived *on* the card. Every client on the board had arrived via an engine fan-out. **+ Add client to Nominated** picks from the roster (a dropdown, never free text — identity is never guessed) and writes `Nomination — logged`.

**Cycle rule:** cycle 1 normally, `max(cycle) + 1` for a re-nomination, **refused while a prior cycle is still active** — one client cannot have two live testimonials. Clients with a live testimonial are filtered out of the dropdown.

This was also a prerequisite for testing the bridge: without it there is no fresh client to walk Nominated → Outreach → Invited, and the seven existing clients have all already been fanned out.

### Carried from v2

**Sofi is out of `PEOPLE`** — v2's dashboard users are Gaby, Miguel, Joey, Bernardo. Applied in `config.js`, `Code.gs` and `Digest.gs`. **The reel moves in-house to Miguel**, reverting that part of D-071/D-072.

### Verified before pushing

Roster dropdown offers 126 clients and excludes everyone with a live testimonial · the fire step renders only when no fan-out has run · Declined opens a confirmation, refuses an empty note, and writes nothing on cancel · an ordinary move (Note) opens no dialog and writes directly · the Collecting gate stays a disabled button reading "Waiting on: Everfit data, photos" · `nextCycleFor` refuses an active client and returns cycle 1 for a new one.

**Files / commits:** `dashboard/{dialog,pipeline-board,client-card,event-writer,state-builder,config,renderer}.js` · `apps-script/{Code,Digest,engine-signal-poll}.gs` · `index.html` · `styles.css`

---

## 2026-08-07 — Phase 3: action queue + alerts

**Built:** `dashboard/alerts.js` (the rules), `dashboard/queue-view.js` (the per-person queue), `apps-script/Digest.gs` (the daily Slack digest — written, **not wired**).

### The queue is now the default view

Spec §5 opens with *"the dashboard is the home — the action queue is always there when someone opens it."* An action engine should open on the work, so `#/queue` is the landing route and Pipeline moved one click away. It defaults to the signed-in person's own list — a queue showing everyone's work is a report, not a worklist.

### Two invariants, both from spec §5

**Every task has exactly one owner** — an alert with no owner is spam. Routing follows the spec exactly, including the one that is easy to get wrong: **the coach form task goes to the coach**, not Gaby. Verified live: Amy Lang's coach-form task is owned by Brent.

**Every threshold comes from the Settings tab**, never from code. `SETTINGS_DEFAULTS` only backfills missing keys.

### The folder-03 task is the video detection mechanism

Nothing watches Drive folder 03, so the standing task for every client in Invited **is** Option A — the human half of Invited → Collecting. It stays one task per client and escalates its wording from "check the folder" to "no video after Nh — nudge the client" once `inviteUploadFollowupHours` passes, rather than spawning a second competing row. Its inline action writes `Collection — video uploaded`. Verified: 5 clients in Invited → exactly 5 tasks, all owned by Gaby.

### Manual-review flags surface but never block

Carried forward from the gate decision. A Meet or Loom flag appears as a `review` task so it is not silently lost, and its own text says *"does not block the pipeline — often just means this client has none."* Only Everfit and photos carry the `blocks Producing` badge. Verified on Benjamin: two blocking tasks (both manual pulls), his two flags not among them.

Closed testimonials raise nothing.

### The Slack digest is deliberately not wired

`Digest.gs` is complete and deployable but installs no trigger and sends nothing. `previewDigest()` returns exactly what would be posted, and sends nothing. Posting to Slack reaches real people, so it needs an explicit decision, plus three values that do not exist yet: Slack addresses for the five people, the testimonial-management channel ID, and confirmation to reuse the engine's bot token.

**⚠️ Registered risk: `Digest.gs` duplicates the fold.** A time trigger has no browser, so it cannot reuse `state-builder.js`; it re-implements last-write-wins, the ordering rule, the five-fan-out Invited inference, the four-state inputs, the Collecting gate, and the alert rules. That is a real second source of truth and the largest maintenance hazard in the repo. `selfCheck()` prints its stage counts and task total so drift is detectable rather than silent. Documented in `DASHBOARD-SYSTEM.md` §10.5.

**Verified against live state:** 16 tasks — 0 overdue, 10 due, 6 review; owners Gaby (15) and Brent (1); 0 tasks without an owner.

**Files / commits:** `dashboard/alerts.js` · `dashboard/queue-view.js` · `dashboard/renderer.js` · `apps-script/Digest.gs` · `app.js` · `index.html` · `styles.css` · `CLAUDE.md` · `DASHBOARD-SYSTEM.md`

---

## 2026-08-07 — Collecting → Producing gate · duplicate-write bug fixed

### The gate: automatic-input flags never block

Proposed initially as "all inputs present and unflagged." **Bernardo corrected the scope, and the correction is right.** Meet and Loom flags frequently mean *this client has none* — no Loom was ever recorded, no Gemini note carries their email. Nobody can resolve that, so gating on them would freeze a testimonial in Collecting forever. Benjamin Jayne is the live case: both flagged, neither resolvable.

**What gates Producing:** the client video is present **and** Gaby has marked her manual pulls (Everfit data, photos). Nothing else.

The principle underneath, worth keeping: **a manual input can always be satisfied by the person; an automatic one cannot.** Gating only on manual inputs plus the video can never produce a state no human can exit.

`Collection — complete` stays its **own explicit event** rather than being derived from the two manual dots. The dots are arrival facts; the button is Gaby's judgment that her part is done. Deriving it would make marking photos silently advance the pipeline stage.

The gate lives at the point of action (`ClientCard.collectionLock`), not in the fold. In the fold it would mean an event that exists but does not take effect, and the stage could **regress** if an input later re-flagged, breaking the monotonic ladder. A `partial` video counts as present; a `flagged` one does not. Disabled state names what is outstanding.

Verified against all seven live testimonials: Benjamin's blockers are `["Everfit data","photos"]` — Meet and Loom absent from the list.

### Duplicate-write bug (introduced in Phase 2, found by the video test)

Benjamin's video test appended **three identical rows** (73, 74, 75) from one session. `ClientCard.wire()` attached a delegated click listener to `#app` on **every** render. `#app` is never replaced — only its innerHTML is — so listeners accumulated, and because a successful write triggers a re-render, each subsequent click fired once per prior render.

The log is append-only, so those duplicate rows are permanent; they join the pre-launch cleanup list. State is unaffected (last-write-wins), but the same bug on a `Production — …` link or a `Pipeline — declined` would have been materially worse.

Fixed by attaching the handler exactly once and carrying the current testimonial in a module-level `ctx`. Regression test: five renders followed by one click now produces **one** `appendEvent` call, previously five.

**Files / commits:** `dashboard/client-card.js` · `DASHBOARD-SYSTEM.md` §4.6 · `DECISION-LOG.md`

---

## 2026-08-07 — Engine bug: `logEvent_` silently dropped every write from a form-bound trigger

**Symptom.** The coach form routed correctly to folder 04 but wrote no `Collection — coach form` row. The Executions panel showed the `onCoachFormSubmit` run (TEST 3, 3:37:22 PM) as **Completed with no error**. The live Event Log held 69 rows and zero coach-form rows.

**Root cause, confirmed in the engine source (line 505):**

```js
var tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(prop_('EVENTS_TAB'));
if (!tab) return;
```

`getActiveSpreadsheet()` returns the spreadsheet the *running trigger* is attached to, not the script's container. `onSignalEdit` is attached to Signal & Event Log, so the fan-out has always logged fine — which is why 69 rows exist and the bug stayed invisible. `onCoachFormSubmit` is attached to the coach form **responses** file, which has no `Event Log` tab, so `tab` was null and the function returned. Silent, no error, status Completed. Folder-04 routing still worked because that path uses DriveApp, never the sheet.

**Fix:** resolve the log by id instead of by ambient context, via one new Script Property `SIGNAL_SHEET_ID`. Recorded in `apps-script/engine-fix-logEvent.gs`. `prop_()` is called without the optional flag and `openById()` throws on a bad id, so a missing or wrong property now fails **loudly** in the Executions panel rather than skipping the write — silent failure was the entire defect. Nothing else in the engine is touched.

**Second exposure the same fix covers:** in a time-driven trigger `getActiveSpreadsheet()` can be null, which would make the original line throw. That is `sendMonthlyNominationMessage`'s two `Nomination` events; they become reliable too.

**⚠️ Character trap, again.** The id pasted for the new property was `…eGlKmo` (lowercase L) and **404s**. The correct id is `…eGIKmo` (capital I) — verified against the Sheets API, 200 vs 404. Identical to the failure that produced a dead Roster id in the data reference. Any Google id handled in this project should be diffed and probed, never eyeballed.

**Files / commits:** `apps-script/engine-fix-logEvent.gs` · `DECISION-LOG.md`

---

## 2026-08-07 — Phase 2: pipeline board + client card, on the corrected fold

**What was built:** `dashboard/pipeline-board.js` and `dashboard/client-card.js`; `renderer.js` became the shell (nav, actor picker, hash routing) and kept the Phase 1 diagnostics as the Foundation view. Six corrections were applied to the fold first.

### The six fixes

1. **Collecting entry accepts either source.** `Collection — video uploaded` (manual) **OR** `Collection — client video` (engine), in a `received` or `partial` state. `partial` counts — "video received; transcript not downloaded" means the video is there. Accepting both means the planned folder-03 poll drops in later with no downstream change.
2. **Coach form reads the engine's `Collection — coach form`.** The dashboard duplicate `Collection — coach form received` was retired; the vocabulary is now 41 strings, matched in `Code.gs`.
3. **Four-state inputs** — `received` / `partial` / `flagged` / `missing`, classified per pipe from the engine's own branch conditions, mirroring its ✅ / ⚠❌ / 🚩 status vocabulary. The old binary test reported `Could not download the transcript for …` and `… — copies failed, review manually` as healthy; both are real failures with no `Flag:` prefix. Verified against 15 real strings from the live log.
4. **Empty-email rows go to a System events bucket.** `Confirmation` and an unresolved coach-form selector are written with no client email; folding them by email invented a phantom testimonial keyed `::1`. They now surface as manual review on the Foundation view.
5. **Timestamps are read as serials.** The Event Log is fetched with `UNFORMATTED_VALUE` and converted with a fixed −05:00 offset. Previously the fold parsed a *display format*, so changing that column's number format would have NaN'd every timestamp at once; and "time in stage" was computed in the viewer's timezone, wrong for anyone outside Ecuador. Phase 3's thresholds depend on this.
6. **The Invited inference is locked to the five fan-out strings.** `CFG.ENGINE_FANOUT` is separate from `CFG.ENGINE`. The engine's other four (`Collection — coach form`, `Collection — client video`, `Confirmation`, `Nomination`) fire later or carry no client, and must never advance a stage. Asserted in the test: 0 leaked.

Also: all **nine** engine strings are now in the never-write guard on both sides, not just the five fan-out ones.

### New read: the Signal tab

The event log records the client folder's *name*, never its URL. Signal column E holds the surfaced folder-03 link, joined back through the roster by name. Without it the client card cannot link to folder 03 — which is the entire manual video workflow decided above.

### Verified against live data before pushing

7 testimonials, 69 events, all at Invited (inferred), 0 unresolved identities, 6 open flags. The four-state classifier was exercised on 15 real strings; the live log produced genuine variation (`Looms` reading `received`, `partial`, and `flagged` across different clients). Timezone check: serial `46241.28888889` → `7 Aug 2026, 6:56` → `11:56Z`. Frontend and Apps Script vocabularies diff to zero.

### Scope notes

The card exposes stage-advance actions for Scheduled and Published so the pipeline is traversable end to end; Phase 4 replaces them with the calendar. Recognitions is read-only until Phase 5.

**Files / commits:** `dashboard/{config,sheets-reader,state-builder,event-writer,pipeline-board,client-card,renderer}.js` · `app.js` · `index.html` · `styles.css` · `apps-script/Code.gs` · `DASHBOARD-SYSTEM.md` · `DECISION-LOG.md`

---

## 2026-08-07 — Collecting entry decided · engine dead code recorded · coach form trigger gap found

**Context.** Before building Phase 2, two things had to be settled: what event marks Invited → Collecting, and the exact engine vocabulary the client card's input checklist reads.

### The engine writes nine Stage strings, not the five in the data reference

Extracted from every `logEvent_` call site: the five fan-out strings plus `Collection — coach form`, `Collection — client video`, `Confirmation`, and `Nomination`. The last two write with an **empty Client email**. Documented in `DASHBOARD-SYSTEM.md` §11.

### `onClientVideoSubmit` is dead code — corrected course

Reading the engine source, `Collection — client video` looked like a live video-arrival event and was proposed as the Collecting trigger. **That was wrong.** Bernardo's decision log is the authority: D-059 rejected a Forms file-upload question (it forces a client Google login — worse for a 40+/low-tech audience), D-063 pointed the kickoff email at each client's `03 · Client video` folder, and D-065 validated a no-login upload live in incognito. D-054's English rewrite renamed the old handler instead of deleting it.

**Lesson recorded:** source presence ≠ live behavior. The conditional `if (cf)` around the trigger was the tell, and it was read as "unwired" rather than "deliberately dead." Verify against the Triggers list **and** the decision log, not the source alone.

### Nothing watches folder 03 — confirmed structurally

Only four entry points exist in the engine, and the sole time-driven one sends the monthly nomination. All 15 `DriveApp` iterations are write-path plumbing; none enumerates folder 03. Apps Script has no Drive change trigger. So a client upload fires nothing.

### Decision: Collecting entry is manual now, automated later

**Option A — Gaby marks it — is the primary path.** `Collection — video uploaded`, `MANUAL - Gaby`.

**Why:** volume is tiny (10–15/month), it needs zero new code in a live engine three days before launch, and the fold does not care who writes the event. Collecting entry is defined as `Collection — video uploaded` **OR** `Collection — client video`, whichever appears — so detection can be upgraded later with no downstream rework, and the manual path always remains as an override.

**Option C — poll folder 03 from the dashboard's own standalone script — is the planned upgrade, after launch.** It gets the same capability without touching the engine. Deferred: Drive access for the Membership account and an `AUTO - dashboard` Source convention are unsettled, and neither is needed yet. Option B (polling from inside the live engine) was rejected as unnecessary risk pre-launch.

A poll of either kind must not test "is folder 03 non-empty" — `copyStructure_` copies template files into every subfolder, so 03 is non-empty from creation. The sound test is `getDateCreated()` later than the folder's own creation.

In Phase 3 this becomes a queued task: clients sitting in Invited generate a "check for uploads" item in Gaby's list, with the card linking straight to folder 03; she either marks it received or does a client reach-out.

### ⚠️ Launch gap found: `onCoachFormSubmit` is not installed

The engine's Triggers list holds only `onSignalEdit` and `sendMonthlyNominationMessage`. The missing video trigger is correct; the **missing coach form trigger is not** — that path was never abandoned, and without it coach responses at launch are silently lost. The empty log is not evidence either way (no coach has submitted yet — the test clients belong to Bernardo and Brent, neither of whom filled the form).

Repair is additive and lives in `apps-script/engine-one-time-coach-form-trigger.gs`: a read-only `checkCoachFormWiring()` preflight plus `installCoachFormTriggerOnly()`. **`installTriggers()` must not be re-run** — it deletes every trigger before recreating them (a mid-run failure leaves the fan-out dead) and it reinstalls the dead `onClientVideoSubmit` whenever `CLIENT_FORM_SHEET_ID` is still set. The Triggers UI cannot do this by hand either: it only binds to the script's container spreadsheet, and the coach form responses live in a different file.

**Files / commits:** `apps-script/engine-one-time-coach-form-trigger.gs` · `DASHBOARD-SYSTEM.md` · `DECISION-LOG.md`

---

## 2026-08-07 — Wired to the live sheets · API key restriction must be origin-level

**What changed:** the read-only Sheets API key and the Apps Script Web App `/exec` URL were committed into `dashboard/config.js`. `setupPhase1()` was run on the Membership account: the `Cycle` header is in F1, the `Settings` tab exists with the 8 defaults, spreadsheet timezone is **America/Guayaquil**. GitHub Pages is live at `https://f4la.github.io/testimonial-dashboard/`.

**The gotcha, and the correction.** The setup instructions originally said to restrict the key to `https://f4la.github.io/testimonial-dashboard/*`. **That can never work.** Browsers send only the *origin* as the `Referer` on cross-origin requests (default `strict-origin-when-cross-origin` strips the path), so Google sees `https://f4la.github.io/` and the path-scoped rule fails with *"Requests from referer https://f4la.github.io/ are blocked."*

Verified by comparing against the key Coach Pulse already runs in production:

| Referer sent | New key | Coach Pulse key |
|---|---|---|
| `https://f4la.github.io/<path>/` | 200 | 200 |
| `https://f4la.github.io/` | **403** | 200 |

**Correct restriction:** `https://f4la.github.io/*`. Consequence: any page on `f4la.github.io` can use the key — that host is entirely ours, the key is read-only, restricted to the Sheets API, and limited to spreadsheets already link-readable. Path scoping is not achievable with a browser-side key. Documented in `DASHBOARD-SYSTEM.md` §2.4.

The restriction is genuinely enforced otherwise — `https://evil.example/` and a request with no referrer both return **403**.

**Live event log at this point:** 43 rows, 5 clients, all `AUTO`, all with a blank `Cycle` (so all fold to cycle 1). Stage counts are uneven — 11 `Collection — Loom` against 8 of each other pipe — which is more of the engine re-running that the fold's last-write-wins rule already handles.

**Files / commits:** `dashboard/config.js` · `DASHBOARD-SYSTEM.md` · `DECISION-LOG.md` · dc9c619

---

## 2026-08-07 — Phase 1: Foundation

**What was built:** repo scaffolding (`index.html`, `app.js`, `styles.css`, `dashboard/`), governance docs, the read path (Sheets API), the write path (Apps Script proxy), the Settings tab, identity resolution, and the event-log fold keyed on (email, cycle).

**Files:** `index.html` · `app.js` · `styles.css` · `dashboard/{config,sheets-reader,identity,state-builder,event-writer,renderer}.js` · `apps-script/Code.gs` · `CLAUDE.md` · `DASHBOARD-SYSTEM.md` · `DECISION-LOG.md`

### Decisions taken

**1. Roster spreadsheet ID corrected against the live sheet.**
The data reference documented `…hkjlajt…` (lowercase L). That id returns **404**. The working id, confirmed live and matching what Coach Pulse has deployed, is `…hkjIajt…` (capital i). Verified by calling the Sheets API on both. *Why it matters:* every identity lookup would have failed with an unhelpful 404.

**2. Identity falls back to Mastersheet Data, picking the most recent contract.**
The Roster is a QUERY view filtered to **active** clients; the event log is permanent. Resolving only against the Roster would turn every past client into a false "unmatched" flag. Mastersheet Data has one row **per contract** (94 of 323 emails have more than one; one has eight), so the fallback sorts by `Contract Start` — which mixes `August 5, 2024` and `5/6/2026` formats in the same column — falling back to `Date Purchased`, then sheet order.
Mastersheet Data has **no** full-name column (built from First + Last) and **no** coach Slack column (resolved through a coach→Slack map harvested from the Roster; all six coaches are covered today).

**3. Last-write-wins per (email, cycle, Stage).**
The live log contains **two complete fan-out runs for the same client** (Benjamin Jayne, 6:56 and 8:13 on 7 Aug). The engine re-runs and re-appends. Counting rows would double-count; taking the first would keep a stale `Flag:` after a later run succeeded. Only the newest row for a Stage describes reality. *This was not in the spec or the data reference — it was found in the data.*

**4. Order is (timestamp, row number).**
`Date and time` has minute resolution and no seconds, so one fan-out writes several rows sharing a timestamp. Append order is the tiebreaker. Unparseable dates sort last and are surfaced in setup health rather than dropped.

**5. Stage matching normalizes dashes and whitespace.**
The engine writes an em dash (U+2014). Exact-matching a typographic character is too fragile for the system's only memory — one hand-typed hyphen would silently drop a row from the fold instead of failing loudly.

**6. Any engine collection event implies the Invited stage.**
The engine only starts writing at the confirmation checkbox, which fires during Invited, and the three front stages have no events today. Without this inference every client currently in the log would be stage-less. Inferred stages are badged `inferred` in the UI so the inference is never invisible. Events that match no stage-entry condition yield **Indeterminate** — the fold does not invent a stage.

**7. `Approval — …` for Joey's stage; `Review — …` for Google reviews.**
The spec calls both "Review" (§4.1 stage 6 and §4.5). They are unrelated. The vocabulary separates them; the pipeline stage still displays as "Review".

**8. `Collection — video uploaded`, not `— client video received`.**
Renamed for visual distance from the engine's `Collection — client video link`, which means the folder was *shared*, not that the client uploaded. The upload is 100% manual — nothing detects it today.

**9. No `detail` column; `Event` already is it.**
The spec proposed a sixth `detail` column. `Event` already carries the free-text payload, so adding one would have split the same field in two. **`Cycle` is the only added column** (F), blank on all pre-existing rows and folded to 1.

**10. Timestamps are generated server-side, in the spreadsheet's timezone.**
`Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'd MMM yyyy, H:mm')`. Using the spreadsheet's own timezone guarantees no new timezone is introduced, and the browser clock never reaches the sheet.

**11. Write then verify.**
Apps Script Web Apps return no CORS headers, so the POST is `mode:"no-cors"` and the response is unreadable (same as Coach Pulse). Fire-and-forget alone would let a silent failure look like success, so every write re-reads the log to confirm the row landed.

**12. Two guards against corrupting the live log.**
Both the frontend and Apps Script reject any Stage outside the approved vocabulary, and explicitly reject the five engine strings — the dashboard can never forge an `AUTO`-looking collection event. `Code.gs` also re-checks the A–E headers before every write and refuses if they drifted. The collection engine is live; a non-additive change would break it.

**13. Six modules, not four.**
`identity.js` (two sources plus a recency rule is its own concern) and `event-writer.js` (the write path belonged in neither config nor renderer) were added to the four named in the brief.

**14. Governance docs in English.**
The 21DC docs are in Spanish; the build spec, the Coach Pulse README, and this repo's audience are English. Matching the spec. Say the word to switch.

### Setup still required (outside git)

- Sheets API key, referrer-restricted to `https://f4la.github.io/testimonial-dashboard/*` → `TDConfig.API_KEY`.
- Apps Script Web App deployed from `apps-script/Code.gs` → `TDConfig.WEB_APP_URL`.
- `setupPhase1()` run once to add the `Cycle` header and create the `Settings` tab.

---

## 2026-08-07 — `context/` folder created

Holds the build spec and the real-data reference. Inputs to the build, not runtime code.

**Files:** `context/README.md` · commit `0da26c5`
