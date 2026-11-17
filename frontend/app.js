// ==========================================
// SMARTMARKET STREETWEAR
// FRONTEND + POSTGRESQL + CARRITO
// NAVEGACION + HISTORIAL DE PEDIDOS
// ==========================================

const API = "";

let productosDisponibles = [];
let carrito = [];

// CONTROL DE ACTUALIZACION Y NOTIFICACIONES
let ultimoPedidoNotificado = null;
let intervaloActualizacionEstadisticas = null;
let actualizandoEstadisticas = false;
let temporizadorNotificacionPedido = null;

function mostrarNotificacionPedido(idPedido, nombreCliente) {

    let notificacion = document.getElementById("notificacion-pedido");

    if (!notificacion) {

        notificacion = document.createElement("div");

        notificacion.id = "notificacion-pedido";
        notificacion.className = "notificacion-pedido";

        notificacion.setAttribute("role", "status");
        notificacion.setAttribute("aria-live", "polite");

        document.body.appendChild(notificacion);
    }

    const clienteSeguro = escaparHTML(
        nombreCliente || "Cliente de demostración"
    );

    notificacion.innerHTML = `
        <div class="notificacion-pedido-icono">🔔</div>

        <div class="notificacion-pedido-contenido">
            <strong>¡NUEVO PEDIDO EN SMARTMARKET!</strong>

            <span class="notificacion-pedido-numero">
                Pedido #${Number(idPedido)}
            </span>

            <small>${clienteSeguro} realizó una compra.</small>
        </div>

        <button
            type="button"
            class="notificacion-pedido-cerrar"
            aria-label="Cerrar notificación"
        >×</button>
    `;

    notificacion.classList.remove("mostrar");

    clearTimeout(temporizadorNotificacionPedido);

    requestAnimationFrame(() => {
        notificacion.classList.add("mostrar");
    });

    notificacion.querySelector(".notificacion-pedido-cerrar")
        .addEventListener("click", () => {
            notificacion.classList.remove("mostrar");
            clearTimeout(temporizadorNotificacionPedido);
        });

    // Sonido suave mediante Web Audio cuando el navegador lo permite
    try {

        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (AudioContextClass) {

            const audio = new AudioContextClass();

            const oscilador = audio.createOscillator();
            const volumen = audio.createGain();

            oscilador.type = "sine";
            oscilador.frequency.setValueAtTime(660, audio.currentTime);
            oscilador.frequency.setValueAtTime(880, audio.currentTime + 0.12);

            volumen.gain.setValueAtTime(0.0001, audio.currentTime);
            volumen.gain.exponentialRampToValueAtTime(
                0.12,
                audio.currentTime + 0.03
            );
            volumen.gain.exponentialRampToValueAtTime(
                0.0001,
                audio.currentTime + 0.35
            );

            oscilador.connect(volumen);
            volumen.connect(audio.destination);

            oscilador.start();
            oscilador.stop(audio.currentTime + 0.36);

            oscilador.onended = () => audio.close();
        }

    } catch (error) {
        console.log("El sonido de notificación no está disponible.");
    }

    temporizadorNotificacionPedido = setTimeout(() => {
        notificacion.classList.remove("mostrar");
    }, 6000);
}

// ==========================================
// FORMATO DE PRECIOS
// ==========================================

function formatearPrecio(precio) {
    return new Intl.NumberFormat("es-CO", {
        style: "currency",
        currency: "COP",
        maximumFractionDigits: 0
    }).format(Number(precio));
}

// ==========================================
// NAVEGACION ENTRE VISTAS
// ==========================================

function cambiarVista(nombreVista) {

    const vistas = document.querySelectorAll(".vista-pagina");

    vistas.forEach(vista => {
        vista.classList.remove("activa");
    });

    const vistaSeleccionada = document.getElementById(
        `vista-${nombreVista}`
    );

    if (!vistaSeleccionada) return;

    vistaSeleccionada.classList.add("activa");

    document.querySelectorAll("nav a[data-vista]").forEach(enlace => {

        enlace.classList.toggle(
            "activo",
            enlace.dataset.vista === nombreVista
        );

    });

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });

    if (nombreVista === "pedidos") {
        cargarPedidos();
    }

    if (nombreVista === "estadisticas") {
        cargarEstadisticas();
    }
}

// ==========================================

// ==========================================
// ANALITICA Y ESTADISTICAS SMARTMARKET
// ==========================================

