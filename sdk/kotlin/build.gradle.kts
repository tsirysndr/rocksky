plugins {
    kotlin("jvm") version "2.0.21" apply false
    kotlin("plugin.serialization") version "2.0.21" apply false
}

subprojects {
    repositories {
        mavenCentral()
    }
}
