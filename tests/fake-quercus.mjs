// A fake Quercus (Canvas) server built from fixtures.mjs, shared by the end-to-end tests.
import http from "node:http";
import { route, FILE_KIND, samplePdf, SAMPLE_PNG } from "./fixtures.mjs";

export async function startFakeQuercus({ token = "e2e-token", pdfText = "Rendered by the release build" } = {}) {
  const hits = [];
  const unknown = [];
  let authOk = true;
  const server = http.createServer((req, res) => {
    const url = req.url;
    hits.push(url);
    if (req.headers.authorization !== `Bearer ${token}`) authOk = false;
    const base = `http://127.0.0.1:${server.address().port}`;
    let m;
    if ((m = url.match(/^\/files\/(\d+)\/download/))) {
      const kind = FILE_KIND[m[1]];
      res.writeHead(200, { "content-type": kind === "pdf" ? "application/pdf" : kind === "png" ? "image/png" : "text/plain" });
      return res.end(kind === "pdf" ? samplePdf(pdfText) : kind === "png" ? SAMPLE_PNG : Buffer.from("print('hello from the fake server')\n"));
    }
    if (/^\/courses\/\d+\/files\/5002\/preview/.test(url)) {
      res.writeHead(200, { "content-type": "image/png" });
      return res.end(SAMPLE_PNG);
    }
    if (!url.startsWith("/api/v1/")) {
      res.writeHead(404);
      return res.end();
    }
    const path = url.replace(/([?&])per_page=100&?/, "$1").replace(/[?&]$/, "");
    try {
      const v = route(path);
      if (v === undefined) {
        unknown.push(path);
        res.writeHead(404, { "content-type": "application/json" });
        return res.end('{"errors":[{"message":"not found"}]}');
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(v).replaceAll("https://q.utoronto.ca", base));
    } catch (e) {
      const status = Number(String(e).replace("http-", "")) || 500;
      // Canvas answers "no permission" with 401 + status "unauthorized".
      res.writeHead(status === 403 ? 401 : status, { "content-type": "application/json" });
      res.end(status === 403 ? '{"status":"unauthorized","errors":[{"message":"user not authorized to perform that action"}]}' : "{}");
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    hits,
    unknown,
    authOk: () => authOk,
    close: () => server.close(),
  };
}