function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[caracter]);
}

function crearGraficaEstadisticas(titulo, datos, campoNombre, campoValor) {

    const filas = Array.isArray(datos) ? datos : [];

    if (filas.length === 0) {
        return `<div class="grafica-card"><h3>${escaparHTML(titulo)}</h3><p>Sin datos disponibles.</p></div>`;
    }

    const maximo = Math.max(...filas.map(item => Number(item[campoValor]) || 0), 1);

    const barras = filas.map(item => {
        const nombre = escaparHTML(item[campoNombre]);
        const cantidad = Number(item[campoValor]) || 0;
        const porcentaje = (cantidad / maximo) * 100;

        return `
            <div class="barra-estadistica">
                <div class="barra-info">
                    <span>${nombre}</span>
                    <strong>${cantidad.toLocaleString("es-CO")}</strong>
                </div>
                <div class="barra-fondo">
                    <div class="barra-progreso" style="width: ${porcentaje}%"></div>
                </div>
            </div>
        `;
    }).join("");

    return `
        <div class="grafica-card">
            <h3>${escaparHTML(titulo)}</h3>
            ${barras}
        </div>
    `;
}

async function cargarEstadisticas(esActualizacionAutomatica = false) {

    const resumen = document.getElementById("resumen-estadisticas");
    const graficas = document.getElementById("graficas");

    if (!resumen || !graficas || actualizandoEstadisticas) return;

    actualizandoEstadisticas = true;

    if (!esActualizacionAutomatica) {
        resumen.innerHTML = "<p>Cargando indicadores...</p>";
        graficas.innerHTML = "";
    }

    try {

        const respuesta = await fetch(`${API}/api/estadisticas`);

        if (!respuesta.ok) {
            throw new Error("No se pudieron consultar las estadísticas.");
        }

        const datos = await respuesta.json();

        // Datos de actividad
        const totalEventos = Number(datos.totalEventos) || 0;
        const tipos = Array.isArray(datos.eventosPorTipo) ? datos.eventosPorTipo : [];
        const dispositivos = Array.isArray(datos.eventosPorDispositivo) ? datos.eventosPorDispositivo : [];
        const origenes = Array.isArray(datos.eventosPorOrigen) ? datos.eventosPorOrigen : [];
        const productos = Array.isArray(datos.productosMasConsultados) ? datos.productosMasConsultados : [];

        // Datos comerciales
        const totalUnidades = Number(datos.totalUnidadesVendidas) || 0;
        const totalPedidos = Number(datos.totalPedidos) || 0;
        const totalClientes = Number(datos.totalClientes) || 0;

        const productosVendidos = Array.isArray(datos.productosMasVendidos)
            ? datos.productosMasVendidos
            : [];

        const pedidos = Array.isArray(datos.pedidosRecientes)
            ? datos.pedidosRecientes
            : [];

        // Detectar pedidos nuevos sin exponer datos personales
        const pedidoMasReciente = pedidos.length
            ? Number(pedidos[0].id)
            : null;

        if (pedidoMasReciente !== null && Number.isFinite(pedidoMasReciente)) {

            if (ultimoPedidoNotificado === null) {
                // Primera consulta: establece el pedido inicial como referencia
                ultimoPedidoNotificado = pedidoMasReciente;

            } else if (pedidoMasReciente > ultimoPedidoNotificado) {

                mostrarNotificacionPedido(pedidos[0].id, pedidos[0].cliente);
                ultimoPedidoNotificado = pedidoMasReciente;
            }
        }

        // Tarjetas principales
        resumen.innerHTML = `
            <div class="indicador-estadistica">
                <span>Total de eventos</span>
                <strong>${totalEventos.toLocaleString("es-CO")}</strong>
                <small>Actividad registrada</small>
            </div>

            <div class="indicador-estadistica">
                <span>Tipos de eventos</span>
                <strong>${tipos.length}</strong>
                <small>Acciones diferentes</small>
            </div>

            <div class="indicador-estadistica">
                <span>Dispositivos</span>
                <strong>${dispositivos.length}</strong>
                <small>Categorías detectadas</small>
            </div>

            <div class="indicador-estadistica">
                <span>Productos analizados</span>
                <strong>${productos.length}</strong>
                <small>Productos más consultados</small>
            </div>

            <div class="indicador-estadistica">
                <span>Unidades vendidas</span>
                <strong>${totalUnidades.toLocaleString("es-CO")}</strong>
                <small>Unidades registradas en pedidos</small>
            </div>

            <div class="indicador-estadistica">
                <span>Total de pedidos</span>
                <strong>${totalPedidos.toLocaleString("es-CO")}</strong>
                <small>Pedidos registrados</small>
            </div>

            <div class="indicador-estadistica">
                <span>Total de clientes</span>
                <strong>${totalClientes.toLocaleString("es-CO")}</strong>
                <small>Clientes registrados</small>
            </div>
        `;

        // Gráficas de actividad y ventas
        const graficaVentas = crearGraficaEstadisticas(
            "Productos más vendidos",
            productosVendidos,
            "nombre",
            "unidades_vendidas"
        );

        // Tabla de pedidos recientes: no muestra datos personales
        const filasPedidos = pedidos.length
            ? pedidos.map(pedido => {
                const fecha = pedido.fecha_pedido
                    ? new Date(pedido.fecha_pedido).toLocaleString("es-CO")
                    : "Sin fecha";

                const estado = escaparHTML(pedido.estado || "Sin estado");

                const total = new Intl.NumberFormat("es-CO", {
                    style: "currency",
                    currency: "COP",
                    maximumFractionDigits: 0
                }).format(Number(pedido.total) || 0);

                return `
                    <tr>
                        <td>#${Number(pedido.id) || 0}</td>
                        <td>${escaparHTML(fecha)}</td>
                        <td>${estado}</td>
                        <td>${total}</td>
                    </tr>
                `;
            }).join("")
            : `
                <tr>
                    <td colspan="4">Todavía no hay pedidos registrados.</td>
                </tr>
            `;

        graficas.innerHTML = `
            ${crearGraficaEstadisticas("Eventos por tipo", tipos, "tipo_evento", "cantidad")}

            ${crearGraficaEstadisticas("Actividad por dispositivo", dispositivos, "dispositivo", "cantidad")}

            ${crearGraficaEstadisticas("Origen del tráfico", origenes, "origen", "cantidad")}

            ${crearGraficaEstadisticas("Productos más consultados", productos, "nombre", "consultas")}

            ${graficaVentas}

            <div class="grafica-card pedidos-recientes-card">
                <h3>Pedidos recientes</h3>

                <div class="tabla-pedidos-contenedor">
                    <table class="tabla-pedidos">
                        <thead>
                            <tr>
                                <th>Pedido</th>
                                <th>Fecha</th>
                                <th>Estado</th>
                                <th>Total</th>
                            </tr>
                        </thead>

                        <tbody>
                            ${filasPedidos}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

    } catch (error) {

        console.error("Error al cargar estadísticas:", error);

        // Una consulta automática fallida no borra los datos que ya se muestran
        if (!esActualizacionAutomatica) {
            resumen.innerHTML = "<p>No fue posible cargar los indicadores.</p>";
            graficas.innerHTML = "<p>Verifica que el servidor y el servicio de estadísticas estén funcionando.</p>";
        }

    } finally {

        actualizandoEstadisticas = false;

    }
}

// CALCULOS DEL CARRITO
// ==========================================

function calcularTotal() {

    return carrito.reduce(
        (suma, item) => suma + item.precio * item.cantidad,
        0
    );

}

function calcularCantidadTotal() {

    return carrito.reduce(
        (suma, item) => suma + item.cantidad,
        0
    );

}

// ==========================================
// CARGAR CATEGORIAS
// ==========================================

async function cargarCategorias() {

    try {

        const respuesta = await fetch(`${API}/api/categorias`);

        if (!respuesta.ok) {
            throw new Error("No se pudieron cargar las categorías");
        }

        const datos = await respuesta.json();

        const contenedor = document.getElementById("lista-categorias");

        contenedor.innerHTML = "";

        datos.categorias.forEach(categoria => {

            const elemento = document.createElement("div");

            elemento.classList.add("categoria-card");

            elemento.innerHTML = `
                <h3>${categoria.nombre}</h3>
                <p>${categoria.descripcion || ""}</p>
            `;

            contenedor.appendChild(elemento);

        });

    } catch (error) {

        console.error("Error cargando categorías:", error);

    }

}

// ==========================================

// ==========================================
// MODAL DETALLES DEL PRODUCTO
// ==========================================

function cerrarModalProducto() {

    const modal = document.getElementById("modal-producto");

    if (!modal) return;

    modal.classList.remove("activo");
    modal.setAttribute("aria-hidden", "true");

}

function abrirModalProducto(productoId) {

    const producto = productosDisponibles.find(
        p => Number(p.id) === Number(productoId)
    );

    if (!producto) return;

    const modal = document.getElementById("modal-producto");
    const foto = document.getElementById("modal-producto-foto");
    const disponible = Number(producto.stock) > 0;
    const botonAgregar = document.getElementById("modal-producto-agregar");

    document.getElementById("modal-producto-categoria").textContent =
        producto.categoria || "Streetwear";

    document.getElementById("modal-producto-nombre").textContent =
        producto.nombre;

    document.getElementById("modal-producto-descripcion").textContent =
        producto.descripcion || "Sin descripción disponible.";

    document.getElementById("modal-producto-precio").textContent =
        formatearPrecio(producto.precio);

    const stock = document.getElementById("modal-producto-stock");

    stock.textContent = disponible
        ? `DISPONIBLE · ${producto.stock} unidades`
        : "PRODUCTO AGOTADO";

    stock.classList.toggle("agotado", !disponible);

    foto.src = `/imagenes/${encodeURIComponent(producto.imagen || "")}`;
    foto.alt = producto.nombre;

    botonAgregar.disabled = !disponible;

    botonAgregar.textContent = disponible
        ? "AGREGAR AL CARRITO"
        : "SOLD OUT";

    botonAgregar.onclick = () => {

        agregarAlCarrito(Number(producto.id));
        cerrarModalProducto();

    };

    modal.classList.add("activo");
    modal.setAttribute("aria-hidden", "false");

    // Registrar la vista en PostgreSQL
    fetch(`${API}/api/eventos/vista-producto`, {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            producto_id: Number(producto.id)
        })

    })
    .then(respuesta => {

        if (!respuesta.ok) {
            throw new Error("No se pudo registrar la vista");
        }

        return respuesta.json();

    })
    .catch(error => {

        console.error("Error registrando vista:", error);

    });

}

// ==========================================
// CARGAR PRODUCTOS

// ==========================================

async function cargarProductos() {

    try {

        const respuesta = await fetch(`${API}/api/productos`);

        if (!respuesta.ok) {
            throw new Error("No se pudieron cargar los productos");
        }

        const datos = await respuesta.json();

        productosDisponibles = datos.productos;

        const contenedor = document.getElementById("lista-productos");

        contenedor.innerHTML = "";

        productosDisponibles.forEach(producto => {

            const elemento = document.createElement("article");

            elemento.classList.add("producto-card");

            elemento.addEventListener("click", evento => {

                if (evento.target.closest(".boton-agregar")) return;

                abrirModalProducto(Number(producto.id));

            });

            const disponible = Number(producto.stock) > 0;

            const rutaImagen =
                `/imagenes/${encodeURIComponent(producto.imagen)}`;

            elemento.innerHTML = `

                <div class="producto-imagen">

                    <img
                        src="${rutaImagen}"
                        alt="${producto.nombre}"
                        loading="lazy"
                    >

                    <span class="producto-estado ${disponible ? "disponible" : "agotado"}">
                        ${disponible ? "DISPONIBLE" : "SOLD OUT"}
                    </span>

                </div>

                <div class="producto-info">

                    <span class="producto-categoria">
                        ${producto.categoria || "Streetwear"}
                    </span>

                    <h3>${producto.nombre}</h3>

                    <p class="producto-descripcion">
                        ${producto.descripcion || ""}
                    </p>

                    <div class="producto-pie">

                        <span class="producto-precio">
                            ${formatearPrecio(producto.precio)}
                        </span>

                        <span class="producto-stock">
                            ${Number(producto.stock) > 1
                                ? `${producto.stock} unidades disponibles`
                                : Number(producto.stock) === 1
                                    ? "¡Última unidad!"
                                    : "Agotado"}
                        </span>

                    </div>

                    <button
                        class="boton-agregar"
                        data-id="${producto.id}"
                        ${!disponible ? "disabled" : ""}
                    >
                        ${disponible ? "AGREGAR AL CARRITO" : "SOLD OUT"}
                    </button>

                </div>

            `;

            const imagen = elemento.querySelector("img");

            imagen.addEventListener("error", () => {

                imagen.alt = "Imagen no disponible";
                imagen.classList.add("imagen-error");

            });

            contenedor.appendChild(elemento);

        });

        document.querySelectorAll(".boton-agregar").forEach(boton => {

            boton.addEventListener("click", () => {

                agregarAlCarrito(Number(boton.dataset.id));

            });

        });

    } catch (error) {

        console.error("Error cargando productos:", error);

        document.getElementById("lista-productos").innerHTML =
            "<p>No fue posible cargar la colección.</p>";

    }

}

// ==========================================
// AGREGAR AL CARRITO
// ==========================================

function agregarAlCarrito(productoId) {

    const producto = productosDisponibles.find(
        p => Number(p.id) === productoId
    );

    if (!producto || Number(producto.stock) <= 0) {
        return;
    }

    const existente = carrito.find(
        p => p.producto_id === productoId
    );

    if (existente) {

        if (existente.cantidad >= Number(producto.stock)) {

            mostrarMensaje(
                "No hay más unidades disponibles.",
                "error"
            );

            return;

        }

        existente.cantidad++;

    } else {

        carrito.push({

            producto_id: productoId,
            nombre: producto.nombre,
            precio: Number(producto.precio),
            cantidad: 1

        });

    }

    renderizarCarrito();

}

// ==========================================
// CAMBIAR CANTIDAD
// ==========================================

function cambiarCantidad(productoId, cambio) {

    const item = carrito.find(
        p => p.producto_id === productoId
    );

    const producto = productosDisponibles.find(
        p => Number(p.id) === productoId
    );

    if (!item || !producto) return;

    const nuevaCantidad = item.cantidad + cambio;

    if (nuevaCantidad <= 0) {

        eliminarDelCarrito(productoId);
        return;

    }

    if (nuevaCantidad > Number(producto.stock)) {

        mostrarMensaje("Stock insuficiente.", "error");
        return;

    }

    item.cantidad = nuevaCantidad;

    renderizarCarrito();

}

// ==========================================
// ELIMINAR PRODUCTO
// ==========================================

function eliminarDelCarrito(productoId) {

    carrito = carrito.filter(
        p => p.producto_id !== productoId
    );

    renderizarCarrito();

}

// ==========================================
// GENERAR CONTENIDO DEL CARRITO
// ==========================================

function generarProductosCarrito() {

    if (carrito.length === 0) {

        return "<p>Tu carrito está vacío.</p>";

    }

    return carrito.map(item => `

        <div class="carrito-item">

            <div>

                <h3>${item.nombre}</h3>

                <p>${formatearPrecio(item.precio)}</p>

                <p>
                    Subtotal:
                    ${formatearPrecio(item.precio * item.cantidad)}
                </p>

            </div>

            <div class="carrito-controles">

                <button
                    class="cantidad-menos"
                    data-id="${item.producto_id}"
                >−</button>

                <span>${item.cantidad}</span>

                <button
                    class="cantidad-mas"
                    data-id="${item.producto_id}"
                >+</button>

                <button
                    class="eliminar-producto"
                    data-id="${item.producto_id}"
                >
                    Eliminar
                </button>

            </div>

        </div>

    `).join("");

}

// ==========================================
// CONECTAR BOTONES DEL CARRITO
// ==========================================

function conectarBotonesCarrito(contenedor) {

    contenedor.querySelectorAll(".cantidad-menos").forEach(boton => {

        boton.addEventListener("click", () => {

            cambiarCantidad(Number(boton.dataset.id), -1);

        });

    });

    contenedor.querySelectorAll(".cantidad-mas").forEach(boton => {

        boton.addEventListener("click", () => {

            cambiarCantidad(Number(boton.dataset.id), 1);

        });

    });

    contenedor.querySelectorAll(".eliminar-producto").forEach(boton => {

        boton.addEventListener("click", () => {

            eliminarDelCarrito(Number(boton.dataset.id));

        });

    });

}

// ==========================================
// MOSTRAR CARRITO PRINCIPAL
// ==========================================

function renderizarCarrito() {

    const contenedor = document.getElementById("lista-carrito");

    const totalElemento = document.getElementById("total-carrito");

    const contador = document.getElementById("contador-carrito");

    const botonConfirmar = document.getElementById("confirmar-pedido");

    contenedor.innerHTML = generarProductosCarrito();

    conectarBotonesCarrito(contenedor);

    const total = calcularTotal();

    const cantidadTotal = calcularCantidadTotal();

    totalElemento.textContent = formatearPrecio(total);

    contador.textContent = cantidadTotal;

    botonConfirmar.disabled = carrito.length === 0;

    renderizarCarritoFlotante();

}

// ==========================================
// ACTUALIZAR CARRITO FLOTANTE
// ==========================================

function renderizarCarritoFlotante() {

    const contenedor = document.getElementById(
        "productos-carrito-flotante"
    );

    const contador = document.getElementById(
        "contador-flotante"
    );

    const totalElemento = document.getElementById(
        "total-flotante"
    );

    contenedor.innerHTML = generarProductosCarrito();

    conectarBotonesCarrito(contenedor);

    contador.textContent = calcularCantidadTotal();

    totalElemento.textContent = formatearPrecio(calcularTotal());

}

// ==========================================
// ABRIR Y CERRAR CARRITO FLOTANTE
// ==========================================

function abrirCarritoFlotante() {

    document.getElementById("panel-carrito")
        .classList.add("abierto");

    document.getElementById("fondo-carrito")
        .classList.add("visible");

}

function cerrarCarritoFlotante() {

    document.getElementById("panel-carrito")
        .classList.remove("abierto");

    document.getElementById("fondo-carrito")
        .classList.remove("visible");

}

// ==========================================
// CARGAR CLIENTES
// ==========================================

async function cargarClientes() {

    try {

        const respuesta = await fetch(`${API}/api/clientes`);

        if (!respuesta.ok) {

            throw new Error("No se pudieron cargar los clientes");

        }

        const datos = await respuesta.json();

        const selector = document.getElementById("cliente-select");

        selector.innerHTML = `
            <option value="">Selecciona un cliente</option>
        `;

        datos.clientes.forEach(cliente => {

            const opcion = document.createElement("option");

            opcion.value = cliente.id;

            opcion.textContent = cliente.nombre;

            selector.appendChild(opcion);

        });

    } catch (error) {

        console.error("Error cargando clientes:", error);

        mostrarMensaje(
            "No se pudieron cargar los clientes.",
            "error"
        );

    }

}

// ==========================================
// MOSTRAR MENSAJES
// ==========================================

function mostrarMensaje(mensaje, tipo) {

    const elemento = document.getElementById("mensaje-pedido");

    elemento.textContent = mensaje;

    elemento.className = tipo;

}

// ==========================================
// CONFIRMAR PEDIDO
// ==========================================

async function confirmarPedido() {

    if (carrito.length === 0) {

        mostrarMensaje("El carrito está vacío.", "error");
        return;

    }

    const clienteId = Number(
        document.getElementById("cliente-select").value
    );

    if (!Number.isInteger(clienteId) || clienteId <= 0) {

        mostrarMensaje("Selecciona un cliente.", "error");
        return;

    }

    const boton = document.getElementById("confirmar-pedido");

    boton.disabled = true;

    boton.textContent = "PROCESANDO...";

    try {

        const respuesta = await fetch(`${API}/api/pedidos`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                cliente_id: clienteId,

                productos: carrito.map(item => ({

                    producto_id: item.producto_id,
                    cantidad: item.cantidad

                }))

            })

        });

        const datos = await respuesta.json();

        if (!respuesta.ok) {

            throw new Error(
                datos.error || "No se pudo registrar el pedido"
            );

        }

        mostrarMensaje(

            `¡Pedido #${datos.pedido.id} registrado! Total: ${formatearPrecio(datos.pedido.total)}`,

            "exito"

        );

        carrito = [];

        renderizarCarrito();

        document.getElementById("cliente-select").value = "";

        await cargarProductos();

        // Actualizar historial después de la compra
        await cargarPedidos();

    } catch (error) {

        mostrarMensaje(error.message, "error");

        console.error("Error al confirmar pedido:", error);

    } finally {

        boton.textContent = "CONFIRMAR PEDIDO";

        boton.disabled = carrito.length === 0;

    }

}

