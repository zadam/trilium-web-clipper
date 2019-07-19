#!/usr/bin/env bash

VERSION=$(jq -r ".version" manifest.json)

ARTIFACT_NAME=trilium-web-clipper-${VERSION}
BUILD_DIR=dist/$ARTIFACT_NAME

rm -rf dist
mkdir -p "$BUILD_DIR"

cp -r icons lib options popup *.js manifest.json "$BUILD_DIR"

cd dist/"${ARTIFACT_NAME}" || exit

jq '.name = "Trilium Web Clipper"' manifest.json | sponge manifest.json

zip -r ../"${ARTIFACT_NAME}".zip *

cd ..
rm -r "${ARTIFACT_NAME}"