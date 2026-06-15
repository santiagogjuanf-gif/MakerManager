const db = require('./db');

async function seed() {
  await db.ready;
  console.log('Seeding v2.0...');
  const tables = ['job_extras','job_products','job_filaments','print_jobs','filaments','resinas','consumibles_laser','consumibles_cnc','printers','clients'];
  for (const t of tables) await db.runAsync(`DELETE FROM ${t}`);

  const p = await db.runAsync(`INSERT INTO printers (nombre,marca,modelo,tipo,costo_compra,fecha_compra,consumo_promedio_watts,costo_por_hora,tiene_ams,ubicacion,estado,horas_acumuladas,notas)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['P1S Combo','Bambu Lab','P1S Combo','FDM',1339.26,'2024-01-15',120,(1339.26/5000),1,'Taller principal','Activa',142,'Impresora principal']);

  const fdata = [
    ['Bambu Lab','Basic PLA Negro','PLA','Negro','Mate',1000,875,28.99],
    ['Bambu Lab','Basic PLA Blanco','PLA','Blanco','Mate',1000,1000,28.99],
    ['Bambu Lab','Basic PLA Gris','PLA','Gris','Mate',1000,650,28.99],
    ['Bambu Lab','Basic PLA Azul','PLA','Azul','Mate',1000,420,28.99],
    ['Bambu Lab','Basic PLA Verde','PLA','Verde','Mate',1000,90,28.99],
  ];
  const fids = [];
  for (const f of fdata) {
    const cpg = f[7] / (f[5] - 200);
    const r = await db.runAsync(`INSERT INTO filaments (marca,nombre_comercial,material,color,acabado,diametro_mm,peso_inicial_g,peso_actual_g,peso_bobina_vacia_g,costo_total,costo_por_gramo,proveedor)
      VALUES (?,?,?,?,?,1.75,?,?,200,?,?,'Amazon CA')`,
      [f[0],f[1],f[2],f[3],f[4],f[5],f[6],f[7],cpg]);
    fids.push(r.lastID);
  }

  const c1 = await db.runAsync('INSERT INTO clients (nombre,telefono,email,notas,total_pedidos,clasificacion) VALUES (?,?,?,?,?,?)',
    ['Juan Pérez','(514) 555-0101','juan@email.com','Cliente frecuente',8,'Frecuente']);
  const c2 = await db.runAsync('INSERT INTO clients (nombre,telefono,email,notas,total_pedidos,clasificacion) VALUES (?,?,?,?,?,?)',
    ['María García','(514) 555-0202','maria@email.com','Pide llaveros',2,'Regular']);

  const job = await db.runAsync(`INSERT INTO print_jobs (nombre_proyecto,cliente_id,fecha,impresora_id,gramos_purga,gramos_perdidos,tiempo_impresion_min,tiempo_preparacion_min,tiempo_postproceso_min,tiempo_diseno_min,notas,precio_unitario,precio_menudeo,precio_mayoreo,precio_final,tipo_precio)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ['Llavero Personalizado',c1.lastID,'2024-06-10',p.lastID,5,2,90,15,10,20,'Set de 5 llaveros',4.50,18.00,14.00,18.00,'menudeo']);

  await db.runAsync('INSERT INTO job_filaments (print_job_id,filamento_id,gramos_pieza) VALUES (?,?,?)', [job.lastID,fids[0],45]);
  await db.runAsync('INSERT INTO job_products (print_job_id,descripcion,cantidad) VALUES (?,?,?)', [job.lastID,'Llavero personalizado',5]);
  await db.runAsync('INSERT INTO job_extras (print_job_id,nombre_extra,cantidad,costo_unitario,costo_total) VALUES (?,?,?,?,?)', [job.lastID,'Aro llavero',5,0.30,1.50]);
  await db.runAsync('UPDATE filaments SET peso_actual_g = peso_actual_g - 47 WHERE id=?', [fids[0]]);

  console.log('Seed v2.0 complete!');
}

module.exports = seed;

if (require.main === module) {
  seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
