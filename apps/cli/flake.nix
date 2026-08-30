{
  description = "A Nix Flake for @rocksky/cli";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/release-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # On Linux the runtime needs ALSA (rockbox-ffi audio output), D-Bus
        # (MPRIS via mpris-service/dbus-next) and PC/SC (@pokusew/pcsclite —
        # the nfc-pcsc card-reader addon compiles against winscard.h and
        # dlopens libpcsclite). No-ops on macOS, where PC/SC is a system
        # framework.
        linuxDeps = pkgs.lib.optionals pkgs.stdenv.isLinux [
          pkgs.alsa-lib
          pkgs.dbus
          pkgs.pcsclite
        ];

        rocksky-cli = pkgs.buildNpmPackage {
          pname = "rocksky-cli";
          version = "0.10.3";

          src = ./.;

          npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
          npmConfigHook = pkgs.importNpmLock.npmConfigHook;

          nodejs = pkgs.nodejs_22;

          buildInputs = linuxDeps;
          # bun runs the build script (`bun build …`).
          nativeBuildInputs = [ pkgs.bun ]
            ++ pkgs.lib.optionals pkgs.stdenv.isLinux [ pkgs.makeWrapper ];

          # @pokusew/pcsclite's binding.gyp does `#include <winscard.h>` and
          # hardcodes /usr/include/PCSC, which doesn't exist in the sandbox —
          # and pcsclite ships its headers under include/PCSC/, so buildInputs
          # alone doesn't surface them. Hand the subdirectory to the compiler;
          # linking (-lpcsclite) is satisfied by pcsclite in buildInputs.
          env.NIX_CFLAGS_COMPILE = pkgs.lib.optionalString pkgs.stdenv.isLinux
            "-I${pkgs.lib.getDev pkgs.pcsclite}/include/PCSC";

          # Make the ALSA / D-Bus shared libraries discoverable at runtime so the
          # native rockbox-ffi library and dbus-next can dlopen them.
          postInstall = pkgs.lib.optionalString pkgs.stdenv.isLinux ''
            wrapProgram $out/bin/rocksky \
              --prefix LD_LIBRARY_PATH : ${pkgs.lib.makeLibraryPath linuxDeps}
          '';

          meta.mainProgram = "rocksky";
        };
      in {
        packages.default = rocksky-cli;

        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_22
            pkgs.bun
            rocksky-cli
          ];
          buildInputs = linuxDeps;
        };
      }
    );
}
