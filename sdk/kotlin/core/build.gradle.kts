// rocksky-kotlin-core — native-core bindings (UniFFI over the shared Rust core,
// rocksky-uniffi). This is the write + dedup side (AT Protocol PDS writes); the
// sibling `:rocksky` module is the ktor HTTP read side. No `explicitApi()` here:
// the generated UniFFI code doesn't declare explicit visibility.
plugins {
    kotlin("jvm")
    `java-library`
}

group = "app.rocksky"
version = "0.1.0"

kotlin {
    jvmToolchain(17)
}

dependencies {
    // UniFFI's Kotlin bindings load the native library via JNA.
    api("net.java.dev.jna:jna:5.15.0")

    testImplementation(kotlin("test-junit5"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.10.2")
}

tasks.test {
    useJUnitPlatform()
    // The native lib is loaded via JNA; allow restricted native access on JDK 24+.
    jvmArgs("--enable-native-access=ALL-UNNAMED")
}
