# Expo reads these annotations through Kotlin reflection when converting JS
# objects to Records (including every expo-image source and contentPosition).
# Keeping only Record implementations is insufficient: R8 can assume annotation
# instances never exist and replace PropertyDescriptor.fieldAnnotation with null.
-keep @interface expo.modules.kotlin.records.** { *; }
