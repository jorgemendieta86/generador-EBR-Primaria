MATERIALES EBR – PRIMARIA V1.4
Generador conectado de Programación Anual, Unidad Didáctica y Sesión de Aprendizaje

ARCHIVO DE INICIO
- Abrir index.html en un navegador moderno.

ESTRUCTURA
- index.html: punto de entrada de la plataforma.
- assets/styles.css: interfaz responsive e impresión A4.
- assets/app.js: lógica, herencia entre documentos, guardado local y generación de vistas previas.
- assets/curriculum.js: motor curricular cargado en el navegador.
- data/curriculum.json: copia estructurada y legible del catálogo curricular de esta V1.4.

FLUJO
1. Fuentes y contexto:
   - Datos informativos de la institución y docente.
   - Diagnóstico del contexto estudiantil.
   - Calendario comunal.
   - Visión y misión institucional.
   - La aplicación organiza fragmentos detectados y exige validación docente.

2. Programación anual:
   - Construcción de unidades base.
   - Distribución de competencias por unidad.
   - Plan de estudios institucional editable.
   - Valores, actitudes y evaluación.
   - Vista previa e impresión/PDF.

3. Unidad didáctica:
   - Solo se puede seleccionar una unidad creada en la programación.
   - Hereda título, duración, contexto y competencias.
   - Permite concretar propósitos, criterios por ciclo, evidencias, instrumentos, sesiones, recursos y bibliografía.

4. Sesión de aprendizaje:
   - Solo se puede seleccionar una unidad existente.
   - Hereda propósito, criterios y evidencia de la competencia seleccionada en la unidad.
   - Cambia la estructura didáctica según área/competencia: lectura, escritura, matemática, Personal Social, Ciencia y Tecnología, Arte, Educación Religiosa y Educación Física.
   - Genera un instrumento básico y una vista previa imprimible.

5. Motor curricular:
   - Catálogo Primaria con ciclos III, IV y V.
   - Competencias, capacidades y estándares por ciclo obtenidos del Programa Curricular de Educación Primaria cargado en el proyecto, excepto Educación Religiosa.
   - Educación Religiosa queda señalada como pendiente de una fuente oficial curricular específica porque el Programa Curricular proporcionado la presenta “en proceso de ajuste por la ONDEC”.

GUARDADO
- La información se almacena en localStorage del navegador.
- “Exportar proyecto” crea un archivo JSON.
- “Importar proyecto” recupera un archivo JSON exportado previamente.

IMPORTACIÓN DE DOCUMENTOS
- Para extraer texto directamente de Word, PDF o Excel, esta primera versión carga Mammoth.js, PDF.js y SheetJS desde CDN.
- Por tanto, esa función requiere conexión a internet al abrir la plataforma.
- Si no hay conexión, toda la plataforma continúa funcionando y el docente puede pegar el contenido de diagnóstico, calendario y misión/visión en los campos de texto.
- En una siguiente versión se pueden empaquetar estas librerías dentro de la plataforma para funcionamiento totalmente offline.

ALCANCE DE ESTA V1.4
- Es un prototipo funcional y estructural, no una versión curricular/documental final.
- Los textos generados automáticamente desde el contexto quedan como borradores editables y deben ser validados por el docente.
- No se generan automáticamente desempeños ni criterios finales a partir de reglas artificiales; los estándares se muestran como referente para conservar trazabilidad.
- La fidelidad visual definitiva a las plantillas originales deberá afinarse después de validar este flujo de trabajo.

V1.4: la programación anual se genera primero con una estructura más fiel al documento de referencia; los grados se distribuyen simétricamente en dos líneas cuando corresponde.


Cambio V1.4: la vista previa de la programación permanece oculta hasta hacer clic en “Generar Programación”.


CAMBIOS PRINCIPALES V1.4
- Interfaz más guiada y con lenguaje sencillo para docentes con poca experiencia tecnológica.
- Programación organizada automáticamente en 3 trimestres o 4 bimestres.
- Las unidades se distribuyen por periodo y la vista previa muestra encabezados agrupados por periodo.
- Vista previa con páginas A4 en orientación vertical u horizontal según el contenido.
- Impresión con páginas nombradas para conservar orientación mixta cuando el navegador lo soporta.
- Unidad: secciones iniciales/finales en vertical y matrices amplias en horizontal.
- Sesión: páginas horizontales para conservar la legibilidad de las tablas de criterios y evaluación.
- Botones principales coherentes: Generar Programación, Generar Unidad y Generar Sesión.
