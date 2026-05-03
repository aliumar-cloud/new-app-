export async function generateRSAKeyPair() {
  const keyPair = await window.crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  
  const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
  
  return { publicKeyJwk, privateKeyJwk, keyPair };
}

export async function importPublicKey(jwk: any) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"]
  );
}

export async function importPrivateKey(jwk: any) {
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"]
  );
}

export async function generateChatKey() {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function importChatKey(raw: ArrayBuffer) {
  return await window.crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptChatKey(chatKey: CryptoKey, publicKey: CryptoKey) {
  const rawKey = await window.crypto.subtle.exportKey("raw", chatKey);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    rawKey
  );
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

export async function decryptChatKey(encryptedBase64: string, privateKey: CryptoKey) {
  const binaryRule = atob(encryptedBase64);
  const encryptedBytes = new Uint8Array(binaryRule.length);
  for (let i = 0; i < binaryRule.length; i++) {
    encryptedBytes[i] = binaryRule.charCodeAt(i);
  }
  
  const rawKey = await window.crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    encryptedBytes
  );
  
  return await importChatKey(rawKey);
}

export async function encryptMessage(text: string, chatKey: CryptoKey) {
  const encoded = new TextEncoder().encode(text);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    chatKey,
    encoded
  );
  
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

export async function decryptMessage(encryptedBase64: string, chatKey: CryptoKey) {
  const binaryStr = atob(encryptedBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    chatKey,
    ciphertext
  );
  
  return new TextDecoder().decode(decrypted);
}
