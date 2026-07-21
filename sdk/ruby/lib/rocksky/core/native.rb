# frozen_string_literal: true

# Resolves the native Rocksky core library (librocksky_uniffi), built from the
# shared Rust core by build-core.sh.
#
# Order of preference:
#   1. $ROCKSKY_NATIVE_LIB, if set.
#   2. librocksky_uniffi.<ext> next to this file — a local ./build-core.sh build.
require "rbconfig"

module Rocksky
  module Core
    # Raised on native-lib resolution failure or an `{"error": …}` envelope.
    class Error < StandardError; end

    module Native
      module_function

      def ext
        case RbConfig::CONFIG["host_os"]
        when /darwin/ then "dylib"
        when /mswin|mingw|cygwin/ then "dll"
        else "so"
        end
      end

      def resolve
        env = ENV["ROCKSKY_NATIVE_LIB"]
        return env if env && File.exist?(env)

        local = File.join(__dir__, "librocksky_uniffi.#{ext}")
        return local if File.exist?(local)

        raise Error, "native lib not found (run ./build-core.sh, or set ROCKSKY_NATIVE_LIB)"
      end
    end
  end
end
