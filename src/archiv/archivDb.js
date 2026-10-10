// =================================================================
//  PLANWAND-BACKUP · Datenbank aus der Datei
//
//  In einer Datei aus dem Planwand-Archiv (src/teile/planwandArchiv.js)
//  läuft die echte App, aber ohne Netz und ohne Supabase: Die Tabellen
//  stehen in window.HOFER_ARCHIV.daten. Dieser kleine Nachbau beantwortet
//  die Abfragen der App daraus, genau so weit, wie die Planwand sie
//  braucht (Filter, Sortierung, Ausschnitt, Anzahl). Schreiben geht nicht:
//  Jede Änderung kommt mit einer verständlichen Meldung zurück.
// =================================================================

const NUR_ANSEHEN = { message: "Das ist ein Backup der Planwand, nur zum Ansehen. Ändern geht nur in der App." };

function passt(zeile, f) {
  const w = zeile[f.feld];
  switch (f.art) {
    case "eq": return String(w) === String(f.wert);
    case "neq": return String(w) !== String(f.wert);
    case "is": return f.wert === null ? (w === null || w === undefined) : w === f.wert;
    case "gt": return w !== null && w !== undefined && w > f.wert;
    case "gte": return w !== null && w !== undefined && w >= f.wert;
    case "lt": return w !== null && w !== undefined && w < f.wert;
    case "lte": return w !== null && w !== undefined && w <= f.wert;
    case "in": return (f.wert || []).map(String).indexOf(String(w)) !== -1;
    case "like": {
      const muster = String(f.wert || "").toLowerCase().replace(/%/g, "");
      return String(w ?? "").toLowerCase().includes(muster);
    }
    default: return true;
  }
}

function abfrage(daten, tabelle) {
  const z = { filter: [], sort: [], grenze: null, einzeln: false, vielleicht: false, schreiben: false, zaehlen: false, kopf: false };
  const b = {
    select(_s, o) { if (o && o.count) z.zaehlen = true; if (o && o.head) z.kopf = true; return b; },
    insert() { z.schreiben = true; return b; },
    update() { z.schreiben = true; return b; },
    upsert() { z.schreiben = true; return b; },
    delete() { z.schreiben = true; return b; },
    eq(feld, wert) { z.filter.push({ feld, wert, art: "eq" }); return b; },
    neq(feld, wert) { z.filter.push({ feld, wert, art: "neq" }); return b; },
    is(feld, wert) { z.filter.push({ feld, wert, art: "is" }); return b; },
    gt(feld, wert) { z.filter.push({ feld, wert, art: "gt" }); return b; },
    gte(feld, wert) { z.filter.push({ feld, wert, art: "gte" }); return b; },
    lt(feld, wert) { z.filter.push({ feld, wert, art: "lt" }); return b; },
    lte(feld, wert) { z.filter.push({ feld, wert, art: "lte" }); return b; },
    in(feld, wert) { z.filter.push({ feld, wert, art: "in" }); return b; },
    ilike(feld, wert) { z.filter.push({ feld, wert, art: "like" }); return b; },
    like(feld, wert) { z.filter.push({ feld, wert, art: "like" }); return b; },
    // „oder“ und „nicht“ schränken nur ein: Ohne sie kommt eher etwas
    // mehr zurück, und die App filtert selbst weiter
    or() { return b; },
    not() { return b; },
    filter() { return b; },
    match(o) { Object.keys(o || {}).forEach((k) => z.filter.push({ feld: k, wert: o[k], art: "eq" })); return b; },
    contains() { return b; },
    textSearch() { return b; },
    order(feld, o) { z.sort.push({ feld, ab: !!(o && o.ascending === false), leerVorn: !!(o && o.nullsFirst) }); return b; },
    limit(n) { z.grenze = n; return b; },
    range(von, bis) { z.von = von; z.bis = bis; return b; },
    single() { z.einzeln = true; return b; },
    maybeSingle() { z.einzeln = true; z.vielleicht = true; return b; },
    abortSignal() { return b; },
    then(ok, nein) { return lauf().then(ok, nein); },
    catch(f) { return lauf().catch(f); },
    finally(f) { return lauf().finally(f); },
  };
  function lauf() {
    return Promise.resolve().then(() => {
      if (z.schreiben) return { data: null, error: NUR_ANSEHEN, count: null };
      let t = (daten[tabelle] || []).filter((zeile) => z.filter.every((f) => passt(zeile, f)));
      const anzahl = t.length;
      z.sort.slice().reverse().forEach((s) => {
        t = t.slice().sort((x, y) => {
          const a = x[s.feld], c = y[s.feld];
          const aLeer = a === null || a === undefined, cLeer = c === null || c === undefined;
          if (aLeer && cLeer) return 0;
          if (aLeer) return s.leerVorn ? -1 : 1;
          if (cLeer) return s.leerVorn ? 1 : -1;
          if (a === c) return 0;
          return (a > c ? 1 : -1) * (s.ab ? -1 : 1);
        });
      });
      if (z.von !== undefined) t = t.slice(z.von, z.bis + 1);
      if (z.grenze) t = t.slice(0, z.grenze);
      // Kopien, damit die App die Daten der Datei nicht verändert
      t = t.map((x) => Object.assign({}, x));
      if (z.kopf) return { data: null, error: null, count: anzahl };
      if (z.einzeln) {
        if (!t.length && !z.vielleicht) return { data: null, error: { message: "keine Zeile" } };
        return { data: t[0] || null, error: null };
      }
      return { data: t, error: null, count: z.zaehlen ? anzahl : null };
    });
  }
  return b;
}

export function archivVerbindung(archiv) {
  const daten = (archiv && archiv.daten) || {};
  const sitzung = { access_token: "archiv", refresh_token: "archiv", user: { id: archiv.ich.id, email: archiv.ich.email } };
  return {
    from: (t) => abfrage(daten, t),
    rpc: () => Promise.resolve({ data: null, error: NUR_ANSEHEN }),
    functions: { invoke: () => Promise.resolve({ data: null, error: NUR_ANSEHEN }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; }, send() { return Promise.resolve(); }, track() { return Promise.resolve(); } }),
    removeChannel: () => {},
    removeAllChannels: () => {},
    // Keine Dateien in der Datei: Zeichnungen und WBGs gibt es hier nicht
    storage: { from: () => ({
      upload: () => Promise.resolve({ data: null, error: NUR_ANSEHEN }),
      getPublicUrl: () => ({ data: { publicUrl: "" } }),
      createSignedUrl: () => Promise.resolve({ data: null, error: NUR_ANSEHEN }),
      remove: () => Promise.resolve({ data: null, error: NUR_ANSEHEN }),
      download: () => Promise.resolve({ data: null, error: NUR_ANSEHEN }),
      list: () => Promise.resolve({ data: [], error: null }),
    }) },
    auth: {
      getSession: () => Promise.resolve({ data: { session: sitzung }, error: null }),
      getUser: () => Promise.resolve({ data: { user: sitzung.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signInWithPassword: () => Promise.resolve({ data: {}, error: NUR_ANSEHEN }),
      verifyOtp: () => Promise.resolve({ data: {}, error: NUR_ANSEHEN }),
      signOut: () => Promise.resolve({ error: null }),
      refreshSession: () => Promise.resolve({ data: { session: sitzung }, error: null }),
      setSession: () => Promise.resolve({ data: { session: sitzung }, error: null }),
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
      updateUser: () => Promise.resolve({ data: {}, error: NUR_ANSEHEN }),
    },
  };
}
