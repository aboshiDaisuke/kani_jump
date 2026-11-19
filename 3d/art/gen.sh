#!/bin/zsh
# Codex で 2D 画像素材を生成する。 使い方: ./art/gen.sh <name> <prompt>
# 環境変数 REF に画像のパスを入れると、参考画像として Codex に渡す
cd "${0:A:h}/.."
name=$1; shift
ref_args=()
[[ -n "$REF" ]] && ref_args=(-i "$REF")
# -i は複数の値を受け取るので、プロンプトより後ろに置く
codex exec --skip-git-repo-check -s workspace-write -C "$PWD" \
  "Use your image generation tool to create ONE image, then copy the generated PNG file to ./art/${name}.png (overwrite if it exists). Do not modify any other file. Image spec: $*" \
  "${ref_args[@]}" < /dev/null > "art/${name}.log" 2>&1
echo "exit=$? ${name}"
ls -la "art/${name}.png" 2>/dev/null
