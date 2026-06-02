import com.vanniktech.maven.publish.JavaLibrary
import com.vanniktech.maven.publish.JavadocJar
import com.vanniktech.maven.publish.SonatypeHost

plugins {
    kotlin("jvm")
    kotlin("plugin.serialization")
    `java-library`
    id("com.vanniktech.maven.publish") version "0.30.0"
}

group = "app.rocksky"
version = "0.2.0"

kotlin {
    jvmToolchain(17)
    explicitApi()
}

val ktorVersion = "2.3.12"
val coroutinesVersion = "1.9.0"
val serializationVersion = "1.7.3"

dependencies {
    api("org.jetbrains.kotlinx:kotlinx-coroutines-core:$coroutinesVersion")
    api("org.jetbrains.kotlinx:kotlinx-serialization-json:$serializationVersion")

    api("io.ktor:ktor-client-core:$ktorVersion")
    api("io.ktor:ktor-client-content-negotiation:$ktorVersion")
    api("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")
    implementation("io.ktor:ktor-client-cio:$ktorVersion")

    testImplementation(kotlin("test-junit5"))
    testImplementation("org.junit.jupiter:junit-jupiter:5.10.2")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher:1.10.2")
    testImplementation("io.ktor:ktor-client-mock:$ktorVersion")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:$coroutinesVersion")
}

tasks.test {
    useJUnitPlatform()
    testLogging {
        events("passed", "skipped", "failed")
        showStandardStreams = false
    }
}

mavenPublishing {
    publishToMavenCentral(SonatypeHost.CENTRAL_PORTAL, automaticRelease = true)
    signAllPublications()

    coordinates("app.rocksky", "rocksky-kotlin", project.version.toString())

    configure(JavaLibrary(javadocJar = JavadocJar.Empty(), sourcesJar = true))

    pom {
        name.set("Rocksky Kotlin SDK")
        description.set("Coroutine-based Kotlin SDK for the Rocksky XRPC API")
        url.set("https://rocksky.app")
        inceptionYear.set("2025")
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
        issueManagement {
            system.set("GitHub")
            url.set("https://github.com/tsirysndr/rocksky/issues")
        }
    }
}
