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

        rocksky-cli = pkgs.buildNpmPackage {
          pname = "rocksky-cli";
          version = "0.3.4";

          src = ./.;

          npmDeps = pkgs.importNpmLock { npmRoot = ./.; };
          npmConfigHook = pkgs.importNpmLock.npmConfigHook;

          nodejs = pkgs.nodejs_22;
        };
      in {
        packages.default = rocksky-cli;

        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_22
            rocksky-cli
          ];
        };
      }
    );
}
