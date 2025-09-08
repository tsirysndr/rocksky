{
  description = "A Nix-flake-based Rust development environment";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/release-25.05";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem
    (system: let
      pkgs = import nixpkgs {
        inherit system;
      };
    in {
      devShells.default = pkgs.mkShell {
         buildInputs = [
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
         ];
       };
    });
}
