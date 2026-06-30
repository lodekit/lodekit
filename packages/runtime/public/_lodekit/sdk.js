(function () {
  var slug = location.pathname.split("/").filter(Boolean)[0] || "";
  var base = "/api/apps/" + slug;
  async function jpost(p, body) {
    var r = await fetch(base + p, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var data = await r.json();
    if (!r.ok) throw new Error(data && data.error ? data.error : r.statusText);
    return data;
  }
  window.lodekit = {
    db: {
      query: async function (sql, params) {
        return (await jpost("/db/query", { sql: sql, params: params || [] })).rows;
      },
      exec: async function (sql, params) {
        return jpost("/db/exec", { sql: sql, params: params || [] });
      },
    },
    store: {
      get: async function (key) {
        var r = await fetch(base + "/store/" + encodeURIComponent(key));
        return (await r.json()).value;
      },
      set: async function (key, value) {
        await fetch(base + "/store/" + encodeURIComponent(key), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: value }),
        });
      },
    },
    secrets: {
      get: async function () {
        throw new Error("lodekit.secrets is not implemented in the POC");
      },
    },
  };
})();
