package expo.modules.rockskycast

data class ByteRange(val start: Long, val end: Long) {
  val length: Long get() = end - start + 1
  companion object {
    // Single ranges, including suffix/open-ended ranges. Reject invalid or multi-range requests.
    fun parse(header: String, size: Long): ByteRange? {
      if (size <= 0) return null
      val match = Regex("bytes=(\\d*)-(\\d*)").matchEntire(header.trim()) ?: return null
      val first = match.groupValues[1]
      val last = match.groupValues[2]
      if (first.isEmpty()) {
        val suffix = last.toLongOrNull()?.takeIf { it > 0 } ?: return null
        return ByteRange((size - suffix).coerceAtLeast(0), size - 1)
      }
      val start = first.toLongOrNull()?.takeIf { it < size } ?: return null
      val end = if (last.isEmpty()) size - 1 else last.toLongOrNull()?.coerceAtMost(size - 1) ?: return null
      return if (end >= start) ByteRange(start, end) else null
    }
  }
}
