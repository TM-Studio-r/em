const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a))).replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
const unb64 = s => Uint8Array.from(atob(s.replaceAll("-","+").replaceAll("_","/") + "=".repeat((4-s.length%4)%4)), c=>c.charCodeAt(0));
export async function newIdentity() {
  const kp = await crypto.subtle.generateKey({name:"ECDH", namedCurve:"P-256"}, true, ["deriveKey"]);
  const pub = await crypto.subtle.exportKey("raw", kp.publicKey);
  const priv = await crypto.subtle.exportKey("jwk", kp.privateKey);
  return {publicKey:b64(pub), privateKey:priv};
}
export async function importPrivate(jwk){ return crypto.subtle.importKey("jwk",jwk,{name:"ECDH",namedCurve:"P-256"},false,["deriveKey"]); }
export async function importPublic(b){ return crypto.subtle.importKey("raw",unb64(b),{name:"ECDH",namedCurve:"P-256"},false,[]); }
export async function encryptFor(plain, recipientPublicB64, myPrivateJwk) {
  const priv=await importPrivate(myPrivateJwk), pub=await importPublic(recipientPublicB64);
  const key=await crypto.subtle.deriveKey({name:"ECDH",public:pub},priv,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(plain));
  return JSON.stringify({v:1,iv:b64(iv),ct:b64(ct)});
}
export async function decryptFrom(payload, senderPublicB64, myPrivateJwk) {
  const p=JSON.parse(payload), priv=await importPrivate(myPrivateJwk), pub=await importPublic(senderPublicB64);
  const key=await crypto.subtle.deriveKey({name:"ECDH",public:pub},priv,{name:"AES-GCM",length:256},false,["decrypt"]);
  const pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(p.iv)},key,unb64(p.ct));
  return dec.decode(pt);
}
export function avatarLetter(name){return (name||"?").trim().charAt(0).toUpperCase() || "?";}
