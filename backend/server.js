
// ==========================================
// SMARTMARKET STREETWEAR
// API REST + FRONTEND + POSTGRESQL
// ==========================================

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// CONEXION CON POSTGRESQL
// ==========================================

const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// ==========================================
// MIDDLEWARES
// ==========================================

app.use(cors());
app.use(express.json());

// ==========================================
// VERIFICAR ESTADO DE LA API
// ==========================================

app.get("/api/health", (req, res) => {
    res.json({
        estado: "OK",
        servicio: "SmartMarket API",
        fecha: new Date()
    });
});

// ==========================================
// CONSULTAR PRODUCTOS ACTIVOS
// ==========================================

app.get("/api/productos", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                p.id,
                p.nombre,
                p.descripcion,
                p.precio,
                p.stock,
                p.imagen,
                c.nombre AS categoria
            FROM productos p
            LEFT JOIN categorias c
                ON p.categoria_id = c.id
            WHERE p.activo = TRUE
            ORDER BY p.id;
        `);

        res.json({
            total: resultado.rowCount,
            productos: resultado.rows
        });

    } catch (error) {
        console.error("Error al consultar productos:", error.message);

        res.status(500).json({
            error: "No se pudieron consultar los productos"
        });
    }
});

// ==========================================
// CONSULTAR CATEGORIAS
// ==========================================

app.get("/api/categorias", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT DISTINCT
                c.id,
                c.nombre,
                c.descripcion
            FROM categorias c
            INNER JOIN productos p
                ON p.categoria_id = c.id
            WHERE p.activo = TRUE
            ORDER BY c.id;
        `);

        res.json({
            total: resultado.rowCount,
            categorias: resultado.rows
        });

    } catch (error) {
        console.error("Error al consultar categorias:", error.message);

        res.status(500).json({
            error: "No se pudieron consultar las categorias"
        });
    }
});

// ==========================================
// CONSULTAR CLIENTES DE DEMOSTRACION
// ==========================================

app.get("/api/clientes", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT id, nombre, correo
            FROM clientes
            ORDER BY id;
        `);

        res.json({
            total: resultado.rowCount,
            clientes: resultado.rows
        });

    } catch (error) {
        console.error("Error al consultar clientes:", error.message);

        res.status(500).json({
            error: "No se pudieron consultar los clientes"
        });
    }
});

// ==========================================
// CONSULTAR PEDIDOS REGISTRADOS
// ==========================================

app.get("/api/pedidos", async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT
                p.id,
                p.cliente_id,
                c.nombre AS cliente,
                p.fecha_pedido,
                p.estado,
                p.total,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'producto_id', dp.producto_id,
                            'nombre', pr.nombre,
                            'cantidad', dp.cantidad,
                            'precio_unitario', dp.precio_unitario,
                            'subtotal', dp.subtotal
                        )
                    ) FILTER (WHERE dp.id IS NOT NULL),
                    '[]'::json
                ) AS productos
            FROM pedidos p
            INNER JOIN clientes c
                ON p.cliente_id = c.id
            LEFT JOIN detalle_pedido dp
                ON p.id = dp.pedido_id
            LEFT JOIN productos pr
                ON dp.producto_id = pr.id
            GROUP BY p.id, c.nombre
            ORDER BY p.id DESC;
        `);

        res.json({
            total: resultado.rowCount,
            pedidos: resultado.rows
        });

    } catch (error) {
        console.error("Error al consultar pedidos:", error.message);

        res.status(500).json({
            error: "No se pudieron consultar los pedidos"
        });
    }
});

// ==========================================
// REGISTRAR UN PEDIDO
// ==========================================

