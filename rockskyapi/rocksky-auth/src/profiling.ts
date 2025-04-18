import Pyroscope from "@pyroscope/nodejs";

Pyroscope.init({
  serverAddress: "http://localhost:4040",
  appName: "rocksky-api",
  // Enable CPU time collection for wall profiles
  // This is required for CPU profiling functionality
  // wall: {
  //   collectCpuTime: true
  // }
});

Pyroscope.start();
