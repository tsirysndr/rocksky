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

        # On Linux the runtime needs ALSA (rockbox-ffi audio output) and D-Bus
        # (MPRIS via mpris-service/dbus-next). No-ops on macOS.
        linuxDeps = pkgs.lib.optionals pkgs.stdenv.isLinux [
          pkgs.alsa-lib
          pkgs.dbus
        ];

        rocksky-cli = pkgs.buildNpmPackage {
          pname = "rocksky-cli";
          version = "0.4.1";

          src = ./.;

          npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
          npmConfigHook = pkgs.importNpmLock.npmConfigHook;

          nodejs = pkgs.nodejs_22;

          buildInputs = linuxDeps;
          nativeBuildInputs = pkgs.lib.optionals pkgs.stdenv.isLinux [
            pkgs.makeWrapper
          ];

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
            rocksky-cli
          ];
          buildInputs = linuxDeps;
        };
      }
    );
}
