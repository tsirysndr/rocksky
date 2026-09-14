{
  description = "A Nix-flake-based Rust development environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/release-25.05";
    flake-utils.url = "github:numtide/flake-utils";

    rocksky-cli.url = "path:./apps/cli";
    rocksky-cli.inputs.nixpkgs.follows = "nixpkgs";
    rocksky-cli.inputs.flake-utils.follows = "flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    rocksky-cli,
  }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        lib = pkgs.lib;
        fs = lib.fileset;

        # crates/rocksky-sdk inherits authors/edition/… from the repo-root
        # workspace manifest, but the real one lists every crates/* member,
        # which would drag the whole workspace into these builds. Both Rust
        # packages get this minimal stand-in instead.
        rootWorkspace = pkgs.writeText "Cargo.toml" ''
          [workspace]
          members = ["crates/rocksky-sdk"]
          resolver = "2"

          [workspace.package]
          authors = ["Tsiry Sandratraina <tsiry.sndr@rocksky.app"]
          edition = "2021"
          license = "MPL-2.0"
          repository = "https://github.com/tsirysndr/rocksky"
        '';

        playerd = pkgs.rustPlatform.buildRustPackage {
          pname = "playerd";
          version = "0.3.0";

          src = fs.toSource {
            root = ./.;
            fileset = fs.difference
              (fs.unions [
                ./playerd
                ./crates/rocksky-sdk
              ])
              (fs.unions [
                ./playerd/npm
                (fs.maybeMissing ./playerd/target)
              ]);
          };

          cargoRoot = "playerd";
          buildAndTestSubdir = "playerd";
          cargoLock.lockFile = ./playerd/Cargo.lock;

          postPatch = ''
            cp ${rootWorkspace} Cargo.toml
          '';

          nativeBuildInputs = [ pkgs.pkg-config ];
          # rockbox-playback's ALSA output; everything else (rustls, bundled
          # sqlite, symphonia) is vendored or pure Rust.
          buildInputs = lib.optionals pkgs.stdenv.isLinux [ pkgs.alsa-lib ];

          doCheck = false;

          meta.mainProgram = "playerd";
        };

        # rockskyd lives in the real root cargo workspace, so it builds from
        # the actual root manifest + lockfile; cargo has to load every
        # crates/* member manifest, hence the whole crates/ tree, but only
        # rockskyd's dependency graph is compiled (-p).
        rockskyd = pkgs.rustPlatform.buildRustPackage {
          pname = "rockskyd";
          version = "0.1.0";

          src = fs.toSource {
            root = ./.;
            fileset = fs.unions [
              ./Cargo.toml
              ./Cargo.lock
              ./crates
            ];
          };

          cargoLock.lockFile = ./Cargo.lock;
          cargoBuildFlags = [ "-p" "rockskyd" ];

          nativeBuildInputs = [ pkgs.pkg-config ];

          doCheck = false;

          meta.mainProgram = "rockskyd";
        };

        # Keep in sync with "workspaces" in the root package.json: bun needs
        # every member manifest to validate the frozen lockfile.
        workspaceManifests = fs.unions [
          ./package.json
          ./bun.lock
          ./apps/api/package.json
          ./apps/app-proxy/package.json
          ./apps/doc/package.json
          ./apps/spotify-proxy/package.json
          ./apps/uploads/package.json
          ./apps/web/package.json
          ./apps/web-mobile/package.json
          ./apps/xata-proxy/package.json
          ./crates/analysis-node/package.json
          ./desktop/package.json
          ./sdk/typescript/package.json
        ];

        # NAR hash of the tree `bun install` leaves behind. Tied to bun.lock
        # AND the nixpkgs bun version (hoisting may change across releases);
        # per platform because bun only installs the native optional deps for
        # the current one. To (re)compute on a new platform or after a lockfile
        # change: build .#rocksky-desktop-node-modules with lib.fakeHash here
        # and copy the hash from the mismatch error.
        bunNodeModulesHash =
          {
            aarch64-darwin = "sha256-vROy9gGovfiRIEKESvx2Hk4DgGkvcoZCF10we1X0HZw=";
          }
          .${system} or lib.fakeHash;

        desktopNodeModules = pkgs.stdenvNoCC.mkDerivation {
          pname = "rocksky-desktop-node-modules";
          version = "0.1.0";

          src = fs.toSource {
            root = ./.;
            fileset = workspaceManifests;
          };

          nativeBuildInputs = [ pkgs.bun ];

          dontConfigure = true;
          # Shebang patching would splice store paths into the fixed-output
          # tree and break the hash.
          dontFixup = true;

          buildPhase = ''
            runHook preBuild
            export HOME=$TMPDIR
            export BUN_INSTALL_CACHE_DIR=$TMPDIR/bun-install-cache
            bun install --frozen-lockfile --ignore-scripts --no-progress
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            cp -R . $out
            runHook postInstall
          '';

          outputHashAlgo = "sha256";
          outputHashMode = "recursive";
          outputHash = bunNodeModulesHash;
        };

        desktopFrontend = pkgs.stdenvNoCC.mkDerivation {
          pname = "rocksky-desktop-frontend";
          version = "0.1.0";

          src = fs.toSource {
            root = ./.;
            fileset = fs.unions [
              ./package.json
              ./bun.lock
              (fs.difference ./sdk/typescript (fs.unions [
                (fs.maybeMissing ./sdk/typescript/node_modules)
                (fs.maybeMissing ./sdk/typescript/dist)
              ]))
              # .env is the local dev config; --mode prod reads .env.prod but
              # vite would still layer a stray .env on top of it.
              (fs.difference ./desktop (fs.unions [
                ./desktop/src-tauri
                (fs.maybeMissing ./desktop/node_modules)
                (fs.maybeMissing ./desktop/dist)
                (fs.maybeMissing ./desktop/.env)
              ]))
            ];
          };

          nativeBuildInputs = [
            pkgs.bun
            # tsc/vite run through their #!/usr/bin/env node shebangs.
            pkgs.nodejs_22
          ];

          configurePhase = ''
            runHook preConfigure
            for dir in node_modules desktop/node_modules sdk/typescript/node_modules; do
              if [ -e ${desktopNodeModules}/$dir ]; then
                cp -R ${desktopNodeModules}/$dir $dir
                find $dir -type d -exec chmod u+w {} +
              fi
            done
            runHook postConfigure
          '';

          buildPhase = ''
            runHook preBuild
            export HOME=$TMPDIR
            # @rocksky/sdk resolves to its dist/, so build it first.
            (cd sdk/typescript && bun run build)
            (cd desktop && bun run build:prod)
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            cp -R desktop/dist $out
            runHook postInstall
          '';
        };

        rocksky-desktop = pkgs.rustPlatform.buildRustPackage {
          pname = "rocksky-desktop";
          version = "0.1.0";

          src = fs.toSource {
            root = ./.;
            fileset = fs.unions [
              (fs.difference ./desktop/src-tauri (fs.unions [
                (fs.maybeMissing ./desktop/src-tauri/target)
                (fs.maybeMissing ./desktop/src-tauri/gen)
              ]))
              ./crates/rocksky-sdk
            ];
          };

          cargoRoot = "desktop/src-tauri";
          buildAndTestSubdir = "desktop/src-tauri";
          cargoLock.lockFile = ./desktop/src-tauri/Cargo.lock;

          postPatch = ''
            cp ${rootWorkspace} Cargo.toml

            # The frontend is prebuilt into frontendDist (../dist); drop the
            # beforeBuildCommand so `cargo tauri build` doesn't invoke bun.
            jq '.build.beforeBuildCommand = ""' desktop/src-tauri/tauri.conf.json \
              > tauri.conf.json.patched
            mv tauri.conf.json.patched desktop/src-tauri/tauri.conf.json

            mkdir -p desktop/dist
            cp -R ${desktopFrontend}/. desktop/dist/
          '';

          nativeBuildInputs =
            [
              pkgs.cargo-tauri.hook
              pkgs.jq
              pkgs.pkg-config
            ]
            ++ lib.optionals pkgs.stdenv.isLinux [
              pkgs.wrapGAppsHook4
            ];

          buildInputs = lib.optionals pkgs.stdenv.isLinux [
            pkgs.alsa-lib
            pkgs.glib-networking
            pkgs.gtk3
            pkgs.libsoup_3
            pkgs.openssl
            pkgs.pcsclite
            pkgs.webkitgtk_4_1
          ];

          doCheck = false;

          # On darwin the tauri hook installs Rocksky.app under
          # $out/Applications; also expose the binary on $out/bin.
          postInstall = lib.optionalString pkgs.stdenv.isDarwin ''
            mkdir -p $out/bin
            for exe in $out/Applications/*.app/Contents/MacOS/*; do
              ln -s "$exe" "$out/bin/$(basename "$exe")"
            done
          '';
        };
      in {
        packages = {
          inherit playerd rocksky-desktop rockskyd;
          rocksky-desktop-frontend = desktopFrontend;
          rocksky-desktop-node-modules = desktopNodeModules;
        };

        devShells.default = pkgs.mkShell {
          buildInputs =
            [
              pkgs.cargo
              pkgs.rustc
              pkgs.rustfmt
              pkgs.rustPackages.clippy
              pkgs.bun
              pkgs.nodejs
              pkgs.duckdb
              pkgs.turbo
              pkgs.git
              pkgs.wasm-pack
              pkgs.gcc
              pkgs.gnumake
              pkgs.pkg-config
              pkgs.readline
              pkgs.flex
              pkgs.bison
              pkgs.binutils
              pkgs.clang
              rocksky-cli.packages.${system}.default
            ]
            ++ lib.optionals pkgs.stdenv.isLinux [
              pkgs.glibc.dev
            ]
            ++ lib.optionals pkgs.stdenv.isDarwin [
              pkgs.libiconv
            ];
        };
      });
}
