import { TestStorage } from "../spec/test-storage";

import {
  aesGcmDecrypt,
  ecdhDeriveSharedKey,
  generateEcKeys,
  randomBytes,
  readEcKeys,
  verifyVapidAuth,
  webPushSharedKey,
  writeEcKeys,
} from "./crypto";
import { UncompressedPublicKey } from "./crypto-types";
import { fromBufferToUrlB64, fromBufferToUtf8, fromUrlB64ToBuffer } from "./string-manipulation";

describe("randomBytes", () => {
  it("returns a buffer of the specified length", async () => {
    const buffer = await randomBytes(10);
    expect(buffer.length).toBe(10);
  });

  it("returns a buffer of random data", async () => {
    const buffer1 = await randomBytes(10);
    const buffer2 = await randomBytes(10);
    expect(buffer1).not.toEqualBuffer(buffer2);
  });
});

describe("aesGcmDecrypt", () => {
  it("decrypts", async () => {
    const key = new Uint8Array(16); // filled with 0
    const nonce = new Uint8Array(12);
    const encrypted = new Uint8Array([
      119, 237, 169, 186, 104, 152, 35, 150, 249, 60, 26, 86, 88, 100, 30, 34, 94, 60, 151, 235,
    ]);

    const decrypted = await aesGcmDecrypt(encrypted, key, nonce);
    const result = fromBufferToUtf8(decrypted);
    expect(result).toEqual("test");
  });
});

describe("generateEcKeys", () => {
  it("generates EC keys", async () => {
    const keys = await generateEcKeys();
    expect((keys.privateKey as CryptoKey).type).toEqual("private");
    expect((keys.publicKey as CryptoKey).type).toEqual("public");
    expect(keys.uncompressedPublicKey.byteLength).toBe(65);
    expect(new Uint8Array(keys.uncompressedPublicKey)[0]).toEqual(0x04);
  });
});

describe("writeEcKeys", () => {
  let storage: TestStorage;

  beforeEach(() => {
    storage = new TestStorage();
  });

  it("writes EC keys", async () => {
    const keys = await generateEcKeys();
    const privateKeyLocation = "test";
    await writeEcKeys(storage, keys, privateKeyLocation);
    const jwk = await storage.read<JsonWebKey>(privateKeyLocation);
    if (jwk === null) {
      fail("jwk is null");
    }
    expect(jwk.kty).toEqual("EC");
    expect(jwk.crv).toEqual("P-256");
    expect(jwk.d).toEqual(expect.any(String));
    expect(jwk.x).toEqual(expect.any(String));
    expect(jwk.y).toEqual(expect.any(String));
  });
});

describe("readEcKeys", () => {
  it("round trips EC keys", async () => {
    const keys = await generateEcKeys();
    const storage = new TestStorage();
    const privateKeyLocation = "test";
    await writeEcKeys(storage, keys, privateKeyLocation);
    const readKeys = await readEcKeys(storage, privateKeyLocation);

    if (readKeys === null) {
      fail("readKeys is null");
    }

    await writeEcKeys(storage, readKeys, "test2");

    expect(storage.store.get("test2") as JsonWebKey).toEqual(
      storage.store.get(privateKeyLocation) as ArrayBuffer,
    );
  });
});

describe("VerifyVapidAuth", () => {
  it("verifies a valid VAPID auth header", async () => {
    const header =
      "vapid t=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL2ZjbS5nb29nbGVhcGlzLmNvbS8iLCJleHAiOjE3MjE4MjQwMzAsInN1YiI6Im1haWx0bzp3ZWJwdXNoX29wc0BiaXR3YXJkZW4uY29tIn0.vK7-swmGq2w25HvZRMV1pggxLUx4Zso-0UMD65a6caloZ0f0I09n7kSvDyUUVjNFsUn49BtoMTXlKIRcZXbUfA, k=BPRe7l8uXCrh34pZ56BDqvAR0_c-88U_S8k5IMGBvqrN7-VF6jaZTcEXDZaKjThSZ7qicmeexG66jpY2HdPkCdA";
    const publicKey =
      "BPRe7l8uXCrh34pZ56BDqvAR0_c-88U_S8k5IMGBvqrN7-VF6jaZTcEXDZaKjThSZ7qicmeexG66jpY2HdPkCdA";
    await expect(verifyVapidAuth(header, publicKey)).resolves.toEqual(true);
  });
});

