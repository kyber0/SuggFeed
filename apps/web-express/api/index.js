// Vercel Serverless Function entrypoint for Express
const app = require("../dist/server").default || require("../dist/server");

module.exports = app;
