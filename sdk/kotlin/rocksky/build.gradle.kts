// rocksky-kotlin-core — native-core bindings (UniFFI over the shared Rust core,
// rocksky-uniffi). This is the write + dedup side (AT Protocol PDS writes); the
// sibling `:rocksky` module is the ktor HTTP read side. No `explicitApi()` here:
// the generated UniFFI code doesn't declare explicit visibility.
//
// Unlike the other SDKs (which fetch the native lib on first load), the published
// jar BUNDLES the per-triple libs under the JNA resource prefixes
// (core/src/main/resources/<os>-<arch>/librocksky_uniffi.*) — staged by
// sdk/scripts/publish-kotlin.sh from the release artifacts before publishing.
import com.vanniktech.maven.publish.JavaLibrary
import com.vanniktech.maven.publish.JavadocJar
import com.vanniktech.maven.publish.SonatypeHost

plugins {
    kotlin("jvm")
    `java-library`
    id("com.vanniktech.maven.publish") version "0.30.0"
}

group = "app.rocksky"
version = "0.7.0"

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

mavenPublishing {
    publishToMavenCentral(SonatypeHost.CENTRAL_PORTAL, automaticRelease = true)
    signAllPublications()

    coordinates("app.rocksky", "rocksky-kotlin", project.version.toString())

    configure(JavaLibrary(javadocJar = JavadocJar.Empty(), sourcesJar = true))

    pom {
        name.set("Rocksky Kotlin SDK — native core")
        description.set("UniFFI bindings to the shared Rust core: AT Protocol PDS writes + identity hashes")
        url.set("https://rocksky.app")
        inceptionYear.set("2026")
        licenses {
            license {
                name.set("MIT License")
                url.set("https://opensource.org/licenses/MIT")
                distribution.set("repo")
            }
        }
        developers {
            developer {
                id.set("tsirysndr")
                name.set("Tsiry Sandratraina")
                email.set("tsiry.sndr@rocksky.app")
                url.set("https://github.com/tsirysndr")
            }
        }
        scm {
            url.set("https://github.com/tsirysndr/rocksky")
            connection.set("scm:git:git://github.com/tsirysndr/rocksky.git")
            developerConnection.set("scm:git:ssh://git@github.com/tsirysndr/rocksky.git")
        }
    }
}