app.post("/api/pedidos", async (req, res) => {

    const { cliente_id, productos } = req.body;

    // Validar cliente
    if (!Number.isInteger(Number(cliente_id)) || Number(cliente_id) <= 0) {
        return res.status(400).json({
            error: "Debes seleccionar un cliente valido"
        });
    }

    // Validar productos
    if (!Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({
            error: "El pedido debe contener productos"
        });
    }

    if (productos.length > 20) {
        return res.status(400).json({
            error: "El pedido supera el limite de productos diferentes"
        });
    }

    // Unificar productos repetidos
    const cantidades = new Map();

    for (const item of productos) {

        const productoId = Number(item.producto_id);
        const cantidad = Number(item.cantidad);

        if (
            !Number.isSafeInteger(productoId) ||
            productoId <= 0 ||
            !Number.isSafeInteger(cantidad) ||
            cantidad <= 0
        ) {
            return res.status(400).json({
                error: "Los productos y cantidades deben ser validos"
            });
        }

        const nuevaCantidad = (cantidades.get(productoId) || 0) + cantidad;

        if (!Number.isSafeInteger(nuevaCantidad)) {
            return res.status(400).json({
                error: "La cantidad solicitada no es valida"
            });
        }

        cantidades.set(productoId, nuevaCantidad);
    }

    const conexion = await pool.connect();

    try {

        await conexion.query("BEGIN");

        // Verificar cliente
        const cliente = await conexion.query(
            "SELECT id FROM clientes WHERE id = $1",
            [Number(cliente_id)]
        );

        if (cliente.rowCount === 0) {
            const error = new Error("El cliente seleccionado no existe");
            error.status = 404;
            throw error;
        }

        const detalles = [];

        let totalCalculado = 0;

        // Verificar productos y bloquear registros
        for (const [productoId, cantidad] of cantidades) {

            const resultado = await conexion.query(`
                SELECT id, nombre, precio, stock
                FROM productos
                WHERE id = $1
                  AND activo = TRUE
                FOR UPDATE;
            `, [productoId]);

            if (resultado.rowCount === 0) {
                const error = new Error(
                    `El producto ${productoId} no existe o no esta disponible`
                );
                error.status = 404;
                throw error;
            }

            const producto = resultado.rows[0];

            if (producto.stock < cantidad) {
                const error = new Error(
                    `Stock insuficiente para: ${producto.nombre}`
                );
                error.status = 409;
                throw error;
            }

            const precio = Number(producto.precio);
            const subtotal = precio * cantidad;

            detalles.push({
                producto_id: producto.id,
                nombre: producto.nombre,
                cantidad,
                precio_unitario: producto.precio,
                subtotal
            });

            totalCalculado += subtotal;
        }

        // Crear pedido
        const nuevoPedido = await conexion.query(`
            INSERT INTO pedidos (
                cliente_id,
                fecha_pedido,
                estado,
                total
            )
            VALUES ($1, NOW(), 'pendiente', 0)
            RETURNING id, fecha_pedido, estado;
        `, [Number(cliente_id)]);

        const pedidoId = nuevoPedido.rows[0].id;

        // Guardar detalles y descontar inventario
        for (const detalle of detalles) {

            await conexion.query(`
                INSERT INTO detalle_pedido (
                    pedido_id,
                    producto_id,
                    cantidad,
                    precio_unitario,
                    subtotal
                )
                VALUES ($1, $2, $3, $4, $5);
            `, [
                pedidoId,
                detalle.producto_id,
                detalle.cantidad,
                detalle.precio_unitario,
                detalle.subtotal
            ]);

            await conexion.query(`
                UPDATE productos
                SET stock = stock - $1
                WHERE id = $2;
            `, [
                detalle.cantidad,
                detalle.producto_id
            ]);
        }

        // Calcular total desde PostgreSQL
        const totalPedido = await conexion.query(`
            SELECT COALESCE(SUM(subtotal), 0) AS total
            FROM detalle_pedido
            WHERE pedido_id = $1;
        `, [pedidoId]);

        // Actualizar total
        await conexion.query(`
            UPDATE pedidos
            SET total = $1
            WHERE id = $2;
        `, [
            totalPedido.rows[0].total,
            pedidoId
        ]);

        await conexion.query("COMMIT");

        res.status(201).json({
            mensaje: "Pedido registrado correctamente",
            pedido: {
                id: pedidoId,
                cliente_id: Number(cliente_id),
                fecha: nuevoPedido.rows[0].fecha_pedido,
                estado: nuevoPedido.rows[0].estado,
                total: totalPedido.rows[0].total,
                productos: detalles
            }
        });

    } catch (error) {

        await conexion.query("ROLLBACK");

        console.error("Error al registrar pedido:", error.message);

        res.status(error.status || 500).json({
            error: error.status
                ? error.message
                : "No se pudo registrar el pedido"
        });

    } finally {
        conexion.release();
    }
});

