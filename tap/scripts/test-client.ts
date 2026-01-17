#!/usr/bin/env -S deno run --allow-net

const WS_URL = Deno.env.get("WS_URL") || "ws://localhost:2481";
const SLOW_MODE = Deno.env.get("SLOW_MODE") === "true"; // Set SLOW_MODE=true to slow down

console.log(`🔌 Connecting to ${WS_URL}...`);
if (SLOW_MODE) {
  console.log(`🐌 SLOW MODE enabled - will process messages slowly`);
}

const ws = new WebSocket(WS_URL);

let messageCount = 0;
let startTime = Date.now();
let lastMessageTime = Date.now();

ws.onopen = () => {
  console.log("✅ WebSocket connection opened");
  console.log(`   readyState: ${ws.readyState}`);
  console.log(`   Time: ${new Date().toISOString()}`);

  // Send ping immediately
  console.log("📤 Sending ping...");
  ws.send("ping");

  // Send ping every 30 seconds (less frequent to not interfere with fast streaming)
  setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const now = Date.now();
      const timeSinceLastMessage = now - lastMessageTime;
      console.log(
        `📤 Sending ping... (${timeSinceLastMessage}ms since last message)`,
      );
      ws.send("ping");
    }
  }, 30000);
};

ws.onmessage = async (event) => {
  messageCount++;
  lastMessageTime = Date.now();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  try {
    const data = JSON.parse(event.data);

    // Handle batched messages (array of events)
    if (Array.isArray(data)) {
      messageCount += data.length;
      if (messageCount % 500 === 0 || messageCount <= 50) {
        console.log(
          `📨 [${elapsed}s] Batch received: ${data.length} events (total: ${messageCount})`,
        );
      }
    }
    // Handle single messages
    else if (data.type === "connected") {
      console.log(`📨 [${elapsed}s] Connection confirmed: ${data.message}`);
    } else if (data.type === "heartbeat") {
      console.log(`💓 [${elapsed}s] Heartbeat received`);
    } else if (data.type === "error") {
      console.log(`❌ [${elapsed}s] Error: ${data.message}`);
    } else {
      if (messageCount % 100 === 0 || messageCount <= 10) {
        console.log(`📨 [${elapsed}s] Message #${messageCount}:`, data);
      }
    }
  } catch {
    // Not JSON, just log as text
    console.log(`📨 [${elapsed}s] Message #${messageCount}: ${event.data}`);
  }

  if (messageCount % 500 === 0) {
    const rate = (messageCount / parseFloat(elapsed)).toFixed(2);
    console.log(
      `📊 Progress: ${messageCount} events received in ${elapsed}s (${rate} events/s)`,
    );
  }

  // In slow mode, add delay to simulate slow client
  if (SLOW_MODE && messageCount % 10 === 0) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

ws.onerror = (error) => {
  console.error("❌ WebSocket error occurred");
  console.error("   Error:", error);
  console.error("   Time:", new Date().toISOString());
  console.error("   Messages received so far:", messageCount);
};

ws.onclose = (event) => {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  const rate =
    messageCount > 0 ? (messageCount / parseFloat(elapsed)).toFixed(2) : "0";

  console.log(`\n❌ WebSocket closed after ${elapsed}s`);
  console.log(`   Code: ${event.code}`);
  console.log(`   Reason: ${event.reason || "No reason provided"}`);
  console.log(`   Clean: ${event.wasClean}`);
  console.log(`   Total messages received: ${messageCount}`);
  console.log(`   Average rate: ${rate} messages/second`);
  console.log(`   Time: ${new Date().toISOString()}`);

  if (event.code === 1006) {
    console.error(`\n⚠️  ERROR 1006: Abnormal Closure`);
    console.error(
      `   This means the connection dropped without proper close frame.`,
    );
    console.error(`   Last message was ${Date.now() - lastMessageTime}ms ago`);
    console.error(`   Possible causes:`);
    console.error(`   - Server sent messages too fast (backpressure)`);
    console.error(`   - Server crashed or panicked`);
    console.error(`   - Network timeout or interruption`);
    console.error(`   - Client couldn't keep up with message rate`);
    console.error(
      `\n   Try running with: SLOW_MODE=true deno run --allow-net scripts/test-client.ts`,
    );
  }

  Deno.exit(event.wasClean ? 0 : 1);
};

// Handle Ctrl+C gracefully
Deno.addSignalListener("SIGINT", () => {
  console.log("\n🛑 Closing connection...");
  ws.close();
});

console.log("⏳ Waiting for messages... (Press Ctrl+C to exit)");
