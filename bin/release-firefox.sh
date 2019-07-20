#!/usr/bin/env bash

WEB_EXT_ID="{1410742d-b377-40e7-a9db-63dc9c6ec99c}"

ARTIFACT_NAME=trilium-web-clipper-firefox
BUILD_DIR=dist/$ARTIFACT_NAME

rm -rf dist
mkdir -p "$BUILD_DIR"

cp -r icons lib options popup *.js manifest.json "$BUILD_DIR"

cd dist/"${ARTIFACT_NAME}" || exit

jq '.name = "Trilium Web Clipper"' manifest.json | sponge manifest.json

web-ext sign --id ${WEB_EXT_ID} --artifacts-dir ../ --channel=listed

cd ..
rm -r "${ARTIFACT_NAME}"