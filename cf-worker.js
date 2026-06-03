const API_HOST = "run-lb.tanmasports.com";

async function handleRequest(request) {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, sign, token, appkey",
        "Access-Control-Max-Age": "86400"
      }
    });
  }

  try {
    const body = request.method === "POST" ? await request.text() : null;
    const sign = request.headers.get("sign") || "";
    const token = request.headers.get("token") || "";
    const appkey = request.headers.get("appkey") || "";

    const apiUrl = "https://" + API_HOST + url.pathname + url.search;
    const apiResponse = await fetch(apiUrl, {
      method: request.method,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "sign": sign,
        "token": token,
        "appkey": appkey
      },
      body: body
    });

    const responseBody = await apiResponse.text();

    return new Response(responseBody, {
      status: apiResponse.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ code: -1, msg: "Proxy error: " + e.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

addEventListener("fetch", function(event) {
  event.respondWith(handleRequest(event.request));
});
