const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    ['/api', '/api-system'],
    createProxyMiddleware({
      target: process.env.REACT_APP_API_BASE_URL || 'https://43.209.126.252',
      changeOrigin: true,
      secure: false, // Allow self-signed SSL certificates
    })
  );
};
