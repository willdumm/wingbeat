{
  description = "Wingbeat — Cloudflare Worker dev shell";

  nixConfig = {
    extra-substituters = [ "https://wrangler.cachix.org" ];
    extra-trusted-public-keys = [ "wrangler.cachix.org-1:N/FIcG2qBQcolSpklb2IMDbsfjZKWg+ctxx0mSMXdSs=" ];
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    emrldnix-wrangler = {
      url = "github:emrldnix/wrangler";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, emrldnix-wrangler }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_20                                      # node + npm
            emrldnix-wrangler.packages.${system}.wrangler      # prebuilt workerd, NixOS-patched
            pkgs.zsh
            pkgs.gh
            pkgs.hugo                                           # docs site (site/)
            pkgs.playwright-driver.browsers                    # nix-built chromium for playwright (browser debugging)
          ];
          shellHook = ''
            # Only exec zsh for interactive shells; leave --command invocations alone
            if [ -z "$NIX_DEVELOP_COMMAND" ] && [ -t 0 ]; then
              exec ${pkgs.zsh}/bin/zsh
            fi
          '';
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1";
        };
      });
}
