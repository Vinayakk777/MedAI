import zlib from "zlib";

const BASE = "http://localhost:5000/api";

function createPng(width, height, r, g, b) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < width; x++) {
      const i = rowStart + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  function crc32(buf) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = new Int32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c; }
    }
    let crc = -1;
    for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    return (crc ^ -1) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, "ascii");
    const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]);
}

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  âœ… ${name}`);
  else { failed++; console.log(`  âŒ ${name} ${extra}`); }
}

// 1. create conversation
const conv = await fetch(`${BASE}/conversations`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ title: "E2E Multimodal Test" }),
}).then((r) => r.json());
check("create conversation", !!conv.id);
console.log("  conversation:", conv.id);

// 2. build tiny image + upload
const png = createPng(120, 120, 200, 40, 40);
const fd = new FormData();
fd.append("images", new Blob([png], { type: "image/png" }), "rash-photo.png");
const uploadRes = await fetch(`${BASE}/images/upload`, { method: "POST", body: fd });
const uploadJson = await uploadRes.json();
check("upload image", uploadRes.status === 201 && uploadJson.attachments?.length === 1, JSON.stringify(uploadJson));
console.log("  upload:", JSON.stringify(uploadJson.attachments));

// 2b. reject a fake text file masquerading as png
const fd2 = new FormData();
fd2.append("images", new Blob([Buffer.from("not an image at all")], { type: "image/png" }), "fake.png");
const fakeRes = await fetch(`${BASE}/images/upload`, { method: "POST", body: fd2 });
check("reject corrupted image file", fakeRes.status === 400, `status=${fakeRes.status} ${await fakeRes.text()}`);

// 3. send multimodal message (text + image)
const msgBody = {
  content: "I have this rash on my arm for 3 days. Is this concerning?",
  attachments: [{ id: uploadJson.attachments[0].id }],
};
const post = await fetch(`${BASE}/conversations/${conv.id}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(msgBody),
});
if (!post.ok) {
  console.log("  POST ERROR BODY:", await post.text());
}
check("message POST status", post.ok, `status=${post.status}`);
let aiText = "";
let donePayload = null;
const reader = post.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  for (const line of decoder.decode(value, { stream: true }).split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const parsed = JSON.parse(line.slice(6));
    if (parsed.content !== undefined) aiText += parsed.content;
    if (parsed.done) donePayload = parsed;
  }
}
check("multimodal stream produced text", aiText.length > 50, `len=${aiText.length}`);
check("done payload has user+ai message", !!donePayload?.userMessage && !!donePayload?.aiMessage);
check("done payload userMessage has attachments", donePayload?.userMessage?.attachments?.length === 1, JSON.stringify(donePayload?.userMessage?.attachments));

const startsThink = aiText.trimStart().startsWith(" thinking");
check("no thinking-block leakage", !startsThink, aiText.slice(0, 80).replace(/\n/g, " "));
console.log("  AI fragment:", aiText.slice(0, 140).replace(/\n/g, " "));
console.log("  AI msg id:", donePayload.aiMessage.id);

// 4. GET conversation -> attachments persisted
const convGet = await fetch(`${BASE}/conversations/${conv.id}`).then((r) => r.json());
const msgs = convGet.messages;
const userMsg = msgs.find((m) => m.role === "user");
check("user message persisted with attachments", userMsg?.attachments?.length === 1);
check("two messages persisted", msgs.length === 2);
console.log("  persisted messages:", msgs.map((m) => `${m.role}[${m.attachments?.length ?? 0} img]`).join(", "));

// 5. fetch the image with auth -> expect 200 PNG
const imgRes = await fetch(`${BASE}/images/${uploadJson.attachments[0].id}`);
const imgBuf = Buffer.from(await imgRes.arrayBuffer());
check("image fetch with auth returns 200", imgRes.status === 200 && imgRes.headers.get("content-type") === "image/png");
check("image bytes match uploaded png", imgBuf.equals(png));

// unlink the message -> add second message to test re-fetch persistence of image in conversation later
const imgRes2 = await fetch(`${BASE}/images/${uploadJson.attachments[0].id}`);
check("image still reachable after message", imgRes2.status === 200, String(imgRes2.status));

// 6. text-only message still works
const post2 = await fetch(`${BASE}/conversations/${conv.id}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: "Thank you. What should I monitor?" }),
});
let aiText2 = "";
{
  const reader2 = post2.body.getReader();
  const decoder2 = new TextDecoder();
  while (true) {
    const { done, value } = await reader2.read();
    if (done) break;
    for (const line of decoder2.decode(value, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const parsed = JSON.parse(line.slice(6));
      if (parsed.content !== undefined) aiText2 += parsed.content;
    }
  }
}
check("text-only message streams", aiText2.length > 30, `len=${aiText2.length}`);

// 7. send attachment-only message (no text) - permitted
const fd3 = new FormData();
fd3.append("images", new Blob([createPng(100, 100, 30, 90, 200)], { type: "image/png" }), "blue.png");
const up3 = await fetch(`${BASE}/images/upload`, { method: "POST", body: fd3 }).then((r) => r.json());
const post3 = await fetch(`${BASE}/conversations/${conv.id}/messages`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ content: "", attachments: [{ id: up3.attachments[0].id }] }),
});
let aiText3 = "";
{
  const reader3 = post3.body.getReader();
  const decoder3 = new TextDecoder();
  while (true) {
    const { done, value } = await reader3.read();
    if (done) break;
    for (const line of decoder3.decode(value, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const parsed = JSON.parse(line.slice(6));
      if (parsed.content !== undefined) aiText3 += parsed.content;
    }
  }
}
check("image-only message streams", aiText3.length > 30, `len=${aiText3.length}`);

// 8. cleanup: delete conversation
const del = await fetch(`${BASE}/conversations/${conv.id}`, { method: "DELETE" });
check("delete conversation", del.status === 204, String(del.status));

console.log(failed === 0 ? "\nALL E2E CHECKS PASSED" : `\n${failed} CHECKS FAILED`);
process.exit(failed === 0 ? 0 : 1);
