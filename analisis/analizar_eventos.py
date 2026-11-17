from pyspark.sql import SparkSession
from pyspark.sql.functions import count, desc, col

# 1. Crear sesión de Spark
spark = SparkSession.builder \
    .appName("SmartMarketAnalisisJSON") \
    .master("local[2]") \
    .getOrCreate()

spark.sparkContext.setLogLevel("ERROR")

# 2. Leer los eventos
ruta = "/home/ec2-user/smartmarket/data/eventos_smartmarket.json"

eventos = spark.read.json(ruta)

# 3. Definir carpeta de resultados
salida = "/home/ec2-user/smartmarket/analisis/resultados"

# 4. Resumen de eventos por categoría
resumen_eventos = eventos.groupBy("tipo_evento") \
    .agg(count("*").alias("cantidad")) \
    .orderBy(desc("cantidad"))

print("\n========== EVENTOS POR CATEGORIA ==========")
resumen_eventos.show()

resumen_eventos.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(salida + "/eventos_por_categoria")

# 5. Resumen por dispositivo
resumen_dispositivos = eventos.groupBy(
    col("detalles.dispositivo").alias("dispositivo")
).agg(
    count("*").alias("cantidad")
).orderBy(desc("cantidad"))

print("\n========== EVENTOS POR DISPOSITIVO ==========")
resumen_dispositivos.show()

resumen_dispositivos.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(salida + "/eventos_por_dispositivo")

# 6. Resumen por origen
resumen_origen = eventos.groupBy(
    col("detalles.origen").alias("origen")
).agg(
    count("*").alias("cantidad")
).orderBy(desc("cantidad"))

print("\n========== EVENTOS POR ORIGEN ==========")
resumen_origen.show()

resumen_origen.coalesce(1).write.mode("overwrite").option(
    "header", True
).csv(salida + "/eventos_por_origen")

# 7. Finalizar Spark
spark.stop()

print("\nAnalisis terminado. Resultados guardados correctamente.")
