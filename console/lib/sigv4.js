// SigV4 签名的 POST 请求(浏览器,用全局 window.CryptoJS)。返回解析后的 JSON。
// 用于 KVS 控制面/归档媒体调用(替代跑不动的 @aws-sdk esm 版)。
export async function sigv4PostJson(creds, { host, path, service, region, body, endpoint }) {
  const C = window.CryptoJS;
  const hmac = (key, data) => C.HmacSHA256(data, key); // CryptoJS: (message, key)
  const sha = (d) => C.SHA256(d).toString(C.enc.Hex);
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amz.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const payload = JSON.stringify(body);

  const headers = { 'content-type': 'application/x-amz-json-1.1', 'host': host, 'x-amz-date': amz };
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;
  const signed = Object.keys(headers).sort();
  const signedHeaders = signed.join(';');
  const canonHeaders = signed.map((k) => k + ':' + headers[k] + '\n').join('');
  const canon = `POST\n${path}\n\n${canonHeaders}\n${signedHeaders}\n${sha(payload)}`;
  const sts = `AWS4-HMAC-SHA256\n${amz}\n${scope}\n${sha(canon)}`;
  const kSigning = hmac(hmac(hmac(hmac('AWS4' + creds.secretAccessKey, date), region), service), 'aws4_request');
  const sig = hmac(sts, kSigning).toString(C.enc.Hex);
  const auth = `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`;

  const h = { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Date': amz, 'Authorization': auth };
  if (creds.sessionToken) h['X-Amz-Security-Token'] = creds.sessionToken;
  const r = await fetch((endpoint || `https://${host}`) + path, { method: 'POST', headers: h, body: payload });
  const text = await r.text();
  if (!r.ok) throw new Error(`${r.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}
