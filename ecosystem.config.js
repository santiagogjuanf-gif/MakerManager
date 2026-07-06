module.exports = {
  apps: [{
    name: 'makermanager',
    script: 'server.js',
    watch: false,
    env: {
      NODE_ENV: 'production',
      PORT: 8000,
      // Cloudflare — actualiza estos valores si cambias el token
      CLOUDFLARE_API_TOKEN: 'REEMPLAZA_CON_TU_TOKEN',
      CLOUDFLARE_ZONE_ID: '2f2e4b88fab965ba3f08b338260c1483',
      CLOUDFLARE_BASE_DOMAIN: 'makermanager.cerberusdev.pro',
      CLOUDFLARE_TUNNEL_ID: '64a3df03-7796-4ed1-b1f9-f06b5a9cbe89',
      // JWT secrets — pon una cadena larga y aleatoria aquí
      SUPERADMIN_JWT_SECRET: 'REEMPLAZA_CON_SECRET_LARGO',
      JWT_SECRET: 'REEMPLAZA_CON_OTRO_SECRET_LARGO',
    }
  }]
};
