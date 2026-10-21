# !/bin/bash

TAG_CURRENT=$(git describe --abbrev=0 --tags HEAD)

echo "Test changelog output for latest tag:"
echo "------------------------------------"
sed -n "/## $TAG_CURRENT/,/##/p" CHANGELOG.md | grep -v "^##" | grep .
echo "------------------------------------"