describe("ecdhDeriveSharedKey", () => {
  it("derives a shared key", async () => {
    const storage = new TestStorage();
    storage.store.set("privateKey", {
      key_ops: ["deriveKey", "deriveBits"],
      ext: true,
      kty: "EC",
      x: "84p2j3B4ulNBhJmjcrIsJl0pax3MaYYk6eqk1HYsN_Y",
      y: "cZCKmCjy4grDsBrGXkpUikHv2VZmen8SRmclj244OtY",
      crv: "P-256",
      d: "EZdq8BiFjHbl6U6F0iK0yF8nXvw8-6mGjto9E_2fpwo",
    });
    const publicKey = new Uint8Array([
      4, 212, 7, 72, 118, 252, 190, 220, 245, 154, 52, 177, 252, 15, 23, 133, 156, 239, 180, 143,
      238, 35, 90, 17, 113, 37, 51, 202, 227, 65, 216, 90, 65, 164, 147, 8, 238, 157, 148, 51, 109,
      61, 222, 177, 105, 70, 150, 45, 212, 238, 129, 62, 121, 29, 29, 181, 81, 11, 242, 181, 219,
      56, 159, 236, 125,
    ]);
    const localKeys = await readEcKeys(storage, "privateKey");
    if (localKeys === null) {
      fail("localKeys is null");
    }
    const secret = new Uint8Array(16);
    // TODO: convert to string
    const senderKey = fromBufferToUrlB64(publicKey.buffer);
    const salt = fromBufferToUrlB64(secret.buffer); // In practice this is a random value, not linked to secret

    const sharedKeys = await ecdhDeriveSharedKey(localKeys, secret, senderKey, salt);
    expect(sharedKeys.contentEncryptionKey).toEqualBuffer(
      new Uint8Array([48, 0, 223, 95, 172, 79, 172, 31, 184, 11, 61, 5, 68, 120, 86, 62]),
    );
    expect(sharedKeys.nonce).toEqualBuffer(
      new Uint8Array([201, 196, 98, 239, 12, 215, 67, 233, 119, 119, 11, 191]),
    );
  });
});

describe("webPushSharedKey", () => {
  // https://datatracker.ietf.org/doc/html/rfc8291#section-5
  it("recreates the RFC example", async () => {
    const authenticationSecret = "BTBZMqHH6r4Tts7J_aSIgg";
    const receiverKeys = await importKeys(
      "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
      "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
    );
    const senderKeys = await importKeys(
      "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
      "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
    );
    const contentStream =
      "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN";
    const result = await webPushSharedKey(
      { keys: receiverKeys, secret: fromUrlB64ToBuffer(authenticationSecret) },
      {
        publicKey: fromBufferToUrlB64(senderKeys.uncompressedPublicKey),
        content: fromUrlB64ToBuffer(contentStream),
      },
    );

    expect(result.contentEncryptionKey).toEqualBuffer(fromUrlB64ToBuffer("oIhVW04MRdy2XN9CiKLxTg"));
    expect(result.nonce).toEqualBuffer(fromUrlB64ToBuffer("4h_95klXJ5E_qnoN"));
  });
});

async function importKeys(b64urlPrivateKey: string, b64urlPublicKey: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const subtle = require("crypto").webcrypto.subtle;

  // const priv = fromUrlB64ToBuffer(b64urlPrivateKey)
  const pubPoints = fromUrlB64ToBuffer(b64urlPublicKey);
  const pubX = fromBufferToUrlB64(pubPoints.slice(1, 33));
  const pubY = fromBufferToUrlB64(pubPoints.slice(33, 65));

  const keyData = {
    key_ops: ["deriveKey", "deriveBits"],
    ext: true,
    kty: "EC",
    x: pubX,
    y: pubY,
    crv: "P-256",
    d: b64urlPrivateKey,
  } as JsonWebKey;

  const privateKey = await subtle.importKey(
    "jwk",
    keyData,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    ["deriveKey", "deriveBits"],
  );

  // Delete private data from the JWK
  delete keyData.d;
  keyData.key_ops = [];

  const publicKey = await subtle.importKey(
    "jwk",
    keyData,
    {
      name: "ECDH",
      namedCurve: "P-256",
    },
    true,
    [],
  );
  const keys = {
    publicKey,
    privateKey,
  };
  return {
    ...keys,
    uncompressedPublicKey: (await subtle.exportKey("raw", publicKey)) as UncompressedPublicKey,
  };
}