// ==========================================
// ESTADISTICAS SMARTMARKET - BIG DATA
// ==========================================

app.get("/api/estadisticas", async (req, res) => {

    try {

        const resultados = await Promise.all([

            // 1. Eventos por tipo
            pool.query(`
                SELECT tipo_evento, COUNT(*)::int AS cantidad
                FROM eventos
                GROUP BY tipo_evento
                ORDER BY cantidad DESC
            `),

            // 2. Eventos por dispositivo
            pool.query(`
                SELECT
                    COALESCE(detalles->>'dispositivo', 'Sin identificar') AS dispositivo,
                    COUNT(*)::int AS cantidad
                FROM eventos
                GROUP BY dispositivo
                ORDER BY cantidad DESC
            `),

            // 3. Eventos por origen
            pool.query(`
                SELECT
                    COALESCE(detalles->>'origen', 'Sin identificar') AS origen,
                    COUNT(*)::int AS cantidad
                FROM eventos
                GROUP BY origen
                ORDER BY cantidad DESC
            `),

            // 4. Productos más consultados
            pool.query(`
                SELECT p.id, p.nombre, COUNT(*)::int AS consultas
                FROM eventos e
                INNER JOIN productos p ON e.producto_id = p.id
                WHERE e.tipo_evento = 'vista_producto'
                GROUP BY p.id, p.nombre
                ORDER BY consultas DESC
                LIMIT 5
            `),

            // 5. Total de eventos
            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM eventos
            `),

            // 6. Productos más vendidos
            pool.query(`
                SELECT
                    p.id,
                    p.nombre,
                    SUM(dp.cantidad)::int AS unidades_vendidas
                FROM detalle_pedido dp
                INNER JOIN productos p ON dp.producto_id = p.id
                GROUP BY p.id, p.nombre
                ORDER BY unidades_vendidas DESC
                LIMIT 5
            `),

            // 7. Total de unidades vendidas
            pool.query(`
                SELECT COALESCE(SUM(cantidad), 0)::int AS total
                FROM detalle_pedido
            `),

            // 8. Total de pedidos
            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM pedidos
            `),

            // 9. Total de clientes
            pool.query(`
                SELECT COUNT(*)::int AS total
                FROM clientes
            `),

            // 10. Pedidos recientes sin datos personales
            pool.query(`
                SELECT
                    p.id,
                    c.nombre AS cliente,
                    p.fecha_pedido,
                    p.estado,
                    p.total
                FROM pedidos p
                INNER JOIN clientes c
                    ON p.cliente_id = c.id
                ORDER BY p.fecha_pedido DESC, p.id DESC
                LIMIT 5
            `)

        ]);

        res.json({

            totalEventos: resultados[4].rows[0].total,
            eventosPorTipo: resultados[0].rows,
            eventosPorDispositivo: resultados[1].rows,
            eventosPorOrigen: resultados[2].rows,
            productosMasConsultados: resultados[3].rows,

            productosMasVendidos: resultados[5].rows,
            totalUnidadesVendidas: resultados[6].rows[0].total,
            totalPedidos: resultados[7].rows[0].total,
            totalClientes: resultados[8].rows[0].total,
            pedidosRecientes: resultados[9].rows

        });

    } catch (error) {

        console.error(
            "Error al consultar estadísticas:",
            error.message
        );

        res.status(500).json({
            error: "No se pudieron obtener las estadísticas"
        });

    }

});


// ==========================================
// ESTADISTICAS BIG DATA - RESULTADOS PYSPARK
// ==========================================

