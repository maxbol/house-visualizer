{
  description = "House visualizer - PDF floor plan to three.js 3D scene";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_22        # validator scripts, npm for vendoring three.js
            poppler-utils    # pdftoppm: rasterize the floor plan PDF for tracing reference
            python3          # quick static file server
            chromium         # headless screenshots to verify the rendered scene
            jq               # inspecting plan JSON
          ];
        };
      });
}
