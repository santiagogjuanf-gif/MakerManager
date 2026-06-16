const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const JWT_SECRET = process.env.JWT_SECRET || 'makermanager-secret-2024';

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Credenciales requeridas' });
    const user = await db.getAsync('SELECT * FROM users WHERE username = ?', [username.toLowerCase().trim()]);
    if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role, display_name: user.display_name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await db.getAsync('SELECT id, username, display_name, role, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'No encontrado' });
    const isDefault = user.username === 'admin' && await bcrypt.compare('admin', user.password_hash);
    res.json({ id: user.id, username: user.username, display_name: user.display_name, role: user.role, is_default_password: isDefault });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!new_password || new_password.length < 4) return res.status(400).json({ error: 'Mínimo 4 caracteres' });
    const user = await db.getAsync('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!await bcrypt.compare(current_password, user.password_hash)) return res.status(401).json({ error: 'Contraseña actual incorrecta' });
    await db.runAsync('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(new_password, 10), req.user.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.allAsync('SELECT id, username, display_name, role, created_at FROM users ORDER BY role DESC, created_at ASC')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, display_name, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username y contraseña requeridos' });
    const validRole = ['admin','worker'].includes(role) ? role : 'worker';
    const counts = await db.getAsync("SELECT SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) as admins, SUM(CASE WHEN role='worker' THEN 1 ELSE 0 END) as workers FROM users");
    if (validRole === 'admin' && counts.admins >= 2) return res.status(400).json({ error: 'Límite de 2 administradores alcanzado' });
    if (validRole === 'worker' && counts.workers >= 10) return res.status(400).json({ error: 'Límite de 10 trabajadores alcanzado' });
    const r = await db.runAsync('INSERT INTO users (username, display_name, password_hash, role) VALUES (?,?,?,?)',
      [username.toLowerCase().trim(), display_name || username, await bcrypt.hash(password, 10), validRole]);
    res.json({ id: r.lastID });
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El usuario ya existe' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const uid = req.params.id;
    const { display_name, role, password } = req.body;
    if (role) {
      const validRole = ['admin','worker'].includes(role) ? role : 'worker';
      const cur = await db.getAsync('SELECT role FROM users WHERE id=?', [uid]);
      if (cur && cur.role !== validRole) {
        const counts = await db.getAsync("SELECT SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) as admins, SUM(CASE WHEN role='worker' THEN 1 ELSE 0 END) as workers FROM users");
        if (validRole === 'admin' && counts.admins >= 2) return res.status(400).json({ error: 'Límite de 2 administradores alcanzado' });
        if (validRole === 'worker' && counts.workers >= 10) return res.status(400).json({ error: 'Límite de 10 trabajadores alcanzado' });
      }
      await db.runAsync('UPDATE users SET role=? WHERE id=?', [validRole, uid]);
    }
    if (display_name) await db.runAsync('UPDATE users SET display_name=? WHERE id=?', [display_name, uid]);
    if (password && password.length >= 4) await db.runAsync('UPDATE users SET password_hash=? WHERE id=?', [await bcrypt.hash(password, 10), uid]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    await db.runAsync('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'No autenticado' });
  try { req.user = jwt.verify(h.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Token inválido o expirado' }); }
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Requiere administrador' });
  next();
}

module.exports = router;
module.exports.requireAuth = requireAuth;
module.exports.requireAdmin = requireAdmin;