// ==========================================
// FORMATO DE FECHA
// ==========================================

function formatearFecha(fecha) {

    if (!fecha) return "Fecha no disponible";

    const fechaConvertida = new Date(fecha);

    if (Number.isNaN(fechaConvertida.getTime())) {
        return "Fecha no disponible";
    }

    return fechaConvertida.toLocaleString("es-CO", {
        dateStyle: "medium",
        timeStyle: "short"
    });

}

// ==========================================
// CARGAR HISTORIAL DE PEDIDOS
// ==========================================

async function cargarPedidos() {

    const contenedor = document.getElementById("lista-pedidos");

    contenedor.innerHTML = "<p>Cargando pedidos...</p>";

    try {

        const respuesta = await fetch(`${API}/api/pedidos`);

        if (!respuesta.ok) {

            throw new Error("No se pudieron consultar los pedidos");

        }

        const datos = await respuesta.json();

        contenedor.innerHTML = "";

        if (!datos.pedidos || datos.pedidos.length === 0) {

            contenedor.innerHTML = `
                <p>Todavía no hay pedidos registrados.</p>
            `;

            return;

        }

        datos.pedidos.forEach(pedido => {

            const elemento = document.createElement("article");

            elemento.classList.add("pedido-card");

            const productos = Array.isArray(pedido.productos)
                ? pedido.productos
                : [];

            const listaProductos = productos.map(producto => `

                <p>
                    ${producto.nombre || "Producto"}
                    × ${producto.cantidad}
                    — ${formatearPrecio(producto.subtotal)}
                </p>

            `).join("");

            elemento.innerHTML = `

                <h3>Pedido #${pedido.id}</h3>

                <p>
                    <strong>Cliente:</strong>
                    ${pedido.cliente}
                </p>

                <p>
                    <strong>Fecha:</strong>
                    ${formatearFecha(pedido.fecha_pedido)}
                </p>

                <p>
                    <strong>Estado:</strong>
                    <span class="pedido-estado">
                        ${pedido.estado}
                    </span>
                </p>

                <div class="pedido-productos">

                    <strong>Productos:</strong>

                    ${listaProductos}

                </div>

                <div class="pedido-total">
                    Total: ${formatearPrecio(pedido.total)}
                </div>

            `;

            contenedor.appendChild(elemento);

        });

    } catch (error) {

        console.error("Error cargando pedidos:", error);

        contenedor.innerHTML = `
            <p>No fue posible cargar el historial de pedidos.</p>
        `;

    }

}

