const db = require('./db');

async function seed() {
  await db.ready;
  console.log('Seeding database...');

  await db.runAsync('DELETE FROM job_extras');
  await db.runAsync('DELETE FROM print_jobs');
  await db.runAsync('DELETE FROM filaments');
  await db.runAsync('DELETE FROM printers');
  await db.runAsync('DELETE FROM clients');

  const printer = await db.runAsync(`
    INSERT INTO printers (nombre, modelo, costo_compra_cad, fecha_compra, vida_util_horas, costo_por_hora, consumo_promedio_watts, costo_kwh_cad, notas)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Bambu Lab P1S Combo', 'P1S Combo', 1339.26, '2024-01-15', 1500, (1339.26/1500), 120, 0.18, 'Impresora principal del taller']
  );

  const filamentData = [
    ['Bambu Lab', 'Basic PLA Negro', 'PLA', 'Negro', 'Mate', 1000, 875, 28.99],
    ['Bambu Lab', 'Basic PLA Blanco', 'PLA', 'Blanco', 'Mate', 1000, 1000, 28.99],
    ['Bambu Lab', 'Basic PLA Gris', 'PLA', 'Gris', 'Mate', 1000, 650, 28.99],
    ['Bambu Lab', 'Basic PLA Azul', 'PLA', 'Azul', 'Mate', 1000, 420, 28.99],
    ['Bambu Lab', 'Basic PLA Verde', 'PLA', 'Verde', 'Mate', 1000, 90, 28.99],
  ];

  let firstFilamentId;
  for (const f of filamentData) {
    const netWeight = f[6] - 200;
    const costo_por_gramo = f[7] / netWeight;
    const r = await db.runAsync(`
      INSERT INTO filaments (marca, nombre_comercial, material, color, acabado, diametro_mm, peso_inicial_g, peso_actual_g, peso_bobina_vacia_g, costo_total_cad, costo_por_gramo, fecha_compra, proveedor)
      VALUES (?, ?, ?, ?, ?, 1.75, ?, ?, 200, ?, ?, '2024-01-15', 'Amazon CA')`,
      [f[0], f[1], f[2], f[3], f[4], f[5], f[6], f[7], costo_por_gramo]
    );
    if (!firstFilamentId) firstFilamentId = r.lastID;
  }

  const c1 = await db.runAsync('INSERT INTO clients (nombre, telefono, email, notas) VALUES (?, ?, ?, ?)', ['Juan Pérez', '(514) 555-0101', 'juan@email.com', 'Cliente frecuente']);
  const c2 = await db.runAsync('INSERT INTO clients (nombre, telefono, email, notas) VALUES (?, ?, ?, ?)', ['María García', '(514) 555-0202', 'maria@email.com', 'Pedidos de llaveros']);

  const job = await db.runAsync(`
    INSERT INTO print_jobs (nombre_proyecto, cliente_id, fecha, impresora_id, filamento_id, material, color, gramos_pieza, gramos_purga, gramos_perdidos, gramos_total, tiempo_impresion_min, tiempo_preparacion_min, tiempo_postproceso_min, tiempo_diseno_min, notas, precio_final_cad)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['Llavero Personalizado x5', c1.lastID, '2024-06-10', printer.lastID, firstFilamentId, 'PLA', 'Negro', 45, 5, 2, 52, 90, 15, 10, 20, 'Set de 5 llaveros con nombre grabado', 18.00]
  );

  await db.runAsync('UPDATE filaments SET peso_actual_g = peso_actual_g - ? WHERE id = ?', [52, firstFilamentId]);

  await db.runAsync('INSERT INTO job_extras (print_job_id, nombre_extra, cantidad, costo_unitario, costo_total) VALUES (?, ?, ?, ?, ?)', [job.lastID, 'Aro llavero metálico', 5, 0.30, 1.50]);
  await db.runAsync('INSERT INTO job_extras (print_job_id, nombre_extra, cantidad, costo_unitario, costo_total) VALUES (?, ?, ?, ?, ?)', [job.lastID, 'Bolsa transparente', 1, 0.15, 0.15]);

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
