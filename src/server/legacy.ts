import { Hono } from "hono";
import { canonicalOrigin } from "../shared/origins";

const app = new Hono();
app.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "no-referrer");
  c.header(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'self'; frame-ancestors ${canonicalOrigin}`,
  );
  await next();
});
app.get("/migrate", (c) =>
  c.html(
    '<!doctype html><html lang="ja"><meta charset="utf-8"><title>Arkhive データ移行</title><script src="/migration.js" defer></script></html>',
  ),
);
app.get("/migration.js", (c) => {
  c.header("Content-Type", "text/javascript; charset=utf-8");
  return c.body(`window.addEventListener('message',function(event){
    if(event.origin!==${JSON.stringify(canonicalOrigin)}||event.source!==parent||event.data?.type!=='arkhive:request-legacy-drafts'||typeof event.data.nonce!=='string'||event.data.nonce.length>100)return;
    try{parent.postMessage({type:'arkhive:legacy-drafts',nonce:event.data.nonce,raw:localStorage.getItem('mythos-notebook-v1')},${JSON.stringify(canonicalOrigin)});}catch{}
  });
  if(parent===window){
    var heading=document.createElement('h1');heading.textContent='旧URLの端末保存データ';document.body.append(heading);
    var note=document.createElement('p');note.textContent='JSONを書き出し、新URLの「読み込み」から追加できます。';document.body.append(note);
    try{
      var records=JSON.parse(localStorage.getItem('mythos-notebook-v1')||'[]');
      records.forEach(function(record){
        var link=document.createElement('a');link.textContent=(record.name||'名前のない探索者')+' — JSON出力';
        link.href=URL.createObjectURL(new Blob([JSON.stringify(record,null,2)],{type:'application/json'}));
        link.download=(record.name||'探索者')+'.json';var p=document.createElement('p');p.append(link);document.body.append(p);
      });
      if(!records.length){var empty=document.createElement('p');empty.textContent='このブラウザーに保存された探索者はありません。';document.body.append(empty);}
    }catch{}
    var home=document.createElement('a');home.textContent='Arkhiveを開く';home.href=${JSON.stringify(canonicalOrigin)};document.body.append(home);
  }`);
});
app.all("*", (c) => {
  const target = new URL(c.req.url);
  target.host = new URL(canonicalOrigin).host;
  target.protocol = "https:";
  return c.redirect(target.toString(), 308);
});
export default app;
