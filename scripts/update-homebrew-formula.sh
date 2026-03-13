#!/usr/bin/env bash
set -euo pipefail
# Usage: ./scripts/update-homebrew-formula.sh <version> <sha-darwin-arm64> <sha-darwin-x64> <sha-linux-arm64> <sha-linux-x64>

VERSION="$1"
SHA_DARWIN_ARM64="$2"
SHA_DARWIN_X64="$3"
SHA_LINUX_ARM64="$4"
SHA_LINUX_X64="$5"

cat <<EOF
class Superghost < Formula
  desc "Plain English test cases with AI execution and instant cached replay"
  homepage "https://github.com/lacion/superghost"
  version "${VERSION}"
  license "MIT"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/lacion/superghost/releases/download/v#{version}/superghost-darwin-arm64"
      sha256 "${SHA_DARWIN_ARM64}"
    else
      url "https://github.com/lacion/superghost/releases/download/v#{version}/superghost-darwin-x64"
      sha256 "${SHA_DARWIN_X64}"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/lacion/superghost/releases/download/v#{version}/superghost-linux-arm64"
      sha256 "${SHA_LINUX_ARM64}"
    else
      url "https://github.com/lacion/superghost/releases/download/v#{version}/superghost-linux-x64"
      sha256 "${SHA_LINUX_X64}"
    end
  end

  def install
    binary_name = stable.url.split("/").last
    bin.install binary_name => "superghost"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/superghost --version")
  end
end
EOF
