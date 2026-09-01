# Del riesgo a la interacción estratégica

Experiencia web educativa de la cátedra Teoría de la Decisión de la Universidad Nacional de Río Negro.

**Actividad publicada:** [abrir la experiencia interactiva](https://tddunrn-gif.github.io/preferencias-riesgo-teoria-juegos/)

La página se publica automáticamente mediante GitHub Actions.

## Recorrido didáctico

La primera parte elicita una función de utilidad individual mediante tres fractiles adaptativos, con un máximo de cuatro comparaciones por fractil y dos pruebas predictivas. Cada lotería muestra su valor esperado.

La segunda parte aplica esa curva al caso ficticio **BioValle Envases**, una empresa del Alto Valle que evalúa tres escalas para producir bandejas compostables a partir de orujo de manzana. El alumno controla el avance y no necesita realizar cálculos. La experiencia incorpora, en orden:

1. formulación, matriz de pagos y árbol;
2. criterios de decisión sin probabilidades;
3. probabilidades previas y valor esperado;
4. estudio imperfecto, revisión bayesiana y estrategia contingente;
5. valor de la información muestral y perfecta;
6. utilidad esperada individual;
7. equivalentes ciertos y primas de riesgo;
8. valor personal de la información y comparación final de decisiones.

La tercera parte conserva BioValle e incorpora a **EcoPack Sur** como competidor. Compara:

1. la expansión rival tratada como un estado aleatorio;
2. una matriz bimatricial con mejores respuestas y eliminación de estrategias dominadas;
3. el equilibrio de Nash del juego simultáneo;
4. un juego secuencial resuelto por inducción hacia atrás;
5. el papel de la función de utilidad cuando la respuesta rival todavía es incierta.

Durante las dos aplicaciones, una línea de tiempo progresiva señala autores, años y publicaciones de referencia para cada método. Los hitos indican antecedentes o formalizaciones decisivas; no atribuyen necesariamente cada idea a un único inventor.

Los pagos del caso se expresan en millones de pesos constantes y permanecen dentro del intervalo de elicitación de −50 a 50.

## Privacidad y almacenamiento

La aplicación solicita un código de participante y advierte que no se deben ingresar nombres, DNI ni correos electrónicos. Firebase Authentication genera una identidad anónima. Las reglas de Firestore permiten escribir solamente el documento asociado con esa identidad y no habilitan lecturas desde la aplicación pública.

La configuración concreta del SDK web se conserva como el secreto `FIREBASE_CONFIG_JSON` de GitHub Actions. Durante la publicación se genera `firebase-config.runtime.js`, que no forma parte del árbol fuente. Como toda configuración de Firebase para la Web, sus valores siguen siendo observables en el navegador. La protección de los datos depende de la autenticación, las reglas de Firestore y las restricciones del proyecto.

Las respuestas integradas se guardan en la colección `integratedResponses`. El documento incorpora primero la encuesta y luego el estado y los resultados de la aplicación de decisiones y de la extensión estratégica.

## Referencias históricas de la línea de tiempo

- Daniel Bernoulli (1738), *Exposition of a New Theory on the Measurement of Risk*, traducción publicada en *Econometrica* en 1954, [DOI 10.2307/1909829](https://doi.org/10.2307/1909829).
- Thomas Bayes y Richard Price (1763), *An Essay towards Solving a Problem in the Doctrine of Chances*, [DOI 10.1098/rstl.1763.0053](https://doi.org/10.1098/rstl.1763.0053).
- John von Neumann (1928), *Zur Theorie der Gesellschaftsspiele*, [DOI 10.1007/BF01448847](https://doi.org/10.1007/BF01448847).
- John von Neumann y Oskar Morgenstern (1944), *Theory of Games and Economic Behavior*, [Princeton University Press](https://press.princeton.edu/books/paperback/9780691130613/theory-of-games-and-economic-behavior).
- John F. Nash (1950), *Equilibrium Points in N-Person Games*, [DOI 10.1073/pnas.36.1.48](https://doi.org/10.1073/pnas.36.1.48).
- Leonard J. Savage (1951), *The Theory of Statistical Decision*, [DOI 10.1080/01621459.1951.10500768](https://doi.org/10.1080/01621459.1951.10500768).
- Leonid Hurwicz (1951), *The Generalized Bayes-Minimax Principle*, [Cowles Foundation](https://cowles.yale.edu/publications/cfdp/cfdp-355).
- Harold W. Kuhn (1953), *Extensive Games and the Problem of Information*, en *Contributions to the Theory of Games II*.
- Howard Raiffa y Robert Schlaifer (1961), *Applied Statistical Decision Theory*, Harvard University.
- John W. Pratt (1964), *Risk Aversion in the Small and in the Large*, [DOI 10.2307/1913738](https://doi.org/10.2307/1913738).
- Ronald A. Howard (1966), *Decision Analysis: Applied Decision Theory*.

## Configuración

1. Habilitar el acceso anónimo en Firebase Authentication.
2. Crear Firestore y publicar `firestore.rules`.
3. Guardar el objeto JSON de configuración como el secreto `FIREBASE_CONFIG_JSON` del repositorio.
4. Configurar GitHub Pages para publicar mediante GitHub Actions.
5. Ejecutar el flujo incluido en `.github/workflows/deploy-pages.yml`.

La actividad funciona sin Firebase, pero en ese caso advierte que no pudo confirmar el guardado y permite descargar la experiencia completa como JSON.

## Licencias

- El código fuente se distribuye bajo la [Licencia MIT](LICENSE).
- Los textos, consignas y demás contenidos educativos se distribuyen bajo [Creative Commons Atribución 4.0 Internacional](LICENSE-CONTENT.md).