// ==========================================
// INICIAR APLICACION
// ==========================================

document.addEventListener("DOMContentLoaded", () => {

    // Cargar información inicial
    cargarCategorias();

    cargarProductos();

    cargarClientes();

    renderizarCarrito();

    // Navegación del menú
    document.querySelectorAll("[data-vista]").forEach(enlace => {

        enlace.addEventListener("click", evento => {

            evento.preventDefault();

            cambiarVista(enlace.dataset.vista);

        });

    });

    // Confirmar pedido
    document
        .getElementById("confirmar-pedido")
        .addEventListener("click", confirmarPedido);

    // Abrir carrito flotante
    document
        .getElementById("abrir-carrito-flotante")
        .addEventListener("click", abrirCarritoFlotante);

    // Cerrar carrito flotante
    document
        .getElementById("cerrar-carrito-flotante")
        .addEventListener("click", cerrarCarritoFlotante);

    // Cerrar al pulsar fondo oscuro
    document
        .getElementById("fondo-carrito")
        .addEventListener("click", cerrarCarritoFlotante);

    // Ir desde carrito flotante a la vista carrito
    document
        .getElementById("ir-carrito")
        .addEventListener("click", () => {

            cerrarCarritoFlotante();

            cambiarVista("carrito");

        });

    // Cerrar modal de detalles
    document
        .getElementById("cerrar-modal-producto")
        .addEventListener("click", cerrarModalProducto);

    document
        .getElementById("cerrar-modal-fondo")
        .addEventListener("click", cerrarModalProducto);

    // Cerrar panel con Escape
    document.addEventListener("keydown", evento => {

        if (evento.key === "Escape") {

            cerrarCarritoFlotante();
            cerrarModalProducto();

        }

    });

    // Actualizar analítica cada 15 segundos mientras esté visible
    if (intervaloActualizacionEstadisticas === null) {

        intervaloActualizacionEstadisticas = setInterval(() => {

            const vistaEstadisticas = document.getElementById("vista-estadisticas");

            if (vistaEstadisticas && vistaEstadisticas.classList.contains("activa")) {
                cargarEstadisticas(true);
            }

        }, 15000);
    }

    // Vista inicial
    cambiarVista("inicio");

});