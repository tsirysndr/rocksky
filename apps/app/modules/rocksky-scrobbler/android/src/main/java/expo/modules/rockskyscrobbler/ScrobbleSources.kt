package expo.modules.rockskyscrobbler

object ScrobbleSources {
  // Exact package matching: YouTube Music remains a supported music player.
  val excluded = setOf("com.google.android.youtube", "fm.atradio.app")
}
