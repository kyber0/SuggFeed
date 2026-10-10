import type { Request, Response, Application } from "express";
// Vercel Serverless Function entrypoint for Express
let app: Application | undefined;

function getApp() {
  if (!app) {
    try {
      const serverModule = require("../dist/server");
      app = serverModule.default || serverModule.app || serverModule;
    } catch (err) {
      console.error("[vercel-entry] Critical error loading server bundle:", err);
      throw err;
    }
  }
  return app!;
}

export default (req: Request, res: Response) => {
  try {
    const handler = getApp();
    return handler(req, res);
  } catch (err) {
    console.error("[vercel-entry] Invocation error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>SuggFeed Deployment Error</title></head>
        <body style="font-family:sans-serif;padding:32px;line-height:1.6;background:#f8fafc;color:#0f172a">
          <div style="max-width:680px;margin:0 auto;background:#fff;padding:28px;border-radius:12px;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(0,0,0,0.05)">
            <h2 style="color:#e11d48;margin-top:0">⚠️ Server Initialization Error</h2>
            <p>The service is temporarily unavailable. Please try again later.</p>
          </div>
        </body>
      </html>
    `);
  }
};
