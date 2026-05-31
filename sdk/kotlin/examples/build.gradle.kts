plugins {
    kotlin("jvm")
    application
}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation(project(":rocksky"))
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.9.0")
}

application {
    // Override with `-PmainClass=app.rocksky.examples.CreateScrobbleKt` for other samples.
    val example = (project.findProperty("mainClass") as String?)
        ?: "app.rocksky.examples.BasicProfileKt"
    mainClass.set(example)
}
