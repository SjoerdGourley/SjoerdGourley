#!/usr/bin/env bash
set -euo pipefail
#
# Reinstall the claude-seo plugin scoped to THIS repo only, never into ~/.claude.
# .claude/ is gitignored, so a fresh clone has no /seo command until this runs.
# See the "SEO status" section of CLAUDE.md.
#

REPO_TAG="${CLAUDE_SEO_TAG:-v2.3.0}"
SRC="$(mktemp -d)/claude-seo"
git clone --depth 1 --branch "${REPO_TAG}" https://github.com/AgriciDaniel/claude-seo.git "${SRC}"
trap 'rm -rf -- "$(dirname "${SRC}")"' EXIT
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.claude"
SKILLS="${ROOT}/skills"
SKILL_DIR="${SKILLS}/seo"
AGENT_DIR="${ROOT}/agents"

mkdir -p "${SKILL_DIR}" "${AGENT_DIR}"

echo "-> skills"
for skill_dir in "${SRC}/skills"/*/; do
    name=$(basename "${skill_dir}")
    mkdir -p "${SKILLS}/${name}"
    cp -R "${skill_dir}." "${SKILLS}/${name}/"
done

for d in schema data pdf scripts hooks; do
    [ -d "${SRC}/${d}" ] || continue
    mkdir -p "${SKILL_DIR}/${d}"
    cp -R "${SRC}/${d}/." "${SKILL_DIR}/${d}/"
done
chmod +x "${SKILL_DIR}/scripts/claude-seo" 2>/dev/null || true
chmod +x "${SKILL_DIR}"/hooks/*.sh "${SKILL_DIR}"/hooks/*.py 2>/dev/null || true

echo "-> agents"
cp "${SRC}/agents/"*.md "${AGENT_DIR}/" 2>/dev/null || true

echo "-> extensions"
for ext_dir in "${SRC}/extensions"/*/; do
    [ -d "${ext_dir}" ] || continue
    ext=$(basename "${ext_dir}")
    if [ -d "${ext_dir}skills" ]; then
        for s in "${ext_dir}skills"/*/; do
            [ -d "${s}" ] || continue
            n=$(basename "${s}")
            mkdir -p "${SKILLS}/${n}"
            cp -R "${s}." "${SKILLS}/${n}/"
        done
    fi
    [ -d "${ext_dir}agents" ] && cp "${ext_dir}agents/"*.md "${AGENT_DIR}/" 2>/dev/null || true
    for sub in references scripts; do
        [ -d "${ext_dir}${sub}" ] || continue
        mkdir -p "${SKILL_DIR}/extensions/${ext}/${sub}"
        cp -R "${ext_dir}${sub}/." "${SKILL_DIR}/extensions/${ext}/${sub}/"
    done
done

cp "${SRC}/requirements.txt" "${SKILL_DIR}/requirements.txt"
cp "${SRC}/.claude-plugin/plugin.json" "${SKILL_DIR}/runtime-plugin.json" 2>/dev/null || true

echo "-> rewriting launcher token to project path"
LAUNCH="${SKILL_DIR}/scripts/claude-seo"
find "${SKILLS}" "${AGENT_DIR}" "${SKILL_DIR}/extensions" -type f -name '*.md' -print0 2>/dev/null \
  | xargs -0 sed -i '' -e "s#\${CLAUDE_PLUGIN_ROOT}/scripts/claude-seo#${LAUNCH}#g"

echo "-> creating the isolated Python runtime"
"${SKILL_DIR}/scripts/claude-seo" setup
"${SKILL_DIR}/scripts/claude-seo" doctor
