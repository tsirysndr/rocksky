#!/usr/bin/env -S deno run --allow-net

const WS_URL = Deno.env.get("WS_URL") || "ws://localhost:2481";

console.log(`🔌 Connecting to ${WS_URL}...`);

const ws = new WebSocket(WS_URL);

let messageCount = 0;
let startTime = Date.now();

ws.onopen = () => {
  console.log("✅ WebSocket connection opened");
  console.log(`   readyState: ${ws.readyState}`);

  // Send ping immediately
  console.log("📤 Sending ping...");
  ws.send("ping");

  // Send ping every 5 seconds
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      console.log("📤 Sending ping...");
      ws.send("ping");
    }
  }, 5000);
};

ws.onmessage = (event) => {
  messageCount++;
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  try {
    const data = JSON.parse(event.data);
    if (data.type === "connected") {
      console.log(`📨 [${elapsed}s] Connection confirmed: ${data.message}`);
    } else if (data.type === "error") {
      console.log(`❌ [${elapsed}s] Error: ${data.message}`);
    } else {
      console.log(`📨 [${elapsed}s] Message #${messageCount}:`, data);
    }
  } catch {
    // Not JSON, just log as text
    console.log(`📨 [${elapsed}s] Message #${messageCount}: ${event.data}`);
  }

  if (messageCount % 100 === 0) {
    console.log(`📊 Progress: ${messageCount} messages received in ${elapsed}s`);
  }
};

ws.onerror = (error) => {
  console.error("❌ WebSocket error:", error);
};

ws.onclose = (event) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`❌ WebSocket closed after ${elapsed}s`);
  console.log(`   Code: ${event.code}`);
  console.log(`   Reason: ${event.reason || "No reason provided"}`);
  console.log(`   Clean: ${event.wasClean}`);
  console.log(`   Total messages received: ${messageCount}`);
  Deno.exit(event.wasClean ? 0 : 1);
};

// Handle Ctrl+C gracefully
Deno.addSignalListener("SIGINT", () => {
  console.log("\n🛑 Closing connection...");
  ws.close();
});

console.log("⏳ Waiting for messages... (Press Ctrl+C to exit)");