const directorioResultadosSpark = path.join(
    __dirname,
    "..",
    "analisis",
    "resultados_distribuidos"
);

function leerResultadoSpark(carpeta, columnaNombre) {

    const directorio = path.join(directorioResultadosSpark, carpeta);

    const archivos = fs.readdirSync(directorio)
        .filter(nombre => nombre.startsWith("part-") && nombre.endsWith(".csv"));

    if (archivos.length === 0) {
        throw new Error(`No se encontro el CSV de resultados: ${carpeta}`);
    }

    const contenido = fs.readFileSync(
        path.join(directorio, archivos[0]),
        "utf8"
    ).trim();

    const filas = contenido.split(/\r?\n/);
    const encabezados = filas[0].split(",");

    const indiceNombre = encabezados.indexOf(columnaNombre);
    const indiceCantidad = encabezados.indexOf("cantidad");

    if (indiceNombre === -1 || indiceCantidad === -1) {
        throw new Error(`Formato CSV incorrecto en ${carpeta}`);
    }

    return filas.slice(1).filter(Boolean).map(fila => {

        const columnas = fila.split(",");

        return {
            [columnaNombre]: columnas[indiceNombre],
            cantidad: Number(columnas[indiceCantidad])
        };
    });
}

app.get("/api/estadisticas-bigdata", (req, res) => {

    try {

        const eventosPorCategoria = leerResultadoSpark(
            "eventos_por_categoria",
            "tipo_evento"
        );

        const eventosPorDispositivo = leerResultadoSpark(
            "eventos_por_dispositivo",
            "dispositivo"
        );

        const eventosPorOrigen = leerResultadoSpark(
            "eventos_por_origen",
            "origen"
        );

        const totalEventos = eventosPorCategoria.reduce(
            (total, evento) => total + evento.cantidad,
            0
        );

        res.json({
            motor: "Apache Spark - PySpark",
            modoEjecucion: "local[2]",
            totalEventos,
            eventosPorCategoria,
            eventosPorDispositivo,
            eventosPorOrigen
        });

    } catch (error) {

        console.error(
            "Error al consultar resultados de PySpark:",
            error.message
        );

        res.status(500).json({
            error: "No se pudieron consultar los resultados Big Data"
        });
    }
});


// ==========================================
// COORDINADOR DE ALMACENAMIENTO DISTRIBUIDO
// BIG DATA SMARTMARKET
// ==========================================

function convertirValorCSV(valor) {
    const texto = valor === null || valor === undefined
        ? ""
        : String(valor);

    if (/[",\r\n]/.test(texto)) {
        return '"' + texto.replace(/"/g, '""') + '"';
    }

    return texto;
}

function guardarEventoDistribuido(evento) {
    const id = Number(evento.id);

    if (!Number.isInteger(id) || id <= 0) {
        throw new Error("Identificador de evento no válido");
    }

    // Distribución circular entre los cuatro nodos
    const nodoPrimario = ((id - 1) % 4) + 1;
    const nodoReplica = (nodoPrimario % 4) + 1;

    const base = path.join(__dirname, "../almacenamiento");

    const archivoPrimario = path.join(
        base,
        `nodo_${nodoPrimario}`,
        "primarios",
        "eventos_primarios.csv"
    );

    const archivoReplica = path.join(
        base,
        `nodo_${nodoReplica}`,
        "replicas",
        `eventos_replica_nodo_${nodoPrimario}.csv`
    );

    if (!fs.existsSync(archivoPrimario) ||
        !fs.existsSync(archivoReplica)) {
        throw new Error("No se encontraron los archivos del nodo primario o réplica");
    }

    // Evitar insertar dos veces el mismo identificador
    const existeId = (archivo) =>
        fs.readFileSync(archivo, "utf8")
            .split(/\r?\n/)
            .some(linea => linea.startsWith(`${id},`));

    if (existeId(archivoPrimario) || existeId(archivoReplica)) {
        throw new Error(`El evento ${id} ya existe en alguno de los archivos`);
    }

    const detalles = typeof evento.detalles === "string"
        ? evento.detalles
        : JSON.stringify(evento.detalles || {});

    const fecha = new Date(evento.fecha_evento).toISOString();

    const fila = [
        evento.id,
        evento.cliente_id,
        evento.tipo_evento,
        evento.producto_id,
        detalles,
        fecha
    ].map(convertirValorCSV).join(",") + "\n";

    // Guardar los tamaños originales para revertir una escritura parcial
    const tamanoPrimario = fs.statSync(archivoPrimario).size;
    const tamanoReplica = fs.statSync(archivoReplica).size;

    try {
        fs.appendFileSync(archivoPrimario, fila, "utf8");
        fs.appendFileSync(archivoReplica, fila, "utf8");
    } catch (error) {
        fs.truncateSync(archivoPrimario, tamanoPrimario);
        fs.truncateSync(archivoReplica, tamanoReplica);
        throw error;
    }

    return {
        nodoPrimario,
        nodoReplica
    };
}

// ==========================================
// REGISTRO DE VISTAS DE PRODUCTOS
// POSTGRESQL + CSV DISTRIBUIDO
// ==========================================

app.post("/api/eventos/vista-producto", async (req, res) => {
    try {
        const productoId = Number(req.body.producto_id);

        if (!Number.isInteger(productoId) || productoId <= 0) {
            return res.status(400).json({
                error: "Identificador de producto no válido"
            });
        }

        const producto = await pool.query(`
            SELECT id, nombre
            FROM productos
            WHERE id = $1
              AND activo = TRUE
              AND eliminado = FALSE
        `, [productoId]);

        if (producto.rowCount === 0) {
            return res.status(404).json({
                error: "Producto no encontrado o no disponible"
            });
        }

        const userAgent = req.get("user-agent") || "";

        let dispositivo = "Computador";

        if (/tablet|ipad/i.test(userAgent)) {
            dispositivo = "Tablet";
        } else if (/mobile|android|iphone/i.test(userAgent)) {
            dispositivo = "Celular";
        }

        // Registrar en PostgreSQL y recuperar el evento completo
        const resultado = await pool.query(`
            INSERT INTO eventos (
                tipo_evento,
                producto_id,
                detalles
            )
            VALUES ($1, $2, $3)
            RETURNING
                id,
                cliente_id,
                tipo_evento,
                producto_id,
                detalles,
                fecha_evento
        `, [
            "vista_producto",
            productoId,
            JSON.stringify({
                dispositivo,
                origen: "SmartMarket"
            })
        ]);

        const evento = resultado.rows[0];

        // Enviar el mismo evento al primario y a su réplica
        const distribucion = guardarEventoDistribuido(evento);

        console.log(
            `Evento ${evento.id}: primario nodo ${distribucion.nodoPrimario}, ` +
            `réplica nodo ${distribucion.nodoReplica}`
        );

        res.status(201).json({
            mensaje: "Vista registrada en PostgreSQL y almacenamiento distribuido",
            evento_id: evento.id,
            producto: producto.rows[0].nombre,
            producto_id: productoId,
            dispositivo,
            nodoPrimario: distribucion.nodoPrimario,
            nodoReplica: distribucion.nodoReplica
        });

    } catch (error) {
        console.error(
            "Error al registrar y distribuir vista de producto:",
            error.message
        );

        res.status(500).json({
            error: "No se pudo completar el registro distribuido",
            detalle: error.message
        });
    }
});

// ==========================================
// SERVIR ARCHIVOS DEL FRONTEND
// ==========================================

const frontendPath = path.join(__dirname, "../frontend");

app.use(express.static(frontendPath));

// ==========================================
// RUTA PRINCIPAL
// ==========================================

app.get("/", (req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
});

// ==========================================
// INICIAR SERVIDOR
// ==========================================

app.listen(PORT, "0.0.0.0", () => {

    console.log("--------------------------------");
    console.log("SMARTMARKET STREETWEAR");
    console.log("--------------------------------");
    console.log(`Servidor activo en el puerto ${PORT}`);
    console.log("Frontend disponible desde el mismo servidor");

});

